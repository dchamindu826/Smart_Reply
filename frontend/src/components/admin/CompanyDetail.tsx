'use client';

import React, { useState } from 'react';
import type { AdminCompany, Invite } from '@smart-reply/shared';
import { MAX_SEATS } from '@smart-reply/shared';
import { useSession } from '@/features/session';
import {
  useAddManager,
  useAdminCompany,
  useCompanyUsers,
  useImpersonate,
  usePlans,
  useSetCompanyStatus,
  useUpdateCompany
} from '@/features/admin';
import { CompanyTab, useAdmin } from './AdminContext';
import { TimezoneList } from './CompaniesScreen';
import WhatsappTab from './WhatsappTab';
import AiBotTab from './AiBotTab';
import { AiChip, CompanyStatusChip, CopyField, ErrorNote, Loading, PageHead, QueryState, fmtDate, fmtDateTime } from './ui';

const TABS: { id: CompanyTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'ai', label: 'AI bot' }
];

function AddManagerSheet({ companyId, companyName }: { companyId: string; companyName: string }) {
  const { toast, reportError, closeSheet } = useAdmin();
  const add = useAddManager(companyId);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [f, setF] = useState({ name: '', email: '', phone: '' });
  if (invite) {
    return (
      <>
        <h2>Invite sent to {invite.name}</h2>
        <p className="sub">The link works once and expires {fmtDate(invite.expiresAt)}.</p>
        {invite.link ? <CopyField id="mgr-invite" label="Invite link" value={invite.link} /> : null}
        <button className="btn" style={{ marginTop: 18 }} onClick={closeSheet}>
          Done
        </button>
      </>
    );
  }
  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        add.mutate(
          { name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim() || undefined },
          {
            onSuccess: inv => {
              toast(`Invite created for ${inv.name}.`);
              setInvite(inv);
            },
            onError: reportError
          }
        );
      }}
    >
      <h2>Add manager</h2>
      <p className="sub">Adds another manager to {companyName}. Uses one seat.</p>
      <label className="f" htmlFor="am-name">Name</label>
      <input className="f-in" id="am-name" required value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
      <label className="f" htmlFor="am-email">Email</label>
      <input className="f-in" id="am-email" type="email" required value={f.email} onChange={e => setF({ ...f, email: e.target.value })} />
      <label className="f" htmlFor="am-phone">Phone (optional)</label>
      <input className="f-in" id="am-phone" type="tel" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} />
      <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
        <button className="btn pri" type="submit" disabled={add.isPending}>
          {add.isPending ? 'Sending…' : 'Send invite'}
        </button>
        <button className="btn" type="button" onClick={closeSheet}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function ImpersonateSheet({ company }: { company: AdminCompany }) {
  const { reportError } = useAdmin();
  const { setMe } = useSession();
  const imp = useImpersonate(company.id);
  const [reason, setReason] = useState('');
  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        imp.mutate(reason.trim(), {
          onSuccess: res => {
            setMe(res.me);
            // Full load so every cache and socket starts fresh as the company's manager.
            window.location.replace('/');
          },
          onError: reportError
        });
      }}
    >
      <h2>Open {company.name} as manager</h2>
      <p className="sub">
        You will see Smart Reply exactly as the company’s manager does. The session and the reason are written to the company’s audit log. Use
        “End support session” at the bottom of the screen to come back.
      </p>
      <label className="f" htmlFor="imp-reason">Reason</label>
      <textarea
        className="f-in"
        id="imp-reason"
        required
        maxLength={200}
        placeholder="For example: ticket #412, manager cannot see templates"
        value={reason}
        onChange={e => setReason(e.target.value)}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
        <button className="btn pri" type="submit" disabled={imp.isPending || !reason.trim()}>
          {imp.isPending ? 'Opening…' : 'Open as manager'}
        </button>
      </div>
    </form>
  );
}

function EditCompanyCard({ company }: { company: AdminCompany }) {
  const { toast, reportError } = useAdmin();
  const plans = usePlans();
  const update = useUpdateCompany(company.id);
  const [f, setF] = useState({
    name: company.name,
    planId: company.planId ?? '',
    seatLimit: String(company.seatLimit),
    timezone: company.timezone
  });
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const seats = Number(f.seatLimit);
    if (!Number.isInteger(seats) || seats < 1 || seats > MAX_SEATS) {
      toast(`Seat limit must be between 1 and ${MAX_SEATS}.`);
      return;
    }
    update.mutate(
      { name: f.name.trim(), planId: f.planId || null, seatLimit: seats, timezone: f.timezone.trim() },
      { onSuccess: c => toast(`${c.name} saved.`), onError: reportError }
    );
  };
  return (
    <form className="card" onSubmit={save}>
      <div className="card-h">
        <h2>Company</h2>
        <span className="sp" />
        <button className="btn sm pri" type="submit" disabled={update.isPending}>
          {update.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
      <div className="card-b">
        <label className="f" htmlFor="ec-name" style={{ marginTop: 0 }}>Name</label>
        <input className="f-in" id="ec-name" required maxLength={120} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
        <div className="f-row f2">
          <div>
            <label className="f" htmlFor="ec-plan">Plan</label>
            <select className="f-in" id="ec-plan" value={f.planId} onChange={e => setF({ ...f, planId: e.target.value })}>
              <option value="">No plan</option>
              {plans.data?.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.seatLimit} seats
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="f" htmlFor="ec-seats">Seat limit (max {MAX_SEATS})</label>
            <input
              className="f-in"
              id="ec-seats"
              type="number"
              min={1}
              max={MAX_SEATS}
              required
              value={f.seatLimit}
              onChange={e => setF({ ...f, seatLimit: e.target.value })}
            />
          </div>
        </div>
        <label className="f" htmlFor="ec-tz">Timezone</label>
        <input className="f-in" id="ec-tz" list="adm-tz" value={f.timezone} onChange={e => setF({ ...f, timezone: e.target.value })} />
        <TimezoneList />
        <p className="hint">
          {company.seatsUsed} of {company.seatLimit} seats used (active, invited and open invites). Created {fmtDate(company.createdAt)}.
        </p>
      </div>
    </form>
  );
}

function OverviewTab({ company }: { company: AdminCompany }) {
  const { toast, reportError, openSheet } = useAdmin();
  const users = useCompanyUsers(company.id);
  const status = useSetCompanyStatus(company.id);
  const suspended = company.status === 'suspended';

  const toggleStatus = () => {
    const msg = suspended
      ? `Activate ${company.name}? Its people can sign in and work again.`
      : `Suspend ${company.name}? Its people cannot use Smart Reply until you activate it again.`;
    if (!window.confirm(msg)) return;
    status.mutate(suspended ? 'activate' : 'suspend', {
      onSuccess: c => toast(`${c.name} is now ${c.status}.`),
      onError: reportError
    });
  };

  return (
    <div className="grid gmain">
      <div>
        <EditCompanyCard key={company.id} company={company} />
        <div className="card">
          <div className="card-h">
            <h2>People</h2>
            {users.data ? <span className="chip">{users.data.length}</span> : null}
            <span className="sp" />
            <button className="btn sm" onClick={() => openSheet(<AddManagerSheet companyId={company.id} companyName={company.name} />)}>
              Add manager
            </button>
          </div>
          <QueryState q={users} empty={{ title: 'Nobody has joined yet', text: 'Open invites still count as seats. Add a manager if the invite was lost.' }}>
            {list => (
              <div className="tw">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Last sign-in</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map(u => (
                      <tr key={u.id}>
                        <td>
                          <div className="emp">
                            <span>
                              <b>{u.name}</b>
                              <span>{u.email}</span>
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className={`chip ${u.role === 'manager' ? 'i' : ''}`}>{u.role}</span>
                        </td>
                        <td>
                          <span className={`chip ${u.status === 'active' ? 'ok' : u.status === 'invited' ? 'w' : 'b'}`}>{u.status}</span>
                        </td>
                        <td>{fmtDateTime(u.lastLoginAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </QueryState>
        </div>
      </div>

      <div>
        <div className="card">
          <div className="card-h">
            <h2>Support</h2>
          </div>
          <div className="card-b">
            <p className="hint" style={{ marginTop: 0, marginBottom: 10 }}>
              Open the company as its manager to see what they see. Every support session is audited.
            </p>
            <button className="btn pri" disabled={company.status !== 'active'} onClick={() => openSheet(<ImpersonateSheet company={company} />)}>
              Open as manager
            </button>
            {company.status !== 'active' ? <p className="hint">Activate the company first.</p> : null}
          </div>
        </div>
        <div className="card">
          <div className="card-h">
            <h2>Status</h2>
            <CompanyStatusChip status={company.status} />
          </div>
          <div className="card-b">
            <div className="ln">
              <span>Plan</span>
              <b>{company.planName ?? 'No plan'}</b>
            </div>
            <div className="ln">
              <span>WhatsApp</span>
              <b>{company.whatsapp.connected ? company.whatsapp.displayPhone ?? 'Connected' : 'Not connected'}</b>
            </div>
            <div className="ln">
              <span>AI bot</span>
              <b>
                <AiChip status={company.aiStatus} />
              </b>
            </div>
            <div className="ln">
              <span>Messages (30 days)</span>
              <b>{company.messages30d}</b>
            </div>
            {company.status !== 'closed' ? (
              <button className={`btn ${suspended ? 'pri' : 'dgr'}`} style={{ marginTop: 12 }} disabled={status.isPending} onClick={toggleStatus}>
                {suspended ? 'Activate company' : 'Suspend company'}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CompanyDetail() {
  const { companyId, tab, go } = useAdmin();
  const q = useAdminCompany(companyId);
  const c = q.data;

  return (
    <>
      <PageHead
        title={c?.name ?? 'Company'}
        sub={
          c ? (
            <>
              {c.slug} · {c.planName ?? 'No plan'} · {c.seatsUsed}/{c.seatLimit} seats · <CompanyStatusChip status={c.status} />
            </>
          ) : undefined
        }
      >
        <button className="btn" onClick={() => go('companies')}>
          ← All companies
        </button>
      </PageHead>

      {q.isLoading ? (
        <div className="card">
          <Loading />
        </div>
      ) : q.error || !c ? (
        <div className="card">
          <ErrorNote error={q.error} onRetry={() => void q.refetch()} />
        </div>
      ) : (
        <>
          <div className="seg" role="tablist" aria-label="Company sections" style={{ marginBottom: 14 }}>
            {TABS.map(t => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                className={tab === t.id ? 'active' : ''}
                onClick={() => go('company', { company: c.id, tab: t.id })}
              >
                {t.label}
              </button>
            ))}
          </div>
          {tab === 'whatsapp' ? <WhatsappTab company={c} /> : tab === 'ai' ? <AiBotTab company={c} /> : <OverviewTab company={c} />}
        </>
      )}
    </>
  );
}
