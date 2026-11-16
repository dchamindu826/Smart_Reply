'use client';

import React, { useMemo, useState } from 'react';
import type { Broadcast } from '@smart-reply/shared';
import { fillTemplate } from '@smart-reply/shared';
import { useApp } from '@/context/AppContext';
import { useLabels } from '@/features/labels';
import {
  useAudiencePreview,
  useBroadcasts,
  useCancelBroadcast,
  useCreateBroadcast,
  useSendBroadcast,
  useTemplates
} from '@/features/content';
import { errorMessage } from '@/lib/api';
import SectionThemeToggle from '@/components/common/SectionThemeToggle';

function statusChip(b: Broadcast): { cls: string; text: string } {
  switch (b.status) {
    case 'draft':
      return { cls: '', text: 'Draft' };
    case 'scheduled':
      return { cls: 'i', text: b.scheduledAt ? `Scheduled · ${new Date(b.scheduledAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}` : 'Scheduled' };
    case 'sending':
      return { cls: 'w', text: `Sending ${b.sent + b.failed}/${b.audience}` };
    case 'done':
      return { cls: 'ok', text: b.failed ? `Done · ${b.failed} failed` : 'Done' };
    case 'failed':
      return { cls: 'b', text: 'Failed' };
    case 'cancelled':
      return { cls: '', text: 'Cancelled' };
  }
}

export default function BroadcastsScreen() {
  const { role, openSheet, closeSheet, addToast, reportError } = useApp();
  const isManager = role === 'manager';
  const broadcastsQ = useBroadcasts(isManager);
  const labelsQ = useLabels();
  const send = useSendBroadcast();
  const cancel = useCancelBroadcast();
  const broadcasts = broadcastsQ.data ?? [];
  const labelColor = useMemo(() => new Map((labelsQ.data ?? []).map(l => [l.id, l.color])), [labelsQ.data]);

  const handleSend = (b: Broadcast) => {
    if (!window.confirm(`Send “${b.name}” to ${b.audience} customer(s) now?`)) return;
    send.mutate(b.id, {
      onSuccess: r => addToast(r.status === 'scheduled' ? `“${b.name}” scheduled.` : `“${b.name}” is sending.`),
      onError: reportError
    });
  };

  const handleCancel = (b: Broadcast) => {
    if (!window.confirm(`Cancel “${b.name}”? Messages not sent yet will not go out.`)) return;
    cancel.mutate(b.id, { onSuccess: () => addToast(`“${b.name}” cancelled.`), onError: reportError });
  };

  return (
    <>
      <div className="ph">
        <div>
          <h1>Broadcasts</h1>
          <p>
            Send an approved marketing template to a labelled group. Only customers who opted in receive it.
          </p>
        </div>
        <div className="acts">
          <SectionThemeToggle />
          {isManager && (
            <button className="btn pri" onClick={() => openSheet(<BroadcastCreator onDone={closeSheet} />)}>
              New broadcast
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Audience</th>
                <th>Template</th>
                <th className="r">Sent</th>
                <th className="r">Read</th>
                <th className="r">Replied</th>
                <th>Status</th>
                <th className="r" />
              </tr>
            </thead>
            <tbody>
              {!isManager && (
                <tr>
                  <td colSpan={8}><span className="hint" style={{ margin: 0 }}>Only managers can see and send broadcasts.</span></td>
                </tr>
              )}
              {isManager && broadcastsQ.isLoading && (
                <tr>
                  <td colSpan={8}><span className="hint" style={{ margin: 0 }}>Loading…</span></td>
                </tr>
              )}
              {isManager && broadcastsQ.isError && (
                <tr>
                  <td colSpan={8}><span className="hint" style={{ margin: 0, color: 'var(--bad)' }}>{errorMessage(broadcastsQ.error)}</span></td>
                </tr>
              )}
              {isManager && broadcastsQ.isSuccess && broadcasts.length === 0 && (
                <tr>
                  <td colSpan={8}><span className="hint" style={{ margin: 0 }}>No broadcasts yet. Pick a label and an approved template to start one.</span></td>
                </tr>
              )}
              {broadcasts.map(b => {
                const chip = statusChip(b);
                const started = b.status === 'sending' || b.status === 'done' || b.status === 'failed' || (b.status === 'cancelled' && b.sent > 0);
                return (
                  <tr key={b.id}>
                    <td><b>{b.name}</b></td>
                    <td>
                      <span className={`chip ${b.labelId ? (labelColor.get(b.labelId) ?? '') : 'ok'}`}>{b.labelName || 'Deleted label'}</span> {b.audience} {b.audience === 1 ? 'person' : 'people'}
                    </td>
                    <td>{b.templateName}</td>
                    <td className="r">{started ? b.sent : '—'}</td>
                    <td className="r">{started ? b.read : '—'}</td>
                    <td className="r">{started ? b.replied : '—'}</td>
                    <td><span className={`chip ${chip.cls}`}>{chip.text}</span></td>
                    <td className="r" style={{ whiteSpace: 'nowrap' }}>
                      {(b.status === 'draft' || b.status === 'scheduled') && (
                        <button className="btn sm pri" disabled={send.isPending && send.variables === b.id} onClick={() => handleSend(b)}>
                          {b.status === 'scheduled' ? 'Send now' : 'Send'}
                        </button>
                      )}{' '}
                      {(b.status === 'draft' || b.status === 'scheduled' || b.status === 'sending') && (
                        <button className="btn sm" disabled={cancel.isPending && cancel.variables === b.id} onClick={() => handleCancel(b)}>
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="note w">
        <span className="ic">⚠</span>
        <div>
          <b>Keep broadcasts relevant</b>
          If many people block or report the number, Meta lowers the quality rating and the daily messaging limit.
        </div>
      </div>
    </>
  );
}

/* ───────── New broadcast ───────── */

function localInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isFuture(d: Date): boolean {
  return d.getTime() > Date.now();
}

function BroadcastCreator({ onDone }: { onDone: () => void }) {
  const { addToast } = useApp();
  const labelsQ = useLabels();
  const templatesQ = useTemplates();
  const create = useCreateBroadcast();
  const send = useSendBroadcast();

  const usable = (templatesQ.data ?? []).filter(t => t.status === 'approved' && (t.category === 'marketing' || t.category === 'utility'));
  const [name, setName] = useState('');
  const [labelId, setLabelId] = useState<string>('');
  const [templateId, setTemplateId] = useState<string>('');
  const [variables, setVariables] = useState<string[]>([]);
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const [at, setAt] = useState(() => localInputValue(new Date(Date.now() + 60 * 60 * 1000)));
  const [error, setError] = useState<string | null>(null);

  const tpl = usable.find(t => t.id === templateId) ?? null;
  const audience = useAudiencePreview(labelId || null);
  const busy = create.isPending || send.isPending;

  const setVar = (i: number, v: string) =>
    setVariables(prev => {
      const next = [...prev];
      next[i] = v;
      return next;
    });

  const handleSubmit = async () => {
    setError(null);
    if (!name.trim()) return setError('Give the broadcast a name.');
    if (!tpl) return setError('Pick an approved template.');
    const vars = Array.from({ length: tpl.variableCount }, (_, i) => (variables[i] ?? '').trim());
    if (vars.some(v => !v)) return setError(`Template “${tpl.name}” needs ${tpl.variableCount} variable(s).`);
    let scheduledAt: string | null = null;
    if (when === 'later') {
      const d = new Date(at);
      if (Number.isNaN(d.getTime()) || !isFuture(d)) return setError('Pick a time in the future, or send now.');
      scheduledAt = d.toISOString();
    }
    try {
      const b = await create.mutateAsync({ name: name.trim(), labelId: labelId || null, templateId: tpl.id, variables: vars, scheduledAt });
      if (when === 'later') {
        addToast(`“${b.name}” scheduled for ${new Date(at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}.`);
        onDone();
        return;
      }
      try {
        await send.mutateAsync(b.id);
        addToast(`“${b.name}” is sending to ${b.audience} customer(s).`);
        onDone();
      } catch (err) {
        addToast(`Saved “${b.name}” as a draft. ${errorMessage(err)}`);
        onDone();
      }
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <>
      <h2>New broadcast</h2>
      <p className="sub">Goes to customers who opted in to marketing messages.</p>

      <label className="f" htmlFor="bName">Campaign name</label>
      <input className="f-in" id="bName" maxLength={120} value={name} placeholder="Avurudu vanity offer" onChange={e => setName(e.target.value)} />

      <label className="f" htmlFor="bAud">Audience</label>
      <select className="f-in" id="bAud" value={labelId} onChange={e => setLabelId(e.target.value)}>
        <option value="">All opted-in customers</option>
        {(labelsQ.data ?? []).map(l => (
          <option key={l.id} value={l.id}>Label · {l.name}</option>
        ))}
      </select>
      <p className="hint">
        {audience.isLoading
          ? 'Counting customers…'
          : audience.isError
            ? errorMessage(audience.error)
            : `${audience.data?.count ?? 0}${audience.data?.more ? '+' : ''} opted-in customer(s) will receive it.`}
      </p>

      <label className="f" htmlFor="bTpl">Template</label>
      <select
        className="f-in"
        id="bTpl"
        value={templateId}
        onChange={e => {
          setTemplateId(e.target.value);
          setVariables([]);
        }}
      >
        <option value="">{templatesQ.isLoading ? 'Loading…' : usable.length ? 'Pick an approved template' : 'No approved marketing or utility templates'}</option>
        {usable.map(t => (
          <option key={t.id} value={t.id}>
            {t.name} · {t.category} · {t.language}
          </option>
        ))}
      </select>

      {tpl && tpl.variableCount > 0 && (
        <>
          <label className="f">Variables</label>
          <div className="f-row f2">
            {Array.from({ length: tpl.variableCount }, (_, i) => (
              <div key={i}>
                <input className="f-in" placeholder={`{{${i + 1}}}`} aria-label={`Value for {{${i + 1}}}`} value={variables[i] ?? ''} onChange={e => setVar(i, e.target.value)} />
              </div>
            ))}
          </div>
          <p className="hint">Every customer gets the same values.</p>
        </>
      )}

      {tpl && (
        <>
          <label className="f">Preview</label>
          <div className="tpv">
            <div className="bb out" style={{ maxWidth: '100%' }}>
              {tpl.headerText && <b style={{ display: 'block', marginBottom: '4px' }}>{tpl.headerText}</b>}
              {fillTemplate(tpl.body, Array.from({ length: tpl.variableCount }, (_, i) => variables[i] || `{{${i + 1}}}`))}
              {tpl.buttons.length > 0 && (
                <div className="bt">
                  {tpl.buttons.map((b, i) => (
                    <span key={i}>{b.text}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <label className="f">When</label>
      <div className="seg">
        <button type="button" className={when === 'now' ? 'active' : ''} aria-pressed={when === 'now'} onClick={() => setWhen('now')}>
          Send now
        </button>
        <button type="button" className={when === 'later' ? 'active' : ''} aria-pressed={when === 'later'} onClick={() => setWhen('later')}>
          Schedule
        </button>
      </div>
      {when === 'later' && (
        <input className="f-in" type="datetime-local" style={{ marginTop: '8px' }} value={at} onChange={e => setAt(e.target.value)} />
      )}

      {error && (
        <div className="note w" style={{ marginTop: '12px' }}>
          <span className="ic">⚠</span>
          <div>
            <b>Not sent</b>
            {error}
          </div>
        </div>
      )}

      <button className="btn pri" style={{ width: '100%', justifyContent: 'center', marginTop: '14px' }} disabled={busy} onClick={() => void handleSubmit()}>
        {busy ? 'Working…' : when === 'now' ? 'Send broadcast' : 'Schedule broadcast'}
      </button>
    </>
  );
}
