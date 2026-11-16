'use client';

import React, { useState } from 'react';
import { useApp } from '@/context/AppContext';
import SectionThemeToggle from '@/components/common/SectionThemeToggle';
import { useSession } from '@/features/session';
import { dayLabel, ExportKind, formatCount, RANGE_LABEL, RangeKey, useExport, useReports } from '@/features/insight';
import { replyTime } from '@/lib/adapters';

const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: 'This week' },
  { key: '30d', label: '30 days' },
  { key: 'month', label: 'Month' },
  { key: 'custom', label: 'Custom' }
];

const EXPORTS: { kind: ExportKind; title: string; text: string; ranged: boolean }[] = [
  { kind: 'reports', title: 'Team report', text: 'Chats, resolved, reply time, calls and breaks per person', ranged: true },
  { kind: 'calls', title: 'Call log', text: 'Every call with who handled it and how long it took', ranged: true },
  { kind: 'conversations', title: 'Conversations', text: 'Messages in the range, including message text', ranged: true },
  { kind: 'contacts', title: 'Customers', text: 'All customers with owner and labels', ranged: false },
  { kind: 'audit', title: 'Audit log', text: 'Who did what, and when', ranged: true }
];

function localDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function ExportSheet({ params, rangeText }: { params: Record<string, string>; rangeText: string }) {
  const { addToast, reportError } = useApp();
  const exporter = useExport();
  const [busy, setBusy] = useState<ExportKind | null>(null);
  const run = (kind: ExportKind, ranged: boolean) => {
    setBusy(kind);
    exporter.mutate(
      { kind, params: ranged ? params : {} },
      {
        onSuccess: res => addToast(`${res.fileName} downloaded.`),
        onError: reportError,
        onSettled: () => setBusy(null)
      }
    );
  };
  return (
    <>
      <h2>Export</h2>
      <p className="sub">CSV files for {rangeText.toLowerCase()}. Customers are always exported in full.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {EXPORTS.map(e => (
          <div key={e.kind} className="list-row" style={{ paddingLeft: 0, paddingRight: 0 }}>
            <div className="bd">
              <b>{e.title}</b>
              <span>{e.text}</span>
            </div>
            <div className="rt">
              <button className="btn sm" disabled={busy !== null} onClick={() => run(e.kind, e.ranged)}>
                {busy === e.kind ? 'Exporting…' : 'Download CSV'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export default function ReportsScreen() {
  const { openSheet } = useApp();
  const { me } = useSession();
  const [period, setPeriod] = useState<RangeKey>('7d');
  const [today] = useState(() => localDay(new Date()));
  const [fromDay, setFromDay] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return localDay(d);
  });
  const [toDay, setToDay] = useState(today);

  const customValid = Boolean(fromDay && toDay && fromDay <= toDay);
  const fromIso = customValid ? new Date(`${fromDay}T00:00:00`).toISOString() : undefined;
  const toIso = customValid ? new Date(new Date(`${toDay}T00:00:00`).getTime() + 86_400_000).toISOString() : undefined;
  const reports = useReports(period, fromIso, toIso);
  const r = reports.data;

  const rangeText = period === 'custom' ? `${fromDay} to ${toDay}` : period === '7d' ? 'This week' : RANGE_LABEL[period];
  const exportParams: Record<string, string> =
    period === 'custom' && fromIso && toIso ? { range: 'custom', from: fromIso, to: toIso } : { range: period };

  const chats = r ? r.byStaff.reduce((sum, s) => sum + s.chatsHandled, 0) : 0;
  const daily = r?.daily ?? [];
  const many = daily.length > 7;
  const mx = Math.max(0, ...daily.map(x => x.messagesIn));
  const answered = r?.totals.callsAnswered ?? 0;
  const missed = r?.totals.callsMissed ?? 0;
  const callTotal = answered + missed;
  const labelTotal = (r?.byLabel ?? []).reduce((sum, l) => sum + l.count, 0);
  const topLabels = [...(r?.byLabel ?? [])].sort((a, b) => b.count - a.count).filter(l => l.count > 0);
  const shownLabels = topLabels.slice(0, 4);
  const otherCount = topLabels.slice(4).reduce((sum, l) => sum + l.count, 0);
  const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : '0%');
  const dash = reports.isLoading ? '…' : '—';

  return (
    <>
      <div className="ph">
        <div>
          <h1>Reports</h1>
          <p>
            {rangeText}
            {me?.company ? ` · ${me.company.name}` : ''}
          </p>
        </div>
        <div className="acts">
          <div className="seg">
            {RANGES.map(x => (
              <button key={x.key} aria-pressed={period === x.key} className={period === x.key ? 'active' : ''} onClick={() => setPeriod(x.key)}>
                {x.label}
              </button>
            ))}
          </div>
          <SectionThemeToggle />
          <button className="btn" onClick={() => openSheet(<ExportSheet params={exportParams} rangeText={rangeText} />)}>
            Export
          </button>
        </div>
      </div>

      {period === 'custom' && (
        <div className="card">
          <div className="card-b">
            <div className="f-row f2">
              <div>
                <label className="f" htmlFor="rpFrom">From</label>
                <input className="f-in" id="rpFrom" type="date" value={fromDay} max={toDay || today} onChange={e => setFromDay(e.target.value)} />
              </div>
              <div>
                <label className="f" htmlFor="rpTo">To</label>
                <input className="f-in" id="rpTo" type="date" value={toDay} min={fromDay} max={today} onChange={e => setToDay(e.target.value)} />
              </div>
            </div>
            {!customValid && <p className="hint" style={{ color: 'var(--bad)' }}>Pick a start date on or before the end date.</p>}
          </div>
        </div>
      )}

      {reports.isError && (
        <p className="hint" style={{ color: 'var(--bad)', marginBottom: '10px' }}>
          Could not load the report. <button className="btn sm" onClick={() => void reports.refetch()}>Try again</button>
        </p>
      )}

      <div className="stats">
        <div className="stat i">
          <span>Conversations</span>
          <b>{r ? formatCount(chats) : dash}</b>
          <small>{r ? `${formatCount(r.totals.newCustomers)} new customers` : 'Loading…'}</small>
        </div>
        <div className="stat ok">
          <span>Resolved</span>
          <b>{r ? formatCount(r.totals.resolved) : dash}</b>
          <small>{r ? `${pct(r.totals.resolved, chats)} of conversations` : 'Loading…'}</small>
        </div>
        <div className="stat w">
          <span>Avg first reply</span>
          <b>{r ? replyTime(r.totals.avgFirstReplySeconds) : dash}</b>
          <small>Target 5 min</small>
        </div>
        <div className="stat">
          <span>Templates sent</span>
          <b>{r ? formatCount(r.totals.templatesSent) : dash}</b>
          <small>{r ? `${formatCount(r.totals.messagesOut)} messages sent · ${formatCount(r.totals.messagesIn)} received` : 'Loading…'}</small>
        </div>
      </div>

      <div className="grid gmain">
        <div className="card">
          <div className="card-h">
            <h2>Messages per day</h2>
            <span className="chip">Received</span>
          </div>
          <div className="card-b">
            {reports.isLoading ? (
              <p className="hint">Loading…</p>
            ) : daily.length === 0 ? (
              <p className="hint">No days in this range.</p>
            ) : (
              <>
                <div className="bars" style={{ gridTemplateColumns: `repeat(${daily.length}, 1fr)`, ...(many ? { gap: '3px' } : {}) }}>
                  {daily.map(x => (
                    <div
                      key={x.date}
                      className={mx > 0 && x.messagesIn === mx ? 'hi' : ''}
                      title={`${x.date} · ${x.messagesIn} in · ${x.messagesOut} out · ${x.calls} calls`}
                    >
                      {x.messagesIn}
                      <i style={{ height: `${mx > 0 ? Math.max(4, Math.round((x.messagesIn / mx) * 100)) : 4}%` }} />
                      {dayLabel(x.date, many)}
                    </div>
                  ))}
                </div>
                {mx === 0 && <p className="hint">No messages received in this range.</p>}
              </>
            )}
          </div>
        </div>

        <div>
          <div className="card">
            <div className="card-h">
              <h2>Calls</h2>
            </div>
            <div className="card-b">
              <div className="split">
                {callTotal > 0 ? (
                  <>
                    <i style={{ flex: answered, background: 'var(--blue)' }} />
                    <i style={{ flex: missed, background: 'var(--bad)' }} />
                  </>
                ) : (
                  <i style={{ flex: 1, background: 'var(--rule)' }} />
                )}
              </div>
              <div className="ln"><span>Answered</span><b>{formatCount(answered)} · {pct(answered, callTotal)}</b></div>
              <div className="ln"><span>Missed</span><b>{formatCount(missed)}</b></div>
            </div>
          </div>

          <div className="card">
            <div className="card-h">
              <h2>Top enquiries</h2>
              <span className="chip">By label</span>
            </div>
            <div className="card-b">
              {reports.isLoading ? (
                <p className="hint">Loading…</p>
              ) : shownLabels.length === 0 ? (
                <p className="hint">No labelled customers in this range.</p>
              ) : (
                <>
                  {shownLabels.map(l => (
                    <div className="ln" key={l.labelId}>
                      <span>{l.name}</span>
                      <b>{pct(l.count, labelTotal)}</b>
                    </div>
                  ))}
                  {otherCount > 0 && (
                    <div className="ln"><span>Other</span><b>{pct(otherCount, labelTotal)}</b></div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <h2>By staff</h2>
        </div>
        {reports.isLoading ? (
          <div className="card-b"><p className="hint">Loading…</p></div>
        ) : !r || r.byStaff.length === 0 ? (
          <div className="empty">
            <b>No staff activity</b>
            Nobody handled chats or calls in this range.
          </div>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Staff</th>
                  <th className="r">Chats</th>
                  <th className="r">Resolved</th>
                  <th className="r">Avg first reply</th>
                  <th className="r">Calls answered</th>
                  <th className="r">Missed</th>
                  <th className="r">Break min</th>
                  <th className="r">Target</th>
                </tr>
              </thead>
              <tbody>
                {r.byStaff.map(s => (
                  <tr key={s.userId}>
                    <td><b>{s.name}</b></td>
                    <td className="r">{formatCount(s.chatsHandled)}</td>
                    <td className="r">{formatCount(s.resolved)}</td>
                    <td className="r">{replyTime(s.avgFirstReplySeconds)}</td>
                    <td className="r">{formatCount(s.callsAnswered)}</td>
                    <td className="r">{formatCount(s.callsMissed)}</td>
                    <td className="r">{formatCount(s.breakMinutes)}</td>
                    <td className="r">{s.targetPercent}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
