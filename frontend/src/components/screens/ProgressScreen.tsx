'use client';

import React, { useMemo, useState } from 'react';
import type { ReportRow, StaffTarget } from '@smart-reply/shared';
import { useApp } from '@/context/AppContext';
import { ProgressRange, useProgress, useSaveTargets, useTargets } from '@/features/team';
import { replyTime } from '@/lib/adapters';
import SectionThemeToggle from '@/components/common/SectionThemeToggle';

const SLOW_REPLY_SECONDS = 300;

function TargetsForm({ rows, targets, onDone }: { rows: ReportRow[]; targets: StaffTarget[]; onDone: () => void }) {
  const { addToast, reportError } = useApp();
  const save = useSaveTargets();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map(r => [r.userId, String(targets.find(t => t.userId === r.userId)?.resolvedTarget ?? 0)]))
  );

  const submit = async () => {
    const list: StaffTarget[] = [];
    for (const r of rows) {
      const n = Number(values[r.userId] ?? 0);
      if (!Number.isInteger(n) || n < 0 || n > 10000) {
        addToast(`Enter a whole number for ${r.name}.`);
        return;
      }
      list.push({ userId: r.userId, resolvedTarget: n });
    }
    try {
      await save.mutateAsync(list);
      addToast('Weekly targets saved.');
      onDone();
    } catch (err) {
      reportError(err);
    }
  };

  return (
    <>
      <h2>Weekly targets</h2>
      <p className="sub">Resolved chats each person should reach in a week. 0 means no target.</p>
      {rows.map(r => (
        <div key={r.userId} className="ln">
          <span>{r.name}</span>
          <b>
            <input
              className="f-in"
              style={{ width: '90px', textAlign: 'right' }}
              type="number"
              min={0}
              max={10000}
              aria-label={`Target for ${r.name}`}
              value={values[r.userId] ?? '0'}
              onChange={e => setValues(prev => ({ ...prev, [r.userId]: e.target.value }))}
            />
          </b>
        </div>
      ))}
      <button className="btn pri" style={{ width: '100%', justifyContent: 'center', marginTop: '14px' }} disabled={save.isPending} onClick={submit}>
        {save.isPending ? 'Saving…' : 'Save targets'}
      </button>
    </>
  );
}

export default function ProgressScreen() {
  const { role, team, openSheet, closeSheet } = useApp();
  const isManager = role === 'manager';
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('week');
  const range: ProgressRange = period === 'week' ? '7d' : period;
  const progressQ = useProgress(range, isManager);
  const targetsQ = useTargets(isManager);

  const rows = useMemo(() => progressQ.data?.rows ?? [], [progressQ.data]);
  const targets = targetsQ.data ?? progressQ.data?.targets ?? [];
  const live = useMemo(() => new Map(team.map(t => [t.id, t])), [team]);
  const slow = useMemo(
    () =>
      rows
        .filter(r => (r.avgFirstReplySeconds ?? 0) > SLOW_REPLY_SECONDS)
        .sort((a, b) => (b.avgFirstReplySeconds ?? 0) - (a.avgFirstReplySeconds ?? 0)),
    [rows]
  );

  return (
    <>
      <div className="ph">
        <div>
          <h1>Progress</h1>
          <p>Each person against their weekly target of resolved chats.</p>
        </div>
        <div className="acts">
          <div className="seg">
            <button
              aria-pressed={period === 'today'}
              className={period === 'today' ? 'active' : ''}
              onClick={() => setPeriod('today')}
            >
              Today
            </button>
            <button
              aria-pressed={period === 'week'}
              className={period === 'week' ? 'active' : ''}
              onClick={() => setPeriod('week')}
            >
              This week
            </button>
            <button
              aria-pressed={period === 'month'}
              className={period === 'month' ? 'active' : ''}
              onClick={() => setPeriod('month')}
            >
              Month
            </button>
          </div>
          <SectionThemeToggle />
          {isManager && (
            <button
              className="btn"
              disabled={!rows.length}
              onClick={() => openSheet(<TargetsForm rows={rows} targets={targets} onDone={closeSheet} />)}
            >
              Targets
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Target progress</th>
                <th className="r">Resolved</th>
                <th className="r">Avg first reply</th>
                <th className="r">Calls answered</th>
                <th className="r">Missed</th>
              </tr>
            </thead>
            <tbody>
              {progressQ.isLoading ? (
                <tr>
                  <td colSpan={6}><span className="hint">Loading…</span></td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="empty">
                      <b>No one to show</b>
                      Add staff on the Staff manage screen.
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map(r => {
                  const s = live.get(r.userId);
                  const target = targets.find(t => t.userId === r.userId)?.resolvedTarget ?? 0;
                  return (
                    <tr key={r.userId}>
                      <td>
                        <div className="emp">
                          <i className="av">{s?.i ?? r.name.slice(0, 2).toUpperCase()}</i>
                          <span>
                            <b>{r.name}</b>
                            <span>{s?.stt ?? ''}</span>
                          </span>
                        </div>
                      </td>
                      <td style={{ minWidth: '200px' }}>
                        <div className="meter">
                          <i style={{ width: `${Math.min(100, r.targetPercent)}%` }} />
                        </div>
                        <span className="hint">{target > 0 ? `${r.targetPercent} of 100 · target ${target} a week` : 'No target set'}</span>
                      </td>
                      <td className="r">{r.resolved}</td>
                      <td className="r">{replyTime(r.avgFirstReplySeconds)}</td>
                      <td className="r">{r.callsAnswered}</td>
                      <td className="r">{r.callsMissed}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {slow.length > 0 && (
        <div className="note w">
          <span className="ic">⚠</span>
          <div>
            <b>{slow[0].name.split(' ')[0]}’s first reply is {replyTime(slow[0].avgFirstReplySeconds)}</b>
            Above the 5-minute target{slow.length > 1 ? `, like ${slow.slice(1).map(r => r.name.split(' ')[0]).join(', ')}` : ''}.
          </div>
        </div>
      )}
    </>
  );
}
