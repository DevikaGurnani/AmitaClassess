'use client';
import { useEffect, useState } from 'react';
import { ArrowUpRight, BookOpen, Download, FileText, Search } from 'lucide-react';
import Phase2Layout from '@/components/Phase2Layout';
import { useAuth, useSupabase } from '@/lib/auth-context';
import { EmptyState } from '@/components/DashboardParts';
import LibraryBrowser from '@/components/LibraryBrowser';
import { safeResourceUrl } from '@/lib/learner-console';

type Material = { id: string; title: string; subject: string; topic: string | null; file_url: string; file_type: string; allow_download: boolean; is_hidden: boolean };
export default function MaterialsPage() {
  const { user, role } = useAuth(); const { supabase: sb } = useSupabase();
  const [materials, setMaterials] = useState<Material[]>([]); const [search, setSearch] = useState(''); const [revision, setRevision] = useState(0); const [batches, setBatches] = useState<Array<{id:string;name:string}>>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoading(true); setError('');
    async function load() {
      const [resources, classes] = await Promise.all([sb.from('materials').select('id,title,subject,topic,file_url,file_type,allow_download,is_hidden').order('created_at', { ascending: false }), role === 'teacher' ? sb.from('batches').select('id,name').eq('teacher_id', user!.id).eq('is_active', true) : sb.from('batches').select('id,name').eq('is_active', true)]);
      if (!active) return;
      setMaterials(resources.data ?? []); setBatches(classes.data ?? []);
      if (resources.error || classes.error) setError(resources.error?.message ?? classes.error?.message ?? 'Unable to load resources.');
    }
    void load().catch(cause => { if (active) setError(cause.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sb, user, role, revision]);
  const visible = materials.filter(material => `${material.title} ${material.subject}`.toLowerCase().includes(search.toLowerCase()));
  return <Phase2Layout title="Learning library" roles={['owner','staff','teacher']}>
    <LibraryBrowser owner={role==='owner'}/>
    {materials.length>0&&<details className="library-legacy"><summary>Previously shared batch resources ({materials.length})</summary>
    <div className="library-search"><Search size={18} /><input aria-label="Search learning library" placeholder="Find a topic or resource…" value={search} onChange={event => setSearch(event.target.value)} /></div>
    {error && <p role="alert" className="form-error">{error}</p>}
    <div className="resource-card-grid">{visible.map((material, index) => <article className="resource-card" key={material.id}><div className={`resource-cover resource-cover-${index % 2}`}><FileText size={45} strokeWidth={1} /><span>{material.subject}</span></div><div className="resource-card-content"><span className="eyebrow">{material.file_type}{material.is_hidden ? ' · Hidden from parents' : ''}</span><h3>{material.title}</h3><p>{material.topic ?? material.subject}</p>{safeResourceUrl(material.file_url) && <div className="resource-actions"><a href={safeResourceUrl(material.file_url)!} className="text-button" target="_blank" rel="noopener noreferrer"><ArrowUpRight size={15} />Open resource</a>{material.allow_download && <a href={safeResourceUrl(material.file_url)!} className="text-button" download><Download size={15} />Download</a>}</div>}</div></article>)}</div>
    {!visible.length && <EmptyState>{loading ? 'Loading learning resources...' : materials.length ? 'No resources match your search.' : 'Share your first learning resource with a class.'}</EmptyState>}
    </details>}
  </Phase2Layout>;
}
