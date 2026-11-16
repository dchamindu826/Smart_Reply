'use client';

import React, { FormEvent, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import type { LoginResponse } from '@smart-reply/shared';
import AuthShell from '@/components/auth/AuthShell';
import { api, errorMessage } from '@/lib/api';
import { qk } from '@/lib/query';

interface InviteInfo {
  name: string;
  email: string;
  companyName: string;
  role: string;
}

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get<InviteInfo>(`/auth/invite/${encodeURIComponent(token)}`)
      .then(i => {
        setInfo(i);
        setName(i.name);
      })
      .catch(err => setLoadError(errorMessage(err)));
  }, [token]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api.post<LoginResponse>(`/auth/invite/${encodeURIComponent(token)}/accept`, { name, password });
      qc.removeQueries({ predicate: q => q.queryKey[0] !== qk.me[0] });
      qc.setQueryData(qk.me, res.me);
      router.replace('/');
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  if (loadError) {
    return (
      <AuthShell title="Invite link">
        <div className="err">{loadError}</div>
      </AuthShell>
    );
  }
  if (!info) return <AuthShell title="Invite link" sub="Checking your invite…">{null}</AuthShell>;

  return (
    <AuthShell title={`Join ${info.companyName}`} sub={`You were invited as ${info.role} (${info.email}). Choose a password to finish.`}>
      <form onSubmit={submit}>
        <label className="f" htmlFor="name">Your name</label>
        <input id="name" className="f-in" value={name} onChange={e => setName(e.target.value)} required />
        <label className="f" htmlFor="pw">Password</label>
        <input id="pw" className="f-in" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} minLength={8} required autoFocus />
        <p className="hint">At least 8 characters.</p>
        {error ? <div className="err" role="alert">{error}</div> : null}
        <button className="btn pri" type="submit" disabled={busy || password.length < 8 || !name.trim()}>
          {busy ? 'Setting up…' : 'Join and sign in'}
        </button>
      </form>
    </AuthShell>
  );
}
