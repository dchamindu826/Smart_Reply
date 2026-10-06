'use client';

import React from 'react';
import { useApp } from '@/context/AppContext';
import { FORWARDING_DESTINATIONS } from '@/data/mockData';
import SectionThemeToggle from '@/components/common/SectionThemeToggle';

export default function ForwardingScreen() {
  const {
    role,
    myStatus,
    staff,
    callConfig,
    setCallConfig,
    setScreen,
    addToast
  } = useApp();

  const isM = role === 'manager';

  const frows = [
    { id: 'noans', label: 'Available, no answer' },
    { id: 'busy', label: 'Busy on another call' },
    { id: 'brk', label: 'On break' },
    { id: 'away', label: 'Away' },
    { id: 'dnd', label: 'Do not disturb' },
    ...(isM ? [{ id: 'after', label: 'Outside call hours' }] : [])
  ];

  const getFwdOptions = (k: string) => {
    const teamOpts = staff.map(s => s.id);
    return {
      noans: ['queue', ...teamOpts, 'vm', 'msg'],
      busy: ['wait', 'queue', ...teamOpts, 'msg'],
      brk: ['queue', ...teamOpts, 'vm', 'msg'],
      away: ['queue', ...teamOpts, 'vm', 'msg'],
      dnd: ['msg', 'vm', 'queue'],
      after: ['msg', 'vm']
    }[k] || ['queue'];
  };

  const handleUpdateFwd = (key: string, val: string) => {
    setCallConfig(prev => ({
      ...prev,
      fwd: { ...prev.fwd, [key]: val }
    }));
    addToast(`Saved: ${key} → ${FORWARDING_DESTINATIONS[val] || val}.`);
  };

  return (
    <>
      <div className="ph">
        <div>
          <h1>Call forwarding</h1>
          <p>
            {isM
              ? 'Where WhatsApp calls go when a person can’t answer. These are the team defaults; staff can set their own on the app.'
              : 'Where your WhatsApp calls go when you can’t answer. Customers never see your personal number.'}
          </p>
        </div>
        <div className="acts">
          <SectionThemeToggle />
          {isM && (
            <button className="btn" onClick={() => setScreen('ivr')}>
              IVR menu
            </button>
          )}
          <button className="btn pri" onClick={() => addToast('Forwarding rules saved.')}>
            Save
          </button>
        </div>
      </div>

      <div className="grid g2">
        <div className="card">
          <div className="card-h">
            <h2>Rules</h2>
          </div>
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Send the call to</th>
                </tr>
              </thead>
              <tbody>
                {frows.map(f => {
                  const on = f.id === myStatus.call.st || (f.id === 'noans' && myStatus.call.st === 'available');
                  return (
                    <tr key={f.id}>
                      <td>
                        <b>{f.label}</b>
                        {on && <span className="chip ok" style={{ marginLeft: '6px' }}>Now</span>}
                        {f.id === 'noans' && (
                          <div className="hint">after {callConfig.ringsec} seconds</div>
                        )}
                      </td>
                      <td>
                        <select
                          className="f-in"
                          value={callConfig.fwd[f.id as keyof typeof callConfig.fwd]}
                          onChange={e => handleUpdateFwd(f.id, e.target.value)}
                        >
                          {getFwdOptions(f.id).map(o => {
                            const s = staff.find(x => x.id === o);
                            return (
                              <option key={o} value={o}>
                                {FORWARDING_DESTINATIONS[o] || o}{s ? ` · ${s.stt}` : ''}
                              </option>
                            );
                          })}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="card-b">
            <label className="f">Ring for</label>
            <div className="seg">
              {[10, 20, 30, 45].map(x => (
                <button
                  key={x}
                  aria-pressed={callConfig.ringsec === x}
                  className={callConfig.ringsec === x ? 'active' : ''}
                  onClick={() => setCallConfig(prev => ({ ...prev, ringsec: x }))}
                >
                  {x} s
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="card">
            <div className="card-h">
              <h2>Sales queue</h2>
              <span className="chip">
                {({ all: 'Ring everyone', rr: 'Round robin', idle: 'Longest idle' })[callConfig.ring]}
              </span>
            </div>
            {staff.map(s => {
              const skip = /brk|away|dnd/.test(s.call.st);
              return (
                <div key={s.id} className="list-row">
                  <i className={`av st ${s.st}`}>{s.i}</i>
                  <div className="bd">
                    <b>{s.n}</b>
                    <span>
                      <span className={`chip sc ${s.call.st === 'available' ? 'ok' : 'w'}`}>
                        ☏ {s.stt}
                      </span>{' '}
                      {skip ? 'skipped' : s.call.st === 'oncall' ? 'rings when free' : 'rings now'}
                    </span>
                  </div>
                </div>
              );
            })}

            <div className="card-b">
              {isM && (
                <>
                  <label className="f" style={{ marginTop: 0 }}>The queue rings</label>
                  <div className="seg">
                    {[
                      ['all', 'Everyone'],
                      ['rr', 'Round robin'],
                      ['idle', 'Longest idle']
                    ].map(o => (
                      <button
                        key={o[0]}
                        aria-pressed={callConfig.ring === o[0]}
                        className={callConfig.ring === o[0] ? 'active' : ''}
                        onClick={() => setCallConfig(prev => ({ ...prev, ring: o[0] as any }))}
                      >
                        {o[1]}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <p className="hint" style={{ marginTop: '8px' }}>
                Nobody answers in 60 s: missed-call message and a call-back task for the team.
              </p>
            </div>
          </div>

          <div className="note i">
            <span className="ic">◈</span>
            <div>
              <b>Runs on the Smart Reply call server</b>
              Meta delivers the call to us; forwarding, queues, transfer and recording happen on our side.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
