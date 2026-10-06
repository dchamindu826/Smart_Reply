'use client';

import React, { useState, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { formatDuration } from '@/data/mockData';
import SectionThemeToggle from '@/components/common/SectionThemeToggle';

export default function LiveStatusScreen() {
  const {
    staff,
    manager,
    callConfig,
    setStatusModalOpen,
    setUserStatus,
    setScreen,
    addToast
  } = useApp();

  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const brkMax = callConfig.brkmax;

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
              {staff.map(s => {
                const onBrk = s.call.st === 'brk' || s.chat.st === 'brk';
                const off = (s.call.st !== 'available' && s.call.st !== 'oncall') || s.chat.st !== 'available';
                const bt = s.used + (onBrk ? Math.round((now - s.call.since) / 60000) : 0);

                return (
                  <tr key={s.id}>
                    <td>
                      <div className="emp">
                        <i className={`av st ${s.st}`}>{s.i}</i>
                        <span>
                          <b>{s.n}</b>
                          <span>Staff · Sales{s.noteS ? ` · ${s.noteS}` : ''}</span>
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
                      {onBrk && (
                        <button
                          className="btn sm"
                          style={{ marginRight: '6px' }}
                          onClick={() => addToast(`${s.n.split(' ')[0]} got a reminder to come back.`)}
                        >
                          Remind
                        </button>
                      )}
                      {off && (
                        <button
                          className="btn sm"
                          onClick={() => {
                            s.call.st = 'available';
                            s.chat.st = 'available';
                            addToast(`${s.n.split(' ')[0]} set to available for calls and chats.`);
                          }}
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
                    <i className="av">MP</i>
                    <span>
                      <b>Madushan P. (you)</b>
                      <span>Owner · Manager</span>
                    </span>
                  </div>
                </td>
                <td>
                  <span className={`chip sc ${getStatusColor(manager.call.st)}`}>
                    ☏ {getStatusLabel(manager.call.st)}{' '}
                    <b className="tmr">{formatDuration(now - manager.call.since)}</b>
                  </span>
                </td>
                <td>
                  <span className={`chip sc ${getStatusColor(manager.chat.st)}`}>
                    ✉ {getStatusLabel(manager.chat.st)}{' '}
                    <b className="tmr">{formatDuration(now - manager.chat.since)}</b>
                  </span>
                </td>
                <td className="r">0</td>
                <td>
                  <span className="hint">{manager.used} min</span>
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
                {staff.map(s => (
                  <React.Fragment key={s.id}>
                    {s.log.map((b, idx) => (
                      <tr key={idx}>
                        <td>{s.n.split(' ')[0]}</td>
                        <td>{b[0]}</td>
                        <td>{b[1]}</td>
                        <td className="r">{b[2]}</td>
                      </tr>
                    ))}
                    {s.call.st === 'brk' && (
                      <tr>
                        <td>{s.n.split(' ')[0]}</td>
                        <td>{s.call.r} <span className="chip w">now</span></td>
                        <td>{new Date(s.call.since).toTimeString().slice(0, 5)}</td>
                        <td className="r">
                          <b className="tmr">{formatDuration(now - s.call.since)}</b>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
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
