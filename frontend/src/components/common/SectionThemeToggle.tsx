'use client';

import React from 'react';
import { useApp } from '@/context/AppContext';

export default function SectionThemeToggle({ className = 'btn' }: { className?: string }) {
  const { sectionTheme, toggleSectionTheme } = useApp();

  return (
    <button
      type="button"
      className={`${className} sec-theme-btn`}
      onClick={toggleSectionTheme}
      title={`Switch section to ${sectionTheme === 'dark' ? 'Light' : 'Dark'} mode (Side and Top frame stay isolated)`}
      aria-label={`Toggle section theme: currently ${sectionTheme} mode`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
    >
      <span style={{ fontSize: '13px' }}>{sectionTheme === 'dark' ? '☀' : '☾'}</span>
      <span>{sectionTheme === 'dark' ? 'Light View' : 'Dark View'}</span>
    </button>
  );
}
