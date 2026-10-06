'use client';

import React, { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { PRODUCT_ARTWORK } from '@/data/mockData';
import SectionThemeToggle from '@/components/common/SectionThemeToggle';

export default function CatalogScreen() {
  const { products, addToast } = useApp();
  const [filter, setFilter] = useState('all');

  const filtered = products.filter(p => {
    if (filter === 'all') return true;
    return p.col === filter;
  });

  return (
    <>
      <div className="ph">
        <div>
          <h1>Catalog &amp; pricing</h1>
          <p>
            Products customers can browse and order inside WhatsApp. Synced with Meta Commerce 2 minutes ago.
          </p>
        </div>
        <div className="acts">
          <SectionThemeToggle />
          <button
            className="btn"
            onClick={() => addToast('Catalog link copied: wa.me/c/94771234567')}
          >
            Share catalog link
          </button>
          <button
            className="btn pri"
            onClick={() => addToast('New product form opened.')}
          >
            Add product
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <div className="seg">
            {[
              { id: 'all', label: `All ${products.length}` },
              { id: 'Kitchen', label: 'Kitchen' },
              { id: 'Bathroom', label: 'Bathroom' },
              { id: 'Wardrobes', label: 'Wardrobes' }
            ].map(tab => (
              <button
                key={tab.id}
                aria-pressed={filter === tab.id}
                className={filter === tab.id ? 'active' : ''}
                onClick={() => setFilter(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <span className="sp" />
          <span className="chip ok">Synced</span>
        </div>

        <div className="card-b">
          <div className="grid g3">
            {filtered.map(p => (
              <div className="prod" key={p.sku}>
                <div
                  className="art"
                  dangerouslySetInnerHTML={{
                    __html: `<svg viewBox="0 0 150 110" fill="none" role="img" aria-label="${p.k}">${PRODUCT_ARTWORK[p.k]}</svg>`
                  }}
                />
                <div className="in">
                  <b>{p.n}</b>
                  <div className="pr">
                    {p.p}
                    {p.old && <s>{p.old}</s>}
                  </div>
                  <span>{p.note}</span>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '9px' }}>
                    <span className={`chip ${p.st === 'ok' ? 'ok' : 'w'}`}>
                      {p.st === 'ok' ? 'In catalog' : 'Hidden'}
                    </span>
                    <span className="hint" style={{ margin: 0 }}>{p.sku}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="note i">
        <span className="ic">◈</span>
        <div>
          <b>Prices shown are demo figures</b>
          Replace them with Madushan Aluminium’s real price list and product photos before the client demo.
        </div>
      </div>
    </>
  );
}
