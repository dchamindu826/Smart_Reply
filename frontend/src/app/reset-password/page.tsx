'use client';

import React, { FormEvent, Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import AuthShell from '@/components/auth/AuthShell';
import { api, errorMessage } from '@/lib/api';

function ResetForm() {
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('The two passwords are different.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.post('/auth/reset-password', { token, password });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <>
        <div className="ok-msg">Password changed. Sign in with your new password.</div>
        <div className="links">
          <Link href="/login">Sign in</Link>
        </div>
      </>
    );
  }
  return (
    <form onSubmit={submit}>
      <label className="f" htmlFor="pw">New password</label>
      <input id="pw" className="f-in" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} minLength={8} required autoFocus />
      <label className="f" htmlFor="pw2">Type it again</label>
      <input id="pw2" className="f-in" type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} required />
      <p className="hint">At least 8 characters.</p>
      {error ? <div className="err" role="alert">{error}</div> : null}
      <button className="btn pri" type="submit" disabled={busy || !token || password.length < 8}>
        {busy ? 'Saving…' : 'Save new password'}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthShell title="Choose a new password">
      <Suspense fallback={null}>
        <ResetForm />
      </Suspense>
    </AuthShell>
  );
}
