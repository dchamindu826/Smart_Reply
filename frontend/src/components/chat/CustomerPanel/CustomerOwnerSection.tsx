'use client';

import React from 'react';
import { Contact, Staff } from '@/types';

interface CustomerOwnerSectionProps {
  contact: Contact;
  staff: Staff[];
  isStaff: boolean;
  onOwnerChange: (newOwnerId: string | null) => void;
}

export default function CustomerOwnerSection({
  contact,
  staff,
  isStaff,
  onOwnerChange
}: CustomerOwnerSectionProps) {
  return (
    <>
      <h3>Customer owner</h3>
      <select
        className="f-in"
        id="cuTo"
        value={contact.to || ''}
        onChange={e => onOwnerChange(e.target.value || null)}
      >
        <option value="">{isStaff ? 'Release to the team' : 'Unassigned'}</option>
        {staff.map(s => (
          <option key={s.id} value={s.id}>
            {s.n} · {s.stt}
          </option>
        ))}
      </select>
      <p className="hint" style={{ marginTop: '5px' }}>
        The owner gets every chat and call from {contact.ph}.
      </p>

      <h3>Owner history</h3>
      {contact.hist.map((h, idx) => (
        <div key={idx} className="ln">
          <span>{h[1]}</span>
          <b style={{ fontWeight: 500, fontSize: '11.5px', textAlign: 'right' }}>
            {h[0]}<br />
            <span style={{ color: 'var(--ink-3)' }}>{h[2]}</span>
          </b>
        </div>
      ))}
    </>
  );
}
