'use client';

import React, { useState } from 'react';
import type { AdminCompany, ConnectLinkResponse, WhatsappConnectResponse } from '@smart-reply/shared';
import { runEmbeddedSignup } from '@/lib/embedded-signup';
import {
  useCompanyWhatsapp,
  useConnectEmbedded,
  useConnectLink,
  useConnectManual,
  usePlatformMeta,
  useWhatsappAction
} from '@/features/admin';
import { errorMessage } from '@/lib/api';
import { useAdmin } from './AdminContext';
import { CopyField, QualityChip, QueryState, fmtDateTime } from './ui';

const PIN = /^\d{6}$/;
const META_ID = /^\d{5,25}$/;

/** Shows the registration PIN once, with a warning to save it. */
function ConnectedSheet({ res }: { res: WhatsappConnectResponse }) {
  const { closeSheet } = useAdmin();
  return (
    <>
      <h2>Number connected</h2>
      <p className="sub">{res.account.displayPhone ?? 'The number'} is connected. {res.note}</p>
      {res.registrationPin ? (
        <>
          <div className="note w" role="alert">
            <span className="ic">!</span>
            <div>
              <b>Save this PIN now</b>
              It is the number’s two-step verification PIN. Smart Reply does not store it and will not show it again.
            </div>
          </div>
          <CopyField id="reg-pin" label="Registration PIN" value={res.registrationPin} />
        </>
      ) : null}
      <button className="btn pri" style={{ marginTop: 18 }} onClick={closeSheet}>
        Done
      </button>
    </>
  );
}

function ManualSheet({ company }: { company: AdminCompany }) {
  const { toast, reportError, openSheet, closeSheet } = useAdmin();
  const manual = useConnectManual(company.id);
  const [f, setF] = useState({ wabaId: '', phoneNumberId: '', accessToken: '', pin: '' });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!META_ID.test(f.wabaId.trim()) || !META_ID.test(f.phoneNumberId.trim())) {
      toast('The WABA id and phone number id are numbers (5–25 digits).');
      return;
    }
    if (f.pin && !PIN.test(f.pin)) {
      toast('The PIN has 6 digits.');
      return;
    }
    manual.mutate(
      { wabaId: f.wabaId.trim(), phoneNumberId: f.phoneNumberId.trim(), accessToken: f.accessToken.trim(), pin: f.pin || undefined },
      {
        onSuccess: res => {
          toast('WhatsApp number connected.');
          openSheet(<ConnectedSheet res={res} />);
        },
        onError: reportError
      }
    );
  };
  return (
    <form onSubmit={submit}>
      <h2>Enter IDs manually</h2>
      <p className="sub">
        For a number already set up in Meta Business Manager. Find the ids in WhatsApp Manager → Phone numbers, and create a permanent system user token
        with the whatsapp_business_messaging and whatsapp_business_management permissions.
      </p>
      <label className="f" htmlFor="mw-waba">WhatsApp Business Account id</label>
      <input className="f-in" id="mw-waba" inputMode="numeric" required value={f.wabaId} onChange={e => setF({ ...f, wabaId: e.target.value })} />
      <label className="f" htmlFor="mw-pn">Phone number id</label>
      <input className="f-in" id="mw-pn" inputMode="numeric" required value={f.phoneNumberId} onChange={e => setF({ ...f, phoneNumberId: e.target.value })} />
      <label className="f" htmlFor="mw-token">Access token</label>
      <input
        className="f-in"
        id="mw-token"
        type="password"
        autoComplete="off"
        required
        minLength={20}
        value={f.accessToken}
        onChange={e => setF({ ...f, accessToken: e.target.value })}
      />
      <label className="f" htmlFor="mw-pin">Two-step PIN (optional, 6 digits)</label>
      <input className="f-in" id="mw-pin" inputMode="numeric" maxLength={6} value={f.pin} onChange={e => setF({ ...f, pin: e.target.value })} />
      <p className="hint">With a PIN the number is registered (or re-registered) with it. Without one, it is connected as it is.</p>
      <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
        <button className="btn pri" type="submit" disabled={manual.isPending}>
          {manual.isPending ? 'Connecting…' : 'Connect number'}
        </button>
        <button className="btn" type="button" onClick={closeSheet}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function LinkSheet({ link }: { link: ConnectLinkResponse }) {
  const { closeSheet } = useAdmin();
  return (
    <>
      <h2>Connect link</h2>
      <p className="sub">
        Send this to the business owner. It opens Meta’s signup for this company only, works once, and expires {fmtDateTime(link.expiresAt)}.
      </p>
      <CopyField id="conn-link" label="One-time connect link" value={link.url} />
      <button className="btn" style={{ marginTop: 18 }} onClick={closeSheet}>
        Done
      </button>
    </>
  );
}

export default function WhatsappTab({ company }: { company: AdminCompany }) {
  const { toast, reportError, openSheet } = useAdmin();
  const wa = useCompanyWhatsapp(company.id);
  const meta = usePlatformMeta();
  const embedded = useConnectEmbedded(company.id);
  const action = useWhatsappAction(company.id);
  const link = useConnectLink(company.id);
  const [signingUp, setSigningUp] = useState(false);

  const connectFacebook = async () => {
    const m = meta.data;
    if (!m) {
      toast('Meta settings are still loading.');
      return;
    }
    setSigningUp(true);
    try {
      const r = await runEmbeddedSignup({ appId: m.appId, configId: m.embeddedSignupConfigId, graphVersion: m.graphVersion });
      embedded.mutate(
        { code: r.code, wabaId: r.wabaId, phoneNumberId: r.phoneNumberId },
        {
          onSuccess: res => {
            toast('WhatsApp number connected.');
            openSheet(<ConnectedSheet res={res} />);
          },
          onError: reportError
        }
      );
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setSigningUp(false);
    }
  };

  const run = (a: 'verify' | 'subscribe' | 'disconnect') => {
    if (a === 'disconnect' && !window.confirm(`Disconnect WhatsApp from ${company.name}? Chats and calls stop until a number is connected again.`)) return;
    action.mutate(a, {
      onSuccess: () => toast(a === 'verify' ? 'Number checked with Meta.' : a === 'subscribe' ? 'Webhook subscribed.' : 'WhatsApp disconnected.'),
      onError: reportError
    });
  };

  return (
    <QueryState q={wa}>
      {v => (
        <div className="grid gmain">
          <div className="card">
            <div className="card-h">
              <h2>WhatsApp number</h2>
              <span className={`chip ${v.status === 'connected' ? 'ok' : v.status === 'error' ? 'b' : v.status === 'pending' ? 'w' : ''}`}>{v.status}</span>
              <QualityChip rating={v.qualityRating} />
            </div>
            <div className="card-b">
              {v.lastError ? (
                <div className="note b" role="alert">
                  <span className="ic">!</span>
                  <div>
                    <b>Last error</b>
                    {v.lastError}
                  </div>
                </div>
              ) : null}
              <div className="ln"><span>Display phone</span><b>{v.displayPhone ?? '—'}</b></div>
              <div className="ln"><span>Verified name</span><b>{v.verifiedName ?? '—'}{v.nameStatus ? ` (${v.nameStatus.toLowerCase()})` : ''}</b></div>
              <div className="ln"><span>WABA id</span><b>{v.wabaId ?? '—'}</b></div>
              <div className="ln"><span>Phone number id</span><b>{v.phoneNumberId ?? '—'}</b></div>
              <div className="ln"><span>Messaging limit</span><b>{v.messagingLimit ?? '—'}</b></div>
              <div className="ln"><span>Calling</span><b>{v.callingEnabled ? 'Enabled' : 'Off'}</b></div>
              <div className="ln"><span>Token</span><b>{v.tokenMasked ? `${v.tokenMasked} · set ${fmtDateTime(v.tokenSetAt)}` : '—'}</b></div>
              <div className="ln"><span>Webhook subscribed</span><b>{fmtDateTime(v.webhookSubscribedAt)}</b></div>
              <div className="ln"><span>Connected</span><b>{v.connectedAt ? `${fmtDateTime(v.connectedAt)} · ${v.connectMethod === 'manual' ? 'manual' : 'Embedded Signup'}` : '—'}</b></div>
              {v.wabaId ? (
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 12 }}>
                  <button className="btn sm" disabled={action.isPending} onClick={() => run('verify')}>Verify</button>
                  <button className="btn sm" disabled={action.isPending} onClick={() => run('subscribe')}>Subscribe webhook</button>
                  <button className="btn sm dgr" disabled={action.isPending} onClick={() => run('disconnect')}>Disconnect</button>
                </div>
              ) : null}
            </div>
          </div>

          <div className="card">
            <div className="card-h">
              <h2>{v.connected ? 'Change number' : 'Connect a number'}</h2>
            </div>
            <div className="list-row">
              <span className="dot i" />
              <div className="bd">
                <b>Connect with Facebook</b>
                <span>Open Meta’s Embedded Signup here, signed in to the business’s Facebook account.</span>
              </div>
              <div className="rt">
                <button className="btn sm pri" disabled={signingUp || embedded.isPending} onClick={() => void connectFacebook()}>
                  {signingUp || embedded.isPending ? 'Connecting…' : 'Connect'}
                </button>
              </div>
            </div>
            <div className="list-row">
              <span className="dot i" />
              <div className="bd">
                <b>Send connect link</b>
                <span>A one-time link the business owner opens to finish signup themselves.</span>
              </div>
              <div className="rt">
                <button
                  className="btn sm"
                  disabled={link.isPending}
                  onClick={() => link.mutate(undefined, { onSuccess: l => openSheet(<LinkSheet link={l} />), onError: reportError })}
                >
                  {link.isPending ? 'Creating…' : 'Create link'}
                </button>
              </div>
            </div>
            <div className="list-row">
              <span className="dot" />
              <div className="bd">
                <b>Enter IDs manually</b>
                <span>WABA id, phone number id and a system user token.</span>
              </div>
              <div className="rt">
                <button className="btn sm" onClick={() => openSheet(<ManualSheet company={company} />)}>
                  Enter IDs
                </button>
              </div>
            </div>
            {meta.data && (!meta.data.appId || !meta.data.embeddedSignupConfigId) ? (
              <p className="hint" style={{ padding: '0 15px 12px' }}>
                Set the Meta app id and Embedded Signup configuration id in Meta & webhook before using Facebook signup or connect links.
              </p>
            ) : null}
          </div>
        </div>
      )}
    </QueryState>
  );
}
