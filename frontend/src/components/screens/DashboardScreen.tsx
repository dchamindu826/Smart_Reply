'use client';

import React from 'react';
import { useApp } from '@/context/AppContext';
import SectionThemeToggle from '@/components/common/SectionThemeToggle';
import { useSession } from '@/features/session';
import { formatCount, formatMoney, useDashboard, useExport, useNow, useUsage } from '@/features/insight';
import { limitLong, qualityView, useWhatsappAccount } from '@/features/settings';
import { hhmm, replyTime } from '@/lib/adapters';

const CATEGORY_LABEL: Record<string, string> = {
  marketing: 'Marketing templates',
  utility: 'Utility templates',
  authentication: 'Authentication',
  authentication_international: 'Authentication (international)',
  service: 'Service conversations'
};

function isToday(iso: string | undefined): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

export default function DashboardScreen() {
  const {
    conversations,
    contacts,
    staff,
    calls,
    templates,
    counts,
    setScreen,
    addToast,
    reportError
  } = useApp();
  const { me } = useSession();
  const dash = useDashboard();
  const account = useWhatsappAccount();
  const usage = useUsage('');
  const exporter = useExport();
  const now = useNow();

  const getOwnerName = (toId: string | null) => {
    if (!toId) return <span className="chip b">Unassigned</span>;
    const s = staff.find(x => x.id === toId);
    return s ? s.n.split(' ')[0] : 'Unassigned';
  };

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

  const today = dash.data?.today;
  const loadingText = dash.isLoading ? '…' : '—';
  const num = (n: number | undefined) => (n === undefined ? loadingText : formatCount(n));

  const expiringConvs = conversations.filter(v => getWinClass(v.exp) === 'r');
  const unassignedContacts = Object.values(contacts).filter(c => !c.to);
  const missedToday = calls.filter(c => c.d === 'missed' && isToday(c.startedAt));
  const rejectedTemplates = templates.filter(t => t.stt === 'Rejected');
  const unlabelled = conversations.filter(v => v.status !== 'resolved' && contacts[v.c] && contacts[v.c].labels.length === 0);
  const openWindows = conversations.filter(v => v.exp && v.exp > now).length;
  const decisions =
    (missedToday.length > 0 ? 1 : 0) +
    (rejectedTemplates.length > 0 ? 1 : 0) +
    (expiringConvs.length > 0 ? 1 : 0) +
    (unassignedContacts.length > 0 ? 1 : 0) +
    (unlabelled.length > 0 ? 1 : 0);

  const teamById = new Map((dash.data?.team ?? []).map(t => [t.userId, t]));
  const answered = today?.callsAnswered ?? 0;
  const missed = today?.callsMissed ?? 0;

  const hourly = dash.data?.hourly ?? [];
  const hourValues = hourly.map(h => h.messages + h.calls);
  const hourMax = Math.max(0, ...hourValues);

  const wa = account.data;
  const quality = qualityView(wa?.qualityRating ?? null);
  const u = usage.data;

  const exportToday = () =>
    exporter.mutate(
      { kind: 'reports', params: { range: 'today' } },
      { onSuccess: res => addToast(`Today’s report downloaded as ${res.fileName}.`), onError: reportError }
    );

  return (
    <>
      <div className="ph">
        <div>
          <h1>Today at a glance</h1>
          <p>
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            {me?.company ? ` · ${me.company.name}` : ''}
          </p>
        </div>
        <div className="acts">
          <SectionThemeToggle />
          <button className="btn" onClick={exportToday} disabled={exporter.isPending}>
            {exporter.isPending ? 'Exporting…' : 'Export today'}
          </button>
          <button className="btn pri" onClick={() => setScreen('chats')}>
            Open chats
          </button>
        </div>
      </div>

      {dash.isError && (
        <p className="hint" style={{ color: 'var(--bad)', marginBottom: '10px' }}>
          Could not load today’s numbers. <button className="btn sm" onClick={() => void dash.refetch()}>Try again</button>
        </p>
      )}

      <div className="stats">
        <div className="stat i" onClick={() => setScreen('chats')} style={{ cursor: 'pointer' }} title="Click to open Chats">
          <span>Open chats</span>
          <b>{num(today?.chatsOpen)}</b>
          <small>
            {today ? `${formatCount(today.newCustomers)} new customer${today.newCustomers === 1 ? '' : 's'} today` : 'Loading…'}
            {counts ? ` · ${formatCount(counts.unread)} unread` : ''}
          </small>
        </div>
        <div className="stat b" onClick={() => setScreen('chats')} style={{ cursor: 'pointer' }} title="Click to view Unassigned chats">
          <span>Unassigned</span>
          <b>{num(today?.chatsUnassigned)}</b>
          <small>
            {today
              ? today.chatsClosingSoon > 0
                ? `${today.chatsClosingSoon} reply window${today.chatsClosingSoon === 1 ? '' : 's'} close in under 2h`
                : 'No reply windows closing soon'
              : 'Loading…'}
          </small>
        </div>
        <div className="stat ok" onClick={() => setScreen('calls')} style={{ cursor: 'pointer' }} title="Click to view Calls log">
          <span>Calls answered</span>
          <b>{today ? `${formatCount(answered)} / ${formatCount(answered + missed)}` : loadingText}</b>
          <small>{today ? `${formatCount(missed)} missed` : 'Loading…'}</small>
        </div>
        <div className="stat w" onClick={() => setScreen('reports')} style={{ cursor: 'pointer' }} title="Click to view Reports">
          <span>Avg first reply</span>
          <b>{today ? replyTime(today.avgFirstReplySeconds) : loadingText}</b>
          <small>
            Target under 5 min
            {today ? ` · ${formatCount(today.messagesIn)} in · ${formatCount(today.messagesOut)} out` : ''}
          </small>
        </div>
      </div>

      <div className="grid gmain">
        <div>
          <div className="card">
            <div className="card-h">
              <h2>Needs a decision</h2>
              <span className={`chip ${decisions ? 'b' : 'ok'}`}>{decisions}</span>
              <span className="sp" />
              <button className="btn sm" onClick={() => setScreen('chats')}>
                Go to inbox
              </button>
            </div>

            {missedToday.length > 0 && (
              <div className="list-row">
                <span className="dot b" />
                <div className="bd">
                  <b>
                    {missedToday.length} missed call{missedToday.length > 1 ? 's' : ''} today
                  </b>
                  <span>
                    {missedToday
                      .slice(0, 3)
                      .map(c => `${contacts[c.c]?.n ?? 'Unknown'}${c.startedAt ? ` ${hhmm(c.startedAt)}` : ''}`)
                      .join(' · ')}
                    {missedToday.length > 3 ? ` · +${missedToday.length - 3} more` : ''}
                  </span>
                </div>
                <div className="rt">
                  <button className="btn sm" onClick={() => setScreen('calls')}>
                    Call log
                  </button>
                </div>
              </div>
            )}

            {rejectedTemplates.length > 0 && (
              <div className="list-row">
                <span className="dot w" />
                <div className="bd">
                  <b>
                    {rejectedTemplates.length === 1
                      ? `Template “${rejectedTemplates[0].n}” rejected by Meta`
                      : `${rejectedTemplates.length} templates rejected by Meta`}
                  </b>
                  <span>
                    {rejectedTemplates.length === 1
                      ? rejectedTemplates[0].why || 'Edit it and submit again'
                      : rejectedTemplates.map(t => t.n).join(' · ')}
                  </span>
                </div>
                <div className="rt">
                  <button className="btn sm" onClick={() => setScreen('templates')}>
                    Fix
                  </button>
                </div>
              </div>
            )}

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

            {unlabelled.length > 0 && (
              <div className="list-row">
                <span className="dot i" />
                <div className="bd">
                  <b>
                    {unlabelled.length} chat{unlabelled.length > 1 ? 's have' : ' has'} no label
                  </b>
                  <span>Labelled chats show up in reports and broadcasts</span>
                </div>
                <div className="rt">
                  <button className="btn sm" onClick={() => setScreen('labels')}>
                    Labels
                  </button>
                </div>
              </div>
            )}

            {decisions === 0 && (
              <div className="list-row">
                <span className="dot ok" />
                <div className="bd">
                  <b>Nothing needs a decision</b>
                  <span>Missed calls, rejected templates and closing reply windows show up here</span>
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-h">
              <h2>Today by hour</h2>
              <span className="chip">Messages + calls</span>
            </div>
            <div className="card-b">
              {dash.isLoading ? (
                <p className="hint">Loading…</p>
              ) : hourMax === 0 ? (
                <p className="hint">No messages or calls yet today.</p>
              ) : (
                <div className="bars" style={{ gridTemplateColumns: `repeat(${hourly.length}, 1fr)`, gap: '3px' }}>
                  {hourly.map(h => {
                    const v = h.messages + h.calls;
                    return (
                      <div
                        key={h.hour}
                        className={v === hourMax ? 'hi' : ''}
                        title={`${String(h.hour).padStart(2, '0')}:00 · ${h.messages} messages · ${h.calls} calls`}
                      >
                        {v > 0 ? v : ' '}
                        <i style={{ height: `${v > 0 ? Math.max(4, Math.round((v / hourMax) * 100)) : 2}%` }} />
                        {h.hour % 3 === 0 ? String(h.hour).padStart(2, '0') : ' '}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-h">
              <h2>Live queue</h2>
              <span className="chip">
                {Math.min(6, conversations.length)} of {conversations.length} shown
              </span>
              <span className="sp" />
              <button className="btn sm" onClick={() => setScreen('inbox')}>
                Full inbox
              </button>
            </div>
            {conversations.length === 0 ? (
              <div className="empty">
                <b>No open chats</b>
                New WhatsApp chats show up here.
              </div>
            ) : (
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
            )}
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
            {staff.length === 0 && <div className="empty">No team members yet.</div>}
            {staff.map(s => {
              const t = teamById.get(s.id);
              return (
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
                    <span>
                      {t ? t.openChats : s.open} open chats · avg reply {s.rep}
                      {t ? ` · ${t.resolved} resolved · ${t.callsToday} call${t.callsToday === 1 ? '' : 's'} today` : ''}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="card">
            <div className="card-h">
              <h2>Business number</h2>
              {wa && <span className={`chip ${wa.connected ? 'ok' : 'b'}`}>{wa.connected ? 'Connected' : 'Not connected'}</span>}
            </div>
            <div className="card-b">
              {account.isLoading ? (
                <p className="hint">Loading…</p>
              ) : wa && wa.connected ? (
                <>
                  <div className="ln"><span>Number</span><b>{wa.displayPhone ?? '—'}</b></div>
                  <div className="ln"><span>Quality rating</span><b style={{ color: quality.color }}>{quality.text}</b></div>
                  <div className="ln"><span>Messaging limit</span><b>{limitLong(wa.messagingLimit)}</b></div>
                  <div className="ln"><span>Calling</span><b>{wa.callingEnabled ? 'On' : 'Off'}</b></div>
                  <div className="ln"><span>Reply window open</span><b>{openWindows} chat{openWindows === 1 ? '' : 's'}</b></div>
                </>
              ) : (
                <p className="hint">LUMI AI connects your WhatsApp number. Contact LUMI AI.</p>
              )}
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
              <span className="chip">Estimate</span>
            </div>
            <div className="card-b">
              {usage.isLoading ? (
                <p className="hint">Loading…</p>
              ) : u ? (
                <>
                  {u.byCategory
                    .filter(c => c.category !== 'service')
                    .map(c => (
                      <div className="ln" key={c.category}>
                        <span>{CATEGORY_LABEL[c.category] ?? c.category}</span>
                        <b>{formatMoney(c.cost)}</b>
                      </div>
                    ))}
                  <div className="ln"><span>Replies inside 24h window</span><b style={{ color: 'var(--ok)' }}>Free</b></div>
                  <div className="tot"><span>Month to date</span><span>{formatMoney(u.total)}</span></div>
                  <p className="hint">Meta bills your business directly; these figures are estimates.</p>
                </>
              ) : (
                <p className="hint">Usage is not available right now.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
