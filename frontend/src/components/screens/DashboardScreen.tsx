'use client';

import React from 'react';
import { useApp } from '@/context/AppContext';
import { TODAY_STRING } from '@/data/mockData';
import SectionThemeToggle from '@/components/common/SectionThemeToggle';

export default function DashboardScreen() {
  const {
    conversations,
    contacts,
    staff,
    setScreen,
    addToast
  } = useApp();

  const getOwnerName = (toId: string | null) => {
    if (!toId) return <span className="chip b">Unassigned</span>;
    const s = staff.find(x => x.id === toId);
    return s ? s.n.split(' ')[0] : 'Unassigned';
  };

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

  const expiringConvs = conversations.filter(v => getWinClass(v.exp) === 'r');
  const unassignedContacts = Object.values(contacts).filter(c => !c.to);

  return (
    <>
      <div className="ph">
        <div>
          <h1>Today at a glance</h1>
          <p>{TODAY_STRING} · Madushan Aluminium</p>
        </div>
        <div className="acts">
          <SectionThemeToggle />
          <button className="btn" onClick={() => addToast('Today’s chat report exported as XLSX.')}>
            Export today
          </button>
          <button className="btn pri" onClick={() => setScreen('chats')}>
            Open chats
          </button>
        </div>
      </div>

      <div className="stats">
        <div className="stat i">
          <span>Open chats</span>
          <b>24</b>
          <small>6 new since 08:00 · 3 unread</small>
        </div>
        <div className="stat b">
          <span>Unassigned</span>
          <b>1</b>
          <small>Waiting 12 min · round-robin paused</small>
        </div>
        <div className="stat ok">
          <span>Calls answered</span>
          <b>46 / 52</b>
          <small>4 missed · 2 rejected</small>
        </div>
        <div className="stat w">
          <span>Avg first reply</span>
          <b>3m 40s</b>
          <small>Target under 5 min · Ruwan 5m 20s</small>
        </div>
      </div>

      <div className="grid gmain">
        <div>
          <div className="card">
            <div className="card-h">
              <h2>Needs a decision</h2>
              <span className="chip b">5</span>
              <span className="sp" />
              <button className="btn sm" onClick={() => setScreen('chats')}>
                Go to inbox
              </button>
            </div>

            <div className="list-row">
              <span className="dot b" />
              <div className="bd">
                <b>2 missed calls not returned</b>
                <span>Mohamed Rizwan 09:58 · Chamara Jayasuriya yesterday 19:20 (after hours)</span>
              </div>
              <div className="rt">
                <button className="btn sm" onClick={() => setScreen('calls')}>
                  Call log
                </button>
              </div>
            </div>

            <div className="list-row">
              <span className="dot w" />
              <div className="bd">
                <b>Template “avurudu_offer” rejected by Meta</b>
                <span>Image header quality too low · the campaign is on hold</span>
              </div>
              <div className="rt">
                <button className="btn sm" onClick={() => setScreen('templates')}>
                  Fix
                </button>
              </div>
            </div>

            {expiringConvs.length > 0 && (
              <div className="list-row">
                <span className="dot b" />
                <div className="bd">
                  <b>{expiringConvs.length} reply window{expiringConvs.length > 1 ? 's' : ''} close in under 2 hours</b>
                  <span>
                    {expiringConvs.map(v => contacts[v.c]?.n).join(' · ')} · after that only paid templates can go
                  </span>
                </div>
                <div className="rt">
                  <button className="btn sm" onClick={() => setScreen('inbox')}>
                    Open
                  </button>
                </div>
              </div>
            )}

            {unassignedContacts.length > 0 && (
              <div className="list-row">
                <span className="dot b" />
                <div className="bd">
                  <b>{unassignedContacts.length} customer{unassignedContacts.length > 1 ? 's have' : ' has'} no owner</b>
                  <span>
                    {unassignedContacts.map(c => c.n).join(' · ')} · chats and calls go to the Sales queue
                  </span>
                </div>
                <div className="rt">
                  <button className="btn sm" onClick={() => setScreen('contacts')}>
                    Assign
                  </button>
                </div>
              </div>
            )}

            <div className="list-row">
              <span className="dot i" />
              <div className="bd">
                <b>2 chats have no label</b>
                <span>Labelled chats show up in reports and broadcasts</span>
              </div>
              <div className="rt">
                <button className="btn sm" onClick={() => setScreen('labels')}>
                  Labels
                </button>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-h">
              <h2>Live queue</h2>
              <span className="chip">6 of 24 shown</span>
              <span className="sp" />
              <button className="btn sm" onClick={() => setScreen('inbox')}>
                Full inbox
              </button>
            </div>
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Last message</th>
                    <th>Owner</th>
                    <th>Reply window</th>
                    <th>Label</th>
                  </tr>
                </thead>
                <tbody>
                  {conversations.slice(0, 6).map(v => {
                    const c = contacts[v.c];
                    if (!c) return null;
                    return (
                      <tr key={v.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <div className="emp">
                            <i className={`av ${c.a}`}>{c.i}</i>
                            <span><b>{c.n}</b></span>
                          </div>
                        </td>
                        <td style={{ maxWidth: '260px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {v.pv}
                        </td>
                        <td>{getOwnerName(c.to)}</td>
                        <td>
                          <span className={`wt ${getWinClass(v.exp)}`}>
                            ◷ <b>{getWinText(v.exp)}</b>
                          </span>
                        </td>
                        <td>
                          {c.labels[0] ? (
                            <span className={`chip ${c.labels[0][1]}`}>{c.labels[0][0]}</span>
                          ) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div>
          <div className="card">
            <div className="card-h">
              <h2>Team right now</h2>
              <span className="sp" />
              <button className="btn sm" onClick={() => setScreen('status')}>
                Live status
              </button>
            </div>
            {staff.map(s => (
              <div className="list-row" key={s.id}>
                <i className={`av st ${s.st}`}>{s.i}</i>
                <div className="bd">
                  <b>{s.n}</b>
                  <div style={{ marginTop: '2px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    <span className={`chip sc ${s.call.st === 'available' ? 'ok' : s.call.st === 'oncall' ? 'i' : s.call.st === 'brk' ? 'w' : 'b'}`}>
                      ☏ {s.call.st === 'brk' ? `${s.call.r} break` : s.stt}
                    </span>
                    <span className={`chip sc ${s.chat.st === 'available' ? 'ok' : s.chat.st === 'dnd' ? 'b' : 'w'}`}>
                      ✉ {s.chat.st === 'available' ? 'Available' : s.chat.st === 'dnd' ? 'DND' : s.chat.st}
                    </span>
                  </div>
                  <span>{s.open} open chats · avg reply {s.rep}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="card-h">
              <h2>Business number</h2>
              <span className="chip ok">Connected</span>
            </div>
            <div className="card-b">
              <div className="ln"><span>Number</span><b>+94 77 123 4567</b></div>
              <div className="ln"><span>Quality rating</span><b style={{ color: 'var(--ok)' }}>High</b></div>
              <div className="ln"><span>Messaging limit</span><b>1,000 customers / day</b></div>
              <div className="ln"><span>Calling</span><b>On · 9:00–18:00 Mon–Sat</b></div>
              <div className="ln"><span>Reply window open</span><b>4 chats</b></div>
              <button
                className="btn"
                style={{ width: '100%', justifyContent: 'center', marginTop: '12px' }}
                onClick={() => setScreen('number')}
              >
                Number &amp; quality
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-h">
              <h2>Meta cost this month</h2>
            </div>
            <div className="card-b">
              <div className="ln"><span>Marketing templates</span><b>Rs 2,450</b></div>
              <div className="ln"><span>Utility templates</span><b>Rs 860</b></div>
              <div className="ln"><span>Authentication</span><b>Rs 120</b></div>
              <div className="ln"><span>Replies inside 24h window</span><b style={{ color: 'var(--ok)' }}>Free</b></div>
              <div className="tot"><span>Month to date</span><span>Rs 3,430</span></div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
