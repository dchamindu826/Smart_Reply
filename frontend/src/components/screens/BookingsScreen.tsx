'use client';

import React, { useState } from 'react';
import type { Booking } from '@smart-reply/shared';
import { useApp } from '@/context/AppContext';
import { useBookings, useUpdateBooking } from '@/features/calls';

const STATUS_TEXT: Record<Booking['status'], string> = { booked: 'Booked', done: 'Done', cancelled: 'Cancelled' };
const STATUS_CHIP: Record<Booking['status'], string> = { booked: 'chip ok', done: 'chip', cancelled: 'chip w' };

function when(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function BookingsScreen() {
  const { addToast, reportError } = useApp();
  const [show, setShow] = useState<'upcoming' | 'all'>('upcoming');
  // Fixed when the screen opens, so the query key stays stable.
  const [monthAgo] = useState(() => new Date(Date.now() - 30 * 86_400_000).toISOString());
  const q = useBookings(show === 'upcoming' ? { status: 'booked' } : { from: monthAgo });
  const update = useUpdateBooking();
  const rows = q.data ?? [];

  const mark = (b: Booking, status: Booking['status']) =>
    update.mutate({ id: b.id, status }, { onSuccess: () => addToast(`Booking for ${b.contactName} marked ${STATUS_TEXT[status].toLowerCase()}.`), onError: reportError });

  return (
    <>
      <div className="ph">
        <div>
          <h1>Bookings</h1>
          <p>Appointments the AI voice agent made on WhatsApp calls.</p>
        </div>
        <div className="acts">
          <select className="f-in" value={show} onChange={e => setShow(e.target.value as 'upcoming' | 'all')} style={{ width: 'auto' }}>
            <option value="upcoming">Upcoming</option>
            <option value="all">Last 30 days and later</option>
          </select>
        </div>
      </div>
      <div className="card">
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Customer</th>
                <th>Service</th>
                <th>Note</th>
                <th>Status</th>
                <th className="r" />
              </tr>
            </thead>
            <tbody>
              {q.isLoading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--ink-3)' }}>
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--ink-3)' }}>
                    No bookings yet. When the AI voice agent books an appointment on a call, it shows here.
                  </td>
                </tr>
              ) : (
                rows.map(b => (
                  <tr key={b.id}>
                    <td>{when(b.startsAt)}</td>
                    <td>
                      <b>{b.contactName}</b>
                      {b.contactPhone ? <div style={{ color: 'var(--ink-3)', fontSize: 12 }}>{b.contactPhone}</div> : null}
                    </td>
                    <td>{b.service || '—'}</td>
                    <td style={{ maxWidth: 260 }}>{b.note || '—'}</td>
                    <td>
                      <span className={STATUS_CHIP[b.status]}>{STATUS_TEXT[b.status]}</span>
                      {b.createdBy === 'ai' ? <span className="chip i" style={{ marginLeft: 6 }}>AI</span> : null}
                    </td>
                    <td className="r" style={{ whiteSpace: 'nowrap' }}>
                      {b.status === 'booked' ? (
                        <>
                          <button className="btn sm" disabled={update.isPending} onClick={() => mark(b, 'done')}>
                            Done
                          </button>{' '}
                          <button className="btn sm" disabled={update.isPending} onClick={() => mark(b, 'cancelled')}>
                            Cancel
                          </button>
                        </>
                      ) : null}
                    </td>
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
