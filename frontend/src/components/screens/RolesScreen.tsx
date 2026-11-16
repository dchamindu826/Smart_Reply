'use client';

import React from 'react';
import type { StaffPermission } from '@smart-reply/shared';
import { useApp } from '@/context/AppContext';
import { useAllStaff, useRoles, useUpdateRoles } from '@/features/team';
import { logTime } from '@/lib/adapters';

/** Rows of the table. A row with a permission key has a switch in the Staff column. */
const ROWS: { text: string; key?: StaffPermission; on?: string; off: string }[] = [
  { text: 'Reply to assigned chats and calls', key: 'replyAssigned', off: '—' },
  { text: 'See every chat', key: 'seeAllChats', off: '—' },
  { text: 'Assign and transfer chats', off: 'Transfer own' },
  { text: 'Send approved templates', key: 'sendTemplates', off: '—' },
  { text: 'Create templates, broadcasts', key: 'createTemplates', off: '—' },
  { text: 'Call customers', key: 'makeCalls', off: '—' },
  { text: 'Edit shared quick replies', key: 'editSharedQuickReplies', on: 'Shared too', off: 'Own only' },
  { text: 'Catalog & pricing', key: 'editPrices', on: 'Edit prices', off: 'View' },
  { text: 'Export own performance', key: 'exportOwn', off: '—' },
  { text: 'Reports, billing, settings', off: 'Own performance' }
];

export default function RolesScreen() {
  const { role, setScreen, addToast, reportError } = useApp();
  const isManager = role === 'manager';
  const rolesQ = useRoles(isManager);
  const staffQ = useAllStaff(isManager);
  const update = useUpdateRoles();
  const perms = rolesQ.data?.staff;

  const toggle = async (key: StaffPermission, text: string, on: boolean) => {
    try {
      await update.mutateAsync({ [key]: on });
      addToast(`Staff: ${text.toLowerCase()} ${on ? 'on' : 'off'}.`);
    } catch (err) {
      reportError(err);
    }
  };

  return (
    <>
      <div className="ph">
        <div>
          <h1>Roles &amp; users</h1>
          <p>Two roles for a small team. Add more when you need them.</p>
        </div>
        <div className="acts">
          <button className="btn pri" onClick={() => setScreen('staff')}>
            Staff manage
          </button>
        </div>
      </div>

      <div className="card">
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Can…</th>
                <th>Manager</th>
                <th>Staff</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map(r => (
                <tr key={r.text}>
                  <td>{r.text}</td>
                  <td>✓</td>
                  <td>
                    {r.key && perms ? (
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          className="ck"
                          checked={perms[r.key]}
                          disabled={update.isPending}
                          aria-label={`Staff: ${r.text}`}
                          onChange={e => void toggle(r.key as StaffPermission, r.text, e.target.checked)}
                        />
                        <span>{perms[r.key] ? (r.on ?? '') : r.off}</span>
                      </label>
                    ) : r.key ? (
                      <span className="hint">Loading…</span>
                    ) : (
                      r.off
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <h2>Users</h2>
          <span className="sp" />
          <span className="hint" style={{ marginTop: 0 }}>Switches for one person are on Staff manage → Edit.</span>
        </div>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last sign-in</th>
              </tr>
            </thead>
            <tbody>
              {staffQ.isLoading ? (
                <tr>
                  <td colSpan={4}><span className="hint">Loading…</span></td>
                </tr>
              ) : (staffQ.data ?? []).length === 0 ? (
                <tr>
                  <td colSpan={4}><span className="hint">No users yet.</span></td>
                </tr>
              ) : (
                (staffQ.data ?? []).map(m => (
                  <tr key={m.id}>
                    <td>
                      <div className="emp">
                        <i className="av">{m.initials}</i>
                        <span>
                          <b>{m.name}</b>
                          <span>{m.email}</span>
                        </span>
                      </div>
                    </td>
                    <td>{m.role === 'manager' ? <span className="chip i">Manager</span> : <span className="chip">Staff</span>}</td>
                    <td>
                      {m.status === 'active' ? (
                        <span className="chip ok">Active</span>
                      ) : m.status === 'invited' ? (
                        <span className="chip w">Invited</span>
                      ) : (
                        <span className="chip b">Removed</span>
                      )}
                    </td>
                    <td>{m.lastLoginAt ? logTime(m.lastLoginAt) : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
