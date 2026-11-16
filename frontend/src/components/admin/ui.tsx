'use client';

import React from 'react';
import type { AiAddon, Money } from '@smart-reply/shared';
import { formatMoney } from '@smart-reply/shared';
import { errorMessage } from '@/lib/api';
import { useAdmin } from './AdminContext';

/* ───────── States ───────── */

export function Loading({ text = 'Loading…' }: { text?: string }) {
  return (
    <p className="hint" style={{ padding: '14px 15px', margin: 0 }} role="status">
      {text}
    </p>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="empty">
      <b>{title}</b>
      {children}
    </div>
  );
}

export function ErrorNote({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="note b" role="alert" style={{ margin: '12px 15px' }}>
      <span className="ic">!</span>
      <div style={{ flex: 1 }}>
        <b>Could not load this</b>
        {errorMessage(error)}
      </div>
      {onRetry ? (
        <button className="btn sm" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}

/** Loading / error / empty switch for a query result. */
export function QueryState<T>({
  q,
  empty,
  isEmpty,
  children
}: {
  q: { data: T | undefined; isLoading: boolean; error: unknown; refetch: () => unknown };
  empty?: { title: string; text?: string };
  isEmpty?: (data: T) => boolean;
  children: (data: T) => React.ReactNode;
}) {
  if (q.isLoading) return <Loading />;
  if (q.error || q.data === undefined) return <ErrorNote error={q.error} onRetry={() => void q.refetch()} />;
  const blank = isEmpty ? isEmpty(q.data) : Array.isArray(q.data) && q.data.length === 0;
  if (blank && empty) return <Empty title={empty.title}>{empty.text}</Empty>;
  return <>{children(q.data)}</>;
}

/* ───────── Copy ───────── */

export function CopyField({ label, value, id }: { label: string; value: string; id: string }) {
  const { toast } = useAdmin();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast(`${label} copied.`);
    } catch {
      toast('Copy failed. Select the text and copy it by hand.');
    }
  };
  return (
    <>
      <label className="f" htmlFor={id}>
        {label}
      </label>
      <div style={{ display: 'flex', gap: 6 }}>
        <input className="f-in" id={id} value={value} readOnly onFocus={e => e.currentTarget.select()} />
        <button type="button" className="btn" onClick={() => void copy()}>
          Copy
        </button>
      </div>
    </>
  );
}

/* ───────── Formatting ───────── */

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function money(m: Money): string {
  return formatMoney(m.amountMinor, m.currency);
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function num(n: number): string {
  return n.toLocaleString('en-US');
}

/** ISO → `YYYY-MM-DD` for a date input. */
export function toDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

/** `YYYY-MM-DD` → end of that day in UTC, or null. */
export function fromDateInput(v: string): string | null {
  return v ? new Date(`${v}T23:59:59.000Z`).toISOString() : null;
}

/* ───────── Chips ───────── */

const AI_CHIP: Record<AiAddon['status'], string> = { active: 'ok', paused: 'w', expired: 'b', off: '' };

export function AiChip({ status }: { status: AiAddon['status'] }) {
  return <span className={`chip ${AI_CHIP[status]}`}>AI {status}</span>;
}

export function CompanyStatusChip({ status }: { status: 'active' | 'suspended' | 'closed' }) {
  return <span className={`chip ${status === 'active' ? 'ok' : status === 'suspended' ? 'w' : 'b'}`}>{status}</span>;
}

export function QualityChip({ rating }: { rating: string | null }) {
  if (!rating) return null;
  const cls = rating === 'GREEN' ? 'ok' : rating === 'YELLOW' ? 'w' : rating === 'RED' ? 'b' : '';
  return <span className={`chip ${cls}`}>{rating.toLowerCase()}</span>;
}

/** Page header in the `ph` style. */
export function PageHead({ title, sub, children }: { title: string; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="ph">
      <div>
        <h1>{title}</h1>
        {sub ? <p>{sub}</p> : null}
      </div>
      {children ? <div className="acts">{children}</div> : null}
    </div>
  );
}

/** Rupees typed in a form → minor units. */
export function rupeesToMinor(v: string): number {
  const n = Number(v.replace(/,/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}
