'use client';

import React, { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { CallLogItem } from '@/types';
import SectionThemeToggle from '@/components/common/SectionThemeToggle';

export default function CallsScreen() {
  const {
    role,
    calls,
    contacts,
    staff,
    startCall,
    openSheet,
    closeSheet,
    sendMessage,
    setScreen,
    addToast,
    ringingCall,
    simulateIncomingCall,
    ivr
  } = useApp();

  const isStaff = role === 'staff';
  const myStaffId = 's1';

  const [filter, setFilter] = useState<'all' | 'missed' | 'rejected' | 'rec' | 'incoming' | 'outgoing'>('all');
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'yesterday' | 'week' | 'custom'>('all');
  const [customDate, setCustomDate] = useState('');
  const [timeFilter, setTimeFilter] = useState<'all' | 'morning' | 'afternoon' | 'evening' | 'biz' | 'afterhours'>('all');
  const [staffFilter, setStaffFilter] = useState<string>('all');

  // Filter calls list based on role, status filter, date, time slot, staff, and search query
  const visibleCalls = calls.filter(k => {
    if (k.d === 'ringing') return false;
    if (isStaff && contacts[k.c]?.to !== myStaffId) return false;

    // 1. Status Filter
    if (filter === 'missed' && k.d !== 'missed') return false;
    if (filter === 'rejected' && k.d !== 'rejected' && k.d !== 'forwarded') return false;
    if (filter === 'rec' && k.rec !== 1) return false;
    if (filter === 'incoming' && k.d !== 'incoming') return false;
    if (filter === 'outgoing' && k.d !== 'outgoing') return false;

    // 2. Date Filter
    const timeLower = (k.t || '').toLowerCase();
    if (dateFilter === 'today') {
      if (!timeLower.includes('today')) return false;
    } else if (dateFilter === 'yesterday') {
      if (!timeLower.includes('yesterday')) return false;
    } else if (dateFilter === 'week') {
      const isThisWeek = timeLower.includes('today') || timeLower.includes('yesterday') || k.t.includes('2026-10') || k.t.includes('2026-09');
      if (!isThisWeek) return false;
    } else if (dateFilter === 'custom' && customDate) {
      if (!k.t.includes(customDate)) return false;
    }

    // 3. Time Slot Filter
    if (timeFilter !== 'all') {
      const timeMatch = k.t.match(/\b(\d{1,2}):(\d{2})\b/);
      if (timeMatch) {
        const hours = parseInt(timeMatch[1], 10);
        const minutes = parseInt(timeMatch[2], 10);
        const totalMinutes = hours * 60 + minutes;

        if (timeFilter === 'morning' && (hours < 6 || hours >= 12)) return false;
        if (timeFilter === 'afternoon' && (hours < 12 || hours >= 17)) return false;
        if (timeFilter === 'evening' && (hours < 17 || hours >= 24)) return false;
        if (timeFilter === 'biz' && (totalMinutes < 8 * 60 + 30 || totalMinutes > 18 * 60)) return false;
        if (timeFilter === 'afterhours' && (totalMinutes >= 8 * 60 + 30 && totalMinutes <= 18 * 60)) return false;
      }
    }

    // 4. Staff Filter (for Manager role)
    if (!isStaff && staffFilter !== 'all') {
      const callBy = (k.by || '').trim();
      if (staffFilter === 'unassigned') {
        const isUnassigned = !callBy || callBy === '—' || callBy.toLowerCase().includes('queue') || callBy.toLowerCase().includes('auto');
        if (!isUnassigned) return false;
      } else {
        if (!callBy.toLowerCase().includes(staffFilter.toLowerCase())) return false;
      }
    }

    // 5. Search Filter
    if (search.trim()) {
      const q = search.toLowerCase();
      const c = contacts[k.c];
      const matchName = c?.n.toLowerCase().includes(q);
      const matchPhone = c?.ph.toLowerCase().includes(q);
      const matchBy = k.by?.toLowerCase().includes(q);
      const matchNote = k.note?.toLowerCase().includes(q);
      if (!matchName && !matchPhone && !matchBy && !matchNote) return false;
    }

    return true;
  });

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

  // Calculate dynamic stats reflecting current filter
  const answeredCount = visibleCalls.filter(k => k.d === 'incoming' || k.d === 'outgoing' || k.d === 'transferred').length;
  const missedCount = visibleCalls.filter(k => k.d === 'missed').length;
  const rejectedCount = visibleCalls.filter(k => k.d === 'rejected' || k.d === 'forwarded').length;
  const recordedCount = visibleCalls.filter(k => k.rec === 1).length;

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

  // Open Start New Call sheet
  const handleOpenNewCallSheet = () => {
    openSheet(
      <>
        <h2>Start a WhatsApp Call</h2>
        <p className="sub">Select a customer with an active window or call permission.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '420px', overflowY: 'auto' }}>
          {Object.entries(contacts).map(([cid, contact]) => (
            <div key={cid} className="list-row" style={{ paddingLeft: 0, paddingRight: 0 }}>
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
                    startCall(cid);
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

  // Open Call recording sheet
  const handleOpenRecordingSheet = (callItem: CallLogItem) => {
    const c = contacts[callItem.c];
    if (!c) return;

    openSheet(
      <>
        <h2>Call recording</h2>
        <p className="sub">
          {c.n} · {callItem.t} · {callItem.dur} · handled by {callItem.by}
        </p>

        <div className="att">
          <span className="att-voice">
            <button className="pl" onClick={e => (e.currentTarget.parentNode as HTMLElement)?.classList.toggle('play')}>
              ▶
            </button>
            <span className="wave">
              {Array.from({ length: 22 }).map((_, i) => (
                <i key={i} style={{ height: `${6 + ((i * 37) % 17)}px` }} />
              ))}
            </span>
            <small>{callItem.dur || '3:12'}</small>
          </span>
        </div>

        <h3 style={{ margin: '16px 0 6px', fontSize: '13px' }}>AI summary</h3>
        <p style={{ fontSize: '13.5px' }}>
          Customer confirmed requirements for pantry cupboard and requested quotation. Site measurement fixed for Saturday 10am.
        </p>

        <h3 style={{ margin: '16px 0 6px', fontSize: '13px' }}>Transcript</h3>
        <p style={{ fontSize: '13px', marginBottom: '4px' }}>
          <b style={{ color: 'var(--ink-2)' }}>{c.n.split(' ')[0]}:</b> Hello, I saw the wardrobe photos on your page.
        </p>
        <p style={{ fontSize: '13px', marginBottom: '4px' }}>
          <b style={{ color: 'var(--ink-2)' }}>{callItem.by}:</b> Hi! Yes, which size are you looking at?
        </p>
        <p style={{ fontSize: '13px', marginBottom: '4px' }}>
          <b style={{ color: 'var(--ink-2)' }}>{c.n.split(' ')[0]}:</b> Three doors, with a mirror in the middle.
        </p>
        <p style={{ fontSize: '13px', marginBottom: '4px' }}>
          <b style={{ color: 'var(--ink-2)' }}>{callItem.by}:</b> Our sliding 3-door is Rs. 145,000. We measure on site for free.
        </p>

        <p className="hint" style={{ marginTop: '10px' }}>
          Recorded after the announcement · kept 90 days · managers and {callItem.by} can listen.
        </p>

        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
          <button
            className="btn"
            onClick={() => {
              sendMessage(
                'v1',
                `Call recording · ${callItem.dur}. Follow up regarding measurements.`,
                true,
                [{ type: 'voice', name: 'call_recording.ogg', size: 420000, dur: callItem.dur }]
              );
              closeSheet();
              addToast(`Recording added to ${c.n.split(' ')[0]}’s chat as a team note.`);
            }}
          >
            Add to chat as note
          </button>
          <button className="btn" onClick={() => addToast('Recording downloaded (call.ogg).')}>
            Download
          </button>
        </div>
      </>
    );
  };

  return (
    <>
      <div className="ph">
        <div>
          <h1>{isStaff ? 'My calls' : 'Calls'}</h1>
          <p>
            {isStaff
              ? 'Every WhatsApp call assigned to you, who took it, and the recording.'
              : 'Every WhatsApp call on +94 77 123 4567, who took it, recordings, and live queue.'}
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
          <button
            className="btn"
            onClick={() => addToast('Call-back queue notified for 2 missed calls.')}
          >
            Call back missed
          </button>
          {!ringingCall && (
            <button
              className="btn"
              style={{ borderColor: '#00a884', color: '#00a884' }}
              onClick={simulateIncomingCall}
              title="Test WhatsApp incoming call floating popup"
            >
              📞 Test Incoming Call
            </button>
          )}
          <button className="btn pri" onClick={handleOpenNewCallSheet}>
            + Start Call
          </button>
        </div>
      </div>

      {/* Call Center Stats */}
      <div className="stats">
        <div className="stat ok">
          <span>Answered</span>
          <b>{answeredCount}</b>
          <small>Avg 3m 12s</small>
        </div>
        <div className="stat b">
          <span>Missed</span>
          <b>{missedCount}</b>
          <small>2 not returned yet</small>
        </div>
        <div className="stat w">
          <span>Rejected / Forwarded</span>
          <b>{rejectedCount}</b>
          <small>Busy or redirected</small>
        </div>
        <div className="stat i">
          <span>Recorded</span>
          <b>{recordedCount}</b>
          <small>Kept 90 days</small>
        </div>
      </div>

      {/* Call Log List Card */}
      <div className="card">
        <div className="card-h" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
          <div className="seg">
            {[
              { id: 'all', label: 'All' },
              { id: 'incoming', label: 'Incoming' },
              { id: 'outgoing', label: 'Outgoing' },
              { id: 'missed', label: 'Missed' },
              { id: 'rejected', label: 'Rejected' },
              { id: 'rec', label: 'Recorded' }
            ].map(tab => (
              <button
                key={tab.id}
                aria-pressed={filter === tab.id}
                className={filter === tab.id ? 'active' : ''}
                onClick={() => setFilter(tab.id as typeof filter)}
              >
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
          <button className="btn sm" onClick={() => addToast('Call log exported to CSV.')}>
            Export CSV
          </button>
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
              onChange={e => setDateFilter(e.target.value as typeof dateFilter)}
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
              onChange={e => setTimeFilter(e.target.value as typeof timeFilter)}
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
                <option value="Madushan">Madushan (Manager)</option>
                <option value="Nimal">Nimal Bandara (Lead)</option>
                <option value="Sachini">Sachini Wickrama</option>
                <option value="Ruwan">Ruwan Jayasinghe</option>
                <option value="Dinuka">Dinuka Perera</option>
                <option value="Kaveen">Kaveen Rajapaksha</option>
                <option value="unassigned">Unassigned / Auto Queue (—)</option>
              </select>
            </div>
          )}

          <span className="sp" />

          {/* Count and Reset button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '12px', color: 'var(--ink-2)', fontWeight: 500 }}>
              Showing <b>{visibleCalls.length}</b> of {calls.filter(k => k.d !== 'ringing').length} calls
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
            <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--ink-2)' }}>
              Active Filters:
            </span>

            {filter !== 'all' && (
              <span className="calls-filter-chip">
                <span>Type: {filter.toUpperCase()}</span>
                <button
                  type="button"
                  className="calls-filter-chip-remove"
                  onClick={() => setFilter('all')}
                  title="Remove status filter"
                >
                  ✕
                </button>
              </span>
            )}

            {dateFilter !== 'all' && (
              <span className="calls-filter-chip">
                <span>📅 Date: {dateFilter === 'today' ? 'Today' : dateFilter === 'yesterday' ? 'Yesterday' : dateFilter === 'week' ? 'Past 7 Days' : customDate || 'Custom Date'}</span>
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
                <span>⏰ Time: {timeFilter === 'morning' ? 'Morning (06:00-12:00)' : timeFilter === 'afternoon' ? 'Afternoon (12:00-17:00)' : timeFilter === 'evening' ? 'Evening (17:00-24:00)' : timeFilter === 'biz' ? 'Business Hours' : 'After Hours'}</span>
                <button
                  type="button"
                  className="calls-filter-chip-remove"
                  onClick={() => setTimeFilter('all')}
                  title="Remove time filter"
                >
                  ✕
                </button>
              </span>
            )}

            {!isStaff && staffFilter !== 'all' && (
              <span className="calls-filter-chip">
                <span>👤 Staff: {staffFilter === 'unassigned' ? 'Unassigned / Queue' : staffFilter}</span>
                <button
                  type="button"
                  className="calls-filter-chip-remove"
                  onClick={() => setStaffFilter('all')}
                  title="Remove staff filter"
                >
                  ✕
                </button>
              </span>
            )}

            {search.trim() !== '' && (
              <span className="calls-filter-chip">
                <span>🔍 Search: &ldquo;{search}&rdquo;</span>
                <button
                  type="button"
                  className="calls-filter-chip-remove"
                  onClick={() => setSearch('')}
                  title="Clear search"
                >
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
              {visibleCalls.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '36px 0', color: 'var(--ink-3)' }}>
                    No calls match your filters.
                  </td>
                </tr>
              ) : (
                visibleCalls.map((k, idx) => {
                  const c = contacts[k.c];
                  if (!c) return null;
                  return (
                    <tr key={idx}>
                      <td>
                        <div className="emp">
                          <i className={`av ${c.a}`}>{c.i}</i>
                          <span>
                            <b>{c.n}</b>
                            <span>{c.ph}</span>
                          </span>
                        </div>
                      </td>
                      <td>{getCallChip(k.d)}</td>
                      <td>{k.t}</td>
                      <td>{k.dur || '—'}</td>
                      <td>{k.by || '—'}</td>
                      <td>
                        {k.ai ? <span className="chip i" style={{ marginRight: '4px' }}>AI summary</span> : null}
                        {k.note || '—'}
                      </td>
                      <td className="r" style={{ whiteSpace: 'nowrap' }}>
                        {k.rec ? (
                          <button
                            className="btn sm"
                            style={{ marginRight: '6px' }}
                            onClick={() => handleOpenRecordingSheet(k)}
                          >
                            ● Recording
                          </button>
                        ) : null}
                        <button
                          className={`btn sm ${k.rec ? '' : 'pri'}`}
                          style={{ marginRight: '6px' }}
                          onClick={() => startCall(k.c)}
                        >
                          ☏ Call
                        </button>
                        <button
                          className="btn sm"
                          onClick={() => {
                            setScreen('chats');
                            addToast(`Opened chat with ${c.n}`);
                          }}
                        >
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
