// Apply only when explicitly run with --apply. Secrets stay in local env files.
import nextEnv from '@next/env';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { root, writeUpgrade, buildUpgrade, applicationTables } from './database-upgrade.mjs';
nextEnv.loadEnvConfig(path.join(root,'apps/web'));
writeUpgrade();
if (!process.argv.includes('--apply')) {
  console.log('SQL generated only. Use --apply after SQL credentials are configured.');
  process.exit(0);
}
const token=process.env.SUPABASE_ACCESS_TOKEN;
const connectionString=process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
const projectUrl=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://invalid.local');
let query,close=async()=>{};
if (token) {
  if (!/^[a-z0-9]+\.supabase\.co$/.test(projectUrl.hostname)) throw new Error('Set the canonical Supabase project URL before using Management API.');
  const ref=projectUrl.hostname.split('.')[0];
  query=async sql=>{
    const response=await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`,{
      method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
      body:JSON.stringify({query:sql}),signal:AbortSignal.timeout(150000),
    });
    if (!response.ok) throw new Error(`Database query failed (HTTP ${response.status}). No response body is printed to avoid leaking data. Inspect the project SQL logs.`);
    return await response.json();
  };
} else if (connectionString) {
  const ref=projectUrl.hostname.split('.')[0];
  let databaseUrl;
  try { databaseUrl=new URL(connectionString); }
  catch { throw new Error('Database connection URI is invalid (value hidden). Check its format and URL-encode password special characters.'); }
  const direct=databaseUrl.hostname===`db.${ref}.supabase.co`;
  const pooler=databaseUrl.hostname.endsWith('.pooler.supabase.com') && decodeURIComponent(databaseUrl.username)===`postgres.${ref}`;
  if (!direct && !pooler) throw new Error('The SQL connection does not identify the same Supabase project as the application URL. Setup stopped.');
  let pg;
  try { pg=(await import('pg')).default; }
  catch { throw new Error('SQL connection found. Install the pg development dependency before applying, or configure SUPABASE_ACCESS_TOKEN for the dependency-free Management API route.'); }
  const caPath=process.env.SUPABASE_DB_CA_PATH || path.join(root,'.runtime','supabase-ca.crt');
  const ca=readFileSync(caPath,'utf8');
  // pg's URI sslmode options can replace the explicit SSL object. Use one
  // verified TLS configuration with Supabase's downloaded public CA.
  for (const name of ['sslmode','sslrootcert','sslcert','sslkey']) databaseUrl.searchParams.delete(name);
  const client=new pg.Client({connectionString:databaseUrl.toString(),connectionTimeoutMillis:15000,ssl:{ca,rejectUnauthorized:true,servername:databaseUrl.hostname}});
  await client.connect();
  close=()=>client.end();
  query=async sql=>{
    const result=await client.query(sql);
    return Array.isArray(result) ? result.at(-1)?.rows ?? [] : result.rows;
  };
} else throw new Error('SQL access missing: set SUPABASE_ACCESS_TOKEN or SUPABASE_DB_URL locally. The service-role API key cannot execute schema migrations.');

const list=applicationTables.map(t=>`'${t}'`).join(',');
try {
  const snapshot={
    columns:await query(`SELECT table_name,column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name IN (${list}) ORDER BY table_name,ordinal_position`),
    policies:await query(`SELECT tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename IN (${list})`),
    triggers:await query(`SELECT c.relname AS table_name,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname='public' AND c.relname IN (${list})`),
  };
  if (!Array.isArray(snapshot.columns)) throw new Error('Unexpected preflight response. Setup stopped.');
  const existing=[...new Set(snapshot.columns.map(row=>row.table_name))];
  const snapshotDir=path.join(root,'.runtime','database-backups',new Date().toISOString().replace(/[:.]/g,'-'));
  mkdirSync(snapshotDir,{recursive:true});
  writeFileSync(path.join(snapshotDir,'schema-before.json'),JSON.stringify(snapshot,null,2));
  // Backup application records before replacing policies; never print contents.
  // Auth passwords/tokens are deliberately excluded from this local app backup.
  for (const table of existing) {
    if (!applicationTables.includes(table)) throw new Error('Unexpected table in preflight');
    const rows=await query(`SELECT row_to_json(record) AS record FROM public."${table}" record`);
    writeFileSync(path.join(snapshotDir,`${table}.json`),JSON.stringify(rows,null,2));
  }
  console.log('Preflight and application-record backup saved in ignored .runtime/database-backups.');
  await query(buildUpgrade());
  const columns=await query("SELECT count(*)::int total FROM information_schema.columns WHERE table_schema='public' AND ((table_name='students' AND column_name IN ('email','phone')) OR (table_name='users' AND column_name='student_id'))");
  if (Number(columns[0]?.total)!==3) throw new Error('Setup completed but column verification failed. Inspect schema before retrying.');
  console.log('Schema upgrade applied. Contact/login-link columns verified. Run check-server-access.mjs and authenticated acceptance checks next.');
} finally {await close();}
