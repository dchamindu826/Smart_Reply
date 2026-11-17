'use client';

import React from 'react';
import { useApp } from '@/context/AppContext';
import { NAV_STRUCTURE } from '@/lib/ui';
import { NavIcon } from '@/components/common/Icons';
import BrandLogo from './BrandLogo';

export default function Rail() {
  const { role, screen, setScreen, railOpen, counts, calls, mediaList, templates, aiAddon } = useApp();
  const navSections = NAV_STRUCTURE[role] || NAV_STRUCTURE.manager;

  // Live badge counts from the API.
  const today = new Date().toDateString();
  const missedToday = calls.filter(c => c.d === 'missed' && c.startedAt && new Date(c.startedAt).toDateString() === today).length;
  const live: Record<string, string> = {
    chats: counts?.unread ? String(counts.unread) : '',
    calls: missedToday ? String(missedToday) : '',
    contacts: role === 'manager' && counts?.no_owner ? String(counts.no_owner) : '',
    gallery: mediaList.length ? String(mediaList.length) : '',
    templates: templates.filter(t => t.st !== 'ok').length ? String(templates.filter(t => t.st !== 'ok').length) : '',
    aibot: aiAddon?.status === 'active' ? 'Live' : ''
  };

  return (
    <aside className={`rail ${railOpen ? 'open' : ''}`} id="rail">
      <div className="brand">
        <BrandLogo />
      </div>

      <nav className="nav" id="nav" aria-label="Main">
        {navSections.map(section => (
          <React.Fragment key={section.title}>
            <h2>{section.title}</h2>
            {section.items.map(item => (
              <button
                key={item.id}
                className={screen === item.id ? 'on' : ''}
                onClick={() => setScreen(item.id)}
                data-go={item.id}
              >
                <span className="ic" aria-hidden="true">
                  <NavIcon id={item.id} size={16} />
                </span>
                <span>{item.label}</span>
                {live[item.id] ? <span className="ct">{live[item.id]}</span> : null}
              </button>
            ))}
          </React.Fragment>
        ))}
      </nav>
    </aside>
  );
}
