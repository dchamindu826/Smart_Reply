'use client';

import React from 'react';
import { useApp } from '@/context/AppContext';
import { logTime } from '@/lib/adapters';
import { useTestWebhook, useWebhookEvents, useWebhookStatus } from '@/features/settings';

export default function IntegrationsScreen() {
  const { addToast, reportError } = useApp();
  const status = useWebhookStatus();
  const events = useWebhookEvents();
  const test = useTestWebhook();
  const s = status.data;
  const list = events.data ?? [];
  const last = list[0];

  const sendTest = () =>
    test.mutate(undefined, {
      onSuccess: () => addToast('Test event stored and queued. It shows in Recent events once processed.'),
      onError: reportError
    });

  return (
    <>
      <div className="ph">
        <div>
          <h1>Webhooks &amp; API</h1>
          <p>How Smart Reply talks to Meta. Your developer needs these; staff never do.</p>
        </div>
        <div className="acts">
          <button className="btn" onClick={sendTest} disabled={test.isPending}>
            {test.isPending ? 'Sending…' : 'Send test event'}
          </button>
        </div>
      </div>

      <div className="grid g2">
        <div className="card">
          <div className="card-h">
            <h2>Meta webhook</h2>
            {s && <span className={`chip ${s.subscribed ? 'ok' : 'w'}`}>{s.subscribed ? 'Verified' : 'Not subscribed'}</span>}
          </div>
          <div className="card-b">
            {status.isLoading ? (
              <p className="hint">Loading…</p>
            ) : !s ? (
              <p className="hint">
                Could not load the webhook status. <button className="btn sm" onClick={() => void status.refetch()}>Try again</button>
              </p>
            ) : (
              <>
                <div className="ln">
                  <span>Callback URL</span>
                  <b style={{ wordBreak: 'break-all' }}>{s.callbackUrl}</b>
                </div>
                <div className="ln">
                  <span>Last event</span>
                  <b>
                    {s.lastEventAt ? logTime(s.lastEventAt) : 'None yet'}
                    {last && s.lastEventAt === last.receivedAt ? ` · ${last.field}.${last.kind}` : ''}
                  </b>
                </div>
                <div className="ln">
                  <span>Events (24h)</span>
                  <b>{s.events24h.toLocaleString('en-GB')}</b>
                </div>
                <div className="ln">
                  <span>Failures (24h)</span>
                  <b style={s.failures24h > 0 ? { color: 'var(--bad)' } : undefined}>{s.failures24h.toLocaleString('en-GB')}</b>
                </div>
                <p className="hint">
                  The Meta app, verify token and subscriptions are managed by LUMI AI. Contact LUMI AI to change them.
                </p>
              </>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <h2>Recent events</h2>
            {list.length > 0 && <span className="chip">{list.length}</span>}
          </div>
          {events.isLoading ? (
            <div className="card-b"><p className="hint">Loading…</p></div>
          ) : events.isError ? (
            <div className="card-b"><p className="hint">Could not load events.</p></div>
          ) : list.length === 0 ? (
            <div className="empty">
              <b>No events yet</b>
              Events from Meta show up here as they arrive.
            </div>
          ) : (
            <div style={{ maxHeight: '440px', overflowY: 'auto' }}>
              {list.map(e => (
                <div className="list-row" key={e.id}>
                  <span className={`dot ${e.error ? 'b' : e.processedAt ? 'ok' : 'w'}`} />
                  <div className="bd">
                    <b>
                      {e.field} · {e.kind}
                    </b>
                    <span>
                      {logTime(e.receivedAt)}
                      {e.processedAt ? '' : ' · waiting'}
                      {e.attempts > 1 ? ` · ${e.attempts} attempts` : ''}
                      {e.error ? ` · ${e.error}` : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
