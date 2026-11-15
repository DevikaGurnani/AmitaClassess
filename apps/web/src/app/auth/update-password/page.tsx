'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { validateNewPassword } from '@/lib/account-validation';
export default function UpdatePassword() {
  const query = useSearchParams();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (query.has('error')) { setError('This reset link is invalid or expired. Request a new reset email.'); return; }
    const sb = createBrowserSupabaseClient();
    void sb.auth.getUser().then(({ data, error }) => {
      setReady(!!data.user && !error);
      if (error || !data.user) setError('Sign in or open a valid password reset email to continue.');
    }).catch(() => setError('Unable to verify your session. Please sign in again.'));
  }, [query]);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      validateNewPassword(password, confirmation);
      const sb = createBrowserSupabaseClient();
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw error;
      // The auth.users trigger clears the server-owned first-login flag only
      // after the password hash actually changes. Refresh picks up that flag.
      const { data, error: refreshError } = await sb.auth.refreshSession();
      if (refreshError || data.user?.app_metadata.must_change_password) {
        setMessage('Password updated. Sign out and sign in again. If the password change prompt remains, contact your administrator to check database setup.');
        return;
      }
      window.location.assign('/dashboard');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to change password.'); }
    finally { setBusy(false); }
  }
  return <main className="min-h-screen grid place-items-center p-6"><section className="login-card dashboard-panel"><h1>Set your own password</h1><p>Choose at least 8 characters. Your temporary password must be replaced before opening your workspace.</p><form className="login-form" onSubmit={event => void submit(event)}><label htmlFor="new-password">New password</label><div className="login-input"><input id="new-password" type="password" minLength={8} autoComplete="new-password" required value={password} onChange={event => setPassword(event.target.value)} /></div><label htmlFor="confirm-password">Confirm new password</label><div className="login-input"><input id="confirm-password" type="password" minLength={8} autoComplete="new-password" required value={confirmation} onChange={event => setConfirmation(event.target.value)} /></div>{error && <p className="form-error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}<button disabled={!ready || busy} className="primary-button">{busy ? 'Saving…' : 'Save new password'}</button></form><Link href="/auth/login">Back to sign in</Link></section></main>;
}
