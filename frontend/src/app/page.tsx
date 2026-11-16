'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppProvider } from '@/context/AppContext';
import Shell from '@/components/layout/Shell';
import { Boot } from '@/components/auth/AuthShell';
import SupportBar from '@/components/auth/SupportBar';
import { useSession } from '@/features/session';
import LandingPage from '@/components/landing/LandingPage';

export default function Home() {
  const { me, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (me && me.user.role === 'system_admin' && !me.company) {
      router.replace('/admin');
    }
  }, [me, loading, router]);

  if (loading) return <Boot />;

  if (!me) {
    return <LandingPage />;
  }

  if (me.user.role === 'system_admin' && !me.company) {
    return <Boot text="Redirecting to Super Admin Console…" />;
  }

  return (
    <AppProvider key={`${me.user.id}:${me.company?.id ?? ''}`}>
      <Shell />
      {me.impersonation ? <SupportBar /> : null}
    </AppProvider>
  );
}
