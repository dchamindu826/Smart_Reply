'use client';

import React from 'react';
import { Contact, Staff, CallLogItem } from '@/types';
import CustomerProfileHeader from './CustomerProfileHeader';
import CustomerQuickActions from './CustomerQuickActions';
import CustomerOwnerSection from './CustomerOwnerSection';
import CustomerLabelsSection from './CustomerLabelsSection';
import CustomerActivitySection from './CustomerActivitySection';

interface CustomerPanelProps {
  contact: Contact | null;
  staff: Staff[];
  calls: CallLogItem[];
  isStaff: boolean;
  onCall: () => void;
  onFocusOwner: () => void;
  onOpenLabels: () => void;
  onBlock: () => void;
  onOwnerChange: (newOwnerId: string | null) => void;
  onAddLabel: () => void;
}

export default function CustomerPanel({
  contact,
  staff,
  calls,
  isStaff,
  onCall,
  onFocusOwner,
  onOpenLabels,
  onBlock,
  onOwnerChange,
  onAddLabel
}: CustomerPanelProps) {
  if (!contact) return null;

  return (
    <aside className="ib-c">
      <CustomerProfileHeader contact={contact} />

      <CustomerQuickActions
        onCall={onCall}
        onFocusOwner={onFocusOwner}
        onOpenLabels={onOpenLabels}
        onBlock={onBlock}
      />

      <CustomerOwnerSection
        contact={contact}
        staff={staff}
        isStaff={isStaff}
        onOwnerChange={onOwnerChange}
      />

      <CustomerLabelsSection
        labels={contact.labels}
        onAddLabel={onAddLabel}
      />

      <CustomerActivitySection
        contact={contact}
        calls={calls}
      />
    </aside>
  );
}
