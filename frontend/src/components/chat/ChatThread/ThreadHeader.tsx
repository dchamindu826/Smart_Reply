'use client';

import React from 'react';
import { Contact, Conversation } from '@/types';
import { getWinClass, getWinText } from '@/utils/windowTime';
import { useApp } from '@/context/AppContext';
import { ChatsIcon, CallsIcon, CheckIcon } from '@/components/common/Icons';

interface ThreadHeaderProps {
  contact: Contact;
  conv: Conversation;
  onCall: () => void;
  onResolve: () => void;
}

export default function ThreadHeader({
  contact,
  conv,
  onCall,
  onResolve
}: ThreadHeaderProps) {
  const { simulateCustomerReply } = useApp();
  const winClass = getWinClass(conv.exp);
  const winText = getWinText(conv.exp);
  const isWindowOpen = conv.exp ? conv.exp - Date.now() > 0 : false;

  return (
    <div className="hd">
      <i className={`av ${contact.a} md`}>{contact.i}</i>
      <div className="bd">
        <b>{contact.n}</b>
        <span className="win" style={{ color: 'var(--ink-2)' }}>
          Reply window{' '}
          <span className={`wt ${winClass}`}>
            ◷ <b>{winText}</b>
          </span>{' '}
          {isWindowOpen ? 'free replies' : 'approved templates only'}
        </span>
      </div>
      <button
        className="btn sm"
        onClick={() => simulateCustomerReply(conv.id)}
        title="Test incoming WhatsApp message notification & sound"
        style={{ borderColor: 'var(--wa-teal, #00a884)', color: 'var(--wa-teal, #00a884)', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
      >
        <ChatsIcon size={14} />
        <span>Test Reply</span>
      </button>
      <button className="btn sm" onClick={onCall} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
        <CallsIcon size={14} />
        <span>Call</span>
      </button>
      <button className="btn sm" onClick={onResolve} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
        <CheckIcon size={14} />
        <span>Resolve</span>
      </button>
    </div>
  );
}
