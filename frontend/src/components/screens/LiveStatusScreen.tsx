'use client';

import React, { useState, useEffect, useMemo } from 'react';
import type { BreakEntry } from '@smart-reply/shared';
import { useApp } from '@/context/AppContext';
import { useBreaks } from '@/features/team';
import { hhmm } from '@/lib/adapters';
import { formatDuration } from '@/lib/ui';
import { Staff } from '@/types';
import SectionThemeToggle from '@/components/common/SectionThemeToggle';

export default function LiveStatusScreen() {
  const {
    role,
    staff: allStaff,
    team,
    manager,
    currentUser,
    callConfig,
    setStatusModalOpen,
    setStaffStatus,
    setScreen,
    addToast
  } = useApp();
  const isManager = role === 'manager';

  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Invited people have not signed in yet; they are not part of the live team.
  const staff = useMemo(() => allStaff.filter(s => s.status !== 'invited' && s.id !== currentUser.id), [allStaff, currentUser.id]);
  const otherManagers = useMemo(
    () => team.filter(m => m.role === 'manager' && m.id !== currentUser.id && m.status !== 'invited'),
    [team, currentUser.id]
  );
  const me = team.find(m => m.id === currentUser.id);
  const members: Staff[] = useMemo(() => [...staff, ...otherManagers], [staff, otherManagers]);

  const breaksQ = useBreaks('today', isManager);
  const { refetch: refetchBreaks } = breaksQ;
  const breaksBy = useMemo(() => new Map((breaksQ.data ?? []).map(b => [b.userId, b])), [breaksQ.data]);
  const brkMax = breaksQ.data?.[0]?.limitMinutes ?? callConfig.brkmax;

  // A status change (live over the socket) can open or close a break: reload the log.
  const presenceKey = team.map(m => `${m.id}:${m.call.st}:${m.chat.st}`).join('|');
  useEffect(() => {
    if (isManager) void refetchBreaks();
  }, [presenceKey, isManager, refetchBreaks]);

  /** Break minutes today: finished breaks plus the one running now, counted live. */
  const breakMinutes = (s: Staff) => {
    const b = breaksBy.get(s.id);
    if (!b) return s.used;
    return b.entries.reduce((sum, e) => sum + (e.endedAt ? e.minutes : Math.round((now - new Date(e.startedAt).getTime()) / 60000)), 0);
  };

  const logRows = useMemo(() => {
    const rows: { userId: string; name: string; e: BreakEntry }[] = [];
    for (const b of breaksQ.data ?? []) for (const e of b.entries) rows.push({ userId: b.userId, name: b.name, e });
    return rows.sort((a, b) => a.e.startedAt.localeCompare(b.e.startedAt));
  }, [breaksQ.data]);

  const setAvailable = async (s: Staff) => {
    setBusy(s.id);
    await setStaffStatus(s.id, 'both', 'available');
    setBusy(null);
    addToast(`${s.n.split(' ')[0]} set to available for calls and chats.`);
  };

  const onBreakStaff = staff.filter(s => s.call.st === 'brk' || s.chat.st === 'brk');
  const lateStaff = staff.filter(
    s => s.call.st === 'brk' && s.call.mins && (now - s.call.since > s.call.mins * 60000)
  );

  const getStatusLabel = (st: string, r?: string) => {
    if (st === 'brk') return `${r || 'Break'} break`;
    return {
      available: 'Available',
      oncall: 'On a call',
      brk: 'On break',
      away: 'Away',
      dnd: 'Do not disturb'
    }[st] || st;
  };

  const getStatusColor = (st: string) => {
    return {
      available: 'ok',
      oncall: 'i',
      brk: 'w',
      away: '',
      dnd: 'b'
    }[st] || '';
  };

  return (
    <>
      <div className="ph">
        <div>
          <h1>Live status</h1>
          <p>Who can take calls and chats right now. It changes the moment someone changes status on their phone.</p>
        </div>
        <div className="acts">
          <SectionThemeToggle />
          <button className="btn" onClick={() => setScreen('callset')}>
            Break rules
          </button>
          <button className="btn pri" onClick={() => setStatusModalOpen(true)}>
            My status
          </button>
        </div>
      </div>

      <div className="stats">
        <div className="stat ok">
          <span>Calls</span>
          <b>{staff.filter(s => s.call.st === 'available').length} of {staff.length}</b>
          <small>can answer now · {staff.filter(s => s.call.st === 'oncall').length} on a call</small>
        </div>
        <div className="stat i">
          <span>Chats</span>
          <b>{staff.filter(s => s.chat.st === 'available').length} of {staff.length}</b>
          <small>take new chats</small>
        </div>
        <div className="stat w">
          <span>On break</span>
          <b>{onBreakStaff.length}</b>
          <small>{onBreakStaff.map(s => s.n.split(' ')[0]).join(', ') || 'Nobody'}</small>
        </div>
        <div className="stat b">
          <span>Away / DND</span>
          <b>{staff.filter(s => /away|dnd/.test(s.call.st + s.chat.st)).length}</b>
          <small>Calls or chats switched off</small>
        </div>
      </div>

      {lateStaff.length > 0 && (
        <div className="note w">
          <span className="ic">⚠</span>
          <div>
            <b>{lateStaff.map(s => s.n.split(' ')[0]).join(', ')} is over the planned break time</b>
            Planned {lateStaff[0].call.mins} minutes.
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-h">
          <h2>Team</h2>
          <span className="chip ok">Live</span>
        </div>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Calls</th>
                <th>Chats</th>
                <th className="r">Open chats</th>
                <th>Breaks today</th>
                <th className="r" />
              </tr>
            </thead>
            <tbody>
              {members.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty">
                      <b>No staff yet</b>
                      Add people on the Staff manage screen.
                    </div>
                  </td>
                </tr>
              )}
              {members.map(s => {
                const off = (s.call.st !== 'available' && s.call.st !== 'oncall') || s.chat.st !== 'available';
                const bt = breakMinutes(s);

                return (
                  <tr key={s.id}>
                    <td>
                      <div className="emp">
                        <i className={`av st ${s.st}`}>{s.i}</i>
                        <span>
                          <b>{s.n}</b>
                          <span>{s.role === 'manager' ? 'Manager' : 'Staff'}{s.title && !/^(staff|manager)$/i.test(s.title) ? ` · ${s.title}` : ''}{s.noteS ? ` · ${s.noteS}` : ''}</span>
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={`chip sc ${getStatusColor(s.call.st)}`}>
                        ☏ {getStatusLabel(s.call.st, s.call.r)}{' '}
                        <b className="tmr">{formatDuration(now - s.call.since)}</b>
                      </span>
                      {s.call.st === 'brk' && s.call.mins ? (
                        <div className="hint">planned {s.call.mins} min</div>
                      ) : null}
                    </td>
                    <td>
                      <span className={`chip sc ${getStatusColor(s.chat.st)}`}>
                        ✉ {getStatusLabel(s.chat.st, s.chat.r)}{' '}
                        <b className="tmr">{formatDuration(now - s.chat.since)}</b>
                      </span>
                    </td>
                    <td className="r">{s.open}</td>
                    <td style={{ minWidth: '150px' }}>
                      <div className="meter">
                        <i style={{ width: `${Math.min(100, Math.round((bt / brkMax) * 100))}%` }} />
                      </div>
                      <span className="hint">{bt} of {brkMax} min</span>
                    </td>
                    <td className="r" style={{ whiteSpace: 'nowrap' }}>
                      {isManager && off && (
                        <button
                          className="btn sm"
                          disabled={busy === s.id}
                          onClick={() => void setAvailable(s)}
                        >
                          Set available
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}

              <tr>
                <td>
                  <div className="emp">
                    <i className="av">{manager.i}</i>
                    <span>
                      <b>{manager.n} (you)</b>
                      <span>{me?.title && !/^manager$/i.test(me.title) ? `${me.title} · ` : ''}{isManager ? 'Manager' : 'Staff'}</span>
                    </span>
                  </div>
                </td>
                <td>
                  <span className={`chip sc ${getStatusColor(manager.call.st)}`}>
                    ☏ {getStatusLabel(manager.call.st, manager.call.r)}{' '}
                    <b className="tmr">{formatDuration(now - manager.call.since)}</b>
                  </span>
                </td>
                <td>
                  <span className={`chip sc ${getStatusColor(manager.chat.st)}`}>
                    ✉ {getStatusLabel(manager.chat.st, manager.chat.r)}{' '}
                    <b className="tmr">{formatDuration(now - manager.chat.since)}</b>
                  </span>
                </td>
                <td className="r">{me?.open ?? 0}</td>
                <td>
                  <span className="hint">{me ? breakMinutes(me) : manager.used} min</span>
                </td>
                <td className="r">
                  <button className="btn sm" onClick={() => setStatusModalOpen(true)}>
                    Change
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid g2">
        <div className="card">
          <div className="card-h">
            <h2>Break log · today</h2>
          </div>
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Reason</th>
                  <th>Start</th>
                  <th className="r">Minutes</th>
                </tr>
              </thead>
              <tbody>
                {breaksQ.isLoading ? (
                  <tr>
                    <td colSpan={4}><span className="hint">Loading…</span></td>
                  </tr>
                ) : logRows.length ? (
                  logRows.map(({ userId, name, e }) => (
                    <tr key={e.id}>
                      <td>{userId === currentUser.id ? 'You' : name.split(' ')[0]}</td>
                      <td>
                        {e.reason || 'Break'}
                        {!e.endedAt && <> <span className="chip w">now</span></>}
                      </td>
                      <td>{hhmm(e.startedAt)}</td>
                      <td className="r">
                        {e.endedAt ? e.minutes : <b className="tmr">{formatDuration(now - new Date(e.startedAt).getTime())}</b>}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4}><span className="hint">No breaks yet today.</span></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <h2>What each status does</h2>
          </div>
          <div className="card-b">
            <div className="ln">
              <span>☏ Available</span>
              <b>Calls ring them</b>
            </div>
            <div className="ln">
              <span>☏ Break / Away</span>
              <b>Calls → Sales queue</b>
            </div>
            <div className="ln">
              <span>☏ Do not disturb</span>
              <b>Missed-call message + callback</b>
            </div>
            <div className="ln">
              <span>✉ Available</span>
              <b>New chats are assigned</b>
            </div>
            <div className="ln">
              <span>✉ Break / Away</span>
              <b>New chats → team, open chats wait</b>
            </div>
            <div className="ln">
              <span>✉ Do not disturb</span>
              <b>No new chats, no alerts</b>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
