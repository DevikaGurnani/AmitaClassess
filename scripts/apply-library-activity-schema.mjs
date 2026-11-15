import nextEnv from '@next/env';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { root } from './database-upgrade.mjs';
nextEnv.loadEnvConfig(path.join(root,'apps/web'));
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,ref=new URL(url).hostname.split('.')[0];
const connection=new URL(process.env.SUPABASE_DB_URL||process.env.DATABASE_URL);
if(connection.hostname!==`db.${ref}.supabase.co`&&!(connection.hostname.endsWith('.pooler.supabase.com')&&decodeURIComponent(connection.username)===`postgres.${ref}`))throw new Error('Database project mismatch');
for(const name of ['sslmode','sslrootcert','sslcert','sslkey'])connection.searchParams.delete(name);
const db=new pg.Client({connectionString:connection.toString(),connectionTimeoutMillis:15000,ssl:{ca:readFileSync(process.env.SUPABASE_DB_CA_PATH||path.join(root,'.runtime/supabase-ca.crt'),'utf8'),rejectUnauthorized:true,servername:connection.hostname}});
const version='20261115_09_library_activity';
const sql=readFileSync(path.join(root,`supabase/migrations/${version}.sql`),'utf8');
const hash=createHash('sha256').update(sql).digest('hex');
await db.connect();
try{
  await db.query('BEGIN');
  await db.query("SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='120s'");
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended('tuitionapp_library_activity_setup',0))");
  await db.query('CREATE TABLE IF NOT EXISTS private.app_schema_versions(version text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
  const existing=await db.query('SELECT checksum FROM private.app_schema_versions WHERE version=$1',[version]);
  if(existing.rows.length){
    if(existing.rows[0].checksum!==hash)throw new Error('Previously applied assignment migration differs; review before changing it.');
    console.log('Attendance/library schema already applied.');
  }else{
    const prior=await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('library_activity')");
    if(prior.rows.length)throw new Error('Attendance/library tables already exist without migration record. Review their schema first.');
    const dir=path.join(root,'.runtime','database-backups');mkdirSync(dir,{recursive:true});
    writeFileSync(path.join(dir,`attendance-library-preflight-${Date.now()}.json`),JSON.stringify((await db.query("SELECT tablename,policyname,cmd FROM pg_policies WHERE schemaname='storage'")).rows,null,2));
    await db.query(sql.replace(/^\s*(BEGIN|COMMIT);\s*$/gm,''));
    await db.query('INSERT INTO private.app_schema_versions(version,checksum) VALUES($1,$2)',[version,hash]);
  }
  await db.query('COMMIT');
}catch(error){await db.query('ROLLBACK');throw error;}finally{await db.end();}
const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const {data:buckets,error:listError}=await admin.storage.listBuckets();
if(listError)throw new Error('Schema applied, but Storage bucket lookup failed. Retry this script.');
const options={public:false,fileSizeLimit:10485760,allowedMimeTypes:['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']};
const result=buckets.some(bucket=>bucket.id==='learning-library')?await admin.storage.updateBucket('learning-library',options):await admin.storage.createBucket('learning-library',options);
if(result.error)throw new Error('Schema applied, but private bucket configuration failed. Retry this script.');
console.log('Attendance/librarys schema and private PDF/Word bucket ready.');
