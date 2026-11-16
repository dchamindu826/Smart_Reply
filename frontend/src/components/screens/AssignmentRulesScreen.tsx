'use client';

import React, { useState } from 'react';
import type { AssignmentRules, KeywordRule } from '@smart-reply/shared';
import { useApp } from '@/context/AppContext';
import { useLabels } from '@/features/labels';
import { useAssignmentRules, useDeleteKeywordRule, useKeywordRules, useSaveAssignmentRules, useSaveKeywordRule } from '@/features/team';
import SectionThemeToggle from '@/components/common/SectionThemeToggle';

const ALERT_MINUTES = [5, 10, 15, 30, 60];
const RING_SECONDS = [15, 20, 30, 45, 60];

function KeywordRuleForm({ initial, onDone }: { initial: KeywordRule | null; onDone: () => void }) {
  const { staff, quickReplies, addToast, reportError } = useApp();
  const labelsQ = useLabels();
  const save = useSaveKeywordRule();
  const remove = useDeleteKeywordRule();
  const [keywords, setKeywords] = useState((initial?.keywords ?? []).join(', '));
  const [labelId, setLabelId] = useState(initial?.labelId ?? '');
  const [assignUserId, setAssignUserId] = useState(initial?.assignUserId ?? '');
  const [quickReplyId, setQuickReplyId] = useState(initial?.quickReplyId ?? '');
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [confirm, setConfirm] = useState(false);
  const people = staff.filter(s => s.status !== 'invited');
  const replies = quickReplies.filter(q => q.id && q.scope !== 'only_me');

  const submit = async () => {
    const list = Array.from(new Set(keywords.split(',').map(k => k.trim()).filter(Boolean)));
    if (!list.length) {
      addToast('Add at least one word, separated by commas.');
      return;
    }
    if (list.some(k => k.length > 40) || list.length > 20) {
      addToast('Use up to 20 words of up to 40 letters each.');
      return;
    }
    if (!labelId && !assignUserId && !quickReplyId) {
      addToast('Choose what the rule does: a label, a person or a quick reply.');
      return;
    }
    try {
      await save.mutateAsync({
        id: initial?.id ?? null,
        input: { keywords: list, labelId: labelId || null, assignUserId: assignUserId || null, quickReplyId: quickReplyId || null, enabled }
      });
      addToast(initial ? 'Keyword rule saved.' : 'Keyword rule added.');
      onDone();
    } catch (err) {
      reportError(err);
    }
  };

  const del = async () => {
    if (!initial) return;
    try {
      await remove.mutateAsync(initial.id);
      addToast('Keyword rule deleted.');
      onDone();
    } catch (err) {
      reportError(err);
    }
  };

  return (
    <>
      <h2>{initial ? 'Edit keyword rule' : 'New keyword rule'}</h2>
      <p className="sub">When a customer’s message contains one of these words, Smart Reply does the actions below.</p>

      <label className="f" htmlFor="kwWords">If message contains</label>
      <input className="f-in" id="kwWords" value={keywords} placeholder="wardrobe, almirah" onChange={e => setKeywords(e.target.value)} />
      <div className="hint">Separate words with commas. Sinhala and Tamil words work too.</div>

      <label className="f" htmlFor="kwLabel">Add label</label>
      <select className="f-in" id="kwLabel" value={labelId} onChange={e => setLabelId(e.target.value)}>
        <option value="">No label</option>
        {(labelsQ.data ?? []).map(l => (
          <option key={l.id} value={l.id}>{l.name}</option>
        ))}
      </select>

      <div className="f-row f2">
        <div>
          <label className="f" htmlFor="kwUser">Assign to</label>
          <select className="f-in" id="kwUser" value={assignUserId} onChange={e => setAssignUserId(e.target.value)}>
            <option value="">Nobody</option>
            {people.map(s => (
              <option key={s.id} value={s.id}>{s.n}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="f" htmlFor="kwQr">Reply with</label>
          <select className="f-in" id="kwQr" value={quickReplyId} onChange={e => setQuickReplyId(e.target.value)}>
            <option value="">No reply</option>
            {replies.map(q => (
              <option key={q.id} value={q.id}>{q.cmd}</option>
            ))}
          </select>
        </div>
      </div>

      <label className="tgl" style={{ marginTop: '10px' }}>
        <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
        <span>Rule is on</span>
      </label>

      <button className="btn pri" style={{ width: '100%', justifyContent: 'center', marginTop: '14px' }} disabled={save.isPending} onClick={submit}>
        {save.isPending ? 'Saving…' : initial ? 'Save rule' : 'Add rule'}
      </button>
      {initial && (
        <button
          className="btn dgr"
          style={{ width: '100%', justifyContent: 'center', marginTop: '8px' }}
          disabled={remove.isPending}
          onClick={() => (confirm ? void del() : setConfirm(true))}
        >
          {confirm ? 'Yes, delete this rule' : 'Delete rule'}
        </button>
      )}
    </>
  );
}

export default function AssignmentRulesScreen() {
  const { role, staff, team, quickReplies, templates, callConfig, saveCallConfig, openSheet, closeSheet, addToast, reportError } = useApp();
  const isManager = role === 'manager';
  const rulesQ = useAssignmentRules(isManager);
  const kwQ = useKeywordRules(isManager);
  const labelsQ = useLabels();
  const saveRules = useSaveAssignmentRules();
  const [draft, setDraft] = useState<AssignmentRules | null>(null);
  const [ringsec, setRingsec] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const r = draft ?? rulesQ.data ?? null;
  const ring = ringsec ?? callConfig.ringsec;
  const set = (patch: Partial<AssignmentRules>) => r && setDraft({ ...r, ...patch });
  const approved = templates.filter(t => t.st === 'ok' && t.id);
  const missedTpl = templates.find(t => t.id === r?.missedCallTemplateId);
  const dirty = Boolean(draft) || (ringsec !== null && ringsec !== callConfig.ringsec);

  const save = async () => {
    if (!r) return;
    setSaving(true);
    try {
      if (draft) await saveRules.mutateAsync(draft);
      if (ringsec !== null && ringsec !== callConfig.ringsec) await saveCallConfig({ ...callConfig, ringsec });
      setDraft(null);
      setRingsec(null);
      addToast('Rules saved.');
    } catch (err) {
      reportError(err);
    } finally {
      setSaving(false);
    }
  };

  const openRule = (rule: KeywordRule | null) => openSheet(<KeywordRuleForm key={rule?.id ?? 'new'} initial={rule} onDone={closeSheet} />);

  const labelOf = (id: string | null) => (labelsQ.data ?? []).find(l => l.id === id);
  const personOf = (id: string | null) => team.find(s => s.id === id) ?? staff.find(s => s.id === id);
  const replyOf = (id: string | null) => quickReplies.find(q => q.id === id);

  const alertOptions = r && !ALERT_MINUTES.includes(r.unassignedAlertMinutes) ? [...ALERT_MINUTES, r.unassignedAlertMinutes].sort((a, b) => a - b) : ALERT_MINUTES;
  const ringOptions = !RING_SECONDS.includes(ring) ? [...RING_SECONDS, ring].sort((a, b) => a - b) : RING_SECONDS;
  const capOn = Boolean(r && r.maxOpenChats < 500);

  return (
    <>
      <div className="ph">
        <div>
          <h1>Assignment rules</h1>
          <p>How new chats and calls find a person.</p>
        </div>
        <div className="acts">
          <SectionThemeToggle />
          <button className="btn pri" disabled={!r || saving || !dirty} onClick={save}>
            {saving ? 'Saving…' : 'Save rules'}
          </button>
        </div>
      </div>

      {!r ? (
        <div className="card">
          <div className="card-b">
            <span className="hint">{rulesQ.isError ? 'Rules could not be loaded.' : 'Loading…'}</span>
          </div>
        </div>
      ) : (
        <div className="grid g2">
          <div className="card">
            <div className="card-h">
              <h2>New chats</h2>
            </div>
            <div className="card-b">
              <label className="tgl">
                <input
                  type="checkbox"
                  checked={r.autoAssign !== 'off'}
                  onChange={e => set({ autoAssign: e.target.checked ? 'round_robin' : 'off' })}
                />
                <span>Auto-assign {r.autoAssign === 'least_open' ? 'to the available staff member with the fewest open chats' : 'round-robin to available staff'}</span>
              </label>
              <label className="tgl">
                <input type="checkbox" checked={r.stickyOwner} onChange={e => set({ stickyOwner: e.target.checked })} />
                <span>Returning customer goes to their last staff member</span>
              </label>
              <label className="tgl">
                <input type="checkbox" checked={capOn} onChange={e => set({ maxOpenChats: e.target.checked ? 8 : 500 })} />
                <span>
                  Skip staff with more than{' '}
                  {capOn ? (
                    <input
                      className="f-in"
                      type="number"
                      min={1}
                      max={499}
                      aria-label="Most open chats"
                      style={{ width: '64px', display: 'inline-block', padding: '2px 6px' }}
                      value={r.maxOpenChats}
                      onChange={e => set({ maxOpenChats: Math.max(1, Math.min(499, Number(e.target.value) || 1)) })}
                    />
                  ) : (
                    8
                  )}{' '}
                  open chats
                </span>
              </label>
              <label className="f">Unassigned alert after</label>
              <select className="f-in" value={r.unassignedAlertMinutes} onChange={e => set({ unassignedAlertMinutes: Number(e.target.value) })}>
                {alertOptions.map(m => (
                  <option key={m} value={m}>{m} minutes</option>
                ))}
              </select>
            </div>
          </div>

          <div className="card">
            <div className="card-h">
              <h2>Incoming calls</h2>
            </div>
            <div className="card-b">
              <label className="tgl">
                <input type="checkbox" checked={r.skipOnBreak} onChange={e => set({ skipOnBreak: e.target.checked })} />
                <span>Ring free staff first; skip anyone on a call or on a break</span>
              </label>
              <label className="tgl">
                <input type="checkbox" checked={r.callRingOwnerFirst} onChange={e => set({ callRingOwnerFirst: e.target.checked })} />
                <span>Ring the assigned staff member first for known customers</span>
              </label>
              <label className="tgl">
                <input
                  type="checkbox"
                  checked={Boolean(r.missedCallTemplateId)}
                  disabled={!approved.length}
                  onChange={e => set({ missedCallTemplateId: e.target.checked ? (approved.find(t => /missed/i.test(t.n))?.id ?? approved[0]?.id ?? null) : null })}
                />
                <span>Missed call: send the {missedTpl?.n ?? 'missed-call'} template</span>
                {!approved.length && <small>No approved templates</small>}
              </label>
              {r.missedCallTemplateId && (
                <select className="f-in" aria-label="Missed-call template" value={r.missedCallTemplateId} onChange={e => set({ missedCallTemplateId: e.target.value || null })}>
                  {approved.map(t => (
                    <option key={t.id} value={t.id}>{t.n} · {t.lang}</option>
                  ))}
                </select>
              )}
              <label className="f">Ring for</label>
              <select className="f-in" value={ring} onChange={e => setRingsec(Number(e.target.value))}>
                {ringOptions.map(sec => (
                  <option key={sec} value={sec}>{sec === 30 ? '30 seconds, then next person' : `${sec} seconds`}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-h">
          <h2>Keyword rules</h2>
          <span className="sp" />
          {isManager && (
            <button className="btn sm" onClick={() => openRule(null)}>
              Add rule
            </button>
          )}
        </div>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>If message contains</th>
                <th>Then</th>
                <th className="r">Matched this month</th>
                <th className="r" />
              </tr>
            </thead>
            <tbody>
              {kwQ.isLoading ? (
                <tr>
                  <td colSpan={4}><span className="hint">Loading…</span></td>
                </tr>
              ) : (kwQ.data ?? []).length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <div className="empty">
                      <b>No keyword rules yet</b>
                      Add a rule to label, assign or answer chats by the words in them.
                    </div>
                  </td>
                </tr>
              ) : (
                (kwQ.data ?? []).map(k => {
                  const l = labelOf(k.labelId);
                  const p = personOf(k.assignUserId);
                  const q = replyOf(k.quickReplyId);
                  const parts: React.ReactNode[] = [];
                  if (l) parts.push(<React.Fragment key="l">Label <span className={`chip ${l.color}`}>{l.name}</span></React.Fragment>);
                  if (p) parts.push(<React.Fragment key="p">{parts.length ? 'assign' : 'Assign'} {p.n.split(' ')[0]}</React.Fragment>);
                  if (q) parts.push(<React.Fragment key="q">{parts.length ? 'reply with' : 'Reply with'} {q.cmd}</React.Fragment>);
                  return (
                    <tr key={k.id} style={k.enabled ? undefined : { opacity: 0.6 }}>
                      <td>
                        {k.keywords.map(w => (
                          <React.Fragment key={w}>
                            <code className="cmd">{w}</code>{' '}
                          </React.Fragment>
                        ))}
                        {!k.enabled && <span className="chip">Off</span>}
                      </td>
                      <td>
                        {parts.length
                          ? parts.map((x, i) => (
                              <React.Fragment key={i}>
                                {i > 0 && ' · '}
                                {x}
                              </React.Fragment>
                            ))
                          : '—'}
                      </td>
                      <td className="r">{k.matchCount}</td>
                      <td className="r">
                        <button className="btn sm" onClick={() => openRule(k)}>
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
