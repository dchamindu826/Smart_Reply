'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { Call as ApiCall, CallFilter, ScheduledCall } from '@smart-reply/shared';
import { useApp } from '@/context/AppContext';
import { useSession } from '@/features/session';
import {
  useCallLog,
  useCallNote,
  useCallSettings,
  useCancelScheduledCall,
  useCreateScheduledCall,
  useDoneScheduledCall,
  useExportCalls,
  useScheduledCalls,
  useSummaryToChat
} from '@/features/calls';
import { logTime, toCallLog } from '@/lib/adapters';
import { CallLogItem } from '@/types';
import SectionThemeToggle from '@/components/common/SectionThemeToggle';

type UiFilter = 'all' | 'missed' | 'rejected' | 'rec' | 'incoming' | 'outgoing';
type DateFilter = 'all' | 'today' | 'yesterday' | 'week' | 'custom';
type TimeFilter = 'all' | 'morning' | 'afternoon' | 'evening' | 'biz' | 'afterhours';

const API_FILTER: Record<UiFilter, CallFilter> = {
  all: 'all',
  missed: 'missed',
  rejected: 'rejected',
  rec: 'recorded',
  incoming: 'incoming',
  outgoing: 'outgoing'
};

function dayStart(offsetDays: number): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offsetDays);
}

/** The date filter as an API window (local days). */
function dateWindow(f: DateFilter, custom: string): { from?: string; to?: string } {
  switch (f) {
    case 'today':
      return { from: dayStart(0).toISOString() };
    case 'yesterday':
      return { from: dayStart(-1).toISOString(), to: new Date(dayStart(0).getTime() - 1).toISOString() };
    case 'week':
      return { from: dayStart(-6).toISOString() };
    case 'custom': {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(custom)) return {};
      const [y, m, d] = custom.split('-').map(Number);
      const start = new Date(y, m - 1, d);
      const end = new Date(y, m - 1, d + 1);
      return { from: start.toISOString(), to: new Date(end.getTime() - 1).toISOString() };
    }
    default:
      return {};
  }
}

function inTimeSlot(iso: string, f: TimeFilter): boolean {
  if (f === 'all') return true;
  const d = new Date(iso);
  const hours = d.getHours();
  const total = hours * 60 + d.getMinutes();
  if (f === 'morning') return hours >= 6 && hours < 12;
  if (f === 'afternoon') return hours >= 12 && hours < 17;
  if (f === 'evening') return hours >= 17;
  if (f === 'biz') return total >= 8 * 60 + 30 && total <= 18 * 60;
  return total < 8 * 60 + 30 || total > 18 * 60;
}

function avgText(seconds: number[]): string {
  if (seconds.length === 0) return 'No answered calls';
  const avg = Math.round(seconds.reduce((a, b) => a + b, 0) / seconds.length);
  return `Avg ${Math.floor(avg / 60)}m ${avg % 60}s`;
}

/** Scheduled times are usually in the future, which `logTime` does not cover. */
function whenText(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/* ───────── Sheets (own components so they can keep form state) ───────── */

function NoteSheet({ call }: { call: ApiCall }) {
  const { addToast, reportError, closeSheet } = useApp();
  const save = useCallNote();
  const [note, setNote] = useState(call.note);
  return (
    <>
      <h2>Call note</h2>
      <p className="sub">
        {call.contact.name} · {logTime(call.startedAt)}
      </p>
      <label className="f" style={{ marginTop: 0 }}>Note</label>
      <textarea className="f-in" style={{ minHeight: '110px' }} value={note} maxLength={2000} onChange={e => setNote(e.target.value)} />
      <p className="hint">Only your team can see call notes.</p>
      <button
        className="btn pri"
        style={{ width: '100%', justifyContent: 'center', marginTop: '14px' }}
        disabled={!note.trim() || save.isPending}
        onClick={() =>
          save.mutate(
            { callId: call.id, note: note.trim() },
            {
              onSuccess: () => {
                addToast('Call note saved.');
                closeSheet();
              },
              onError: reportError
            }
          )
        }
      >
        {save.isPending ? 'Saving…' : 'Save note'}
      </button>
    </>
  );
}

function RecordingSheet({ call, item }: { call: ApiCall; item: CallLogItem }) {
  const { addToast, reportError, closeSheet } = useApp();
  const toChat = useSummaryToChat();
  return (
    <>
      <h2>{call.recordingUrl ? 'Call recording' : 'AI summary'}</h2>
      <p className="sub">
        {call.contact.name} · {item.t} · {item.dur ?? '—'} · handled by {item.by}
      </p>

      {call.recordingUrl ? (
        <div className="att">
          <audio controls preload="none" src={call.recordingUrl} style={{ width: '100%' }} />
        </div>
      ) : call.hasRecording ? (
        <p className="hint">The recording is still being processed.</p>
      ) : null}

      {call.summary ? (
        <>
          <h3 style={{ margin: '16px 0 6px', fontSize: '13px' }}>AI summary</h3>
          <p style={{ fontSize: '13.5px', whiteSpace: 'pre-wrap' }}>{call.summary}</p>
        </>
      ) : null}

      {call.note ? (
        <>
          <h3 style={{ margin: '16px 0 6px', fontSize: '13px' }}>Note</h3>
          <p style={{ fontSize: '13px', whiteSpace: 'pre-wrap' }}>{call.note}</p>
        </>
      ) : null}

      <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
        {call.summary ? (
          <button
            className="btn"
            disabled={toChat.isPending}
            onClick={() =>
              toChat.mutate(call.id, {
                onSuccess: () => {
                  addToast(`Summary added to ${call.contact.name.split(' ')[0]}’s chat as a team note.`);
                  closeSheet();
                },
                onError: reportError
              })
            }
          >
            Add to chat as note
          </button>
        ) : null}
        {call.recordingUrl ? (
          <a className="btn" href={call.recordingUrl} download target="_blank" rel="noreferrer">
            Download
          </a>
        ) : null}
      </div>
    </>
  );
}

function ScheduleSheet({ isManager, preset }: { isManager: boolean; preset?: string }) {
  const { contacts, team, currentUser, addToast, reportError, closeSheet } = useApp();
  const create = useCreateScheduledCall();
  const contactList = useMemo(() => Object.values(contacts).sort((a, b) => a.n.localeCompare(b.n)), [contacts]);
  const [contactId, setContactId] = useState(preset ?? contactList[0]?.id ?? '');
  const [userId, setUserId] = useState(currentUser.id);
  const [when, setWhen] = useState('');
  const [note, setNote] = useState('');
  const valid = Boolean(contactId) && Boolean(when) && !Number.isNaN(new Date(when).getTime());
  return (
    <>
      <h2>Schedule a call</h2>
      <p className="sub">A reminder to call the customer back at a set time.</p>
      <label className="f" style={{ marginTop: 0 }}>Customer</label>
      <select className="f-in" value={contactId} onChange={e => setContactId(e.target.value)}>
        {contactList.length === 0 && <option value="">No customers yet</option>}
        {contactList.map(c => (
          <option key={c.id} value={c.id}>
            {c.n} · {c.ph}
          </option>
        ))}
      </select>
      {isManager && (
        <>
          <label className="f">Who calls</label>
          <select className="f-in" value={userId} onChange={e => setUserId(e.target.value)}>
            {team.map(s => (
              <option key={s.id} value={s.id}>
                {s.n}
              </option>
            ))}
          </select>
        </>
      )}
      <label className="f">When</label>
      <input className="f-in" type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} />
      <label className="f">Note</label>
      <input className="f-in" value={note} maxLength={300} placeholder="What the call is about" onChange={e => setNote(e.target.value)} />
      <button
        className="btn pri"
        style={{ width: '100%', justifyContent: 'center', marginTop: '14px' }}
        disabled={!valid || create.isPending}
        onClick={() =>
          create.mutate(
            { contactId, userId: isManager ? userId : undefined, scheduledAt: new Date(when).toISOString(), note: note.trim() },
            {
              onSuccess: s => {
                addToast(`Call with ${s.contactName} scheduled for ${whenText(s.scheduledAt)}.`);
                closeSheet();
              },
              onError: reportError
            }
          )
        }
      >
        {create.isPending ? 'Saving…' : 'Schedule call'}
      </button>
    </>
  );
}

/* ───────── Screen ───────── */

export default function CallsScreen() {
  const {
    role,
    contacts,
    team,
    startCall,
    openSheet,
    closeSheet,
    setScreen,
    addToast,
    reportError,
    openConversationForContact,
    openConversation
  } = useApp();
  const { me } = useSession();
  const businessNumber = me?.company?.displayPhone ?? 'your business number';

  const isStaff = role === 'staff';
  const isManager = !isStaff;

  const [filter, setFilter] = useState<UiFilter>('all');
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [customDate, setCustomDate] = useState('');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [staffFilter, setStaffFilter] = useState<string>('all');

  const debouncedSearch = useDebounced(search.trim(), 350);
  const win = dateWindow(dateFilter, customDate);
  const logQ = useCallLog({
    filter: API_FILTER[filter],
    staff: isManager && staffFilter !== 'all' && staffFilter !== 'unassigned' ? staffFilter : undefined,
    search: debouncedSearch.length >= 2 ? debouncedSearch : undefined,
    from: win.from,
    to: win.to
  });
  const settingsQ = useCallSettings(isManager);
  const scheduledQ = useScheduledCalls();
  const doneM = useDoneScheduledCall();
  const cancelM = useCancelScheduledCall();
  const exportM = useExportCalls();

  const loaded = useMemo(() => (logQ.data?.pages ?? []).flatMap(p => p.items).filter(c => c.outcome !== 'ringing'), [logQ.data]);

  // Time of day and "unassigned" are not API filters: apply them to the loaded pages.
  const rows = useMemo(
    () =>
      loaded
        .filter(c => inTimeSlot(c.startedAt, timeFilter))
        .filter(c => !(isManager && staffFilter === 'unassigned') || c.handledBy === null)
        .map(c => ({ call: c, item: toCallLog(c) })),
    [loaded, timeFilter, staffFilter, isManager]
  );

  const callingOff = me?.features.calling === false || (settingsQ.data ? !settingsQ.data.callingEnabled : false);
  const callingReason =
    settingsQ.data?.callingUnavailableReason ??
    (isStaff ? 'WhatsApp Calling is not on for this number yet. Ask your manager.' : 'WhatsApp Calling is not on for this number yet.');

  const hasActiveFilters =
    filter !== 'all' ||
    dateFilter !== 'all' ||
    timeFilter !== 'all' ||
    (!isStaff && staffFilter !== 'all') ||
    search.trim() !== '';

  const handleResetFilters = () => {
    setFilter('all');
    setDateFilter('all');
    setCustomDate('');
    setTimeFilter('all');
    setStaffFilter('all');
    setSearch('');
    addToast('All call filters cleared.');
  };

  // Stats reflect the calls currently shown.
  const answered = rows.filter(r => r.item.d === 'incoming' || r.item.d === 'outgoing' || r.item.d === 'transferred');
  const missed = rows.filter(r => r.item.d === 'missed');
  const rejectedCount = rows.filter(r => r.item.d === 'rejected' || r.item.d === 'forwarded').length;
  const recordedCount = rows.filter(r => r.call.hasRecording).length;

  /** Missed calls with no later answered call to or from the same customer (in the loaded log). */
  const notReturned = useMemo(() => {
    const seen = new Set<string>();
    const out: ApiCall[] = [];
    for (const c of loaded) {
      // `loaded` is newest first: a later answered call marks the customer as reached.
      if (c.outcome === 'answered' || c.outcome === 'transferred') seen.add(c.contactId);
      else if (c.outcome === 'missed' && !seen.has(c.contactId)) {
        seen.add(c.contactId);
        out.push(c);
      }
    }
    return out;
  }, [loaded]);

  const keepDays = settingsQ.data?.recording.keepDays;

  const getCallChip = (d: CallLogItem['d']) => {
    const map: Record<string, { cls: string; label: string }> = {
      ringing: { cls: 'w', label: '● Ringing' },
      missed: { cls: 'b', label: '↙ Missed' },
      rejected: { cls: 'w', label: '⊘ Rejected' },
      incoming: { cls: 'ok', label: '↙ Incoming' },
      outgoing: { cls: 'i', label: '↗ Outgoing' },
      forwarded: { cls: 'i', label: '⇄ Forwarded' },
      transferred: { cls: 'i', label: '⇄ Transferred' }
    };
    const c = map[d] || map.incoming;
    return <span className={`chip ${c.cls}`}>{c.label}</span>;
  };

  const openChat = async (contactId: string) => {
    const convId = await openConversationForContact(contactId);
    if (convId) openConversation(convId);
    setScreen('chats');
  };

  // Open Start New Call sheet
  const handleOpenNewCallSheet = () => {
    const list = Object.values(contacts).sort((a, b) => a.n.localeCompare(b.n));
    openSheet(
      <>
        <h2>Start a WhatsApp Call</h2>
        <p className="sub">Select a customer with an active window or call permission.</p>
        {callingOff && <p className="hint">{callingReason}</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '420px', overflowY: 'auto' }}>
          {list.length === 0 && <p className="hint">No customers yet.</p>}
          {list.map(contact => (
            <div key={contact.id} className="list-row" style={{ paddingLeft: 0, paddingRight: 0 }}>
              <div className="emp">
                <i className={`av ${contact.a}`}>{contact.i}</i>
                <div>
                  <b>{contact.n}</b>
                  <span>{contact.ph}</span>
                </div>
              </div>
              <div className="rt">
                <button
                  className="btn sm pri"
                  onClick={() => {
                    closeSheet();
                    startCall(contact.id);
                  }}
                >
                  ☏ Call now
                </button>
              </div>
            </div>
          ))}
        </div>
      </>
    );
  };

  const handleOpenCallBackSheet = () => {
    openSheet(
      <>
        <h2>Call back missed</h2>
        <p className="sub">Missed calls that nobody has returned yet.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '420px', overflowY: 'auto' }}>
          {notReturned.length === 0 && <p className="hint">Every missed call has been returned.</p>}
          {notReturned.map(c => (
            <div key={c.id} className="list-row" style={{ paddingLeft: 0, paddingRight: 0 }}>
              <div className="emp">
                <i className={`av ${c.contact.avatarColor}`}>{c.contact.initials}</i>
                <div>
                  <b>{c.contact.name}</b>
                  <span>
                    {c.contact.phone} · {logTime(c.startedAt)}
                  </span>
                </div>
              </div>
              <div className="rt">
                <button
                  className="btn sm pri"
                  onClick={() => {
                    closeSheet();
                    startCall(c.contactId);
                  }}
                >
                  ☏ Call
                </button>
              </div>
            </div>
          ))}
        </div>
      </>
    );
  };

  const handleExport = () => {
    exportM.mutate(win, {
      onSuccess: res => {
        const a = document.createElement('a');
        a.href = res.url;
        a.download = res.fileName;
        a.rel = 'noreferrer';
        document.body.appendChild(a);
        a.click();
        a.remove();
        addToast(`Call log exported (${res.fileName}).`);
      },
      onError: reportError
    });
  };

  const scheduled = (scheduledQ.data ?? []).filter(s => s.status === 'pending');
  const markDone = (s: ScheduledCall) =>
    doneM.mutate(s.id, { onSuccess: () => addToast(`Call with ${s.contactName} marked done.`), onError: reportError });
  const cancel = (s: ScheduledCall) =>
    cancelM.mutate(s.id, { onSuccess: () => addToast(`Scheduled call with ${s.contactName} cancelled.`), onError: reportError });

  const totalLabel = `${loaded.length}${logQ.hasNextPage ? '+' : ''}`;

  return (
    <>
      <div className="ph">
        <div>
          <h1>{isStaff ? 'My calls' : 'Calls'}</h1>
          <p>
            {isStaff
              ? 'Every WhatsApp call assigned to you, who took it, and the recording.'
              : `Every WhatsApp call on ${businessNumber}, who took it, recordings, and live queue.`}
          </p>
        </div>
        <div className="acts">
          <SectionThemeToggle />
          <button className="btn" onClick={() => setScreen('chats')}>
            💬 Chats
          </button>
          {!isStaff && (
            <button className="btn" onClick={() => setScreen('callset')}>
              Call settings
            </button>
          )}
          <button className="btn" onClick={() => setScreen('fwd')}>
            Forwarding
          </button>
          <button className="btn" onClick={handleOpenCallBackSheet}>
            Call back missed
          </button>
          <button className="btn pri" onClick={handleOpenNewCallSheet}>
            + Start Call
          </button>
        </div>
      </div>

      {callingOff && (
        <div className="note w">
          <span className="ic">⚠</span>
          <div>
            <b>WhatsApp Calling is off</b>
            {callingReason}
            {isManager && (
              <>
                {' '}
                <button className="btn sm" style={{ marginLeft: '6px' }} onClick={() => setScreen('callset')}>
                  Call settings
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Call Center Stats */}
      <div className="stats">
        <div className="stat ok">
          <span>Answered</span>
          <b>{answered.length}</b>
          <small>{avgText(answered.map(r => r.call.durationSeconds ?? 0).filter(s => s > 0))}</small>
        </div>
        <div className="stat b">
          <span>Missed</span>
          <b>{missed.length}</b>
          <small>{notReturned.length} not returned yet</small>
        </div>
        <div className="stat w">
          <span>Rejected / Forwarded</span>
          <b>{rejectedCount}</b>
          <small>Busy or redirected</small>
        </div>
        <div className="stat i">
          <span>Recorded</span>
          <b>{recordedCount}</b>
          <small>{keepDays ? (keepDays === 'forever' ? 'Kept forever' : `Kept ${keepDays} days`) : 'With the announcement'}</small>
        </div>
      </div>

      {/* Call Log List Card */}
      <div className="card">
        <div className="card-h" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
          <div className="seg">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'incoming', label: 'Incoming' },
                { id: 'outgoing', label: 'Outgoing' },
                { id: 'missed', label: 'Missed' },
                { id: 'rejected', label: 'Rejected' },
                { id: 'rec', label: 'Recorded' }
              ] as { id: UiFilter; label: string }[]
            ).map(tab => (
              <button key={tab.id} aria-pressed={filter === tab.id} className={filter === tab.id ? 'active' : ''} onClick={() => setFilter(tab.id)}>
                {tab.label}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, minWidth: '200px', maxWidth: '320px' }}>
            <input
              type="text"
              placeholder="Search by caller, phone, notes..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                color: 'var(--ink)',
                fontSize: '13px'
              }}
            />
          </div>

          <span className="sp" />
          {isManager && (
            <button className="btn sm" disabled={exportM.isPending} onClick={handleExport}>
              {exportM.isPending ? 'Exporting…' : 'Export CSV'}
            </button>
          )}
        </div>

        {/* Manager & Team Filter Controls: Date, Time Slot, and Staff Member */}
        <div className="calls-filter-bar">
          {/* Date Filter */}
          <div className="calls-filter-group">
            <span className="calls-filter-label">
              <span>📅</span> Date:
            </span>
            <select
              className="calls-filter-select"
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value as DateFilter)}
              aria-label="Filter calls by date"
            >
              <option value="all">All Dates</option>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="week">Past 7 Days</option>
              <option value="custom">Specific Date...</option>
            </select>
            {dateFilter === 'custom' && (
              <input
                type="date"
                className="calls-filter-select"
                value={customDate}
                onChange={e => setCustomDate(e.target.value)}
                style={{ padding: '4px 8px' }}
                aria-label="Select custom date"
              />
            )}
          </div>

          {/* Time Slot Filter */}
          <div className="calls-filter-group">
            <span className="calls-filter-label">
              <span>⏰</span> Time:
            </span>
            <select
              className="calls-filter-select"
              value={timeFilter}
              onChange={e => setTimeFilter(e.target.value as TimeFilter)}
              aria-label="Filter calls by time of day"
            >
              <option value="all">All Times (24h)</option>
              <option value="morning">Morning (06:00 – 12:00)</option>
              <option value="afternoon">Afternoon (12:00 – 17:00)</option>
              <option value="evening">Evening / Night (17:00 – 23:59)</option>
              <option value="biz">Business Hours (08:30 – 18:00)</option>
              <option value="afterhours">After Hours (Night / Early)</option>
            </select>
          </div>

          {/* Staff Filter (For Manager) */}
          {!isStaff && (
            <div className="calls-filter-group">
              <span className="calls-filter-label">
                <span>👤</span> Staff:
              </span>
              <select
                className="calls-filter-select"
                value={staffFilter}
                onChange={e => setStaffFilter(e.target.value)}
                aria-label="Filter calls by staff member"
              >
                <option value="all">All Team Members</option>
                {team.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.n}
                    {s.role === 'manager' ? ' (Manager)' : ''}
                  </option>
                ))}
                <option value="unassigned">Unassigned / Auto Queue (—)</option>
              </select>
            </div>
          )}

          <span className="sp" />

          {/* Count and Reset button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '12px', color: 'var(--ink-2)', fontWeight: 500 }}>
              Showing <b>{rows.length}</b> of {totalLabel} calls
            </span>

            {hasActiveFilters && (
              <button
                type="button"
                className="btn sm"
                onClick={handleResetFilters}
                style={{
                  fontSize: '11.5px',
                  padding: '3px 10px',
                  borderRadius: '12px',
                  borderColor: 'var(--rule-2)',
                  color: 'var(--bad)',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
                title="Clear all filters"
              >
                ✕ Reset Filters
              </button>
            )}
          </div>
        </div>

        {/* Active Filter Badges Bar */}
        {hasActiveFilters && (
          <div className="calls-active-pills">
            <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--ink-2)' }}>Active Filters:</span>

            {filter !== 'all' && (
              <span className="calls-filter-chip">
                <span>Type: {filter.toUpperCase()}</span>
                <button type="button" className="calls-filter-chip-remove" onClick={() => setFilter('all')} title="Remove status filter">
                  ✕
                </button>
              </span>
            )}

            {dateFilter !== 'all' && (
              <span className="calls-filter-chip">
                <span>
                  📅 Date:{' '}
                  {dateFilter === 'today'
                    ? 'Today'
                    : dateFilter === 'yesterday'
                      ? 'Yesterday'
                      : dateFilter === 'week'
                        ? 'Past 7 Days'
                        : customDate || 'Custom Date'}
                </span>
                <button
                  type="button"
                  className="calls-filter-chip-remove"
                  onClick={() => {
                    setDateFilter('all');
                    setCustomDate('');
                  }}
                  title="Remove date filter"
                >
                  ✕
                </button>
              </span>
            )}

            {timeFilter !== 'all' && (
              <span className="calls-filter-chip">
                <span>
                  ⏰ Time:{' '}
                  {timeFilter === 'morning'
                    ? 'Morning (06:00-12:00)'
                    : timeFilter === 'afternoon'
                      ? 'Afternoon (12:00-17:00)'
                      : timeFilter === 'evening'
                        ? 'Evening (17:00-24:00)'
                        : timeFilter === 'biz'
                          ? 'Business Hours'
                          : 'After Hours'}
                </span>
                <button type="button" className="calls-filter-chip-remove" onClick={() => setTimeFilter('all')} title="Remove time filter">
                  ✕
                </button>
              </span>
            )}

            {!isStaff && staffFilter !== 'all' && (
              <span className="calls-filter-chip">
                <span>👤 Staff: {staffFilter === 'unassigned' ? 'Unassigned / Queue' : (team.find(s => s.id === staffFilter)?.n ?? '—')}</span>
                <button type="button" className="calls-filter-chip-remove" onClick={() => setStaffFilter('all')} title="Remove staff filter">
                  ✕
                </button>
              </span>
            )}

            {search.trim() !== '' && (
              <span className="calls-filter-chip">
                <span>🔍 Search: &ldquo;{search}&rdquo;</span>
                <button type="button" className="calls-filter-chip-remove" onClick={() => setSearch('')} title="Clear search">
                  ✕
                </button>
              </span>
            )}
          </div>
        )}

        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Type</th>
                <th>When</th>
                <th>Duration</th>
                <th>Handled by</th>
                <th>Notes</th>
                <th className="r">Actions</th>
              </tr>
            </thead>
            <tbody>
              {logQ.isPending ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '36px 0', color: 'var(--ink-3)' }}>
                    Loading…
                  </td>
                </tr>
              ) : logQ.isError ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '36px 0', color: 'var(--bad)' }}>
                    {logQ.error.message}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '36px 0', color: 'var(--ink-3)' }}>
                    {hasActiveFilters ? 'No calls match your filters.' : 'No calls yet.'}
                  </td>
                </tr>
              ) : (
                rows.map(({ call, item: k }) => {
                  const c = call.contact;
                  const hasDetail = Boolean(call.recordingUrl) || call.hasRecording || Boolean(call.summary);
                  return (
                    <tr key={call.id}>
                      <td>
                        <div className="emp">
                          <i className={`av ${c.avatarColor}`}>{c.initials}</i>
                          <span>
                            <b>{c.name}</b>
                            <span>{c.phone}</span>
                          </span>
                        </div>
                      </td>
                      <td>{getCallChip(k.d)}</td>
                      <td>{k.t}</td>
                      <td>{k.dur || '—'}</td>
                      <td>{k.by || '—'}</td>
                      <td>
                        {call.hasSummary ? (
                          <span className="chip i" style={{ marginRight: '4px', cursor: 'pointer' }} onClick={() => openSheet(<RecordingSheet call={call} item={k} />)}>
                            AI summary
                          </span>
                        ) : null}
                        {k.note || '—'}
                      </td>
                      <td className="r" style={{ whiteSpace: 'nowrap' }}>
                        {hasDetail ? (
                          <button className="btn sm" style={{ marginRight: '6px' }} onClick={() => openSheet(<RecordingSheet call={call} item={k} />)}>
                            {call.hasRecording ? '● Recording' : 'Summary'}
                          </button>
                        ) : null}
                        <button className="btn sm" style={{ marginRight: '6px' }} onClick={() => openSheet(<NoteSheet call={call} />)}>
                          ✎ Note
                        </button>
                        <button className={`btn sm ${call.hasRecording ? '' : 'pri'}`} style={{ marginRight: '6px' }} onClick={() => startCall(call.contactId)}>
                          ☏ Call
                        </button>
                        <button className="btn sm" onClick={() => void openChat(call.contactId)}>
                          💬 Chat
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {logQ.hasNextPage && (
          <div className="card-b" style={{ textAlign: 'center' }}>
            <button className="btn sm" disabled={logQ.isFetchingNextPage} onClick={() => void logQ.fetchNextPage()}>
              {logQ.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
      </div>

      {/* Scheduled calls */}
      <div className="card">
        <div className="card-h">
          <h2>{isStaff ? 'My scheduled calls' : 'Scheduled calls'}</h2>
          <span className="chip">{scheduled.length}</span>
          <span className="sp" />
          <button className="btn sm pri" onClick={() => openSheet(<ScheduleSheet isManager={isManager} />)}>
            + Schedule call
          </button>
        </div>
        {scheduledQ.isPending ? (
          <div className="card-b">
            <p className="hint">Loading…</p>
          </div>
        ) : scheduledQ.isError ? (
          <div className="card-b">
            <p className="hint">{scheduledQ.error.message}</p>
          </div>
        ) : scheduled.length === 0 ? (
          <div className="card-b">
            <p className="hint">No calls scheduled.</p>
          </div>
        ) : (
          scheduled.map(s => {
            const overdue = new Date(s.scheduledAt).getTime() < scheduledQ.dataUpdatedAt;
            return (
              <div key={s.id} className="list-row">
                <div className="bd">
                  <b>{s.contactName}</b>
                  <span>
                    <span className={`chip ${overdue ? 'b' : 'i'}`}>◷ {whenText(s.scheduledAt)}</span>
                    {isManager ? ` · ${s.userName}` : ''}
                    {s.note ? ` · ${s.note}` : ''}
                  </span>
                </div>
                <div className="rt" style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn sm pri" style={{ marginRight: '6px' }} onClick={() => startCall(s.contactId)}>
                    ☏ Call
                  </button>
                  <button className="btn sm" style={{ marginRight: '6px' }} disabled={doneM.isPending} onClick={() => markDone(s)}>
                    ✓ Done
                  </button>
                  <button className="btn sm dg" disabled={cancelM.isPending} onClick={() => cancel(s)}>
                    Cancel
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="note i">
        <span className="ic">◈</span>
        <div>
          <b>Calling needs the customer’s permission</b>
          A business can only call a customer who has allowed it, through the call_permission template or by calling the business first. Recording always plays an announcement.
        </div>
      </div>
    </>
  );
}
