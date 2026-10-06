'use client';

import React, { useState, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { formatDuration } from '@/data/mockData';

export default function ActiveCallModal() {
  const {
    activeCall,
    updateActiveCall,
    endCall,
    contacts,
    staff,
    callConfig,
    addToast
  } = useApp();

  const [elapsed, setElapsed] = useState('00:00');

  useEffect(() => {
    if (!activeCall) return;
    const interval = setInterval(() => {
      setElapsed(formatDuration(Date.now() - activeCall.t0));
    }, 1000);
    return () => clearInterval(interval);
  }, [activeCall]);

  if (!activeCall) return null;

  const contact = contacts[activeCall.c];
  if (!contact) return null;

  const teamIds = staff.map(s => s.id);
  const sName = (id: string) => {
    if (id === 'mgr') return 'Madushan';
    const s = staff.find(x => x.id === id);
    return s ? s.n.split(' ')[0] : id;
  };

  const handleCtl = (key: string) => {
    if (key === 'note') {
      addToast('Note added to the call.');
      return;
    }
    if (key === 'keypad') {
      addToast('Keypad: tones are sent to the caller.');
      return;
    }
    if (key === 'add' || key === 'xfer') {
      updateActiveCall(prev => prev ? { ...prev, pick: prev.pick === key ? null : (key as 'add' | 'xfer') } : null);
      return;
    }
    if (key === 'rec') {
      const nextRec = !activeCall.rec;
      updateActiveCall(prev => prev ? { ...prev, rec: nextRec, ever: prev.ever || nextRec } : null);
      addToast(nextRec ? 'Recording on.' : 'Recording paused. Card or bank details said now won’t be saved.');
      return;
    }
    if (key === 'hold') {
      const nextHold = !activeCall.hold;
      updateActiveCall(prev => prev ? { ...prev, hold: nextHold } : null);
      addToast(nextHold ? 'Customer on hold. They hear music.' : 'Call resumed.');
      return;
    }
    if (key === 'mute') {
      updateActiveCall(prev => prev ? { ...prev, mute: !prev.mute } : null);
      return;
    }
    if (key === 'spk') {
      updateActiveCall(prev => prev ? { ...prev, spk: !prev.spk } : null);
      return;
    }
  };

  const handlePickTarget = (id: string) => {
    if (activeCall.pick === 'add') {
      updateActiveCall(prev => prev ? { ...prev, pick: null, adding: id } : null);
      setTimeout(() => {
        updateActiveCall(prev => {
          if (!prev || prev.adding !== id) return prev;
          return { ...prev, adding: null, parts: [...prev.parts, id] };
        });
        addToast(`${sName(id)} joined. The customer can hear both of you.`);
      }, 1500);
      return;
    }

    if (activeCall.xm === 'blind' || id === 'queue') {
      endCall('transferred', `Transferred to ${id === 'queue' ? 'Sales queue' : sName(id)}`);
      return;
    }

    // Warm transfer
    updateActiveCall(prev => prev ? { ...prev, pick: null, warm: id, hold: true } : null);
  };

  return (
    <div className="sheet on" style={{ width: 'min(520px, 100%)', padding: 0, overflow: 'hidden' }}>
      <div className="callv" id="callv">
        <span style={{ fontSize: '12px', color: '#C9D3F0' }}>
          🔒 WhatsApp voice call · {activeCall.ivr ? `IVR ${activeCall.ivr.k} · ${activeCall.ivr.t}` : 'business line'}
        </span>

        <i className={`av ${contact.a} lg`} style={{ margin: '18px 0 10px' }}>
          {contact.i}
        </i>

        <h2>
          {contact.n}
          {activeCall.parts.length ? (
            <small style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#C9D3F0' }}>
              + {activeCall.parts.map(sName).join(', ')} · conference
            </small>
          ) : null}
        </h2>

        <span className="tm">
          {activeCall.hold ? 'On hold · ' : ''}
          <span id="ctm">{elapsed}</span>
        </span>

        <span className={`rec ${activeCall.rec ? '' : 'off'}`}>
          {activeCall.rec ? '● Recording · customer notified' : '❚❚ Recording paused'}
        </span>

        {/* Adding participant status */}
        {activeCall.adding && (
          <div className="cpan">
            <b>Calling {sName(activeCall.adding)}…</b>
            They join when they answer.
          </div>
        )}

        {/* Warm transfer dialog */}
        {activeCall.warm && (
          <div className="cpan">
            <b>Talking to {sName(activeCall.warm)}</b>
            {contact.n.split(' ')[0]} is on hold with music.
            <div className="cbt">
              <button onClick={() => endCall('transferred', `Transferred to ${sName(activeCall.warm!)}`)}>
                Complete transfer
              </button>
              <button onClick={() => {
                updateActiveCall(prev => prev ? { ...prev, parts: [...prev.parts, prev.warm!], warm: null, hold: false } : null);
                addToast('Conference: everyone can hear each other.');
              }}>
                Join all three
              </button>
              <button onClick={() => updateActiveCall(prev => prev ? { ...prev, warm: null, hold: false } : null)}>
                Back to customer
              </button>
            </div>
          </div>
        )}

        {/* Conference control */}
        {activeCall.parts.length > 0 && !activeCall.warm && (
          <div className="cpan">
            <b>Conference · {activeCall.parts.length + 2} people</b>
            <div className="cbt">
              {activeCall.parts.map(p => (
                <button
                  key={p}
                  onClick={() => {
                    updateActiveCall(prev => prev ? { ...prev, parts: prev.parts.filter(x => x !== p) } : null);
                    addToast(`${sName(p)} left the call.`);
                  }}
                >
                  Remove {sName(p)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Picker panel for Add or Transfer */}
        {activeCall.pick && (
          <div className="cpan">
            <b>{activeCall.pick === 'add' ? 'Add to call' : 'Transfer to'}</b>
            {activeCall.pick === 'xfer' && (
              <div className="cbt">
                <button
                  className={activeCall.xm === 'warm' ? '' : 'gh'}
                  onClick={() => updateActiveCall(prev => prev ? { ...prev, xm: 'warm' } : null)}
                >
                  Ask first
                </button>
                <button
                  className={activeCall.xm === 'blind' ? '' : 'gh'}
                  onClick={() => updateActiveCall(prev => prev ? { ...prev, xm: 'blind' } : null)}
                >
                  Transfer now
                </button>
              </div>
            )}
            <div className="cbt">
              {activeCall.pick === 'xfer' && (
                <button onClick={() => handlePickTarget('queue')}>Sales queue</button>
              )}
              {teamIds
                .filter(i => !activeCall.parts.includes(i))
                .map(i => {
                  const s = staff.find(x => x.id === i);
                  const off = s && /brk|away|dnd/.test(s.call.st);
                  return (
                    <button
                      key={i}
                      disabled={off}
                      title={s ? s.stt : ''}
                      onClick={() => handlePickTarget(i)}
                    >
                      {sName(i)}{s ? ` · ${s.stt}` : ''}
                    </button>
                  );
                })}
              <button className="gh" onClick={() => updateActiveCall(prev => prev ? { ...prev, pick: null } : null)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Live transcript */}
        <div className="tr">
          <h4>✦ LIVE TRANSCRIPT</h4>
          <p>
            <b>{contact.n.split(' ')[0]}</b>
            Pantry eke doors walata soft-close hinges danna puluwanda?
          </p>
          <p>
            <b>You</b>
            Ow puluwan. Saturday measurement ekata awama samples pennannam.
          </p>
          <div className="sg">
            <b style={{ fontSize: '10.5px', color: '#7FD1F5', display: 'block' }}>Suggested follow-up</b>
            Send a revised quote with soft-close hinges
          </div>
        </div>

        {/* 8-button call control grid */}
        <div className="cgrid">
          {[
            { key: 'mute', icon: '🎙', label: 'Mute', on: activeCall.mute },
            { key: 'spk', icon: '🔊', label: 'Speaker', on: activeCall.spk },
            { key: 'hold', icon: '❚❚', label: 'Hold', on: activeCall.hold },
            { key: 'add', icon: '＋', label: 'Add', on: activeCall.pick === 'add' },
            { key: 'xfer', icon: '⇄', label: 'Transfer', on: activeCall.pick === 'xfer' },
            { key: 'rec', icon: '●', label: 'Record', on: activeCall.rec },
            { key: 'keypad', icon: '⌗', label: 'Keypad', on: false },
            { key: 'note', icon: '✎', label: 'Note', on: false }
          ].map(btn => (
            <button
              key={btn.key}
              className={btn.on ? 'on' : ''}
              onClick={() => handleCtl(btn.key)}
            >
              <i>{btn.icon}</i>
              {btn.label}
            </button>
          ))}
        </div>

        {/* End Call red button */}
        <button className="endc" onClick={() => endCall()} aria-label="End call">
          ✕
        </button>
      </div>
    </div>
  );
}
