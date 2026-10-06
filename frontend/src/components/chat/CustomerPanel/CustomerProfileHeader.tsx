'use client';

import React from 'react';
import { Contact } from '@/types';

interface CustomerProfileHeaderProps {
  contact: Contact;
}

export default function CustomerProfileHeader({ contact }: CustomerProfileHeaderProps) {
  return (
    <div className="who2">
      <i className={`av ${contact.a} lg`}>{contact.i}</i>
      <b>{contact.n}</b>
      <span>{contact.ph}</span>
      <span>{contact.city} · customer since {contact.since}</span>
    </div>
  );
}
