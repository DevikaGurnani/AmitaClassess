"use client";
import { useState, type FormEvent } from 'react';
import { Plus, X } from 'lucide-react';
import { useAuth, useSupabase } from '@/lib/auth-context';
import { safeResourceUrl } from '@/lib/learner-console';

export default function MaterialShareForm({ batches, onSaved }: { batches: Array<{ id: string; name: string }>; onSaved: () => void }) {
  const { user } = useAuth();
  const { supabase: sb } = useSupabase();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const url = String(values.get('url') ?? '').trim();
    if (!safeResourceUrl(url) || !url.startsWith('https://')) { setError('Enter a valid HTTPS link to your resource.'); return; }
    setBusy(true); setError('');
    try {
      const { error } = await sb.from('materials').insert({ title: String(values.get('title')).trim(), subject: String(values.get('subject')).trim(), topic: String(values.get('topic') ?? '').trim() || null, batch_id: values.get('batch'), file_url: url, file_type: values.get('type'), allow_download: values.get('download') === 'on', is_hidden: false, uploaded_by: user.id });
      if (error) throw error;
      form.reset(); setOpen(false); onSaved();
    } catch (cause) { setError((cause as { message?: string }).message || 'Unable to share this resource.'); }
    finally { setBusy(false); }
  }
  return <div className="material-share"><button className="primary-button" onClick={() => setOpen(value => !value)} aria-expanded={open}>{open ? <X size={16} /> : <Plus size={16} />}{open ? 'Close resource form' : 'Share a resource'}</button>{open && <form className="dashboard-panel material-share-form" onSubmit={event => void submit(event)}><h2>Something new to learn</h2><p>Share a link to a document, video, or learning resource with a class.</p><div className="material-form-grid"><label>Resource title<input name="title" required maxLength={160} /></label><label>Subject<input name="subject" required maxLength={100} /></label><label>Class / batch<select name="batch" required><option value="">Choose a batch</option>{batches.map(batch => <option key={batch.id} value={batch.id}>{batch.name}</option>)}</select></label><label>Resource type<select name="type"><option value="link">Link / video</option><option value="pdf">PDF</option><option value="document">Document</option><option value="presentation">Presentation</option><option value="image">Image</option></select></label><label>Resource link<input name="url" type="url" placeholder="https://..." required /></label><label>Topic (optional)<input name="topic" maxLength={160} /></label></div><label className="material-download-option"><input name="download" type="checkbox" defaultChecked />Show a download action for this resource</label>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button" disabled={busy}>{busy ? 'Sharing...' : 'Share with class'}</button></form>}</div>;
}
