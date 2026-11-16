'use client';

import React, { useState, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { formatDuration } from '@/lib/ui';

export default function Header() {
  const {
    role,
    screen,
    theme,
    toggleTheme,
    frameTheme,
    toggleFrameTheme,
    sectionTheme,
    toggleSectionTheme,
    toggleRail,
    business,
    setBusiness,
    currentUser,
    myStatus,
    setStatusModalOpen,
    addToast,
    soundMuted,
    toggleSoundMuted,
    companyPhone,
    numberQuality,
    counts,
    calls,
    openSheet,
    setScreen,
    signOut
  } = useApp();
  void role;
  void screen;
  void setBusiness;

  // Items that need attention: unread chats, chats about to close, missed calls today.
  const today = new Date().toDateString();
  const missedToday = calls.filter(c => c.d === 'missed' && c.startedAt && new Date(c.startedAt).toDateString() === today).length;
  const attention = [
    { n: counts?.unread ?? 0, text: 'unread chats', go: 'chats' },
    { n: counts?.closingSoon ?? 0, text: 'chats closing within 2 hours', go: 'chats' },
    { n: missedToday, text: 'missed calls today', go: 'calls' }
  ].filter(a => a.n > 0);
  const attentionCount = attention.reduce((sum, a) => sum + a.n, 0);

  const openAttention = () => {
    if (attention.length === 0) {
      addToast('Nothing needs your attention right now.');
      return;
    }
    openSheet(
      <>
        <h2>Needs your attention</h2>
        {attention.map(a => (
          <div key={a.text} className="list-row" style={{ paddingLeft: 0, paddingRight: 0 }}>
            <div className="bd">
              <b>{a.n} {a.text}</b>
            </div>
            <div className="rt">
              <button className="btn sm" onClick={() => setScreen(a.go)}>Open</button>
            </div>
          </div>
        ))}
      </>
    );
  };

  const [callElapsed, setCallElapsed] = useState('');
  const [chatElapsed, setChatElapsed] = useState('');

  // Update live timer elapsed seconds
  useEffect(() => {
    const update = () => {
      const now = Date.now();
      if (myStatus.call?.since) {
        setCallElapsed(formatDuration(now - myStatus.call.since));
      }
      if (myStatus.chat?.since) {
        setChatElapsed(formatDuration(now - myStatus.chat.since));
      }
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [myStatus.call?.since, myStatus.chat?.since]);

  const getStatusChip = (type: 'call' | 'chat') => {
    const chan = type === 'call' ? myStatus.call : myStatus.chat;
    if (!chan) return null;
    const labelMap: Record<string, string> = {
      available: 'Available',
      oncall: 'On a call',
      brk: 'On break',
      away: 'Away',
      dnd: 'Do not disturb'
    };
    const label = chan.st === 'brk' ? `${chan.r} break` : labelMap[chan.st] || chan.st;

    const colorMap: Record<string, string> = {
      available: 'ok',
      oncall: 'i',
      brk: 'w',
      away: '',
      dnd: 'b'
    };
    const colorClass = colorMap[chan.st] || '';

    const icon = type === 'call' ? '☏' : '✉';
    const showTimer = chan.st !== 'available';

    return (
      <span className={`chip sc ${colorClass}`}>
        {icon} {label} {showTimer ? <b className="tmr">{type === 'call' ? callElapsed : chatElapsed}</b> : null}
      </span>
    );
  };

  return (
    <header className="top">
      <button className="burger" id="burger" aria-label="Menu" onClick={toggleRail}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      </button>

      <div className="pick">
        <label className="sr" htmlFor="co">Business</label>
        <select id="co" value={business} onChange={() => undefined}>
          <option>{business}</option>
        </select>
      </div>

      <span className="wa" title="WhatsApp Business number">
        {numberQuality === 'Connected' ? `${companyPhone} · Connected` : 'WhatsApp not connected'}
      </span>

      <span className="sp" />

      {/* Live staff status pill */}
      <button
        className="mst"
        id="mst"
        onClick={() => setStatusModalOpen(true)}
        aria-label="Your status"
        title="Change live status & breaks"
      >
        <span className="scs">
          {getStatusChip('call')}
          {getStatusChip('chat')}
        </span>
      </button>

      {/* Sign out */}
      <div className="rolesw" role="group" aria-label="Account">
        <button onClick={() => void signOut()} title="Sign out of Smart Reply">
          Sign out
        </button>
      </div>

      {/* Sound notification toggle */}
      <button
        className="tbtn"
        id="sound-toggle"
        aria-label="Toggle notification sounds"
        onClick={toggleSoundMuted}
        title={soundMuted ? 'Notification sounds are muted (Click to enable)' : 'Notification sounds active (Click to mute)'}
      >
        {soundMuted ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
            <path d="M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
            <path d="M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
          </svg>
        )}
      </button>

      {/* Frame Theme Toggle (Top Header & Left Sidebar) */}
      <button
        className="tbtn"
        id="theme"
        aria-label="Top & Left Theme"
        onClick={toggleFrameTheme}
        title={`Top & Left Theme: ${frameTheme === 'dark' ? 'Dark' : 'Light'} (Header & Sidebar). Click to toggle.`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          {frameTheme === 'dark' ? (
            <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          ) : (
            <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z" />
          )}
        </svg>
      </button>

      {/* Section Theme Quick Toggle (Rest Area / Main Content) */}
      <button
        className="tbtn"
        id="sec-theme-toggle"
        aria-label="Rest Area Theme"
        onClick={toggleSectionTheme}
        suppressHydrationWarning
        title={`Rest Area Theme: ${sectionTheme === 'dark' ? 'Dark' : 'Light'} (Main Page & Content). Click to toggle.`}
        style={{
          fontSize: '12.5px',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <span suppressHydrationWarning>{sectionTheme === 'dark' ? '☀' : '☾'}</span>
      </button>

      {/* Notification Bell */}
      <button
        className="tbtn"
        id="bell"
        aria-label="Notifications"
        onClick={openAttention}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {attentionCount ? <span className="bdg">{attentionCount > 99 ? '99+' : attentionCount}</span> : null}
      </button>

      {/* User profile */}
      <div className="who" id="who">
        <div>
          <b>{currentUser.name}</b>
          <span>{currentUser.title}</span>
        </div>
        <i>{currentUser.initials}</i>
      </div>
    </header>
  );
}
