'use client';

import React, { Suspense, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Boot } from '@/components/auth/AuthShell';
import { AdminProvider } from '@/components/admin/AdminContext';
import AdminShell from '@/components/admin/AdminShell';
import { useSession } from '@/features/session';

/** LUMI AI super admin console. Only a `system_admin` who is not in a support session may open it. */
export default function AdminPage() {
  const { me, loading } = useSession();
  const router = useRouter();
  const allowed = !!me && me.user.role === 'system_admin' && !me.company;

  useEffect(() => {
    if (loading) return;
    if (!me) router.replace('/login');
    else if (!allowed) router.replace('/');
  }, [me, loading, allowed, router]);

  if (loading || !allowed) return <Boot text="Loading LUMI AI console…" />;

  return (
    <Suspense fallback={<Boot text="Opening LUMI AI console…" />}>
      <AdminProvider>
        <AdminShell />
      </AdminProvider>
    </Suspense>
  );
}
