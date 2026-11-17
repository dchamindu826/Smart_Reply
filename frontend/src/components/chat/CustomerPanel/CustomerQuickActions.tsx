'use client';

import React from 'react';
import { CallsIcon, StaffManageIcon, LabelsIcon, BlockIcon } from '@/components/common/Icons';

interface CustomerQuickActionsProps {
  onCall: () => void;
  onFocusOwner: () => void;
  onOpenLabels: () => void;
  onBlock: () => void;
}

export default function CustomerQuickActions({
  onCall,
  onFocusOwner,
  onOpenLabels,
  onBlock
}: CustomerQuickActionsProps) {
  return (
    <div className="acts4">
      <button type="button" onClick={onCall}>
        <span><CallsIcon size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /></span>Call
      </button>
      <button type="button" onClick={onFocusOwner}>
        <span><StaffManageIcon size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /></span>Owner
      </button>
      <button type="button" onClick={onOpenLabels}>
        <span><LabelsIcon size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /></span>Label
      </button>
      <button type="button" className="dg" onClick={onBlock}>
        <span><BlockIcon size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /></span>Block
      </button>
    </div>
  );
}
