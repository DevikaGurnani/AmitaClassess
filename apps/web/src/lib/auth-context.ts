"use client";
import { useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { retireDemoSession } from '@/lib/retire-demo';
import { loginIdentity } from '@/lib/account-validation';

export type UserProfile = {
  id: string; name: string; phone: string | null;
  role: 'owner' | 'staff' | 'teacher' | 'parent' | 'student';
  status: 'active' | 'inactive' | 'pending';
};
export interface AuthContextType {
  user: User | null; session: Session | null; profile: UserProfile | null;
  role: UserProfile['role'] | null; isLoading: boolean;
  signInWithPassword: (phone: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}
const supabase = createBrowserSupabaseClient;
export function useSupabase() {
  return { supabase: supabase() };
}
export function useAuth(): AuthContextType {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  useEffect(() => {
    let active = true;
    retireDemoSession();
    const client = supabase();
    const refresh = async (s: Session | null) => {
      if (!active) return;
      setSession(s);
      setUser(s?.user ?? null);
      if (!s?.user) { setProfile(null); setIsLoading(false); return; }
      const { data, error } = await client.from('users')
        .select('id,name,phone,role,status').eq('id', s.user.id).maybeSingle();
      if (!active) return;
      setProfile(!error && data?.status === 'active' ? data as UserProfile : null);
      setIsLoading(false);
    };
    client.auth.getSession().then(({ data }) => refresh(data.session)).catch(() => { if (active) setIsLoading(false); });
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, s) => {
      // Deferring extra Supabase calls avoids reentrancy in auth callbacks.
      setTimeout(() => { void refresh(s); }, 0);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);
  const signInWithPassword = async (identifier: string, password: string) => {
    loginIdentity(identifier);
    const response = await fetch('/api/auth/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier, password }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to sign in.');
    retireDemoSession();
    window.location.assign(result.redirect === '/auth/update-password' ? result.redirect : '/dashboard');
  };
  const signOut = async () => {
    retireDemoSession();
    const { error } = await supabase().auth.signOut();
    if (error) throw error;
    setUser(null); setSession(null); setProfile(null);
    window.location.assign('/');
  };
  return { user, session, profile, role: profile?.role ?? null, isLoading, signInWithPassword, signOut };
}
