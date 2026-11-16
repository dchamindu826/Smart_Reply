'use client';

import React, { useState } from 'react';
import type { AuditEntry } from '@smart-reply/shared';
import { useApp } from '@/context/AppContext';
import { logTime } from '@/lib/adapters';
import { useExport } from '@/features/insight';
import { AuditFilter, useAuditLog } from '@/features/settings';

const ACTIONS: [string, string][] = [
  ['', 'All actions'],
  ['staff', 'Staff'],
  ['contact', 'Customers'],
  ['label', 'Labels'],
  ['template', 'Templates'],
  ['broadcast', 'Broadcasts'],
  ['quick_reply', 'Quick replies'],
  ['catalog', 'Catalog'],
  ['media', 'Media'],
  ['call_settings', 'Call settings'],
  ['ivr', 'IVR menu'],
  ['forwarding', 'Call forwarding'],
  ['business_profile', 'Business profile'],
  ['whatsapp', 'WhatsApp number'],
  ['integration', 'Integrations'],
  ['export', 'Exports'],
  ['user', 'Account'],
  ['ai', 'AI bot']
];

const SOURCE: Record<AuditEntry['source'], string> = {
  web: 'web',
  mobile: 'mobile app',
  system: 'system',
  meta: 'Meta'
};

function startOfDayIso(day: string): string | undefined {
  return day ? new Date(`${day}T00:00:00`).toISOString() : undefined;
}

function endOfDayIso(day: string): string | undefined {
  return day ? new Date(new Date(`${day}T00:00:00`).getTime() + 86_400_000 - 1).toISOString() : undefined;
}

export default function AuditScreen() {
  const { addToast, reportError, team, staff } = useApp();
  const [actor, setActor] = useState('');
  const [action, setAction] = useState('');
  const [fromDay, setFromDay] = useState('');
  const [toDay, setToDay] = useState('');
  const filter: AuditFilter = {
    actor: actor || undefined,
    action: action || undefined,
    from: startOfDayIso(fromDay),
    to: endOfDayIso(toDay)
  };
  const log = useAuditLog(filter);
  const exporter = useExport();
  const items = log.data?.pages.flatMap(p => p.items) ?? [];
  const people = (team.length ? team : staff).filter((p, i, all) => all.findIndex(x => x.id === p.id) === i);
  const filtered = Boolean(actor || action || fromDay || toDay);

  const doExport = () => {
    const params: Record<string, string> =
      filter.from && filter.to ? { range: 'custom', from: filter.from, to: filter.to } : { range: '30d' };
    exporter.mutate(
      { kind: 'audit', params },
      { onSuccess: res => addToast(`Audit log downloaded as ${res.fileName}.`), onError: reportError }
    );
  };

  return (
    <>
      <div className="ph">
        <div>
          <h1>Audit log</h1>
          <p>Who did what, and when.</p>
        </div>
        <div className="acts">
          <button className="btn" onClick={doExport} disabled={exporter.isPending} title="CSV of the chosen dates, or the last 30 days">
            {exporter.isPending ? 'Exporting…' : 'Export'}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-b">
          <div className="f-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            <div>
              <label className="f" htmlFor="auActor">Person</label>
              <select className="f-in" id="auActor" value={actor} onChange={e => setActor(e.target.value)}>
                <option value="">Everyone</option>
                {people.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.n}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="f" htmlFor="auAction">Action</label>
              <select className="f-in" id="auAction" value={action} onChange={e => setAction(e.target.value)}>
                {ACTIONS.map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="f" htmlFor="auFrom">From</label>
              <input className="f-in" id="auFrom" type="date" value={fromDay} max={toDay || undefined} onChange={e => setFromDay(e.target.value)} />
            </div>
            <div>
              <label className="f" htmlFor="auTo">To</label>
              <input className="f-in" id="auTo" type="date" value={toDay} min={fromDay || undefined} onChange={e => setToDay(e.target.value)} />
            </div>
          </div>
          {filtered && (
            <button
              className="btn sm"
              style={{ marginTop: '10px' }}
              onClick={() => {
                setActor('');
                setAction('');
                setFromDay('');
                setToDay('');
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-b">
          {log.isLoading ? (
            <p className="hint">Loading…</p>
          ) : log.isError ? (
            <p className="hint">
              Could not load the audit log. <button className="btn sm" onClick={() => void log.refetch()}>Try again</button>
            </p>
          ) : items.length === 0 ? (
            <div className="empty">
              <b>{filtered ? 'Nothing matches these filters' : 'Nothing recorded yet'}</b>
              Changes to settings, staff, templates and exports show up here.
            </div>
          ) : (
            <>
              <div className="tl">
                {items.map((e, i) => (
                  <div className={`tl-i${i === 0 ? ' hi' : ''}`} key={e.id}>
                    <b>{e.summary || e.action}</b>
                    <span>
                      {logTime(e.at)} · {e.actorName} · {SOURCE[e.source] ?? e.source}
                    </span>
                  </div>
                ))}
              </div>
              {log.hasNextPage && (
                <button
                  className="btn"
                  style={{ width: '100%', justifyContent: 'center', marginTop: '12px' }}
                  onClick={() => void log.fetchNextPage()}
                  disabled={log.isFetchingNextPage}
                >
                  {log.isFetchingNextPage ? 'Loading…' : 'Load more'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
