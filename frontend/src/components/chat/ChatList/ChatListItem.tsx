'use client';

import React from 'react';
import { Conversation, Contact, Staff } from '@/types';
import { getWinClass, getWinText } from '@/utils/windowTime';

interface ChatListItemProps {
  conv: Conversation;
  contact?: Contact;
  owner?: Staff | null;
  isSelected: boolean;
  onSelect: () => void;
}

export default function ChatListItem({
  conv,
  contact,
  owner,
  isSelected,
  onSelect
}: ChatListItemProps) {
  const winClass = getWinClass(conv.exp);

  return (
    <button
      className={`cv w${winClass} ${conv.un ? 'un' : ''} ${isSelected ? 'on' : ''}`}
      onClick={onSelect}
    >
      <i className={`av ${contact?.a || 'a1'} md`}>{contact?.i || 'WA'}</i>
      <div className="bd">
        <div className="l1">
          <b>{contact?.n || 'Customer'}</b>
          <small>{conv.t}</small>
        </div>
        <span className="pv">{conv.pv}</span>
        <div className="tags">
          {contact?.labels[0] && (
            <span className={`chip ${contact.labels[0][1]}`}>{contact.labels[0][0]}</span>
          )}
          {owner ? (
            <span className="chip">{owner.n.split(' ')[0]}</span>
          ) : (
            <span className="chip b">No owner</span>
          )}
          <span className={`wt ${winClass}`}>
            ◷ <b>{getWinText(conv.exp)}</b>
          </span>
        </div>
      </div>
      {conv.un > 0 && <span className="n">{conv.un}</span>}
    </button>
  );
}
