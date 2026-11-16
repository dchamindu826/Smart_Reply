'use client';

import React, { useState } from 'react';
import { initialsOf } from '@smart-reply/shared';
import BrandLogo from '@/components/layout/BrandLogo';
import { useSession } from '@/features/session';
import { useAdminHealth, useAiCompanies } from '@/features/admin';
import { AdminScreen, useAdmin } from './AdminContext';
import OverviewScreen from './OverviewScreen';
import CompaniesScreen from './CompaniesScreen';
import CompanyDetail from './CompanyDetail';
import PlansScreen from './PlansScreen';
import MetaScreen from './MetaScreen';
import AiPlatformScreen from './AiPlatformScreen';
import UsageScreen from './UsageScreen';
import AuditScreen from './AuditScreen';

const NAV: { title: string; items: { id: AdminScreen; label: string; icon: string }[] }[] = [
  {
    title: 'Console',
    items: [
      { id: 'overview', label: 'Overview', icon: '◉' },
      { id: 'companies', label: 'Companies', icon: '▦' }
    ]
  },
  {
    title: 'Platform',
    items: [
      { id: 'plans', label: 'Plans', icon: '₨' },
      { id: 'meta', label: 'Meta & webhook', icon: '⚡' },
      { id: 'ai', label: 'AI platform', icon: '✦' }
    ]
  },
  {
    title: 'Records',
    items: [
      { id: 'usage', label: 'Usage', icon: '▤' },
      { id: 'audit', label: 'Audit log', icon: '☰' }
    ]
  }
];

type Theme = 'light' | 'dark';
const THEME_KEY = 'sr.admin.theme';

function readTheme(): Theme {
  try {
    return typeof window !== 'undefined' && localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function Rail() {
  const { screen, go, railOpen } = useAdmin();
  const health = useAdminHealth();
  const ai = useAiCompanies();
  const pending = ai.data?.filter(r => r.addon.requestedAt && r.addon.status !== 'active').length ?? 0;
  const badges: Partial<Record<AdminScreen, string>> = {
    overview: health.data?.webhookFailures24h ? String(health.data.webhookFailures24h) : '',
    ai: pending ? String(pending) : ''
  };
  const active = screen === 'company' ? 'companies' : screen;
  return (
    <aside className={`rail ${railOpen ? 'open' : ''}`} id="rail">
      <div className="brand">
        <BrandLogo idSuffix="adm" />
      </div>
      <nav className="nav" aria-label="Admin">
        {NAV.map(section => (
          <React.Fragment key={section.title}>
            <h2>{section.title}</h2>
            {section.items.map(item => (
              <button
                key={item.id}
                className={active === item.id ? 'on' : ''}
                aria-current={active === item.id ? 'page' : undefined}
                onClick={() => go(item.id)}
              >
                <span className="ic" aria-hidden="true">
                  {item.icon}
                </span>
                <span>{item.label}</span>
                {badges[item.id] ? <span className="ct">{badges[item.id]}</span> : null}
              </button>
            ))}
          </React.Fragment>
        ))}
      </nav>
    </aside>
  );
}

function Header({ theme, onTheme }: { theme: Theme; onTheme: () => void }) {
  const { me, logout } = useSession();
  const { railOpen, setRailOpen } = useAdmin();
  const [busy, setBusy] = useState(false);
  const name = me?.user.name ?? 'Admin';
  const signOut = async () => {
    setBusy(true);
    await logout();
    // Full load: nothing from the admin session survives in memory.
    window.location.replace('/login');
  };
  return (
    <header className="top">
      <button className="burger" aria-label="Menu" aria-expanded={railOpen} onClick={() => setRailOpen(!railOpen)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      </button>
      <span className="chip i">LUMI AI admin console</span>
      <span className="sp" />
      <div className="rolesw" role="group" aria-label="Account">
        <button onClick={() => void signOut()} disabled={busy} title="Sign out of Smart Reply">
          Sign out
        </button>
      </div>
      <button className="tbtn" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} onClick={onTheme} title="Theme">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          {theme === 'dark' ? (
            <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          ) : (
            <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z" />
          )}
        </svg>
      </button>
      <div className="who">
        <div>
          <b>{name}</b>
          <span>{me?.user.title || 'System admin'}</span>
        </div>
        <i>{me?.user.initials || initialsOf(name)}</i>
      </div>
    </header>
  );
}

function Screen() {
  const { screen } = useAdmin();
  switch (screen) {
    case 'companies':
      return <CompaniesScreen />;
    case 'company':
      return <CompanyDetail />;
    case 'plans':
      return <PlansScreen />;
    case 'meta':
      return <MetaScreen />;
    case 'ai':
      return <AiPlatformScreen />;
    case 'usage':
      return <UsageScreen />;
    case 'audit':
      return <AuditScreen />;
    default:
      return <OverviewScreen />;
  }
}

export default function AdminShell() {
  const { sheet, closeSheet, railOpen, setRailOpen, toasts } = useAdmin();
  const [theme, setTheme] = useState<Theme>(readTheme);
  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* private window */
    }
  };

  return (
    <div className="shell admin-shell" data-frame-theme={theme}>
      <Rail />
      <div className="main" data-page-theme={theme}>
        <Header theme={theme} onTheme={toggleTheme} />
        <main className="page" data-page-theme={theme} id="page">
          <Screen />
        </main>
      </div>

      {railOpen || sheet !== null ? (
        <div
          className="scrim on"
          onClick={() => {
            setRailOpen(false);
            closeSheet();
          }}
        />
      ) : null}

      {sheet !== null ? (
        <aside className="sheet on" role="dialog" aria-modal="true" data-section-theme={theme}>
          <button className="x" aria-label="Close" onClick={closeSheet}>
            ×
          </button>
          <div>{sheet}</div>
        </aside>
      ) : null}

      <div className="toasts" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className="toast">
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}
