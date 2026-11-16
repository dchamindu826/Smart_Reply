'use client';

import React, { useState } from 'react';
import type { Plan } from '@smart-reply/shared';
import { MAX_SEATS } from '@smart-reply/shared';
import { usePlans, useSavePlan } from '@/features/admin';
import { useAdmin } from './AdminContext';
import { PageHead, QueryState, money, rupeesToMinor } from './ui';

function PlanSheet({ plan }: { plan: Plan | null }) {
  const { toast, reportError, closeSheet } = useAdmin();
  const save = useSavePlan();
  const [f, setF] = useState({
    name: plan?.name ?? '',
    seatLimit: String(plan?.seatLimit ?? 5),
    price: plan ? String(plan.price.amountMinor / 100) : '',
    features: plan?.features.join('\n') ?? ''
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const seats = Number(f.seatLimit);
    const priceMinor = rupeesToMinor(f.price);
    if (!Number.isInteger(seats) || seats < 1 || seats > MAX_SEATS) {
      toast(`Seat limit must be between 1 and ${MAX_SEATS}.`);
      return;
    }
    if (!Number.isFinite(priceMinor) || priceMinor < 0) {
      toast('Enter the monthly price in rupees.');
      return;
    }
    const features = f.features
      .split('\n')
      .map(x => x.trim())
      .filter(Boolean);
    save.mutate(
      { id: plan?.id ?? null, body: { name: f.name.trim(), seatLimit: seats, priceMinor, currency: 'LKR', features } },
      {
        onSuccess: p => {
          toast(`Plan “${p.name}” saved.`);
          closeSheet();
        },
        onError: reportError
      }
    );
  };
  return (
    <form onSubmit={submit}>
      <h2>{plan ? `Edit ${plan.name}` : 'New plan'}</h2>
      <p className="sub">Plans set the default seat limit and monthly price for companies.</p>
      <label className="f" htmlFor="pl-name">Name</label>
      <input className="f-in" id="pl-name" required maxLength={60} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
      <div className="f-row f2">
        <div>
          <label className="f" htmlFor="pl-seats">Seat limit (max {MAX_SEATS})</label>
          <input
            className="f-in"
            id="pl-seats"
            type="number"
            min={1}
            max={MAX_SEATS}
            required
            value={f.seatLimit}
            onChange={e => setF({ ...f, seatLimit: e.target.value })}
          />
        </div>
        <div>
          <label className="f" htmlFor="pl-price">Price a month (Rs.)</label>
          <input
            className="f-in"
            id="pl-price"
            type="number"
            min={0}
            step="0.01"
            required
            value={f.price}
            onChange={e => setF({ ...f, price: e.target.value })}
          />
        </div>
      </div>
      <label className="f" htmlFor="pl-feat">Features (one per line)</label>
      <textarea className="f-in" id="pl-feat" rows={6} value={f.features} onChange={e => setF({ ...f, features: e.target.value })} />
      <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
        <button className="btn pri" type="submit" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save plan'}
        </button>
        <button className="btn" type="button" onClick={closeSheet}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function PlansScreen() {
  const { openSheet } = useAdmin();
  const plans = usePlans();
  return (
    <>
      <PageHead title="Plans" sub="What companies pay for Smart Reply each month. Changing a plan does not change the seat limit of companies already on it.">
        <button className="btn pri" onClick={() => openSheet(<PlanSheet plan={null} />)}>
          New plan
        </button>
      </PageHead>
      <div className="card">
        <QueryState q={plans} empty={{ title: 'No plans yet', text: 'Create the first plan.' }}>
          {list => (
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>Plan</th>
                    <th className="r">Seats</th>
                    <th className="r">Price a month</th>
                    <th>Features</th>
                    <th className="r">Companies</th>
                    <th className="r" />
                  </tr>
                </thead>
                <tbody>
                  {list.map(p => (
                    <tr key={p.id}>
                      <td>
                        <b>{p.name}</b>
                      </td>
                      <td className="r">{p.seatLimit}</td>
                      <td className="r">{money(p.price)}</td>
                      <td>{p.features.length ? p.features.join(' · ') : '—'}</td>
                      <td className="r">{p.companyCount}</td>
                      <td className="r">
                        <button className="btn sm" onClick={() => openSheet(<PlanSheet plan={p} />)}>
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </QueryState>
      </div>
    </>
  );
}
