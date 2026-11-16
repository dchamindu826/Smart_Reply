'use client';

import React, { useState } from 'react';
import type { Label, LabelColor } from '@smart-reply/shared';
import { useApp } from '@/context/AppContext';
import { useDeleteLabel, useLabels, useSaveLabel } from '@/features/labels';
import SectionThemeToggle from '@/components/common/SectionThemeToggle';

const COLORS: [LabelColor, string][] = [
  ['', 'Grey'],
  ['i', 'Blue'],
  ['w', 'Amber'],
  ['ok', 'Green'],
  ['b', 'Red']
];

function LabelForm({ initial, onDone }: { initial: Label | null; onDone: () => void }) {
  const { addToast, reportError } = useApp();
  const save = useSaveLabel();
  const remove = useDeleteLabel();
  const [name, setName] = useState(initial?.name ?? '');
  const [color, setColor] = useState<LabelColor>(initial?.color ?? '');
  const [meaning, setMeaning] = useState(initial?.meaning ?? '');
  const [autoRule, setAutoRule] = useState(initial?.autoRule ?? '');
  const [confirm, setConfirm] = useState(false);

  const submit = async () => {
    if (!name.trim()) {
      addToast('Give the label a name.');
      return;
    }
    try {
      await save.mutateAsync({ id: initial?.id ?? null, input: { name: name.trim(), color, meaning: meaning.trim(), autoRule: autoRule.trim() } });
      addToast(initial ? `Label “${name.trim()}” saved.` : `Label “${name.trim()}” created.`);
      onDone();
    } catch (err) {
      reportError(err);
    }
  };

  const del = async () => {
    if (!initial) return;
    try {
      await remove.mutateAsync(initial.id);
      addToast(`Label “${initial.name}” deleted.`);
      onDone();
    } catch (err) {
      reportError(err);
    }
  };

  return (
    <>
      <h2>{initial ? `Edit ${initial.name}` : 'New label'}</h2>
      <p className="sub">Labels sort chats in the inbox and pick audiences for broadcasts.</p>

      <div className="f-row f2">
        <div>
          <label className="f" htmlFor="lbName">Name</label>
          <input className="f-in" id="lbName" maxLength={40} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Hot lead" />
        </div>
        <div>
          <label className="f" htmlFor="lbColor">Colour</label>
          <select className="f-in" id="lbColor" value={color} onChange={e => setColor(e.target.value as LabelColor)}>
            {COLORS.map(([v, t]) => (
              <option key={v || 'grey'} value={v}>{t}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="hint">
        Preview <span className={`chip ${color}`}>{name.trim() || 'Label'}</span>
      </div>

      <label className="f" htmlFor="lbMeaning">Meaning</label>
      <input className="f-in" id="lbMeaning" maxLength={160} value={meaning} onChange={e => setMeaning(e.target.value)} placeholder="e.g. Likely to order this week" />

      <label className="f" htmlFor="lbRule">Auto-apply rule</label>
      <input className="f-in" id="lbRule" maxLength={160} value={autoRule} onChange={e => setAutoRule(e.target.value)} placeholder="Leave empty for manual" />
      <div className="hint">Keyword rules on the Assignment rules screen can add this label automatically.</div>

      <button className="btn pri" style={{ width: '100%', justifyContent: 'center', marginTop: '14px' }} disabled={save.isPending} onClick={submit}>
        {save.isPending ? 'Saving…' : initial ? 'Save label' : 'Create label'}
      </button>

      {initial && (
        <button
          className="btn dgr"
          style={{ width: '100%', justifyContent: 'center', marginTop: '8px' }}
          disabled={remove.isPending}
          onClick={() => (confirm ? del() : setConfirm(true))}
        >
          {confirm ? `Yes, delete — removes it from ${initial.chatCount} chat${initial.chatCount === 1 ? '' : 's'}` : 'Delete label'}
        </button>
      )}
    </>
  );
}

export default function LabelsScreen() {
  const { role, openSheet, closeSheet } = useApp();
  const labelsQ = useLabels();
  const labels = labelsQ.data ?? [];
  const isManager = role === 'manager';

  const openForm = (l: Label | null) => openSheet(<LabelForm key={l?.id ?? 'new'} initial={l} onDone={closeSheet} />);

  return (
    <>
      <div className="ph">
        <div>
          <h1>Labels</h1>
          <p>Labels sort chats in the inbox and pick audiences for broadcasts.</p>
        </div>
        <div className="acts">
          <SectionThemeToggle />
          {isManager && (
            <button className="btn pri" onClick={() => openForm(null)}>
              New label
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Label</th>
                <th>Meaning</th>
                <th className="r">Chats</th>
                <th>Auto-apply rule</th>
                <th className="r" />
              </tr>
            </thead>
            <tbody>
              {labelsQ.isLoading ? (
                <tr>
                  <td colSpan={5}><span className="hint">Loading…</span></td>
                </tr>
              ) : labels.length ? (
                labels.map(l => (
                  <tr key={l.id}>
                    <td><span className={`chip ${l.color}`}>{l.name}</span></td>
                    <td>{l.meaning || '—'}</td>
                    <td className="r">{l.chatCount}</td>
                    <td>{l.autoRule || 'Manual'}</td>
                    <td className="r">
                      {isManager && (
                        <button className="btn sm" onClick={() => openForm(l)}>
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5}>
                    <div className="empty">
                      <b>No labels yet</b>
                      {isManager ? 'Create one with New label.' : 'Your manager has not created any labels.'}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
