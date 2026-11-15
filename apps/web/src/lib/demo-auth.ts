import type { User } from '@supabase/supabase-js';

// Historical fixtures only. Demo identities are disabled in every runtime.
export const demoLoginEnabled = false;
export const demoPhone = '123456789';
const demoSessionKey = 'tuition-demo-session';
export type DemoRole = 'owner' | 'parent' | 'student';
export const demoAccounts = {
  owner: { id: '00000000-0000-4000-8000-000000000001', name: 'Ananya Shah' },
  parent: { id: '00000000-0000-4000-8000-000000000002', name: 'Meera Sharma' },
  student: { id: '00000000-0000-4000-8000-000000000003', name: 'Aarav Sharma' },
};

export function isDemoPhone(phone: string): boolean {
  return demoLoginEnabled && phone.trim() === demoPhone;
}

export function getDemoUser(): User | null {
  if (!demoLoginEnabled || typeof window === 'undefined') return null;
  const saved = sessionStorage.getItem(demoSessionKey);
  const role = saved === 'active' ? 'owner' : saved;
  if (role !== 'owner' && role !== 'parent' && role !== 'student') return null;
  return {
    id: demoAccounts[role].id,
    phone: demoPhone,
    aud: 'authenticated',
    role: 'authenticated',
    app_metadata: {},
    user_metadata: { name: demoAccounts[role].name, demoRole: role, student_id: '10000000-0000-4000-8000-000000000001' },
    created_at: '2026-11-11T00:00:00.000Z',
  };
}

export function startDemoSession(phone: string, token: string, role: DemoRole = 'owner'): void {
  if (!isDemoPhone(phone) || token.trim() !== '1234') throw new Error('Invalid demo OTP. Enter 1234.');
  if (!Object.hasOwn(demoAccounts, role)) throw new Error('Choose a demo role');
  sessionStorage.setItem(demoSessionKey, role);
}

export function clearDemoSession(): void {
  sessionStorage.removeItem(demoSessionKey);
}
