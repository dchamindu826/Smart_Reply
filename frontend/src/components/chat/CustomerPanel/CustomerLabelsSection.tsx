'use client';

import React from 'react';

interface CustomerLabelsSectionProps {
  labels: [string, string][];
  onAddLabel: () => void;
}

export default function CustomerLabelsSection({
  labels,
  onAddLabel
}: CustomerLabelsSectionProps) {
  return (
    <>
      <h3>Labels</h3>
      <div className="tags">
        {labels.length > 0 ? (
          labels.map((lbl, idx) => (
            <span key={idx} className={`chip ${lbl[1]}`}>
              {lbl[0]}
            </span>
          ))
        ) : (
          <span className="hint">No labels</span>
        )}
        <button type="button" className="chip" onClick={onAddLabel}>
          + Add
        </button>
      </div>
    </>
  );
}
