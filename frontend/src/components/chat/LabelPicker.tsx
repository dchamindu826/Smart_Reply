'use client';

import React, { useState } from 'react';
import { useLabels } from '@/features/labels';

/** Sheet body: tick the labels for one customer. */
export default function LabelPicker({ current, onSave }: { contactId: string; current: string[]; onSave: (ids: string[]) => void }) {
  const { data: labels = [], isLoading } = useLabels();
  const [picked, setPicked] = useState<string[]>(current);
  const toggle = (id: string) => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));
  return (
    <>
      <h2>Labels</h2>
      <p className="sub">Pick the labels for this customer. Managers add new labels in Labels.</p>
      {isLoading ? <p className="sub">Loading…</p> : null}
      {!isLoading && labels.length === 0 ? <p className="sub">No labels yet.</p> : null}
      {labels.map(l => (
        <label key={l.id} className="list-row" style={{ paddingLeft: 0, paddingRight: 0, cursor: 'pointer' }}>
          <span className={`dot ${l.color}`} />
          <div className="bd">
            <b>{l.name}</b>
            {l.meaning ? <span>{l.meaning}</span> : null}
          </div>
          <div className="rt">
            <input type="checkbox" checked={picked.includes(l.id)} onChange={() => toggle(l.id)} />
          </div>
        </label>
      ))}
      <button className="btn pri" style={{ marginTop: 14 }} onClick={() => onSave(picked)}>
        Save labels
      </button>
    </>
  );
}
