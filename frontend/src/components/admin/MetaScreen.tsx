'use client';

import React, { useState } from 'react';
import type { PlatformMetaSettings, PlatformWebhookSettings } from '@smart-reply/shared';
import {
  WebhookEventStatus,
  useAdminCompanies,
  usePlatformMeta,
  usePlatformWebhook,
  useReplayEvent,
  useSavePlatformMeta,
  useSavePlatformWebhook,
  useTestMeta,
  useTestWebhook,
  useWebhookEvents
} from '@/features/admin';
import { useAdmin } from './AdminContext';
import { CopyField, PageHead, QueryState, fmtDateTime } from './ui';

const REQUIRED_FIELDS = [
  'messages',
  'calls',
  'message_template_status_update',
  'message_template_quality_update',
  'phone_number_quality_update',
  'account_update'
];

/** A write-only secret: shows the masked value; typing a new one replaces it. */
function SecretInput({
  id,
  label,
  masked,
  value,
  onChange,
  minLength
}: {
  id: string;
  label: string;
  masked: string | null;
  value: string;
  onChange: (v: string) => void;
  minLength: number;
}) {
  return (
    <>
      <label className="f" htmlFor={id}>
        {label}
      </label>
      <input
        className="f-in"
        id={id}
        type="password"
        autoComplete="off"
        minLength={minLength}
        placeholder={masked ? `${masked} (saved; type to replace)` : 'Not set'}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    </>
  );
}

function MetaCard({ initial }: { initial: PlatformMetaSettings }) {
  const { toast, reportError } = useAdmin();
  const save = useSavePlatformMeta();
  const test = useTestMeta();
  const [f, setF] = useState({
    appId: initial.appId,
    graphVersion: initial.graphVersion,
    configId: initial.embeddedSignupConfigId,
    appSecret: '',
    systemToken: ''
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    save.mutate(
      {
        appId: f.appId.trim(),
        graphVersion: f.graphVersion.trim(),
        embeddedSignupConfigId: f.configId.trim(),
        appSecret: f.appSecret.trim() || undefined,
        systemToken: f.systemToken.trim() || undefined
      },
      {
        onSuccess: () => {
          setF(prev => ({ ...prev, appSecret: '', systemToken: '' }));
          toast('Meta app settings saved.');
        },
        onError: reportError
      }
    );
  };
  return (
    <form className="card" onSubmit={submit}>
      <div className="card-h">
        <h2>Meta app</h2>
        {initial.updatedAt ? <span className="chip">Saved {fmtDateTime(initial.updatedAt)}</span> : null}
        <span className="sp" />
        <button
          type="button"
          className="btn sm"
          disabled={test.isPending}
          onClick={() =>
            test.mutate(undefined, {
              onSuccess: r => toast(r.message),
              onError: reportError
            })
          }
        >
          {test.isPending ? 'Testing…' : 'Test connection'}
        </button>
        <button className="btn sm pri" type="submit" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
      <div className="card-b">
        <div className="f-row f2">
          <div>
            <label className="f" htmlFor="mt-app" style={{ marginTop: 0 }}>App id</label>
            <input className="f-in" id="mt-app" inputMode="numeric" pattern="\d{5,25}" value={f.appId} onChange={e => setF({ ...f, appId: e.target.value })} />
          </div>
          <div>
            <label className="f" htmlFor="mt-ver" style={{ marginTop: 0 }}>Graph API version</label>
            <input className="f-in" id="mt-ver" required pattern="v\d{2}\.\d" placeholder="v23.0" value={f.graphVersion} onChange={e => setF({ ...f, graphVersion: e.target.value })} />
          </div>
        </div>
        <SecretInput id="mt-secret" label="App secret" masked={initial.appSecretMasked} value={f.appSecret} minLength={10} onChange={v => setF({ ...f, appSecret: v })} />
        <label className="f" htmlFor="mt-cfg">Embedded Signup configuration id</label>
        <input className="f-in" id="mt-cfg" maxLength={40} value={f.configId} onChange={e => setF({ ...f, configId: e.target.value })} />
        <p className="hint">Meta App Dashboard → Facebook Login for Business → Configurations. Use the WhatsApp Embedded Signup configuration.</p>
        <SecretInput
          id="mt-sys"
          label="System user token"
          masked={initial.systemTokenMasked}
          value={f.systemToken}
          minLength={20}
          onChange={v => setF({ ...f, systemToken: v })}
        />
        <p className="hint">Secrets are stored encrypted and never shown again. Leave a secret empty to keep the saved one.</p>
      </div>
    </form>
  );
}

function WebhookCard({ initial }: { initial: PlatformWebhookSettings }) {
  const { toast, reportError } = useAdmin();
  const save = useSavePlatformWebhook();
  const test = useTestWebhook();
  const [verifyToken, setVerifyToken] = useState('');
  const [fields, setFields] = useState(initial.subscribedFields.join(', '));
  const list = fields
    .split(/[\s,]+/)
    .map(x => x.trim())
    .filter(Boolean);
  const missing = REQUIRED_FIELDS.filter(x => !list.includes(x));

  return (
    <form
      className="card"
      onSubmit={e => {
        e.preventDefault();
        save.mutate(
          { verifyToken: verifyToken.trim() || undefined, subscribedFields: list },
          {
            onSuccess: () => {
              setVerifyToken('');
              toast('Webhook settings saved.');
            },
            onError: reportError
          }
        );
      }}
    >
      <div className="card-h">
        <h2>Webhook</h2>
        <span className="sp" />
        <button
          type="button"
          className="btn sm"
          disabled={test.isPending}
          onClick={() =>
            test.mutate(undefined, {
              onSuccess: r => toast(r.ok ? `Test event stored (${r.stored}). It appears in the events below.` : 'The test event was not stored.'),
              onError: reportError
            })
          }
        >
          {test.isPending ? 'Sending…' : 'Send test event'}
        </button>
        <button className="btn sm pri" type="submit" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
      <div className="card-b">
        <div style={{ marginTop: -12 }}>
          <CopyField id="wh-url" label="Callback URL" value={initial.callbackUrl} />
        </div>
        <SecretInput id="wh-verify" label="Verify token" masked={initial.verifyTokenMasked} value={verifyToken} minLength={8} onChange={setVerifyToken} />
        <p className="hint">Make up a long random string, save it here, then paste the same string in Meta.</p>
        <label className="f" htmlFor="wh-fields">Subscribed fields</label>
        <textarea className="f-in" id="wh-fields" rows={3} value={fields} onChange={e => setFields(e.target.value)} />
        {missing.length ? <p className="hint" style={{ color: 'var(--warn)' }}>Missing: {missing.join(', ')}</p> : null}

        <div className="note i" style={{ marginTop: 14, marginBottom: 0 }}>
          <span className="ic">i</span>
          <div>
            <b>Set up in Meta</b>
            <ol style={{ paddingLeft: 18, marginTop: 4 }}>
              <li>Open the Meta App Dashboard → your app → WhatsApp → Configuration.</li>
              <li>Under Webhook, click Edit. Paste the callback URL and the verify token above, then Verify and save.</li>
              <li>
                Under Webhook fields, subscribe: messages, calls, message_template_status_update, message_template_quality_update, phone_number_quality_update,
                account_update.
              </li>
              <li>Come back and press “Send test event” to check that events are stored and processed.</li>
            </ol>
          </div>
        </div>
      </div>
    </form>
  );
}

function EventsCard() {
  const { toast, reportError } = useAdmin();
  const companies = useAdminCompanies();
  const [company, setCompany] = useState('');
  const [status, setStatus] = useState<WebhookEventStatus>('all');
  const events = useWebhookEvents(company, status);
  const replay = useReplayEvent();

  return (
    <div className="card">
      <div className="card-h">
        <h2>Webhook events</h2>
        <span className="sp" />
        <label className="sr" htmlFor="ev-co">Company</label>
        <select className="f-in" id="ev-co" style={{ width: 'auto' }} value={company} onChange={e => setCompany(e.target.value)}>
          <option value="">All companies</option>
          {companies.data?.map(c => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <label className="sr" htmlFor="ev-st">Status</label>
        <select className="f-in" id="ev-st" style={{ width: 'auto' }} value={status} onChange={e => setStatus(e.target.value as WebhookEventStatus)}>
          <option value="all">All</option>
          <option value="failed">Failed</option>
          <option value="pending">Pending</option>
          <option value="processed">Processed</option>
        </select>
        <button className="btn sm" onClick={() => void events.refetch()} disabled={events.isFetching}>
          Refresh
        </button>
      </div>
      <QueryState q={events} empty={{ title: 'No events', text: 'Events Meta sends to the callback URL appear here.' }}>
        {list => (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Received</th>
                  <th>Company</th>
                  <th>Field</th>
                  <th>Kind</th>
                  <th>Status</th>
                  <th className="r">Attempts</th>
                  <th className="r" />
                </tr>
              </thead>
              <tbody>
                {list.map(ev => (
                  <tr key={ev.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(ev.receivedAt)}</td>
                    <td>{ev.companyName ?? '—'}</td>
                    <td>{ev.field}</td>
                    <td>{ev.kind}</td>
                    <td>
                      {ev.error ? (
                        <>
                          <span className="chip b">failed</span>
                          <div className="hint">{ev.error}</div>
                        </>
                      ) : ev.processedAt ? (
                        <span className="chip ok">processed {fmtDateTime(ev.processedAt)}</span>
                      ) : (
                        <span className="chip w">pending</span>
                      )}
                    </td>
                    <td className="r">{ev.attempts}</td>
                    <td className="r">
                      <button
                        className="btn sm"
                        disabled={replay.isPending}
                        onClick={() => replay.mutate(ev.id, { onSuccess: () => toast('Event queued again.'), onError: reportError })}
                      >
                        Replay
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </QueryState>
    </div>
  );
}

export default function MetaScreen() {
  const meta = usePlatformMeta();
  const webhook = usePlatformWebhook();
  return (
    <>
      <PageHead
        title="Meta & webhook"
        sub="The one Meta app every company’s WhatsApp number connects through, and where Meta sends messages, calls and status updates."
      />
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <QueryState q={meta}>{m => <MetaCard initial={m} />}</QueryState>
        <QueryState q={webhook}>{w => <WebhookCard initial={w} />}</QueryState>
      </div>
      <EventsCard />
    </>
  );
}
