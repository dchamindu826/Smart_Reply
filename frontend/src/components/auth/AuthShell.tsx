'use client';

import React, { ReactNode } from 'react';
import BrandLogo from '@/components/layout/BrandLogo';

/** Frame for sign-in, password and invite pages. */
export default function AuthShell({ title, sub, children }: { title: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <div className="auth">
      <div>
        <div className="auth-card">
          <BrandLogo idSuffix="Auth" />
          <h1>{title}</h1>
          {sub ? <p className="sub">{sub}</p> : null}
          {children}
        </div>
        <div className="auth-foot">Smart Reply by LUMI AI · WhatsApp chats and calls for your team</div>
      </div>
    </div>
  );
}

export function Boot({ text = 'Loading Smart Reply…' }: { text?: string }) {
  return (
    <div className="boot">
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>💬</div>
        <div style={{ fontSize: '16px', fontWeight: 600 }}>{text}</div>
      </div>
    </div>
  );
}
