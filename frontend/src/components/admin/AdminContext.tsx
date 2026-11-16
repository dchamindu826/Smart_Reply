'use client';

import React, { createContext, ReactNode, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { errorMessage } from '@/lib/api';

export type AdminScreen = 'overview' | 'companies' | 'company' | 'plans' | 'meta' | 'ai' | 'usage' | 'audit';
export type CompanyTab = 'overview' | 'whatsapp' | 'ai';

const SCREENS: AdminScreen[] = ['overview', 'companies', 'company', 'plans', 'meta', 'ai', 'usage', 'audit'];
const TABS: CompanyTab[] = ['overview', 'whatsapp', 'ai'];

interface Toast {
  id: number;
  message: string;
}

interface AdminValue {
  screen: AdminScreen;
  companyId: string;
  tab: CompanyTab;
  go: (screen: AdminScreen, opts?: { company?: string; tab?: CompanyTab }) => void;
  toasts: Toast[];
  toast: (message: string) => void;
  reportError: (err: unknown) => void;
  sheet: ReactNode | null;
  openSheet: (node: ReactNode) => void;
  closeSheet: () => void;
  railOpen: boolean;
  setRailOpen: (open: boolean) => void;
}

const Ctx = createContext<AdminValue | undefined>(undefined);

/** Screen, selected company and tab live in the URL (`?screen=company&company=…&tab=ai`). */
export function AdminProvider({ children }: { children: ReactNode }) {
  const params = useSearchParams();
  const rawScreen = params.get('screen') as AdminScreen | null;
  const companyId = params.get('company') ?? '';
  let screen: AdminScreen = rawScreen && SCREENS.includes(rawScreen) ? rawScreen : 'overview';
  if (screen === 'company' && !companyId) screen = 'companies';
  const rawTab = params.get('tab') as CompanyTab | null;
  const tab: CompanyTab = rawTab && TABS.includes(rawTab) ? rawTab : 'overview';

  const [toasts, setToasts] = useState<Toast[]>([]);
  const [sheet, setSheet] = useState<ReactNode | null>(null);
  const [railOpen, setRailOpen] = useState(false);
  const seq = useRef(0);

  const toast = useCallback((message: string) => {
    const id = ++seq.current;
    setToasts(t => [...t.slice(-3), { id, message }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4500);
  }, []);

  const go = useCallback((s: AdminScreen, opts?: { company?: string; tab?: CompanyTab }) => {
    const q = new URLSearchParams();
    q.set('screen', s);
    if (s === 'company' && opts?.company) {
      q.set('company', opts.company);
      if (opts.tab && opts.tab !== 'overview') q.set('tab', opts.tab);
    }
    window.history.pushState(null, '', `?${q.toString()}`);
    setRailOpen(false);
    setSheet(null);
  }, []);

  const value = useMemo<AdminValue>(
    () => ({
      screen,
      companyId,
      tab,
      go,
      toasts,
      toast,
      reportError: err => toast(errorMessage(err)),
      sheet,
      openSheet: node => setSheet(node),
      closeSheet: () => setSheet(null),
      railOpen,
      setRailOpen
    }),
    [screen, companyId, tab, go, toasts, toast, sheet, railOpen]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAdmin(): AdminValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAdmin must be used within AdminProvider');
  return ctx;
}
