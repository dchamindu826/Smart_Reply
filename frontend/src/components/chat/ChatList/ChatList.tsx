'use client';

import React from 'react';
import { Conversation, Contact, Staff } from '@/types';
import ChatListHeader, { ChatFilterType } from './ChatListHeader';
import ChatListItem from './ChatListItem';

interface ChatListProps {
  conversations: Conversation[];
  contacts: Record<string, Contact>;
  staff: Staff[];
  selectedConvId?: string;
  onSelectConv: (id: string) => void;
  search: string;
  onSearchChange: (val: string) => void;
  filter: ChatFilterType;
  onFilterChange: (f: ChatFilterType) => void;
  isStaff: boolean;
}

export default function ChatList({
  conversations,
  contacts,
  staff,
  selectedConvId,
  onSelectConv,
  search,
  onSearchChange,
  filter,
  onFilterChange,
  isStaff
}: ChatListProps) {
  return (
    <section className="ib-l">
      <ChatListHeader
        search={search}
        onSearchChange={onSearchChange}
        filter={filter}
        onFilterChange={onFilterChange}
        isStaff={isStaff}
      />

      <div className="items">
        {conversations.length > 0 ? (
          conversations.map(conv => {
            const contact = contacts[conv.c];
            const owner = contact?.to ? staff.find(s => s.id === contact.to) : null;
            const isSelected = conv.id === selectedConvId;

            return (
              <ChatListItem
                key={conv.id}
                conv={conv}
                contact={contact}
                owner={owner}
                isSelected={isSelected}
                onSelect={() => onSelectConv(conv.id)}
              />
            );
          })
        ) : (
          <div className="empty">
            <b>Nothing here</b>
            Try another filter.
          </div>
        )}
      </div>
    </section>
  );
}
