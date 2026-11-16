'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LoginResponse } from '@smart-reply/shared';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/features/session';

/** Shown while LUMI AI support is signed in as a company's manager. */
export default function SupportBar() {
  const { me, setMe } = useSession();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (!me?.impersonation) return null;
  const end = async () => {
    setBusy(true);
    try {
      const res = await api.post<LoginResponse>('/auth/end-support');
      setMe(res.me);
      router.replace('/admin');
    } catch (err) {
      alert(errorMessage(err));
      setBusy(false);
    }
  };
  return (
    <div className="support-bar" role="status">
      LUMI AI support session · {me.company?.name} · {me.impersonation.reason}
      <button className="btn sm" disabled={busy} onClick={() => void end()}>
        End support session
      </button>
    </div>
  );
}
