'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { EmbeddedSignupConfig } from '@smart-reply/shared';
import AuthShell from '@/components/auth/AuthShell';
import { api, errorMessage } from '@/lib/api';
import { runEmbeddedSignup } from '@/lib/embedded-signup';

/**
 * One-time link LUMI AI sends to a business owner. The owner signs in to Facebook in Meta's
 * popup and picks their WhatsApp number; nothing else in Smart Reply is reachable from here.
 */
export default function ConnectPage() {
  const { token } = useParams<{ token: string }>();
  const [cfg, setCfg] = useState<EmbeddedSignupConfig | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get<EmbeddedSignupConfig>(`/connect-links/${encodeURIComponent(token)}`)
      .then(setCfg)
      .catch(err => setError(errorMessage(err)));
  }, [token]);

  const start = async () => {
    if (!cfg) return;
    setBusy(true);
    setError('');
    try {
      const r = await runEmbeddedSignup(cfg);
      const res = await api.post<{ ok: boolean; displayPhone: string | null }>(`/connect-links/${encodeURIComponent(token)}/finish`, r);
      setDone(res.displayPhone ?? 'your number');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <AuthShell title="WhatsApp connected">
        <div className="ok-msg">{done} is now connected to Smart Reply. You can close this page. LUMI AI will finish the setup.</div>
      </AuthShell>
    );
  }
  return (
    <AuthShell
      title={cfg ? `Connect WhatsApp for ${cfg.companyName}` : 'Connect WhatsApp'}
      sub="LUMI AI asked you to connect your business WhatsApp number. Sign in to Facebook, choose your business and number, and confirm."
    >
      {error ? <div className="err" role="alert">{error}</div> : null}
      <button className="btn pri" disabled={!cfg || busy} onClick={() => void start()}>
        {busy ? 'Waiting for Facebook…' : 'Continue with Facebook'}
      </button>
      <p className="hint" style={{ marginTop: 12 }}>
        Your number keeps working on WhatsApp. Meta bills message charges to your own business account.
      </p>
    </AuthShell>
  );
}
