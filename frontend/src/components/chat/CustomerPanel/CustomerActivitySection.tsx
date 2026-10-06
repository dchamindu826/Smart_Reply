'use client';

import React from 'react';
import { Contact, CallLogItem } from '@/types';

interface CustomerActivitySectionProps {
  contact: Contact;
  calls: CallLogItem[];
}

export default function CustomerActivitySection({
  contact,
  calls
}: CustomerActivitySectionProps) {
  const contactCalls = calls.filter(k => k.c === contact.id && k.d !== 'ringing');

  return (
    <>
      <h3>Chat history</h3>
      <div className="ln">
        <span>Quotation Q-1042</span>
        <b className="chip ok">Open</b>
      </div>
      <div className="ln">
        <span>Vanity install · 12 Aug</span>
        <b className="chip">Resolved</b>
      </div>
      <div className="ln">
        <span>Price list · 03 Mar</span>
        <b className="chip">Resolved</b>
      </div>

      <h3>
        Call history{' '}
        {contact.perm && (
          <span className="chip i" style={{ textTransform: 'none', letterSpacing: 0 }}>
            Call permission ✓
          </span>
        )}
      </h3>
      {contactCalls.length > 0 ? (
        contactCalls.map((k, idx) => (
          <div key={idx} className="ln">
            <span>
              {k.d.charAt(0).toUpperCase() + k.d.slice(1)} {k.dur ? `· ${k.dur}` : ''}
            </span>
            <b style={{ fontWeight: 500, fontSize: '12px' }}>{k.t}</b>
          </div>
        ))
      ) : (
        <span className="hint">No previous calls</span>
      )}
    </>
  );
}
