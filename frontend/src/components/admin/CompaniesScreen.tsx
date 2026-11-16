'use client';

import React, { useState } from 'react';
import type { AdminCompanyCreated } from '@smart-reply/shared';
import { MAX_SEATS } from '@smart-reply/shared';
import { useAdminCompanies, useCreateCompany, usePlans } from '@/features/admin';
import { useAdmin } from './AdminContext';
import { AiChip, CompanyStatusChip, CopyField, PageHead, QualityChip, QueryState, num } from './ui';

export const TIMEZONES = ['Asia/Colombo', 'Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'UTC'];

export function TimezoneList() {
  return (
    <datalist id="adm-tz">
      {TIMEZONES.map(z => (
        <option key={z} value={z} />
      ))}
    </datalist>
  );
}

function NewCompanySheet() {
  const { toast, reportError, closeSheet, go } = useAdmin();
  const plans = usePlans();
  const create = useCreateCompany();
  const [created, setCreated] = useState<AdminCompanyCreated | null>(null);
  const [f, setF] = useState({
    name: '',
    slug: '',
    planId: '',
    seatLimit: '',
    timezone: 'Asia/Colombo',
    mName: '',
    mEmail: '',
    mPhone: '',
    mPassword: ''
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const seats = f.seatLimit ? Number(f.seatLimit) : undefined;
    if (seats !== undefined && (!Number.isInteger(seats) || seats < 1 || seats > MAX_SEATS)) {
      toast(`Seat limit must be between 1 and ${MAX_SEATS}.`);
      return;
    }
    create.mutate(
      {
        name: f.name.trim(),
        slug: f.slug.trim() || undefined,
        planId: f.planId || null,
        seatLimit: seats,
        timezone: f.timezone.trim() || 'Asia/Colombo',
        manager: {
          name: f.mName.trim(),
          email: f.mEmail.trim(),
          phone: f.mPhone.trim() || undefined,
          password: f.mPassword || undefined
        }
      },
      {
        onSuccess: res => {
          toast(`${res.company.name} created.`);
          if (res.managerInviteLink) setCreated(res);
          else {
            closeSheet();
            go('company', { company: res.company.id });
          }
        },
        onError: reportError
      }
    );
  };

  if (created) {
    return (
      <>
        <h2>{created.company.name} is ready</h2>
        <p className="sub">Send this invite link to the manager. It works once and expires in 7 days. An email was also sent.</p>
        <CopyField id="new-invite" label="Manager invite link" value={created.managerInviteLink ?? ''} />
        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button
            className="btn pri"
            onClick={() => {
              closeSheet();
              go('company', { company: created.company.id });
            }}
          >
            Open company
          </button>
          <button className="btn" onClick={closeSheet}>
            Done
          </button>
        </div>
      </>
    );
  }

  return (
    <form onSubmit={submit}>
      <h2>New company</h2>
      <p className="sub">Creates the company and its first manager. The manager gets an invite unless you set a password.</p>
      <label className="f" htmlFor="nc-name">Company name</label>
      <input className="f-in" id="nc-name" required maxLength={120} value={f.name} onChange={set('name')} />
      <div className="f-row f2">
        <div>
          <label className="f" htmlFor="nc-slug">Slug (optional)</label>
          <input className="f-in" id="nc-slug" placeholder="made from the name" pattern="[a-z0-9][a-z0-9-]{1,60}" value={f.slug} onChange={set('slug')} />
        </div>
        <div>
          <label className="f" htmlFor="nc-tz">Timezone</label>
          <input className="f-in" id="nc-tz" list="adm-tz" value={f.timezone} onChange={set('timezone')} />
          <TimezoneList />
        </div>
      </div>
      <div className="f-row f2">
        <div>
          <label className="f" htmlFor="nc-plan">Plan</label>
          <select className="f-in" id="nc-plan" value={f.planId} onChange={set('planId')}>
            <option value="">No plan</option>
            {plans.data?.map(p => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.seatLimit} seats
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="f" htmlFor="nc-seats">Seat limit (max {MAX_SEATS})</label>
          <input className="f-in" id="nc-seats" type="number" min={1} max={MAX_SEATS} placeholder="from plan" value={f.seatLimit} onChange={set('seatLimit')} />
        </div>
      </div>

      <h3 style={{ fontSize: 14, marginTop: 18 }}>First manager</h3>
      <label className="f" htmlFor="nc-mname">Name</label>
      <input className="f-in" id="nc-mname" required maxLength={80} value={f.mName} onChange={set('mName')} />
      <div className="f-row f2">
        <div>
          <label className="f" htmlFor="nc-memail">Email</label>
          <input className="f-in" id="nc-memail" type="email" required value={f.mEmail} onChange={set('mEmail')} />
        </div>
        <div>
          <label className="f" htmlFor="nc-mphone">Phone (optional)</label>
          <input className="f-in" id="nc-mphone" type="tel" placeholder="+94 77 123 4567" value={f.mPhone} onChange={set('mPhone')} />
        </div>
      </div>
      <label className="f" htmlFor="nc-mpass">Password (optional)</label>
      <input className="f-in" id="nc-mpass" type="password" minLength={8} autoComplete="new-password" value={f.mPassword} onChange={set('mPassword')} />
      <p className="hint">Leave empty to send an invite link instead.</p>

      <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
        <button className="btn pri" type="submit" disabled={create.isPending}>
          {create.isPending ? 'Creating…' : 'Create company'}
        </button>
        <button className="btn" type="button" onClick={closeSheet}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function CompaniesScreen() {
  const { go, openSheet } = useAdmin();
  const companies = useAdminCompanies();
  const [search, setSearch] = useState('');
  const s = search.trim().toLowerCase();

  return (
    <>
      <PageHead title="Companies" sub="Every company that uses Smart Reply. Click a row to manage its plan, WhatsApp number and AI bot.">
        <button className="btn pri" onClick={() => openSheet(<NewCompanySheet />)}>
          New company
        </button>
      </PageHead>

      <div className="card">
        <div className="card-h">
          <label className="sr" htmlFor="co-search">Search companies</label>
          <input
            id="co-search"
            className="f-in"
            style={{ maxWidth: 320 }}
            placeholder="Search name, slug, manager or phone"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <span className="sp" />
          {companies.data ? <span className="chip">{companies.data.length} companies</span> : null}
        </div>
        <QueryState q={companies} empty={{ title: 'No companies yet', text: 'Create the first company with “New company”.' }}>
          {list => {
            const rows = list.filter(
              c =>
                !s ||
                [c.name, c.slug, c.managerName ?? '', c.managerEmail ?? '', c.whatsapp.displayPhone ?? '']
                  .join(' ')
                  .toLowerCase()
                  .includes(s)
            );
            if (rows.length === 0) return <p className="hint" style={{ padding: '14px 15px', margin: 0 }}>No company matches “{search}”.</p>;
            return (
              <div className="tw">
                <table>
                  <thead>
                    <tr>
                      <th>Company</th>
                      <th>Plan</th>
                      <th className="r">Seats</th>
                      <th>Manager</th>
                      <th>WhatsApp</th>
                      <th>AI bot</th>
                      <th className="r">Messages 30d</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(c => (
                      <tr
                        key={c.id}
                        onClick={() => go('company', { company: c.id })}
                        onKeyDown={e => {
                          if (e.key === 'Enter') go('company', { company: c.id });
                        }}
                        tabIndex={0}
                        style={{ cursor: 'pointer' }}
                        aria-label={`Open ${c.name}`}
                      >
                        <td>
                          <div className="emp">
                            <span>
                              <b>{c.name}</b>
                              <span>{c.slug}</span>
                            </span>
                          </div>
                        </td>
                        <td>{c.planName ?? <span className="chip">No plan</span>}</td>
                        <td className="r">
                          {c.seatsUsed} / {c.seatLimit}
                        </td>
                        <td>
                          <div className="emp">
                            <span>
                              <b>{c.managerName ?? '—'}</b>
                              <span>{c.managerEmail ?? ''}</span>
                            </span>
                          </div>
                        </td>
                        <td>
                          {c.whatsapp.connected ? (
                            <>
                              <span className="chip ok">Connected</span> {c.whatsapp.displayPhone} <QualityChip rating={c.whatsapp.qualityRating} />
                            </>
                          ) : (
                            <span className="chip">Not connected</span>
                          )}
                        </td>
                        <td>
                          <AiChip status={c.aiStatus} />
                        </td>
                        <td className="r">{num(c.messages30d)}</td>
                        <td>
                          <CompanyStatusChip status={c.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }}
        </QueryState>
      </div>
    </>
  );
}
