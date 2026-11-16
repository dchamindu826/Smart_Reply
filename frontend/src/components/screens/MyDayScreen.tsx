'use client';

import React from 'react';
import { useApp } from '@/context/AppContext';
import { useSession } from '@/features/session';
import { formatCount, useMyDashboard, useNow } from '@/features/insight';
import { hhmm, replyTime } from '@/lib/adapters';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function MyDayScreen() {
  const {
    myStatus,
    conversations,
    contacts,
    currentUser,
    setScreen,
    setStatusModalOpen,
    setBreakModalOpen,
    setUserStatus,
    callConfig,
    openConversation,
    openConversationForContact,
    reportError
  } = useApp();
  const { me } = useSession();
  const day = useMyDashboard();
  const d = day.data;
  const now = useNow();

  const myId = me?.user.id ?? currentUser.id;
  const mine = conversations.filter(v => contacts[v.c]?.to === myId && v.status !== 'resolved');

  const getWinClass = (exp?: number) => {
    if (!exp) return 'x';
    const ms = exp - now;
    if (ms <= 0) return 'x';
    if (ms <= 2 * 3600000) return 'r';
    if (ms >= 20 * 3600000) return 'g';
    return 'y';
  };

  const getWinText = (exp?: number) => {
    if (!exp) return 'Closed';
    const ms = exp - now;
    if (ms <= 0) return 'Closed';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
  };

  const expConvs = mine.filter(v => getWinClass(v.exp) === 'r');
  const isOff = myStatus.call?.st !== 'available' || myStatus.chat?.st !== 'available';
  const firstName = (me?.user.name ?? currentUser.name).split(' ')[0];
  const dash = day.isLoading ? '…' : '—';

  const openChat = (convId: string) => {
    openConversation(convId);
    setScreen('chats');
  };

  const openContactChat = async (contactId: string) => {
    try {
      const id = await openConversationForContact(contactId);
      if (id) openConversation(id);
      setScreen('chats');
    } catch (err) {
      reportError(err);
    }
  };

  const scheduled = (d?.scheduledCalls ?? []).filter(c => c.status === 'pending');

  return (
    <>
      <div className="ph">
        <div>
          <h1>
            {greeting()}, {firstName}
          </h1>
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
          <div className="ln">
            <span>Calls today</span>
            <b>{d ? `${formatCount(d.callsToday)} · ${formatCount(d.callsMissed)} missed` : dash}</b>
          </div>
        </div>
      </div>

      {day.isError && (
        <p className="hint" style={{ color: 'var(--bad)', marginBottom: '10px' }}>
          Could not load your day. <button className="btn sm" onClick={() => void day.refetch()}>Try again</button>
        </p>
      )}

      <div className="stats">
        <div className="stat i">
          <span>My customers</span>
          <b>{d ? formatCount(d.openChats) : dash}</b>
          <small>{d ? `${formatCount(d.unread)} unread` : 'Loading…'}</small>
        </div>
        <div className="stat b">
          <span>Closing in under 2h</span>
          <b>{d ? formatCount(d.closingSoon) : dash}</b>
          <small>{expConvs.map(v => contacts[v.c]?.n.split(' ')[0]).join(', ') || 'None'}</small>
        </div>
        <div className="stat ok">
          <span>Resolved today</span>
          <b>{d ? formatCount(d.resolvedToday) : dash}</b>
          <small>{d ? `${d.targetPercent}% of daily target` : 'Daily target'}</small>
        </div>
        <div className="stat">
          <span>My avg reply</span>
          <b>{d ? replyTime(d.avgFirstReplySeconds) : dash}</b>
          <small>First reply today</small>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <h2>Scheduled calls today</h2>
          {scheduled.length > 0 && <span className="chip i">{scheduled.length}</span>}
          <span className="sp" />
          <button className="btn sm" onClick={() => setScreen('calls')}>
            Calls
          </button>
        </div>
        {day.isLoading ? (
          <div className="card-b"><p className="hint">Loading…</p></div>
        ) : scheduled.length > 0 ? (
          scheduled.map(c => {
            const contact = contacts[c.contactId];
            const late = new Date(c.scheduledAt).getTime() < now;
            return (
              <div key={c.id} className="list-row">
                {contact ? <i className={`av ${contact.a}`}>{contact.i}</i> : <span className="dot i" />}
                <div className="bd">
                  <b>{c.contactName}</b>
                  <span>
                    {hhmm(c.scheduledAt)}
                    {c.note ? ` · ${c.note}` : ''}
                  </span>
                </div>
                <div className="rt">
                  {late && <span className="chip w">Due</span>}
                  <button className="btn sm" onClick={() => void openContactChat(c.contactId)}>
                    Open chat
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="card-b">
            <p className="hint">No calls scheduled for today.</p>
          </div>
        )}
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
                  <button className="btn sm" onClick={() => openChat(v.id)}>
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
