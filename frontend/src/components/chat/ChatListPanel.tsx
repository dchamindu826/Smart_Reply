'use client';

import React, { useState, useEffect } from 'react';
import { Conversation, Contact, Staff } from '@/types';
import { getWinClass, getWinText } from '@/utils/windowTime';
import { useApp } from '@/context/AppContext';

export type ChatFilterType = 'all' | 'unread' | 'exp' | 'labeled' | 'none';

interface ChatListPanelProps {
  conversations: Conversation[];
  allConversations: Conversation[];
  contacts: Record<string, Contact>;
  staff: Staff[];
  currentUser: { name: string; title: string; initials: string };
  selectedConvId?: string;
  onSelectConv: (id: string) => void;
  search: string;
  onSearchChange: (val: string) => void;
  filter: ChatFilterType;
  onFilterChange: (f: ChatFilterType) => void;
  staffFilter: string;
  onStaffFilterChange: (staffId: string) => void;
  isStaff: boolean;
  theme?: 'light' | 'dark';
  toggleTheme?: () => void;
  onOpenStatusModal: () => void;
  onNewChat: () => void;
}

export default function ChatListPanel({
  conversations,
  allConversations,
  contacts,
  staff,
  currentUser,
  selectedConvId,
  onSelectConv,
  search,
  onSearchChange,
  filter,
  onFilterChange,
  staffFilter,
  onStaffFilterChange,
  isStaff,
  theme,
  toggleTheme,
  onOpenStatusModal,
  onNewChat
}: ChatListPanelProps) {
  const [showNotice, setShowNotice] = useState(true);

  const { chatWallpaper, setChatWallpaper, addToast } = useApp();
  const [wallpaperMenuOpen, setWallpaperMenuOpen] = useState(false);

  useEffect(() => {
    if (!wallpaperMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setWallpaperMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [wallpaperMenuOpen]);

  const wallpaperOptions = [
    {
      id: 'doodle' as const,
      name: 'WhatsApp Doodle',
      tag: 'Classic',
      desc: 'Subtle WhatsApp doodles with brand motif',
      lightBg: '#efeae2',
      darkBg: '#0b141a',
      previewImg: '/wa-doodle-light.png',
      previewDarkImg: '/wa-doodle-dark.png',
      type: 'doodle'
    },
    {
      id: 'plain' as const,
      name: 'Plain Solid',
      tag: 'Clean',
      desc: 'Distraction-free pure solid background (no pattern)',
      lightBg: '#efeae2',
      darkBg: '#0b141a',
      previewImg: null,
      previewDarkImg: null,
      type: 'solid'
    },
    {
      id: 'dots' as const,
      name: 'Minimal Tech Dots',
      tag: 'Tech',
      desc: 'Modern geometric micro-dot matrix pattern',
      lightBg: '#f0f2f5',
      darkBg: '#111b21',
      previewImg: null,
      previewDarkImg: null,
      type: 'dots'
    },
    {
      id: 'emerald' as const,
      name: 'Emerald Mint',
      tag: 'WhatsApp',
      desc: 'Refreshing signature WhatsApp emerald tint',
      lightBg: '#e7f2ed',
      darkBg: '#081a17',
      previewImg: '/wa-doodle-emerald-light.png',
      previewDarkImg: '/wa-doodle-emerald-dark.png',
      type: 'doodle'
    },
    {
      id: 'warm' as const,
      name: 'Warm Sand',
      tag: 'Cozy',
      desc: 'Gentle warm espresso & parchment tone',
      lightBg: '#f7f1e6',
      darkBg: '#181415',
      previewImg: '/wa-doodle-warm-light.png',
      previewDarkImg: '/wa-doodle-warm-dark.png',
      type: 'doodle'
    }
  ];

  const filterOptions: { id: ChatFilterType; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'unread', label: 'Unread' },
    { id: 'exp', label: 'Expiring (24h)' },
    { id: 'labeled', label: 'Labeled' },
    ...(!isStaff ? [{ id: 'none' as ChatFilterType, label: 'No owner' }] : [])
  ];

  const selectedStaffObj = staff.find(s => s.id === staffFilter);

  return (
    <aside className="wa-col-list">
      {/* 1. Header (Matching WhatsApp Web Top Bar) */}
      <div className="wa-header">
        <div className="wa-user-meta">
          <div className="wa-user-avatar av a1" title={currentUser.name}>
            {currentUser.initials}
          </div>
          <div>
            <div className="wa-user-name" style={{ fontSize: '14px' }}>{currentUser.name}</div>
            <div className="wa-user-sub">
              <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: '#00a884' }} />
              <span>Online · {isStaff ? 'Agent' : 'Manager (All Chats)'}</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', position: 'relative' }}>
          {/* 5-Theme Wallpaper Switcher Button */}
          <button
            type="button"
            className={`wa-icon-btn ${wallpaperMenuOpen ? 'active' : ''}`}
            title="Chat Wallpaper & Theme Options (5 Themes)"
            onClick={() => setWallpaperMenuOpen(!wallpaperMenuOpen)}
            style={wallpaperMenuOpen ? { color: '#00a884', background: theme === 'dark' ? 'rgba(0,168,132,0.15)' : 'rgba(0,168,132,0.12)' } : {}}
            aria-label="Chat Wallpaper Themes"
            aria-expanded={wallpaperMenuOpen}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 9.8 10c.8 0 1.2-.6 1.2-1.2 0-.3-.1-.6-.3-.8-.2-.3-.3-.6-.3-1 0-.8.7-1.5 1.5-1.5h1.8c4.4 0 8-3.6 8-8 0-5.5-5.4-9.5-11.7-7.5z" />
              <circle cx="7.5" cy="10.5" r="1.5" fill="currentColor" />
              <circle cx="12" cy="7.5" r="1.5" fill="currentColor" />
              <circle cx="16.5" cy="10.5" r="1.5" fill="currentColor" />
              <circle cx="15.5" cy="15.5" r="1.5" fill="currentColor" />
            </svg>
          </button>

          {/* Theme Picker Dropdown Popover */}
          {wallpaperMenuOpen && (
            <>
              <div
                style={{
                  position: 'fixed',
                  inset: 0,
                  zIndex: 999
                }}
                onClick={() => setWallpaperMenuOpen(false)}
              />
              <div className="wa-wallpaper-popover" role="dialog" aria-label="Choose chat background wallpaper">
                <div className="wa-wallpaper-header">
                  <div className="wa-wallpaper-title">
                    <span>🎨 Chat Wallpaper</span>
                  </div>
                  {toggleTheme && (
                    <button
                      type="button"
                      className="wa-wallpaper-mode-btn"
                      onClick={() => toggleTheme()}
                      title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
                    >
                      {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
                    </button>
                  )}
                </div>

                <div className="wa-wallpaper-list">
                  {wallpaperOptions.map(opt => {
                    const isActive = chatWallpaper === opt.id;
                    const bgCol = theme === 'dark' ? opt.darkBg : opt.lightBg;
                    const swatchStyle: React.CSSProperties = {
                      backgroundColor: bgCol
                    };
                    if (opt.type === 'doodle' && (opt.previewImg || opt.previewDarkImg)) {
                      const img = theme === 'dark' ? opt.previewDarkImg : opt.previewImg;
                      swatchStyle.backgroundImage = `url(${img})`;
                      swatchStyle.backgroundSize = 'cover';
                    } else if (opt.type === 'dots') {
                      swatchStyle.backgroundImage = theme === 'dark'
                        ? 'radial-gradient(rgba(255,255,255,0.3) 1px, transparent 0)'
                        : 'radial-gradient(rgba(0,0,0,0.3) 1px, transparent 0)';
                      swatchStyle.backgroundSize = '6px 6px';
                    }

                    return (
                      <button
                        key={opt.id}
                        type="button"
                        className={`wa-wallpaper-option ${isActive ? 'active' : ''}`}
                        onClick={() => {
                          setChatWallpaper(opt.id);
                          addToast(`Wallpaper updated: ${opt.name}`);
                          setWallpaperMenuOpen(false);
                        }}
                      >
                        <div className="wa-wallpaper-swatch" style={swatchStyle}>
                          {opt.type === 'solid' && (
                            <span style={{ fontSize: '10px', opacity: 0.6, fontWeight: 700 }}>
                              PLN
                            </span>
                          )}
                        </div>
                        <div className="wa-wallpaper-meta">
                          <div className="wa-wallpaper-name-row">
                            <span className="wa-wallpaper-name">{opt.name}</span>
                            <span className="wa-wallpaper-tag">{opt.tag}</span>
                          </div>
                          <div className="wa-wallpaper-desc">{opt.desc}</div>
                        </div>
                        {isActive && <span className="wa-wallpaper-check">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          <button
            type="button"
            className="wa-icon-btn"
            title="Update Live Agent Status & Breaks"
            onClick={onOpenStatusModal}
          >
            ◌
          </button>
          <button
            type="button"
            className="wa-icon-btn"
            title="New WhatsApp Chat"
            onClick={onNewChat}
          >
            💬
          </button>
        </div>
      </div>

      {/* 2. Notice / Alert Banner */}
      {showNotice && (
        <div className="wa-notice-banner">
          <div className="wa-notice-icon">
            ✓
          </div>
          <div className="wa-notice-content">
            <div className="wa-notice-title">WhatsApp Business Connected</div>
            <div className="wa-notice-sub">
              +94 77 123 4567 · 24h Window active. <a onClick={() => setShowNotice(false)}>Dismiss</a>
            </div>
          </div>
          <button
            type="button"
            className="wa-icon-btn"
            style={{ padding: '4px', fontSize: '14px' }}
            onClick={() => setShowNotice(false)}
            aria-label="Dismiss banner"
          >
            ✕
          </button>
        </div>
      )}

      {/* 3. Search Bar and Filter Pills */}
      <div className="wa-search-container">
        {/* Search input */}
        <div className="wa-search-input-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            className="wa-search-input"
            placeholder="Search or start a new chat"
            value={search}
            onChange={e => onSearchChange(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="wa-icon-btn"
              style={{ padding: '2px', fontSize: '13px' }}
              onClick={() => onSearchChange('')}
            >
              ✕
            </button>
          )}
        </div>

        {/* Message Status Filter Chips */}
        <div className="wa-filter-chips">
          {filterOptions.map(opt => (
            <button
              key={opt.id}
              type="button"
              className={`wa-filter-pill ${filter === opt.id ? 'active' : ''}`}
              onClick={() => onFilterChange(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Staff Allocated Filter Dropdown (Only for Manager) */}
        {!isStaff && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              paddingTop: '6px',
              marginTop: '6px',
              borderTop: '1px solid var(--wa-border)'
            }}
          >
            <label
              htmlFor="waStaffFilterSelect"
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--wa-secondary-text)',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                whiteSpace: 'nowrap',
                flex: 'none'
              }}
            >
              <span>👤</span> Staff:
            </label>
            <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
              <select
                id="waStaffFilterSelect"
                value={staffFilter}
                onChange={e => onStaffFilterChange(e.target.value)}
                className="wa-select f-in"
                style={{
                  width: '100%',
                  padding: '5px 24px 5px 10px',
                  borderRadius: '16px',
                  fontSize: '12px',
                  fontWeight: staffFilter !== 'all' ? 600 : 500,
                  cursor: 'pointer',
                  appearance: 'none',
                  WebkitAppearance: 'none'
                }}
              >
                <option value="all">
                  All Staff ({allConversations.length} chats)
                </option>
                {staff.map(s => {
                  const staffChatCount = allConversations.filter(v => contacts[v.c]?.to === s.id).length;
                  return (
                    <option key={s.id} value={s.id}>
                      {s.n} ({staffChatCount} chats) · {s.stt}
                    </option>
                  );
                })}
                <option value="unassigned">
                  Unassigned ({allConversations.filter(v => !contacts[v.c]?.to).length} chats)
                </option>
              </select>
              <div
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  pointerEvents: 'none',
                  fontSize: '9px',
                  color: 'var(--wa-secondary-text)'
                }}
              >
                ▼
              </div>
            </div>
            {staffFilter !== 'all' && (
              <button
                type="button"
                className="wa-icon-btn"
                title="Reset to All Staff"
                onClick={() => onStaffFilterChange('all')}
                style={{
                  fontSize: '12px',
                  padding: '4px 6px',
                  borderRadius: '50%',
                  flex: 'none',
                  color: '#ea0038'
                }}
              >
                ✕
              </button>
            )}
          </div>
        )}
      </div>

      {/* Active Staff Filter Indicator */}
      {!isStaff && staffFilter !== 'all' && (
        <div style={{
          padding: '6px 14px',
          background: 'var(--wa-panel-sub)',
          borderBottom: '1px solid var(--wa-border)',
          fontSize: '12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>
            Viewing: <b style={{ color: '#008069' }}>{staffFilter === 'unassigned' ? 'Unassigned chats' : selectedStaffObj?.n}</b> ({conversations.length})
          </span>
          <button
            type="button"
            onClick={() => onStaffFilterChange('all')}
            style={{ color: '#008069', fontWeight: 600, fontSize: '11px', cursor: 'pointer', background: 'none', border: 0 }}
          >
            Show All
          </button>
        </div>
      )}

      {/* 4. Conversations List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {conversations.length > 0 ? (
          conversations.map(conv => {
            const contact = contacts[conv.c];
            const owner = contact?.to ? staff.find(s => s.id === contact.to) : null;
            const isSelected = conv.id === selectedConvId;
            const winClass = getWinClass(conv.exp);
            const winText = getWinText(conv.exp);

            return (
              <div
                key={conv.id}
                className={`wa-chat-item ${isSelected ? 'active' : ''} ${conv.un > 0 ? 'unread' : ''}`}
                onClick={() => onSelectConv(conv.id)}
              >
                {/* Avatar */}
                <div className={`wa-chat-avatar av ${contact?.a || 'a1'}`}>
                  {contact?.i || 'WA'}
                </div>

                {/* Content */}
                <div className="wa-chat-body">
                  <div className="wa-chat-row1">
                    <span className="wa-chat-name">{contact?.n || 'Customer'}</span>
                    <span className="wa-chat-time">{conv.t}</span>
                  </div>

                  <div className="wa-chat-row2">
                    <span className="wa-chat-preview">
                      <span className="wa-ticks">✓✓</span>
                      {conv.pv}
                    </span>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 'none' }}>
                      {/* Window badge */}
                      <span
                        className={`wt ${winClass}`}
                        style={{ fontSize: '10.5px', padding: '1px 5px', borderRadius: '4px' }}
                        title="Reply window"
                      >
                        ◷ {winText}
                      </span>

                      {/* Owner pill */}
                      {owner ? (
                        <span className="chip" style={{ fontSize: '10.5px', padding: '1px 5px' }} title={`Assigned to ${owner.n}`}>
                          {owner.n.split(' ')[0]}
                        </span>
                      ) : (
                        <span className="chip b" style={{ fontSize: '10.5px', padding: '1px 5px' }}>
                          Unassigned
                        </span>
                      )}

                      {/* Unread badge */}
                      {conv.un > 0 && (
                        <span className="wa-chat-badge">{conv.un}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--wa-secondary-text)', fontSize: '13.5px' }}>
            <b>No chats match this filter</b>
            <p style={{ marginTop: '4px' }}>
              {!isStaff && staffFilter !== 'all'
                ? `No chats currently assigned to ${staffFilter === 'unassigned' ? 'unassigned queue' : selectedStaffObj?.n}.`
                : 'Try adjusting your search or filters.'}
            </p>
            {!isStaff && staffFilter !== 'all' && (
              <button
                type="button"
                className="btn sm pri"
                style={{ marginTop: '10px' }}
                onClick={() => onStaffFilterChange('all')}
              >
                Reset Staff Filter
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
