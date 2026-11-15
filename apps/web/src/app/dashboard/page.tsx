"use client";
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import WorkspaceLoading from '@/components/WorkspaceLoading';
export default function DashboardPage() {
  const { user, profile, isLoading, signOut } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (isLoading) return;
    if (!user) router.replace('/auth/login');
    else if (user.app_metadata.must_change_password) router.replace('/auth/update-password');
    else if (profile?.role === 'owner' || profile?.role === 'staff') router.replace('/owner');
    else if (profile?.role === 'parent') router.replace('/parent');
    else if (profile?.role === 'student') router.replace('/student');
    else if (profile?.role === 'teacher') router.replace('/teacher');
  }, [isLoading,user,profile,router]);
  if(!isLoading&&user&&!profile)return <WorkspaceLoading><div className="workspace-profile-error" role="alert"><h2>We couldn’t open your profile</h2><p>Your account needs an active academy profile. Contact the owner or try signing in again.</p><button className="primary-button" onClick={()=>void signOut()}>Sign out</button></div></WorkspaceLoading>;
  return <WorkspaceLoading/>;
}
