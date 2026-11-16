'use client';

import React, { FormEvent, useState } from 'react';
import Link from 'next/link';
import AuthShell from '@/components/auth/AuthShell';
import { api, errorMessage } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/auth/forgot-password', { email: email.trim() });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Reset your password" sub="We email you a link to choose a new password.">
      {sent ? (
        <div className="ok-msg">If an account uses {email}, a reset link is on its way. It works for one hour.</div>
      ) : (
        <form onSubmit={submit}>
          <label className="f" htmlFor="email">Email</label>
          <input id="email" className="f-in" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
          {error ? <div className="err" role="alert">{error}</div> : null}
          <button className="btn pri" type="submit" disabled={busy || !email}>
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}
      <div className="links">
        <Link href="/login">Back to sign in</Link>
      </div>
    </AuthShell>
  );
}
