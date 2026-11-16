'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { ContactImportResult } from '@smart-reply/shared';
import { useApp } from '@/context/AppContext';
import { useSession } from '@/features/session';
import { useLabels } from '@/features/labels';
import {
  csvToImportRows,
  ImportRow,
  useBulkOwner,
  useContact,
  useContactList,
  useCreateContact,
  useExportContacts,
  useImportContacts,
  useOwnerHistory,
  useSetContactOwner,
  useStartConversation
} from '@/features/contacts';
import { toContact } from '@/lib/adapters';
import { Contact, Staff } from '@/types';
import SectionThemeToggle from '@/components/common/SectionThemeToggle';

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

const first = (n?: string) => (n ?? '').split(' ')[0];

/** People who can own customers: active staff. */
function useOwners(): Staff[] {
  const { staff } = useApp();
  return useMemo(() => staff.filter(s => s.status !== 'invited'), [staff]);
}

/* ───────── Customer sheet ───────── */

function CustomerSheet({ id }: { id: string }) {
  const app = useApp();
  const { me } = useSession();
  const { conversations, templates, setScreen, openConversation, openConversationForContact, closeSheet, setContactLabels, setBlocked, addToast, reportError } = app;
  const owners = useOwners();
  const contactQ = useContact(id);
  const historyQ = useOwnerHistory(id);
  const labelsQ = useLabels();
  const start = useStartConversation();
  const [tplId, setTplId] = useState('');
  const [vars, setVars] = useState<string[]>([]);
  const [opening, setOpening] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [now] = useState(() => Date.now());

  if (contactQ.isLoading || !contactQ.data) {
    return (
      <>
        <h2>Customer</h2>
        <p className="sub">{contactQ.isError ? 'This customer could not be loaded.' : 'Loading…'}</p>
      </>
    );
  }

  const c: Contact = toContact(contactQ.data, historyQ.data ?? []);
  const conv = conversations.find(v => v.c === c.id);
  const s = owners.find(x => x.id === c.to) ?? app.team.find(x => x.id === c.to);
  const windowOpen = Boolean(conv?.exp && conv.exp > now);
  const approved = templates.filter(t => t.st === 'ok' && t.id);
  const tpl = approved.find(t => t.id === tplId);
  const canTemplates = me?.permissions.sendTemplates ?? false;

  const goToChat = (convId: string) => {
    closeSheet();
    setScreen('chats');
    openConversation(convId);
  };

  const openChat = async () => {
    setOpening(true);
    const convId = conv?.id ?? (await openConversationForContact(c.id));
    setOpening(false);
    if (convId) goToChat(convId);
  };

  const sendTemplate = async () => {
    if (!tpl?.id) {
      addToast('Choose a template first.');
      return;
    }
    const need = tpl.vars ?? 0;
    const values = Array.from({ length: need }, (_, i) => (vars[i] ?? '').trim());
    if (values.some(v => !v)) {
      addToast('Fill in every variable of the template.');
      return;
    }
    try {
      const started = await start.mutateAsync({ contactId: c.id, templateId: tpl.id, variables: values });
      addToast(`Template ${tpl.n} sent to ${c.n}.`);
      goToChat(started.id);
    } catch (err) {
      reportError(err);
    }
  };

  const toggleLabel = (labelId: string) => {
    const ids = c.labelIds ?? [];
    void setContactLabels(c.id, ids.includes(labelId) ? ids.filter(x => x !== labelId) : [...ids, labelId]);
  };

  return (
    <>
      <h2>{c.n}</h2>
      <p className="sub">{c.ph}{c.city ? ` · ${c.city}` : ''} · customer since {c.since}</p>
      <div className="ln">
        <span>Owner</span>
        <b>{s ? s.n : <span className="chip b">No owner</span>}</b>
      </div>
      <div className="ln">
        <span>Reply window</span>
        <b>
          {/* `.sheet .x` is the close button's style; keep the closed-window chip in the row. */}
          <span className={`wt ${getWinClass(conv?.exp)}`} style={{ position: 'static', fontSize: '11.5px', lineHeight: 'normal', color: getWinClass(conv?.exp) === 'x' ? 'var(--ink-3)' : undefined }}>
            ◷ <b>{getWinText(conv?.exp)}</b>
          </span>
        </b>
      </div>
      <div className="ln">
        <span>Call permission</span>
        <b>{c.perm ? 'Allowed' : c.permStatus === 'requested' ? 'Asked, waiting' : 'Not asked yet'}</b>
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
      {c.blocked && (
        <div className="ln">
          <span>Status</span>
          <b><span className="chip b">Blocked</span></b>
        </div>
      )}

      {(labelsQ.data ?? []).length > 0 && (
        <>
          <h3 style={{ margin: '16px 0 4px', fontSize: '13px' }}>Labels</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {(labelsQ.data ?? []).map(l => {
              const on = (c.labelIds ?? []).includes(l.id);
              return (
                <button
                  key={l.id}
                  type="button"
                  className={`chip ${l.color}`}
                  aria-pressed={on}
                  style={{ cursor: 'pointer', border: 0, opacity: on ? 1 : 0.45 }}
                  onClick={() => toggleLabel(l.id)}
                >
                  {on ? '✓ ' : '+ '}{l.name}
                </button>
              );
            })}
          </div>
        </>
      )}

      <h3 style={{ margin: '16px 0 4px', fontSize: '13px' }}>Owner history</h3>
      {historyQ.isLoading ? (
        <div className="hint">Loading…</div>
      ) : c.hist.length ? (
        c.hist.map((h, i) => (
          <div key={i} className="ln">
            <span>{h[1]}</span>
            <b style={{ fontWeight: 500, fontSize: '11.5px', textAlign: 'right' }}>
              {h[0]}<br />
              <span style={{ color: 'var(--ink-3)' }}>{h[2]}</span>
            </b>
          </div>
        ))
      ) : (
        <div className="hint">No owner changes yet.</div>
      )}

      {!windowOpen && canTemplates && !c.blocked && (
        <>
          <h3 style={{ margin: '16px 0 4px', fontSize: '13px' }}>Start chat with a template</h3>
          <div className="hint" style={{ marginTop: 0 }}>The 24-hour window is closed, so the first message must be an approved template.</div>
          <select
            className="f-in"
            style={{ marginTop: '6px' }}
            value={tplId}
            onChange={e => {
              setTplId(e.target.value);
              setVars([]);
            }}
          >
            <option value="">Choose template…</option>
            {approved.map(t => (
              <option key={t.id} value={t.id}>{t.n} · {t.lang}</option>
            ))}
          </select>
          {tpl && (
            <>
              <div className="hint">{tpl.body}</div>
              {Array.from({ length: tpl.vars ?? 0 }, (_, i) => (
                <input
                  key={i}
                  className="f-in"
                  style={{ marginTop: '6px' }}
                  placeholder={`Variable {{${i + 1}}}`}
                  value={vars[i] ?? ''}
                  onChange={e => setVars(prev => {
                    const next = [...prev];
                    next[i] = e.target.value;
                    return next;
                  })}
                />
              ))}
            </>
          )}
          {!approved.length && <div className="hint">No approved templates yet.</div>}
          <button className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: '8px' }} disabled={!tpl || start.isPending} onClick={sendTemplate}>
            {start.isPending ? 'Sending…' : 'Send template'}
          </button>
        </>
      )}

      <button
        className="btn pri"
        style={{ width: '100%', justifyContent: 'center', marginTop: '14px' }}
        disabled={opening}
        onClick={openChat}
      >
        Open chat
      </button>
      <button
        className="btn dgr"
        style={{ width: '100%', justifyContent: 'center', marginTop: '8px' }}
        onClick={() => {
          if (c.blocked) void setBlocked(c.id, false);
          else if (confirmBlock) {
            setConfirmBlock(false);
            void setBlocked(c.id, true);
          } else setConfirmBlock(true);
        }}
      >
        {c.blocked ? 'Unblock' : confirmBlock ? 'Yes, block this number' : 'Block'}
      </button>
    </>
  );
}

/* ───────── Add customer ───────── */

function AddCustomerForm({ onDone }: { onDone: (id: string) => void }) {
  const { role, addToast, reportError } = useApp();
  const owners = useOwners();
  const labelsQ = useLabels();
  const create = useCreateContact();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [owner, setOwner] = useState('');
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [optIn, setOptIn] = useState(false);

  const submit = async () => {
    if (!name.trim() || !phone.trim()) {
      addToast('Enter a name and a number.');
      return;
    }
    try {
      const c = await create.mutateAsync({
        name: name.trim(),
        phone: phone.trim(),
        city: city.trim(),
        ownerUserId: role === 'manager' ? owner || null : undefined,
        labelIds,
        marketingOptIn: optIn
      });
      addToast(`${c.name} added.`);
      onDone(c.id);
    } catch (err) {
      reportError(err);
    }
  };

  return (
    <>
      <h2>Add customer</h2>
      <p className="sub">One owner per customer number. Customers with no owner go to the Sales queue.</p>
      <label className="f" htmlFor="cuName">Name</label>
      <input className="f-in" id="cuName" maxLength={80} value={name} onChange={e => setName(e.target.value)} />
      <div className="f-row f2">
        <div>
          <label className="f" htmlFor="cuPhone">WhatsApp number</label>
          <input className="f-in" id="cuPhone" inputMode="tel" placeholder="+94 77 123 4567" value={phone} onChange={e => setPhone(e.target.value)} />
        </div>
        <div>
          <label className="f" htmlFor="cuCity">City</label>
          <input className="f-in" id="cuCity" maxLength={60} value={city} onChange={e => setCity(e.target.value)} />
        </div>
      </div>
      {role === 'manager' && (
        <>
          <label className="f" htmlFor="cuOwner">Owner</label>
          <select className="f-in" id="cuOwner" value={owner} onChange={e => setOwner(e.target.value)}>
            <option value="">Unassigned</option>
            {owners.map(s => (
              <option key={s.id} value={s.id}>{s.n}</option>
            ))}
          </select>
        </>
      )}
      {(labelsQ.data ?? []).length > 0 && (
        <>
          <label className="f">Labels</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {(labelsQ.data ?? []).map(l => {
              const on = labelIds.includes(l.id);
              return (
                <button
                  key={l.id}
                  type="button"
                  className={`chip ${l.color}`}
                  aria-pressed={on}
                  style={{ cursor: 'pointer', border: 0, opacity: on ? 1 : 0.45 }}
                  onClick={() => setLabelIds(prev => (on ? prev.filter(x => x !== l.id) : [...prev, l.id]))}
                >
                  {on ? '✓ ' : '+ '}{l.name}
                </button>
              );
            })}
          </div>
        </>
      )}
      <label className="tgl" style={{ marginTop: '10px' }}>
        <input type="checkbox" checked={optIn} onChange={e => setOptIn(e.target.checked)} />
        <span>Agreed to receive offers (broadcasts)</span>
      </label>
      <button className="btn pri" style={{ width: '100%', justifyContent: 'center', marginTop: '14px' }} disabled={create.isPending} onClick={submit}>
        {create.isPending ? 'Saving…' : 'Add customer'}
      </button>
    </>
  );
}

/* ───────── Import CSV ───────── */

function ImportForm() {
  const { addToast, reportError } = useApp();
  const imp = useImportContacts();
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [result, setResult] = useState<ContactImportResult | null>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setResult(null);
    setFileName(f.name);
    const parsed = csvToImportRows(await f.text());
    setRows(parsed.rows.slice(0, 5000));
    setProblems(parsed.rows.length > 5000 ? [...parsed.problems, 'Only the first 5000 rows will be imported.'] : parsed.problems);
  };

  const submit = async () => {
    if (!rows.length) {
      addToast('Choose a CSV file with at least one customer.');
      return;
    }
    try {
      const r = await imp.mutateAsync(rows);
      setResult(r);
      addToast(`Import done: ${r.created} added, ${r.updated} updated, ${r.skipped} skipped.`);
    } catch (err) {
      reportError(err);
    }
  };

  return (
    <>
      <h2>Import CSV</h2>
      <p className="sub">One customer per line: name, number, city, owner email, labels (separate labels with ;). A header row is optional.</p>
      <label className="btn" style={{ width: '100%', justifyContent: 'center' }}>
        {fileName ? `Change file (${fileName})` : 'Choose CSV file'}
        <input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={onFile} />
      </label>
      {fileName && (
        <div className="ln" style={{ marginTop: '10px' }}>
          <span>Customers found</span>
          <b>{rows.length}</b>
        </div>
      )}
      {rows.slice(0, 5).map((r, i) => (
        <div key={i} className="ln">
          <span>{r.name}</span>
          <b style={{ fontWeight: 500 }}>{r.phone}{r.city ? ` · ${r.city}` : ''}</b>
        </div>
      ))}
      {rows.length > 5 && <div className="hint">…and {rows.length - 5} more</div>}
      {problems.slice(0, 5).map((p, i) => (
        <div key={i} className="hint">{p}</div>
      ))}
      {problems.length > 5 && <div className="hint">…and {problems.length - 5} more lines skipped</div>}

      {result && (
        <div className={`note ${result.errors.length ? 'w' : 'i'}`} style={{ marginTop: '12px' }}>
          <span className="ic">{result.errors.length ? '⚠' : '◈'}</span>
          <div>
            <b>{result.created} added · {result.updated} updated · {result.skipped} skipped</b>
            {result.errors.slice(0, 8).map(e => (
              <div key={e.row}>Row {e.row}: {e.message}</div>
            ))}
            {result.errors.length > 8 && <div>…and {result.errors.length - 8} more</div>}
          </div>
        </div>
      )}

      <button className="btn pri" style={{ width: '100%', justifyContent: 'center', marginTop: '14px' }} disabled={!rows.length || imp.isPending} onClick={submit}>
        {imp.isPending ? 'Importing…' : `Import ${rows.length || ''} customer${rows.length === 1 ? '' : 's'}`}
      </button>
    </>
  );
}

/* ───────── Screen ───────── */

export default function ContactsScreen() {
  const { role, currentUser, team, conversations, openSheet, closeSheet, addToast, reportError } = useApp();
  const owners = useOwners();
  const labelsQ = useLabels();
  const isManager = role === 'manager';

  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [label, setLabel] = useState('');
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [bulkOwner, setBulkOwner] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const allQ = useContactList({});
  const listQ = useContactList({ search: query || undefined, owner: filter === 'all' ? undefined : filter, label: label || undefined });
  const setOwnerM = useSetContactOwner();
  const bulk = useBulkOwner();
  const exportM = useExportContacts();

  const contactList = useMemo(() => (allQ.data?.pages ?? []).flatMap(p => p.items).map(c => toContact(c)), [allQ.data]);
  const allMore = Boolean(allQ.hasNextPage);
  const filteredContacts = useMemo(() => (listQ.data?.pages ?? []).flatMap(p => p.items).map(c => toContact(c)), [listQ.data]);

  const selectedCount = Object.values(selectedIds).filter(Boolean).length;
  const plus = allMore ? '+' : '';

  const handleSelectAll = (checked: boolean) => {
    const next: Record<string, boolean> = {};
    if (checked) {
      filteredContacts.forEach(c => { next[c.id] = true; });
    }
    setSelectedIds(next);
  };

  const handleBulkAssign = async (sid: string | null) => {
    const ids = Object.keys(selectedIds).filter(k => selectedIds[k]);
    if (!ids.length) return;
    try {
      const r = await bulk.mutateAsync({ contactIds: ids, ownerUserId: sid, reason: 'bulk' });
      setSelectedIds({});
      setBulkOwner('');
      const s = sid ? owners.find(x => x.id === sid) : null;
      addToast(`${r.changed} customer(s) ${s ? `assigned to ${first(s.n)}` : 'unassigned'}.`);
    } catch (err) {
      reportError(err);
    }
  };

  const changeOwner = async (c: Contact, newSid: string | null) => {
    const oldSid = c.to;
    try {
      await setOwnerM.mutateAsync({ id: c.id, ownerUserId: newSid });
      const s = newSid ? owners.find(x => x.id === newSid) : null;
      const oldS = oldSid ? owners.find(x => x.id === oldSid) : null;
      addToast(newSid
        ? (oldSid ? `${c.n} moved from ${first(oldS?.n)} to ${first(s?.n)}.` : `${c.n} assigned to ${first(s?.n)}.`)
        : `${c.n} unassigned. Chats and calls go to the Sales queue.`
      );
    } catch (err) {
      reportError(err);
    }
  };

  const handleOpenCustomerSheet = (c: Contact) => openSheet(<CustomerSheet key={c.id} id={c.id} />);

  const handleExport = async () => {
    try {
      const r = await exportM.mutateAsync();
      window.open(r.url, '_blank', 'noopener');
      addToast('Customer list exported.');
    } catch (err) {
      reportError(err);
    }
  };

  /** Staff may move their own customers, or take one from the team queue for themselves. */
  const canChangeOwner = (c: Contact) => isManager || c.to === currentUser.id || !c.to;

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
          {isManager && (
            <button className="btn" onClick={() => openSheet(<ImportForm />)}>
              Import CSV
            </button>
          )}
          <button
            className="btn pri"
            onClick={() => openSheet(<AddCustomerForm onDone={id => {
              closeSheet();
              setTimeout(() => openSheet(<CustomerSheet key={id} id={id} />), 0);
            }} />)}
          >
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
              All {contactList.length}{plus}
            </button>
            <button
              aria-pressed={filter === 'none'}
              className={filter === 'none' ? 'active' : ''}
              onClick={() => setFilter('none')}
            >
              Unassigned {contactList.filter(c => !c.to).length}{plus}
            </button>
            {owners.map(s => {
              const count = contactList.filter(c => c.to === s.id).length;
              return (
                <button
                  key={s.id}
                  aria-pressed={filter === s.id}
                  className={filter === s.id ? 'active' : ''}
                  onClick={() => setFilter(s.id)}
                >
                  {first(s.n)} {count}{plus}
                </button>
              );
            })}
          </div>

          {(labelsQ.data ?? []).length > 0 && (
            <select className="f-in own" aria-label="Label" value={label} onChange={e => setLabel(e.target.value)}>
              <option value="">All labels</option>
              {(labelsQ.data ?? []).map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          )}

          <span className="sp" />
          {isManager && (
            <button className="btn sm" disabled={exportM.isPending} onClick={handleExport}>
              {exportM.isPending ? 'Exporting…' : 'Export'}
            </button>
          )}
        </div>

        {/* Bulk Action Bar */}
        {isManager && selectedCount > 0 && (
          <div className="bulk">
            <b>{selectedCount} selected</b>
            <span className="sp" />
            <select
              className="f-in own"
              value={bulkOwner}
              onChange={e => setBulkOwner(e.target.value)}
            >
              <option value="">Choose owner…</option>
              {owners.map(s => (
                <option key={s.id} value={s.id}>
                  {s.n}
                </option>
              ))}
            </select>
            <button
              className="btn sm pri"
              disabled={bulk.isPending}
              onClick={() => {
                if (!bulkOwner) {
                  addToast('Choose an owner first.');
                  return;
                }
                void handleBulkAssign(bulkOwner);
              }}
            >
              Assign
            </button>
            <button className="btn sm" disabled={bulk.isPending} onClick={() => handleBulkAssign(null)}>
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
                {isManager && (
                  <th style={{ width: '30px' }}>
                    <input
                      type="checkbox"
                      className="ck"
                      aria-label="Select all"
                      checked={filteredContacts.length > 0 && selectedCount === filteredContacts.length}
                      onChange={e => handleSelectAll(e.target.checked)}
                    />
                  </th>
                )}
                <th>Customer</th>
                <th>City</th>
                <th>Labels</th>
                <th>Owner</th>
                <th>Reply window</th>
                <th>Calls</th>
              </tr>
            </thead>
            <tbody>
              {listQ.isLoading ? (
                <tr>
                  <td colSpan={7}><span className="hint">Loading…</span></td>
                </tr>
              ) : filteredContacts.length ? (
                filteredContacts.map(c => {
                  const conv = conversations.find(v => v.c === c.id);
                  const isChecked = !!selectedIds[c.id];

                  return (
                    <tr key={c.id}>
                      {isManager && (
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
                      )}
                      <td>
                        <button
                          className="emp lk"
                          onClick={() => handleOpenCustomerSheet(c)}
                        >
                          <i className={`av ${c.a}`}>{c.i}</i>
                          <span>
                            <b>{c.n}{c.blocked ? ' · blocked' : ''}</b>
                            <span>{c.ph}</span>
                          </span>
                        </button>
                      </td>
                      <td>{c.city || '—'}</td>
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
                          disabled={!canChangeOwner(c) || setOwnerM.isPending}
                          onChange={e => void changeOwner(c, e.target.value || null)}
                        >
                          <option value="">Unassigned</option>
                          {owners.map(s => (
                            <option key={s.id} value={s.id} disabled={!isManager && !c.to && s.id !== currentUser.id}>
                              {s.n}
                            </option>
                          ))}
                          {c.to && !owners.some(s => s.id === c.to) && <option value={c.to}>{team.find(m => m.id === c.to)?.n ?? 'Manager'}</option>}
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
                      {query || filter !== 'all' || label ? 'Try another filter.' : 'Add a customer or import a CSV.'}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {listQ.hasNextPage && (
          <div className="card-b" style={{ textAlign: 'center' }}>
            <button className="btn sm" disabled={listQ.isFetchingNextPage} onClick={() => void listQ.fetchNextPage()}>
              {listQ.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
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
