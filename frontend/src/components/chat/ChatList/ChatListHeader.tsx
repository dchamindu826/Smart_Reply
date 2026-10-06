'use client';

import React from 'react';

export type ChatFilterType = 'all' | 'unread' | 'exp' | 'labeled' | 'none';

interface ChatListHeaderProps {
  search: string;
  onSearchChange: (value: string) => void;
  filter: ChatFilterType;
  onFilterChange: (filter: ChatFilterType) => void;
  isStaff: boolean;
}

export default function ChatListHeader({
  search,
  onSearchChange,
  filter,
  onFilterChange,
  isStaff
}: ChatListHeaderProps) {
  const filterOptions: { id: ChatFilterType; label: string }[] = [
    { id: 'unread', label: 'Unread' },
    { id: 'all', label: 'All' },
    { id: 'exp', label: 'Expiring' },
    { id: 'labeled', label: 'Labeled' },
    ...(!isStaff ? [{ id: 'none' as ChatFilterType, label: 'No owner' }] : [])
  ];

  return (
    <div className="hd">
      <input
        className="f-in"
        placeholder="Search name or number"
        aria-label="Search conversations"
        value={search}
        onChange={e => onSearchChange(e.target.value)}
      />

      <div className="seg" style={{ flexWrap: 'wrap' }}>
        {filterOptions.map(opt => (
          <button
            key={opt.id}
            aria-pressed={filter === opt.id}
            className={filter === opt.id ? 'active' : ''}
            onClick={() => onFilterChange(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="wleg">
        <span><i className="g" />New · 20h+</span>
        <span><i className="y" />Open</span>
        <span><i className="r" />Under 2h</span>
        <span><i className="x" />Closed</span>
      </div>
    </div>
  );
}
