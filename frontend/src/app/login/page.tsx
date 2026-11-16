'use client';

import React, { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AuthShell from '@/components/auth/AuthShell';
import { errorMessage } from '@/lib/api';
import { useSession } from '@/features/session';

export default function LoginPage() {
  const { me, login } = useSession();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (me) router.replace(me.user.role === 'system_admin' && !me.company ? '/admin' : '/');
  }, [me, router]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const signedIn = await login(email.trim(), password);
      router.replace(signedIn.user.role === 'system_admin' && !signedIn.company ? '/admin' : '/');
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Sign in" sub="Use the email your manager or LUMI AI set up for you.">
      <form onSubmit={submit} noValidate>
        <label className="f" htmlFor="email">Email</label>
        <input id="email" className="f-in" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
        <label className="f" htmlFor="password">Password</label>
        <input id="password" className="f-in" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
        {error ? <div className="err" role="alert">{error}</div> : null}
        <button className="btn pri" type="submit" disabled={busy || !email || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <div className="links">
          <Link href="/forgot-password">Forgot password?</Link>
        </div>
      </form>
    </AuthShell>
  );
}
