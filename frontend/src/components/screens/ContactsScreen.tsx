'use client';

import React, { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { Contact } from '@/types';
import SectionThemeToggle from '@/components/common/SectionThemeToggle';

export default function ContactsScreen() {
  const {
    contacts,
    staff,
    conversations,
    setOwner,
    setScreen,
    openSheet,
    addToast
  } = useApp();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [bulkOwner, setBulkOwner] = useState('');

  const contactList = Object.values(contacts);

  const filteredContacts = contactList.filter(c => {
    const q = search.toLowerCase();
    if (q && !c.n.toLowerCase().includes(q) && !c.ph.includes(q) && !c.city.toLowerCase().includes(q)) {
      return false;
    }
    if (filter === 'none') return !c.to;
    if (filter !== 'all' && c.to !== filter) return false;
    return true;
  });

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

  const selectedCount = Object.values(selectedIds).filter(Boolean).length;

  const handleSelectAll = (checked: boolean) => {
    const next: Record<string, boolean> = {};
    if (checked) {
      filteredContacts.forEach(c => { next[c.id] = true; });
    }
    setSelectedIds(next);
  };

  const handleBulkAssign = (sid: string | null) => {
    const ids = Object.keys(selectedIds).filter(k => selectedIds[k]);
    let count = 0;
    ids.forEach(id => {
      if (setOwner(id, sid, 'bulk')) count++;
    });
    setSelectedIds({});
    const s = sid ? staff.find(x => x.id === sid) : null;
    addToast(`${count} customer(s) ${s ? `assigned to ${s.n.split(' ')[0]}` : 'unassigned'}.`);
  };

  const handleOpenCustomerSheet = (c: Contact) => {
    const conv = conversations.find(v => v.c === c.id);
    const s = staff.find(x => x.id === c.to);

    openSheet(
      <>
        <h2>{c.n}</h2>
        <p className="sub">{c.ph} · {c.city} · customer since {c.since}</p>
        <div className="ln">
          <span>Owner</span>
          <b>{s ? s.n : <span className="chip b">No owner</span>}</b>
        </div>
        <div className="ln">
          <span>Reply window</span>
          <b>
            <span className={`wt ${getWinClass(conv?.exp)}`}>
              ◷ <b>{getWinText(conv?.exp)}</b>
            </span>
          </b>
        </div>
        <div className="ln">
          <span>Call permission</span>
          <b>{c.perm ? 'Allowed' : 'Not asked yet'}</b>
        </div>
        <div className="ln">
          <span>Labels</span>
          <b>
            {c.labels.length > 0 ? (
              c.labels.map((l, i) => (
                <span key={i} className={`chip ${l[1]}`} style={{ marginLeft: '4px' }}>
                  {l[0]}
                </span>
              ))
            ) : '—'}
          </b>
        </div>

        <h3 style={{ margin: '16px 0 4px', fontSize: '13px' }}>Owner history</h3>
        {c.hist.map((h, i) => (
          <div key={i} className="ln">
            <span>{h[1]}</span>
            <b style={{ fontWeight: 500, fontSize: '11.5px', textAlign: 'right' }}>
              {h[0]}<br />
              <span style={{ color: 'var(--ink-3)' }}>{h[2]}</span>
            </b>
          </div>
        ))}

        <button
          className="btn pri"
          style={{ width: '100%', justifyContent: 'center', marginTop: '14px' }}
          onClick={() => setScreen('chats')}
        >
          Open chat
        </button>
      </>
    );
  };

  return (
    <>
      <div className="ph">
        <div>
          <h1>Customers &amp; owners</h1>
          <p>
            One owner per customer number. The owner gets every chat and call from that number. Customers with no owner go to the Sales queue.
          </p>
        </div>
        <div className="acts">
          <SectionThemeToggle />
          <button className="btn" onClick={() => addToast('Import: CSV with name, number and owner.')}>
            Import CSV
          </button>
          <button className="btn pri" onClick={() => addToast('New customer form opened.')}>
            Add customer
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <input
            className="f-in"
            style={{ maxWidth: '230px' }}
            placeholder="Name or number"
            aria-label="Search"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />

          <div className="seg">
            <button
              aria-pressed={filter === 'all'}
              className={filter === 'all' ? 'active' : ''}
              onClick={() => setFilter('all')}
            >
              All {contactList.length}
            </button>
            <button
              aria-pressed={filter === 'none'}
              className={filter === 'none' ? 'active' : ''}
              onClick={() => setFilter('none')}
            >
              Unassigned {contactList.filter(c => !c.to).length}
            </button>
            {staff.map(s => {
              const count = contactList.filter(c => c.to === s.id).length;
              return (
                <button
                  key={s.id}
                  aria-pressed={filter === s.id}
                  className={filter === s.id ? 'active' : ''}
                  onClick={() => setFilter(s.id)}
                >
                  {s.n.split(' ')[0]} {count}
                </button>
              );
            })}
          </div>

          <span className="sp" />
          <button className="btn sm" onClick={() => addToast('Customer list exported.')}>
            Export
          </button>
        </div>

        {/* Bulk Action Bar */}
        {selectedCount > 0 && (
          <div className="bulk">
            <b>{selectedCount} selected</b>
            <span className="sp" />
            <select
              className="f-in own"
              value={bulkOwner}
              onChange={e => setBulkOwner(e.target.value)}
            >
              <option value="">Choose owner…</option>
              {staff.map(s => (
                <option key={s.id} value={s.id}>
                  {s.n}
                </option>
              ))}
            </select>
            <button
              className="btn sm pri"
              onClick={() => {
                if (!bulkOwner) {
                  addToast('Choose an owner first.');
                  return;
                }
                handleBulkAssign(bulkOwner);
              }}
            >
              Assign
            </button>
            <button className="btn sm" onClick={() => handleBulkAssign(null)}>
              Unassign
            </button>
            <button className="btn sm" onClick={() => setSelectedIds({})}>
              Clear
            </button>
          </div>
        )}

        <div className="tw">
          <table>
            <thead>
              <tr>
                <th style={{ width: '30px' }}>
                  <input
                    type="checkbox"
                    className="ck"
                    aria-label="Select all"
                    checked={filteredContacts.length > 0 && selectedCount === filteredContacts.length}
                    onChange={e => handleSelectAll(e.target.checked)}
                  />
                </th>
                <th>Customer</th>
                <th>City</th>
                <th>Labels</th>
                <th>Owner</th>
                <th>Reply window</th>
                <th>Calls</th>
              </tr>
            </thead>
            <tbody>
              {filteredContacts.length ? (
                filteredContacts.map(c => {
                  const conv = conversations.find(v => v.c === c.id);
                  const isChecked = !!selectedIds[c.id];

                  return (
                    <tr key={c.id}>
                      <td style={{ width: '30px' }}>
                        <input
                          type="checkbox"
                          className="ck"
                          checked={isChecked}
                          onChange={e => {
                            setSelectedIds(prev => ({ ...prev, [c.id]: e.target.checked }));
                          }}
                        />
                      </td>
                      <td>
                        <button
                          className="emp lk"
                          onClick={() => handleOpenCustomerSheet(c)}
                        >
                          <i className={`av ${c.a}`}>{c.i}</i>
                          <span>
                            <b>{c.n}</b>
                            <span>{c.ph}</span>
                          </span>
                        </button>
                      </td>
                      <td>{c.city}</td>
                      <td>
                        {c.labels.length > 0 ? (
                          c.labels.map((l, i) => (
                            <span key={i} className={`chip ${l[1]}`} style={{ marginRight: '4px' }}>
                              {l[0]}
                            </span>
                          ))
                        ) : '—'}
                      </td>
                      <td>
                        {!c.to && <span className="chip b" style={{ marginRight: '6px' }}>No owner</span>}
                        <select
                          className="f-in own"
                          value={c.to || ''}
                          onChange={e => {
                            const newSid = e.target.value || null;
                            const oldSid = c.to;
                            setOwner(c.id, newSid);
                            const s = newSid ? staff.find(x => x.id === newSid) : null;
                            const oldS = oldSid ? staff.find(x => x.id === oldSid) : null;
                            addToast(newSid
                              ? (oldSid ? `${c.n} moved from ${oldS?.n.split(' ')[0]} to ${s?.n.split(' ')[0]}.` : `${c.n} assigned to ${s?.n.split(' ')[0]}.`)
                              : `${c.n} unassigned. Chats and calls go to the Sales queue.`
                            );
                          }}
                        >
                          <option value="">Unassigned</option>
                          {staff.map(s => (
                            <option key={s.id} value={s.id}>
                              {s.n}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <span className={`wt ${getWinClass(conv?.exp)}`}>
                          ◷ <b>{getWinText(conv?.exp)}</b>
                        </span>
                      </td>
                      <td>
                        {c.perm ? (
                          <span className="chip ok">Allowed</span>
                        ) : (
                          <span className="chip">Not yet</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7}>
                    <div className="empty">
                      <b>No customers here</b>
                      Try another filter.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="note i">
        <span className="ic">◈</span>
        <div>
          <b>Changing the owner</b>
          Pick a name in the Owner column, or tick several customers and assign them together. Each change is saved in the customer’s owner history and added to the chat as a team note.
        </div>
      </div>
    </>
  );
}
