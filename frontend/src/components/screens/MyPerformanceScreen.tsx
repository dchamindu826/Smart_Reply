'use client';

import React, { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { useSession } from '@/features/session';
import { dayLabel, formatCount, RANGE_LABEL, RangeKey, useExport, useMyPerformance } from '@/features/insight';
import { replyTime } from '@/lib/adapters';

const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: 'This week' },
  { key: 'month', label: 'Month' }
];

export default function MyPerformanceScreen() {
  const { addToast, reportError } = useApp();
  const { me } = useSession();
  const [range, setRange] = useState<RangeKey>('7d');
  const perf = useMyPerformance(range);
  const exporter = useExport();
  const p = perf.data;

  const daily = p?.daily ?? [];
  const values = daily.map(x => x.resolved);
  const mx = Math.max(0, ...values);
  const many = daily.length > 7;
  const dash = perf.isLoading ? '…' : '—';
  const rangeText = range === '7d' ? 'this week' : RANGE_LABEL[range].toLowerCase();

  const doExport = () =>
    exporter.mutate(
      { kind: 'performance', params: { range } },
      { onSuccess: res => addToast(`Your report downloaded as ${res.fileName}.`), onError: reportError }
    );

  return (
    <>
      <div className="ph">
        <div>
          <h1>My performance</h1>
          <p>
            {me?.user.name ?? ''} · {rangeText}
          </p>
        </div>
        <div className="acts">
          <div className="seg">
            {RANGES.map(r => (
              <button key={r.key} aria-pressed={range === r.key} className={range === r.key ? 'active' : ''} onClick={() => setRange(r.key)}>
                {r.label}
              </button>
            ))}
          </div>
          {me?.permissions.exportOwn && (
            <button className="btn" onClick={doExport} disabled={exporter.isPending}>
              {exporter.isPending ? 'Exporting…' : 'Export'}
            </button>
          )}
        </div>
      </div>

      {perf.isError && (
        <p className="hint" style={{ color: 'var(--bad)', marginBottom: '10px' }}>
          Could not load your performance. <button className="btn sm" onClick={() => void perf.refetch()}>Try again</button>
        </p>
      )}

      <div className="stats">
        <div className="stat ok">
          <span>Score</span>
          <b>{p ? `${p.targetPercent}%` : dash}</b>
          <small>{p && p.resolvedTarget > 0 ? `Of target · ${formatCount(p.resolvedTarget)} resolved` : 'Of your target'}</small>
        </div>
        <div className="stat i">
          <span>Chats handled</span>
          <b>{p ? formatCount(p.chatsHandled) : dash}</b>
          <small>{p ? `${formatCount(p.resolved)} resolved` : 'Loading…'}</small>
        </div>
        <div className="stat">
          <span>Avg reply</span>
          <b>{p ? replyTime(p.avgFirstReplySeconds) : dash}</b>
          <small>{p ? `${formatCount(p.callsAnswered)} call${p.callsAnswered === 1 ? '' : 's'} answered` : 'Loading…'}</small>
        </div>
        <div className="stat w">
          <span>Missed / rejected</span>
          <b>{p ? formatCount(p.callsMissed) : dash}</b>
          <small>{p ? `${formatCount(p.breakMinutes)} min on break` : 'Loading…'}</small>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <h2>Resolved per day</h2>
        </div>
        <div className="card-b">
          {perf.isLoading ? (
            <p className="hint">Loading…</p>
          ) : daily.length === 0 ? (
            <p className="hint">No days in this range.</p>
          ) : (
            <>
              <div className="bars" style={many ? { gridTemplateColumns: `repeat(${daily.length}, 1fr)`, gap: '3px' } : { gridTemplateColumns: `repeat(${Math.max(daily.length, 1)}, 1fr)` }}>
                {daily.map(x => (
                  <div key={x.date} className={mx > 0 && x.resolved === mx ? 'hi' : ''} title={`${x.date} · ${x.resolved} resolved · ${x.calls} calls`}>
                    {x.resolved}
                    <i style={{ height: `${mx > 0 ? Math.max(4, Math.round((x.resolved / mx) * 100)) : 4}%` }} />
                    {dayLabel(x.date, many)}
                  </div>
                ))}
              </div>
              {mx === 0 && <p className="hint">Nothing resolved yet in this range.</p>}
            </>
          )}
        </div>
      </div>
    </>
  );
}
