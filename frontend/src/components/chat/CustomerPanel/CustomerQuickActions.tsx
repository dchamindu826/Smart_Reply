'use client';

import React from 'react';

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
        <span>☏</span>Call
      </button>
      <button type="button" onClick={onFocusOwner}>
        <span>⚇</span>Owner
      </button>
      <button type="button" onClick={onOpenLabels}>
        <span>◈</span>Label
      </button>
      <button type="button" className="dg" onClick={onBlock}>
        <span>⊘</span>Block
      </button>
    </div>
  );
}
