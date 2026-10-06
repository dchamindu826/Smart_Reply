'use client';

import React, { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { StatusType } from '@/types';
import { FORWARDING_DESTINATIONS } from '@/data/mockData';

export default function StatusBreakModal() {
  const {
    role,
    myStatus,
    setUserStatus,
    statusModalOpen,
    setStatusModalOpen,
    breakModalOpen,
    setBreakModalOpen,
    setScreen,
    callConfig,
    setCallConfig,
    addToast
  } = useApp();

  const [breakScope, setBreakScope] = useState<'both' | 'call' | 'chat'>('both');
  const [breakReason, setBreakReason] = useState('Tea');
  const [breakMins, setBreakMins] = useState(15);

  if (!statusModalOpen && !breakModalOpen) return null;

  const isM = role === 'manager';
  const brkMax = callConfig.brkmax;
  const brkUsed = myStatus.used || 0;
  const brkLeft = Math.max(0, brkMax - brkUsed);

  const getStatusLabel = (st: StatusType, r: string = '') => {
    if (st === 'brk') return `${r || 'Break'} break`;
    return {
      available: 'Available',
      oncall: 'On a call',
      brk: 'On break',
      away: 'Away',
      dnd: 'Do not disturb'
    }[st] || st;
  };

  const getEffect = (channel: 'call' | 'chat', st: StatusType) => {
    if (channel === 'call') {
      return st === 'available'
        ? 'WhatsApp calls ring you.'
        : `Calls go to ${FORWARDING_DESTINATIONS[callConfig.fwd[st as keyof typeof callConfig.fwd] || 'queue'] || 'queue'}.`;
    }
    return st === 'available'
      ? 'New chats are assigned to you.'
      : st === 'dnd'
      ? 'No new chats and no chat alerts. Open chats stay yours.'
      : 'New chats go to the team. Your open chats wait for you.';
  };

  const handlePickStatus = (channel: 'call' | 'chat', st: StatusType) => {
    if (st === 'brk') {
      setBreakScope(callConfig.link ? 'both' : channel);
      setStatusModalOpen(false);
      setBreakModalOpen(true);
      return;
    }
    const targetChannel = callConfig.link ? 'both' : channel;
    setUserStatus(targetChannel, st);
    setStatusModalOpen(false);
  };

  const handleStartBreak = () => {
    setUserStatus(breakScope, 'brk', breakReason, breakMins);
    setBreakModalOpen(false);
    addToast(`${breakReason} break started (${breakMins} min) for ${breakScope === 'both' ? 'calls and chats' : breakScope === 'call' ? 'calls' : 'chats'}.`);
  };

  return (
    <>
      <div className="scrim on" onClick={() => { setStatusModalOpen(false); setBreakModalOpen(false); }} />

      {/* Main Status Modal */}
      {statusModalOpen && (
        <aside className="sheet on" role="dialog" aria-modal="true">
          <button className="x" aria-label="Close" onClick={() => setStatusModalOpen(false)}>×</button>
          <h2>Your status</h2>
          <p className="sub">
            Set calls and chats separately. {isM ? 'Staff do the same from their app.' : 'Your manager sees both, live.'}
          </p>

          {/* Calls Block */}
          <div className="chb">
            <div className="chh">
              <b>☏ Calls</b>
              <span>{getStatusLabel(myStatus.call?.st || 'available', myStatus.call?.r)}</span>
            </div>
            <div className="sopts">
              {[
                { id: 'available', label: 'Available', dot: 'ok' },
                { id: 'brk', label: 'Break', dot: 'sbrk' },
                { id: 'away', label: 'Away', dot: 'saway' },
                { id: 'dnd', label: 'DND', dot: 'sdnd' }
              ].map(opt => (
                <button
                  key={opt.id}
                  aria-pressed={myStatus.call?.st === opt.id}
                  className={myStatus.call?.st === opt.id ? 'active' : ''}
                  onClick={() => handlePickStatus('call', opt.id as StatusType)}
                >
                  <i className={`sdot ${opt.dot}`} />
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="hint">{getEffect('call', myStatus.call?.st || 'available')}</p>
          </div>

          {/* Chats Block */}
          <div className="chb">
            <div className="chh">
              <b>✉ Chats</b>
              <span>{getStatusLabel(myStatus.chat?.st || 'available', myStatus.chat?.r)}</span>
            </div>
            <div className="sopts">
              {[
                { id: 'available', label: 'Available', dot: 'ok' },
                { id: 'brk', label: 'Break', dot: 'sbrk' },
                { id: 'away', label: 'Away', dot: 'saway' },
                { id: 'dnd', label: 'DND', dot: 'sdnd' }
              ].map(opt => (
                <button
                  key={opt.id}
                  aria-pressed={myStatus.chat?.st === opt.id}
                  className={myStatus.chat?.st === opt.id ? 'active' : ''}
                  onClick={() => handlePickStatus('chat', opt.id as StatusType)}
                >
                  <i className={`sdot ${opt.dot}`} />
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="hint">{getEffect('chat', myStatus.chat?.st || 'available')}</p>
          </div>

          <label className="tgl">
            <input
              type="checkbox"
              checked={callConfig.link}
              onChange={e => {
                const nextLink = e.target.checked;
                setCallConfig(prev => ({ ...prev, link: nextLink }));
                addToast(nextLink ? 'Calls and chats now change together.' : 'Calls and chats can have different statuses.');
              }}
            />
            <span>Same status for calls and chats</span>
            <small>Change one, both follow</small>
          </label>

          <div className="ln">
            <span>Breaks today</span>
            <b>{brkUsed} of {brkMax} min</b>
          </div>

          <button
            className="btn"
            style={{ width: '100%', justifyContent: 'center', marginTop: '12px' }}
            onClick={() => { setStatusModalOpen(false); setScreen('fwd'); }}
          >
            ⇄ Call forwarding rules
          </button>
        </aside>
      )}

      {/* Break Sub-Modal */}
      {breakModalOpen && (
        <aside className="sheet on" role="dialog" aria-modal="true">
          <button className="x" aria-label="Close" onClick={() => setBreakModalOpen(false)}>×</button>
          <h2>Take a break</h2>
          <p className="sub">Choose what the break covers. {isM ? '' : 'Your manager sees it live.'}</p>

          <label className="f">Break from</label>
          <div className="seg">
            {[
              { id: 'both', label: 'Calls + chats' },
              { id: 'call', label: 'Calls only' },
              { id: 'chat', label: 'Chats only' }
            ].map(o => (
              <button
                key={o.id}
                aria-pressed={breakScope === o.id}
                className={breakScope === o.id ? 'active' : ''}
                onClick={() => setBreakScope(o.id as any)}
              >
                {o.label}
              </button>
            ))}
          </div>

          <label className="f">Reason</label>
          <div className="seg" style={{ flexWrap: 'wrap' }}>
            {[
              { r: 'Tea', m: 15 },
              { r: 'Lunch', m: 45 },
              { r: 'Prayer', m: 15 },
              { r: 'Meeting', m: 30 },
              { r: 'Training', m: 60 }
            ].map(b => (
              <button
                key={b.r}
                aria-pressed={breakReason === b.r}
                className={breakReason === b.r ? 'active' : ''}
                onClick={() => { setBreakReason(b.r); setBreakMins(b.m); }}
              >
                {b.r}
              </button>
            ))}
          </div>

          <label className="f">How long</label>
          <div className="seg">
            {[10, 15, 30, 45, 60].map(m => (
              <button
                key={m}
                aria-pressed={breakMins === m}
                className={breakMins === m ? 'active' : ''}
                onClick={() => setBreakMins(m)}
              >
                {m} min
              </button>
            ))}
          </div>

          <p className="hint" style={{ marginTop: '10px' }}>
            {brkLeft} of {brkMax} break minutes left today. Calls on break go to{' '}
            {FORWARDING_DESTINATIONS[callConfig.fwd.brk] || 'queue'}; new chats go to the team.
          </p>

          <button
            className="btn pri"
            style={{ width: '100%', justifyContent: 'center', marginTop: '14px' }}
            onClick={handleStartBreak}
          >
            Start break
          </button>
        </aside>
      )}
    </>
  );
}
