// Retire only the mock identity. Preserve tab-stored admissions for recovery;
// never silently upload sample or unreviewed records into the real database.
export function retireDemoSession(): void {
  if (typeof window === 'undefined') return;
  try { window.sessionStorage.removeItem('tuition-demo-session'); }
  catch { /* Storage can be unavailable; real Supabase auth still decides access. */ }
}
