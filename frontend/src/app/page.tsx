'use client';

import React from 'react';
import { AppProvider } from '@/context/AppContext';
import Shell from '@/components/layout/Shell';

export default function Home() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
