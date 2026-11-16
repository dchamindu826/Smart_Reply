'use client';

import React, { useMemo, useState } from 'react';
import type { CompanyRole, Invite, StaffMember, StaffPermission, StaffPermissions } from '@smart-reply/shared';
import { useApp } from '@/context/AppContext';
import { useSession } from '@/features/session';
import {
  seatsFull,
  useAllStaff,
  useCancelInvite,
  useCreateInvite,
  useInvites,
  useRemoveStaff,
  useResendInvite,
  useRoles,
  useSeats,
  useStaffSummary,
  useUpdateRoles,
  useUpdateStaff
} from '@/features/team';
import { logTime, replyTime, toStaff } from '@/lib/adapters';
import { Staff } from '@/types';
import SectionThemeToggle from '@/components/common/SectionThemeToggle';

/** Switches shown for one person, in the order of the "What staff can do" card. */
const PERMISSION_TEXT: [StaffPermission, string][] = [
  ['replyAssigned', 'Reply and call customers assigned to them'],
  ['sendTemplates', 'Send approved templates'],
  ['seeAllChats', 'See chats assigned to others'],
  ['createTemplates', 'Create or edit templates'],
  ['exportOwn', 'Export their own performance'],
  ['makeCalls', 'Call customers'],
  ['editPrices', 'Edit catalog prices'],
  ['editSharedQuickReplies', 'Edit shared quick replies']
];

/** Short summary for the "Can" column. */
function canText(m: StaffMember): string {
  if (m.role === 'manager') return 'Everything';
  const p = m.permissions;
  const parts: string[] = [];
  if (p.seeAllChats) parts.push('All chats');
  else if (p.replyAssigned) parts.push('Own chats');
  if (p.makeCalls) parts.push('calls');
  if (p.sendTemplates) parts.push('templates');
  if (p.createTemplates) parts.push('edit templates');
  if (p.editPrices) parts.push('prices');
  if (p.editSharedQuickReplies) parts.push('shared replies');
  return parts.length ? parts.join(' · ') : 'View only';
}

function CopyLink({ link }: { link: string }) {
  const { addToast } = useApp();
  return (
    <>
      <label className="f" htmlFor="invLink">Invite link</label>
      <div style={{ display: 'flex', gap: '6px' }}>
        <input className="f-in" id="invLink" readOnly value={link} onFocus={e => e.target.select()} />
        <button
          className="btn"
          onClick={() => {
            navigator.clipboard
              .writeText(link)
              .then(() => addToast('Invite link copied.'))
              .catch(() => addToast('Select the link and copy it.'));
          }}
        >
          Copy
        </button>
      </div>
      <div className="hint">Send it by WhatsApp or SMS if the email does not arrive. It works for 7 days, once.</div>
    </>
  );
}

/* ───────── Invite ───────── */

function InviteForm() {
  const { addToast, reportError } = useApp();
  const seatsQ = useSeats();
  const create = useCreateInvite();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [title, setTitle] = useState('Staff');
  const [role, setRole] = useState<CompanyRole>('staff');
  const [error, setError] = useState('');
  const [sent, setSent] = useState<Invite | null>(null);
  const seats = seatsQ.data;

  const submit = async () => {
    setError('');
    if (!name.trim() || !email.trim()) {
      addToast('Enter a name and an email address.');
      return;
    }
    try {
      const inv = await create.mutateAsync({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        title: title.trim() || (role === 'manager' ? 'Manager' : 'Staff'),
        role
      });
      setSent(inv);
      addToast(`Invite sent to ${inv.email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The invite could not be sent.');
      reportError(err);
    }
  };

  if (sent) {
    return (
      <>
        <h2>Invite sent</h2>
        <p className="sub">{sent.name} gets an email at {sent.email}. They open the link, set a password and can sign in on the web or the app.</p>
        {sent.link && <CopyLink link={sent.link} />}
        <button
          className="btn"
          style={{ width: '100%', justifyContent: 'center', marginTop: '14px' }}
          onClick={() => {
            setSent(null);
            setName('');
            setEmail('');
            setPhone('');
          }}
        >
          Invite someone else
        </button>
      </>
    );
  }

  return (
    <>
      <h2>Add staff</h2>
      <p className="sub">
        Each person logs in to the app with their own account.
        {seats ? ` ${seats.used + seats.pendingInvites} of ${seats.limit} seats used.` : ''}
      </p>
      <label className="f" htmlFor="invName">Name</label>
      <input className="f-in" id="invName" maxLength={80} value={name} onChange={e => setName(e.target.value)} />
      <div className="f-row f2">
        <div>
          <label className="f" htmlFor="invEmail">Email</label>
          <input className="f-in" id="invEmail" type="email" value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="f" htmlFor="invPhone">Mobile (optional)</label>
          <input className="f-in" id="invPhone" inputMode="tel" placeholder="+94 77 123 4567" value={phone} onChange={e => setPhone(e.target.value)} />
        </div>
      </div>
      <div className="f-row f2">
        <div>
          <label className="f" htmlFor="invTitle">Job title</label>
          <input className="f-in" id="invTitle" maxLength={80} value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="f" htmlFor="invRole">Role</label>
          <select className="f-in" id="invRole" value={role} onChange={e => setRole(e.target.value as CompanyRole)}>
            <option value="staff">Staff</option>
            <option value="manager">Manager</option>
          </select>
        </div>
      </div>
      {error && (
        <div className="note w" style={{ marginTop: '12px' }}>
          <span className="ic">⚠</span>
          <div>{error}</div>
        </div>
      )}
      <button className="btn pri" style={{ width: '100%', justifyContent: 'center', marginTop: '14px' }} disabled={create.isPending} onClick={submit}>
        {create.isPending ? 'Sending…' : 'Send invite'}
      </button>
    </>
  );
}

/* ───────── Edit person ───────── */

function StaffEditForm({ id, onDone }: { id: string; onDone: () => void }) {
  const { currentUser, addToast, reportError } = useApp();
  const summaryQ = useStaffSummary(id);
  const update = useUpdateStaff();
  const remove = useRemoveStaff();
  const m = summaryQ.data;
  const [title, setTitle] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  if (!m) {
    return (
      <>
        <h2>Staff member</h2>
        <p className="sub">{summaryQ.isError ? 'This person could not be loaded.' : 'Loading…'}</p>
      </>
    );
  }

  const isSelf = m.id === currentUser.id;
  const first = m.name.split(' ')[0];
  const vTitle = title ?? m.title;
  const vNote = note ?? m.note;
  const vPhone = phone ?? m.phone ?? '';

  const save = async () => {
    try {
      await update.mutateAsync({ id: m.id, patch: { title: vTitle.trim(), note: vNote.trim(), phone: vPhone.trim() || null } });
      addToast(`${first}’s profile saved.`);
      onDone();
    } catch (err) {
      reportError(err);
    }
  };

  const setPermission = async (key: StaffPermission, on: boolean) => {
    try {
      await update.mutateAsync({ id: m.id, patch: { permissions: { [key]: on } } });
      await summaryQ.refetch();
      addToast(`${first}: ${PERMISSION_TEXT.find(p => p[0] === key)?.[1].toLowerCase()} ${on ? 'on' : 'off'}.`);
    } catch (err) {
      reportError(err);
    }
  };

  const doRemove = async () => {
    try {
      await remove.mutateAsync(m.id);
      addToast(`${first} removed. Their customers went back to the team pool.`);
      onDone();
    } catch (err) {
      reportError(err);
    }
  };

  const reactivate = async () => {
    try {
      await update.mutateAsync({ id: m.id, patch: { status: 'active' } });
      addToast(`${first} can sign in again.`);
      onDone();
    } catch (err) {
      reportError(err);
    }
  };

  return (
    <>
      <h2>{m.name}</h2>
      <p className="sub">
        {m.role === 'manager' ? 'Manager' : 'Staff'} · {m.email}
        {m.lastLoginAt ? ` · last sign-in ${logTime(m.lastLoginAt)}` : ' · not signed in yet'}
      </p>

      <div className="ln"><span>Customers they own</span><b>{m.assignedCustomers}</b></div>
      <div className="ln"><span>Open chats</span><b>{m.stats.openChats}</b></div>
      <div className="ln"><span>Resolved this week</span><b>{m.stats.resolved}</b></div>
      <div className="ln"><span>Avg first reply</span><b>{replyTime(m.stats.avgFirstReplySeconds)}</b></div>
      <div className="ln"><span>Calls today</span><b>{m.stats.callsToday} · {m.stats.callsMissed} missed</b></div>
      <div className="ln"><span>Breaks today</span><b>{m.breaks.usedMinutes} min</b></div>

      <div className="f-row f2">
        <div>
          <label className="f" htmlFor="stTitle">Job title</label>
          <input className="f-in" id="stTitle" maxLength={80} value={vTitle} onChange={e => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="f" htmlFor="stPhone">Mobile</label>
          <input className="f-in" id="stPhone" inputMode="tel" value={vPhone} onChange={e => setPhone(e.target.value)} />
        </div>
      </div>
      <label className="f" htmlFor="stNote">Note (shown on Live status)</label>
      <input className="f-in" id="stNote" maxLength={120} value={vNote} placeholder="e.g. Kandy showroom, weekends" onChange={e => setNote(e.target.value)} />

      <button className="btn pri" style={{ width: '100%', justifyContent: 'center', marginTop: '14px' }} disabled={update.isPending} onClick={save}>
        {update.isPending ? 'Saving…' : 'Save'}
      </button>

      {m.role === 'staff' && (
        <>
          <h3 style={{ margin: '16px 0 4px', fontSize: '13px' }}>What {first} can do</h3>
          {PERMISSION_TEXT.map(([key, text]) => (
            <label key={key} className="tgl">
              <input
                type="checkbox"
                checked={m.permissions[key]}
                disabled={update.isPending}
                onChange={e => void setPermission(key, e.target.checked)}
              />
              <span>{text}</span>
            </label>
          ))}
          <div className="hint">These switches apply to {first} only. The defaults for every staff member are on Roles &amp; users.</div>
        </>
      )}

      {!isSelf && m.status !== 'disabled' && (
        <button
          className="btn dgr"
          style={{ width: '100%', justifyContent: 'center', marginTop: '14px' }}
          disabled={remove.isPending}
          onClick={() => (confirm ? void doRemove() : setConfirm(true))}
        >
          {confirm
            ? `Yes, remove ${first} — signs them out, frees the seat, ${m.assignedCustomers} customer${m.assignedCustomers === 1 ? '' : 's'} go to the team`
            : `Remove ${first}`}
        </button>
      )}
      {m.status === 'disabled' && (
        <button className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: '14px' }} disabled={update.isPending} onClick={reactivate}>
          Re-activate {first}
        </button>
      )}
    </>
  );
}

/* ───────── Screen ───────── */

export default function StaffManageScreen() {
  const { role, team, openSheet, closeSheet, addToast, reportError } = useApp();
  const { me } = useSession();
  const isManager = role === 'manager';
  const staffQ = useAllStaff(isManager);
  const invitesQ = useInvites(isManager);
  const seatsQ = useSeats(isManager);
  const rolesQ = useRoles(isManager);
  const updateRoles = useUpdateRoles();
  const resend = useResendInvite();
  const cancel = useCancelInvite();
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  // Presence changes arrive live on `team`; the full list adds stats and disabled people.
  const live = useMemo(() => new Map(team.map(t => [t.id, t])), [team]);
  const people = useMemo(
    () =>
      (staffQ.data ?? []).map(m => {
        const v: Staff = live.get(m.id) ?? toStaff(m);
        return { m, v };
      }),
    [staffQ.data, live]
  );
  const seats = seatsQ.data;
  const full = seatsFull(seats);
  const usedSeats = seats ? seats.used + seats.pendingInvites : 0;
  const perms: StaffPermissions | undefined = rolesQ.data?.staff;
  const phone = me?.company?.displayPhone || 'your WhatsApp number';

  const openEdit = (id: string) => openSheet(<StaffEditForm key={id} id={id} onDone={closeSheet} />);

  const setRole = async (key: StaffPermission, on: boolean) => {
    try {
      await updateRoles.mutateAsync({ [key]: on });
      addToast(`Staff role: ${PERMISSION_TEXT.find(p => p[0] === key)?.[1].toLowerCase()} ${on ? 'on' : 'off'}.`);
    } catch (err) {
      reportError(err);
    }
  };

  const doResend = async (inv: Invite) => {
    try {
      const r = await resend.mutateAsync(inv.id);
      openSheet(
        <>
          <h2>Invite sent again</h2>
          <p className="sub">{r.name} gets a new email at {r.email}. The old link no longer works.</p>
          {r.link && <CopyLink link={r.link} />}
        </>
      );
    } catch (err) {
      reportError(err);
    }
  };

  const doCancel = async (inv: Invite) => {
    try {
      await cancel.mutateAsync(inv.id);
      setConfirmCancel(null);
      addToast(`Invite to ${inv.email} cancelled.`);
    } catch (err) {
      reportError(err);
    }
  };

  const statusChip = (m: StaffMember, v: Staff) => {
    if (m.status === 'invited') return <span className="chip w">Invited</span>;
    if (m.status === 'disabled') return <span className="chip b">Removed</span>;
    return (
      <span className="scs">
        <span className={`chip sc ${v.call.st === 'available' ? 'ok' : 'w'}`}>
          ☏ {v.stt}
        </span>
      </span>
    );
  };

  const toggles: [StaffPermission, string, string?][] = [
    ['replyAssigned', 'Reply and call customers assigned to them'],
    ['sendTemplates', 'Send approved templates'],
    ['seeAllChats', 'See chats assigned to others', 'Off'],
    ['createTemplates', 'Create or edit templates', 'Manager only'],
    ['exportOwn', 'Export their own performance']
  ];

  return (
    <>
      <div className="ph">
        <div>
          <h1>Staff manage</h1>
          <p>
            Who answers chats and calls on {phone}. Each person logs in to the app with their own account.
          </p>
        </div>
        <div className="acts">
          <SectionThemeToggle />
          {isManager && (
            <button className="btn pri" onClick={() => openSheet(<InviteForm />)}>
              Add staff
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th>Status</th>
                <th className="r">Open chats</th>
                <th className="r">Avg reply</th>
                <th className="r">Calls today</th>
                <th>Can</th>
                <th className="r" />
              </tr>
            </thead>
            <tbody>
              {staffQ.isLoading ? (
                <tr>
                  <td colSpan={8}><span className="hint">Loading…</span></td>
                </tr>
              ) : people.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className="empty">
                      <b>No staff yet</b>
                      Add staff to send the first invite.
                    </div>
                  </td>
                </tr>
              ) : (
                people.map(({ m, v }) => (
                  <tr key={m.id} style={m.status === 'disabled' ? { opacity: 0.6 } : undefined}>
                    <td>
                      <div className="emp">
                        <i className={`av ${m.role === 'staff' ? `st ${v.st}` : ''}`}>{m.initials}</i>
                        <span>
                          <b>{m.name}</b>
                          <span>{m.title || (m.role === 'manager' ? 'Manager' : 'Staff')}{m.phone ? ` · ${m.phone}` : ''}</span>
                        </span>
                      </div>
                    </td>
                    <td>{m.role === 'manager' ? <span className="chip i">Manager</span> : <span className="chip">Staff</span>}</td>
                    <td>{statusChip(m, v)}</td>
                    <td className="r">{m.stats.openChats}</td>
                    <td className="r">{replyTime(m.stats.avgFirstReplySeconds)}</td>
                    <td className="r">{m.stats.callsToday}</td>
                    <td>{canText(m)}</td>
                    <td className="r">
                      <button className="btn sm" onClick={() => openEdit(m.id)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {(invitesQ.data ?? []).length > 0 && (
        <div className="card">
          <div className="card-h">
            <h2>Pending invites</h2>
            <span className="chip w">{invitesQ.data?.length}</span>
          </div>
          <div className="card-b">
            {(invitesQ.data ?? []).map(inv => {
              const expired = new Date(inv.expiresAt).getTime() <= now;
              return (
                <div key={inv.id} className="list-row">
                  <span className={`dot ${expired ? 'b' : 'w'}`} />
                  <div className="bd">
                    <b>{inv.name} · {inv.role === 'manager' ? 'Manager' : inv.title || 'Staff'}</b>
                    <span>
                      {inv.email} · sent {logTime(inv.createdAt)} · {expired ? 'expired' : `link works until ${new Date(inv.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
                    </span>
                  </div>
                  <div className="rt">
                    <button className="btn sm" disabled={resend.isPending} onClick={() => void doResend(inv)}>
                      Resend
                    </button>
                    <button
                      className="btn sm dgr"
                      disabled={cancel.isPending}
                      onClick={() => (confirmCancel === inv.id ? void doCancel(inv) : setConfirmCancel(inv.id))}
                    >
                      {confirmCancel === inv.id ? 'Yes, cancel' : 'Cancel'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid g2">
        <div className="card">
          <div className="card-h">
            <h2>What staff can do</h2>
          </div>
          <div className="card-b">
            {!perms ? (
              <span className="hint">Loading…</span>
            ) : (
              toggles.map(([key, text, offNote]) => (
                <label key={key} className="tgl">
                  <input
                    type="checkbox"
                    checked={perms[key]}
                    disabled={updateRoles.isPending}
                    onChange={e => void setRole(key, e.target.checked)}
                  />
                  <span>{text}</span>
                  {!perms[key] && offNote && <small>{offNote}</small>}
                </label>
              ))
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <h2>Seats</h2>
            {seats?.planName && <span className="chip">{seats.planName}</span>}
          </div>
          <div className="card-b">
            {!seats ? (
              <span className="hint">Loading…</span>
            ) : (
              <>
                <div className="ln">
                  <span>Used</span>
                  <b>{usedSeats} of {seats.limit}</b>
                </div>
                <div className="meter" style={{ margin: '6px 0 10px' }}>
                  <i style={{ width: `${Math.min(100, Math.round((usedSeats / Math.max(1, seats.limit)) * 100))}%` }} />
                </div>
                {seats.pendingInvites > 0 && (
                  <div className="ln">
                    <span>Waiting invites</span>
                    <b>{seats.pendingInvites}</b>
                  </div>
                )}
                {full && (
                  <div className="hint" style={{ marginBottom: '6px' }}>
                    All {seats.limit} seats are in use. Remove someone or ask LUMI AI for more seats.
                  </div>
                )}
              </>
            )}
            <div className="ln">
              <span>Mobile app</span>
              <b>Android + iOS</b>
            </div>
            <div className="ln">
              <span>Web dashboard</span>
              <b>Included</b>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
