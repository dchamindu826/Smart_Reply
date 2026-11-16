'use client';

import React, { useState } from 'react';
import SectionThemeToggle from '@/components/common/SectionThemeToggle';
import { useSession } from '@/features/session';
import { formatCount, formatMoney, useInvoices, useUsage } from '@/features/insight';

const CATEGORY: Record<string, { label: string; cls: string; usedFor: string }> = {
  marketing: { label: 'Marketing', cls: '', usedFor: 'Offers, broadcasts' },
  utility: { label: 'Utility', cls: 'i', usedFor: 'Quotations, reminders, missed calls' },
  authentication: { label: 'Authentication', cls: '', usedFor: 'Login codes' },
  authentication_international: { label: 'Authentication (intl)', cls: '', usedFor: 'Login codes to other countries' },
  service: { label: 'Service', cls: 'ok', usedFor: 'Replies inside the window' }
};

const INVOICE_STATUS: Record<'paid' | 'due' | 'void', { text: string; cls: string }> = {
  paid: { text: 'Paid', cls: 'ok' },
  due: { text: 'Due', cls: 'w' },
  void: { text: 'Void', cls: '' }
};

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthName(m: string): string {
  const [y, mo] = m.split('-').map(Number);
  if (!y || !mo) return m;
  return new Date(y, mo - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

export default function BillingScreen() {
  const { me } = useSession();
  const [month, setMonth] = useState(currentMonth());
  const usage = useUsage(month);
  const invoices = useInvoices();
  const u = usage.data;
  const isCurrent = month === currentMonth();

  const paid = (u?.byCategory ?? []).filter(c => c.category !== 'service');
  const delivered = paid.reduce((sum, c) => sum + c.delivered, 0);
  const breakdown = paid.map(c => `${CATEGORY[c.category]?.label ?? c.category} ${formatCount(c.delivered)}`).join(' · ');
  const dash = usage.isLoading ? '…' : '—';
  const company = me?.company;

  return (
    <>
      <div className="ph">
        <div>
          <h1>Meta usage &amp; billing</h1>
          <p>Meta charges per delivered template. Replies inside the 24-hour window are free.</p>
        </div>
        <div className="acts">
          <SectionThemeToggle />
          <input
            className="f-in"
            type="month"
            aria-label="Month"
            value={month}
            max={currentMonth()}
            onChange={e => setMonth(e.target.value || currentMonth())}
            style={{ width: 'auto' }}
          />
        </div>
      </div>

      {usage.isError && (
        <p className="hint" style={{ color: 'var(--bad)', marginBottom: '10px' }}>
          Could not load usage. <button className="btn sm" onClick={() => void usage.refetch()}>Try again</button>
        </p>
      )}

      <div className="stats">
        <div className="stat">
          <span>{isCurrent ? 'Month to date' : monthName(month)}</span>
          <b>{u ? formatMoney(u.total) : dash}</b>
          <small>Meta messaging · estimate</small>
        </div>
        <div className="stat ok">
          <span>Free replies</span>
          <b>{u ? formatCount(u.freeReplies) : dash}</b>
          <small>Inside the 24h window</small>
        </div>
        <div className="stat i">
          <span>Templates delivered</span>
          <b>{u ? formatCount(delivered) : dash}</b>
          <small>{breakdown || 'None this month'}</small>
        </div>
        <div className="stat">
          <span>Smart Reply plan</span>
          <b>{company?.planName ?? '—'}</b>
          <small>{company ? `${company.seatLimit} seat${company.seatLimit === 1 ? '' : 's'}` : ''}</small>
        </div>
      </div>

      <div className="card">
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th className="r">Delivered</th>
                <th className="r">Cost</th>
                <th>Used for</th>
              </tr>
            </thead>
            <tbody>
              {usage.isLoading && (
                <tr>
                  <td colSpan={4} className="hint">Loading…</td>
                </tr>
              )}
              {paid.map(c => {
                const meta = CATEGORY[c.category] ?? { label: c.category, cls: '', usedFor: '' };
                return (
                  <tr key={c.category}>
                    <td><span className={`chip ${meta.cls}`}>{meta.label}</span></td>
                    <td className="r">{formatCount(c.delivered)}</td>
                    <td className="r">{formatMoney(c.cost)}</td>
                    <td>{meta.usedFor}</td>
                  </tr>
                );
              })}
              {u && (
                <tr>
                  <td><span className="chip ok">Service</span></td>
                  <td className="r">{formatCount(u.freeReplies)}</td>
                  <td className="r">Free</td>
                  <td>Replies inside the window</td>
                </tr>
              )}
              {u && paid.length === 0 && (
                <tr>
                  <td colSpan={4} className="hint">No paid templates delivered in {monthName(month)}.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <h2>Smart Reply invoices</h2>
        </div>
        {invoices.isLoading ? (
          <div className="card-b"><p className="hint">Loading…</p></div>
        ) : invoices.isError ? (
          <div className="card-b"><p className="hint">Could not load invoices.</p></div>
        ) : (invoices.data ?? []).length === 0 ? (
          <div className="empty">
            <b>No invoices yet</b>
            LUMI AI’s invoices for your Smart Reply plan appear here.
          </div>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Period</th>
                  <th>Issued</th>
                  <th className="r">Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(invoices.data ?? []).map(inv => (
                  <tr key={inv.id}>
                    <td><b>{inv.number}</b></td>
                    <td>{inv.period}</td>
                    <td>{new Date(inv.issuedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    <td className="r">{formatMoney(inv.amount)}</td>
                    <td><span className={`chip ${INVOICE_STATUS[inv.status].cls}`}>{INVOICE_STATUS[inv.status].text}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="hint">
        Meta bills your business directly for WhatsApp messages. These figures are estimates from delivered messages and Meta’s published
        rates; your Meta invoice is the final amount.
      </p>
    </>
  );
}
