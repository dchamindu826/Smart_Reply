'use client';

import React from 'react';
import { useApp } from '@/context/AppContext';

export default function MyDayScreen() {
  const {
    myStatus,
    conversations,
    contacts,
    setScreen,
    setStatusModalOpen,
    setBreakModalOpen,
    setUserStatus,
    callConfig
  } = useApp();

  const mine = conversations.filter(v => contacts[v.c]?.to === 's1');

  const getWinClass = (exp?: number) => {
    if (!exp) return 'x';
    const ms = exp - Date.now();
    if (ms <= 0) return 'x';
    if (ms <= 2 * 3600000) return 'r';
    if (ms >= 20 * 3600000) return 'g';
    return 'y';
  };

  const getWinText = (exp?: number) => {
    if (!exp) return 'Closed';
    const ms = exp - Date.now();
    if (ms <= 0) return 'Closed';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
  };

  const expConvs = mine.filter(v => getWinClass(v.exp) === 'r');
  const isOff = myStatus.call?.st !== 'available' || myStatus.chat?.st !== 'available';

  return (
    <>
      <div className="ph">
        <div>
          <h1>Good morning, Nimal</h1>
          <p>Your chats, calls and status for today.</p>
        </div>
        <div className="acts">
          <button className="btn" onClick={() => setBreakModalOpen(true)}>
            Take a break
          </button>
          <button className="btn pri" onClick={() => setStatusModalOpen(true)}>
            Change status
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <h2>My status</h2>
          <span className="scs">
            <span className={`chip sc ${myStatus.call?.st === 'available' ? 'ok' : 'w'}`}>
              ☏ {myStatus.call?.st === 'brk' ? `${myStatus.call.r} break` : myStatus.call?.st}
            </span>
            <span className={`chip sc ${myStatus.chat?.st === 'available' ? 'ok' : 'w'}`}>
              ✉ {myStatus.chat?.st === 'available' ? 'Available' : myStatus.chat?.st}
            </span>
          </span>
          <span className="sp" />
          {isOff && (
            <button className="btn sm pri" onClick={() => setUserStatus('both', 'available')}>
              Back to available
            </button>
          )}
        </div>
        <div className="card-b">
          <div className="ln">
            <span>Breaks today</span>
            <b>{myStatus.used || 0} of {callConfig.brkmax} min</b>
          </div>
        </div>
      </div>

      <div className="stats">
        <div className="stat i">
          <span>My customers</span>
          <b>{mine.length}</b>
          <small>{mine.filter(v => v.un > 0).length} unread</small>
        </div>
        <div className="stat b">
          <span>Closing in under 2h</span>
          <b>{expConvs.length}</b>
          <small>{expConvs.map(v => contacts[v.c]?.n.split(' ')[0]).join(', ') || 'None'}</small>
        </div>
        <div className="stat ok">
          <span>Resolved today</span>
          <b>14 / 20</b>
          <small>Daily target</small>
        </div>
        <div className="stat">
          <span>My avg reply</span>
          <b>2m 10s</b>
          <small>Team 3m 40s</small>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <h2>My queue</h2>
          <span className="sp" />
          <button className="btn sm" onClick={() => setScreen('chats')}>
            Open chats
          </button>
        </div>
        {mine.length > 0 ? (
          mine.map(v => {
            const c = contacts[v.c];
            if (!c) return null;
            return (
              <div key={v.id} className="list-row">
                <i className={`av ${c.a}`}>{c.i}</i>
                <div className="bd">
                  <b>{c.n}</b>
                  <span>{v.pv}</span>
                </div>
                <div className="rt">
                  <span className={`wt ${getWinClass(v.exp)}`}>
                    ◷ <b>{getWinText(v.exp)}</b>
                  </span>
                  {v.un > 0 && <span className="chip i">{v.un} new</span>}
                  <button className="btn sm" onClick={() => setScreen('chats')}>
                    Open
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="empty">
            <b>No customers assigned</b>
            Your manager assigns customers to you.
          </div>
        )}
      </div>
    </>
  );
}
