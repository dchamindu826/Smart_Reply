'use client';

import React from 'react';
import { useApp } from '@/context/AppContext';

export default function AuditScreen() {
  const { addToast } = useApp();

  return (
    <>
      <div className="ph">
        <div>
          <h1>Audit log</h1>
          <p>Who did what, and when.</p>
        </div>
        <div className="acts">
          <button className="btn" onClick={() => addToast('Audit log exported.')}>
            Export
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-b">
          <div className="tl">
            <div className="tl-i hi">
              <b>Nimal sent quotation_ready to Kasun Perera</b>
              <span>Today 10:45 · mobile app</span>
            </div>
            <div className="tl-i">
              <b>Auto-assign gave Kasun Perera to Nimal</b>
              <span>Today 10:39 · round-robin</span>
            </div>
            <div className="tl-i">
              <b>Meta rejected template avurudu_offer</b>
              <span>Today 09:12 · image quality</span>
            </div>
            <div className="tl-i">
              <b>Madushan P. changed call hours</b>
              <span>Yesterday 18:20 · web</span>
            </div>
            <div className="tl-i">
              <b>Sachini exported her performance report</b>
              <span>Yesterday 17:02 · web</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
