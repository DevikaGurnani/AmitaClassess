'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import LearningStory from '@/components/LearningStory';
import AcademyBrand from '@/components/AcademyBrand';
import { ArrowRight, BookOpen, GraduationCap, LockKeyhole, Phone } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { loginIdentity } from '@/lib/account-validation';

export default function HomePage() {
  const { user, profile, isLoading, signInWithPassword, signOut } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [forgot, setForgot] = useState(false);
  const [recoverySent, setRecoverySent] = useState(false);
  const [message, setMessage] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setMessage(''); setPending(true);
    try {
        if (forgot) {
          const identity = loginIdentity(phone);
          if (!('email' in identity)) throw new Error('Enter your registered email address to reset your password.');
          if (recoverySent) {
            const response = await fetch('/api/auth/signin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: identity.email, otp }) });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Unable to verify email code.');
            window.location.assign('/auth/update-password');
            return;
          }
          const { error } = await createBrowserSupabaseClient().auth.resetPasswordForEmail(identity.email);
          if (error) throw error;
          setRecoverySent(true); setOtp('');
          setMessage('If this email is registered, enter the recovery code from your email below. Keep this page open.');
        } else await signInWithPassword(phone, password);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to sign in. Please try again.'); }
    finally { setPending(false); }
  }
  return <main className="login-page">
    <LearningStory />
    <section className="login-form-side">
      <div className="login-mobile-brand"><AcademyBrand/></div>
      <div className="login-card">
        <span className="login-welcome-icon"><BookOpen size={25} /></span>
        <p className="eyebrow">YOUR LEARNING COMMUNITY</p><h2>Welcome to your<br />next chapter<span>.</span></h2><p className="login-description">A calmer way to manage learning. Let’s get you in.</p>
        {user && profile ? <div className="signed-in-panel"><span className="avatar avatar-green">{profile.name[0]}</span><div><strong>{profile.name}</strong><p>Signed in as {profile.role}</p></div><Link className="primary-button" href="/dashboard">Open workspace <ArrowRight size={17} /></Link><button className="text-button" onClick={() => void signOut()}>Use another account</button></div> : <>
          <form onSubmit={event => void submit(event)} className="login-form">
            <label htmlFor="login-phone">{forgot ? 'Registered email address' : 'Email or mobile number'}</label><div className="login-input"><Phone size={18} /><input id="login-phone" type={forgot ? 'email' : 'text'} autoComplete="username" required disabled={pending || recoverySent} value={phone} onChange={event => setPhone(event.target.value)} placeholder={forgot ? 'you@example.com' : 'you@example.com or 9876543210'} /></div>
            {forgot && recoverySent && <><label htmlFor="email-recovery-code">Email recovery code</label><div className="login-input"><LockKeyhole size={18} /><input id="email-recovery-code" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" value={otp} onChange={event => setOtp(event.target.value)} placeholder="Enter the code from your email" /></div><button type="button" className="text-button" disabled={pending} onClick={() => { setRecoverySent(false); setOtp(''); setMessage(''); }}>Change email / request another email</button></>}
            {!forgot && <><label htmlFor="login-password">Password</label><div className="login-input"><LockKeyhole size={18} /><input id="login-password" type="password" required autoComplete="current-password" disabled={pending} value={password} onChange={event => setPassword(event.target.value)} placeholder="Your password" /></div></>}
            {error && <p className="form-error" role="alert">{error}</p>}
            {message && <p role="status">{message}</p>}
            {forgot && <p className="login-description">Use the email registered for your academy account.</p>}
            <button className="primary-button login-submit" disabled={pending || isLoading}>{pending ? 'One moment…' : forgot ? recoverySent ? 'Verify email code' : 'Send password reset email' : 'Sign in to academy'}<ArrowRight size={19} /></button>
            <button type="button" className="text-button" disabled={pending} onClick={() => { setForgot(!forgot); setRecoverySent(false); setOtp(''); setError(''); setMessage(''); }}>{forgot ? 'Back to sign in' : 'Forgot password?'}</button>
          </form>
        </>}
        <div className="login-security"><LockKeyhole size={13} />Your learning community, securely connected.</div>
      </div><p className="login-bottom-note">A little structure. A lot of potential.</p>
    </section>
  </main>;
}
