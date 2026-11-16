'use client';

import React, { useMemo, useState } from 'react';
import type { CreateTemplateInput, Template as ApiTemplate, TemplateButton } from '@smart-reply/shared';
import { createTemplateSchema, fillTemplate } from '@smart-reply/shared';
import { useApp } from '@/context/AppContext';
import { useSession } from '@/features/session';
import { useCreateTemplate, useDeleteTemplate, useResubmitTemplate, useSyncTemplates, useTemplates } from '@/features/content';
import { toTemplate } from '@/lib/adapters';
import { errorMessage } from '@/lib/api';
import SectionThemeToggle from '@/components/common/SectionThemeToggle';

const LANGUAGES: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'si', label: 'Sinhala' },
  { code: 'ta', label: 'Tamil' },
  { code: 'en_US', label: 'English (US)' },
  { code: 'en_GB', label: 'English (UK)' }
];

export default function TemplatesScreen() {
  const { role, openSheet, closeSheet, addToast, reportError } = useApp();
  const { me } = useSession();
  const isStaff = role === 'staff';
  const canCreate = !isStaff || Boolean(me?.permissions.createTemplates);

  const templatesQ = useTemplates();
  const sync = useSyncTemplates();
  const resubmit = useResubmitTemplate();
  const apiTemplates = useMemo(() => templatesQ.data ?? [], [templatesQ.data]);
  const templates = useMemo(() => apiTemplates.map(t => ({ api: t, view: toTemplate(t) })), [apiTemplates]);

  const [filter, setFilter] = useState('all');

  const filteredTemplates = templates.filter(t => {
    if (filter === 'all') return true;
    return t.view.st === filter;
  });

  const handleOpenNewTemplateSheet = () => {
    openSheet(
      <TemplateCreator
        onSaved={tpl => {
          addToast(`Template “${tpl.name}” submitted to Meta for review.`);
          closeSheet();
        }}
      />
    );
  };

  const handleOpenDetails = (tpl: ApiTemplate) => {
    openSheet(<TemplateDetails template={tpl} canManage={canCreate} onDone={closeSheet} />);
  };

  const handleResubmit = (tpl: ApiTemplate) => {
    resubmit.mutate(tpl.id, {
      onSuccess: () => addToast('Resubmitted to Meta for review.'),
      onError: reportError
    });
  };

  const handleSync = () => {
    sync.mutate(undefined, {
      onSuccess: r => addToast(r.updated ? `Synced from Meta · ${r.updated} template(s) updated.` : 'Synced from Meta · everything is up to date.'),
      onError: reportError
    });
  };

  return (
    <>
      <div className="ph">
        <div>
          <h1>Message templates</h1>
          <p>
            Needed to message a customer after the 24-hour window closes. Meta reviews each template, usually within minutes.
          </p>
        </div>
        <div className="acts">
          <SectionThemeToggle />
          {!isStaff && (
            <button className="btn" onClick={handleSync} disabled={sync.isPending}>
              {sync.isPending ? 'Syncing…' : '↻ Sync from Meta'}
            </button>
          )}
          {canCreate && (
            <button className="btn pri" onClick={handleOpenNewTemplateSheet}>
              New template
            </button>
          )}
        </div>
      </div>

      {me && !me.features.whatsappConnected && (
        <div className="note w">
          <span className="ic">⚠</span>
          <div>
            <b>WhatsApp is not connected yet</b>
            New templates go to Meta for review, so they can be submitted once LUMI AI connects your number.
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-h">
          <div className="seg">
            {[
              { id: 'all', label: `All ${templates.length}` },
              { id: 'ok', label: 'Approved' },
              { id: 'w', label: 'In review' },
              { id: 'b', label: 'Rejected' }
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
        </div>

        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Language</th>
                <th>Body</th>
                <th>Status</th>
                <th>Quality</th>
                <th className="r">Sent</th>
                <th className="r" />
              </tr>
            </thead>
            <tbody>
              {templatesQ.isLoading && (
                <tr>
                  <td colSpan={8}><span className="hint" style={{ margin: 0 }}>Loading…</span></td>
                </tr>
              )}
              {templatesQ.isError && (
                <tr>
                  <td colSpan={8}><span className="hint" style={{ margin: 0, color: 'var(--bad)' }}>{errorMessage(templatesQ.error)}</span></td>
                </tr>
              )}
              {!templatesQ.isLoading && !templatesQ.isError && filteredTemplates.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <span className="hint" style={{ margin: 0 }}>
                      {templates.length === 0 ? 'No templates yet. Create one, or sync from Meta.' : 'No templates with this status.'}
                    </span>
                  </td>
                </tr>
              )}
              {filteredTemplates.map(({ api: a, view: t }) => (
                <tr key={a.id}>
                  <td><b>{t.n}</b></td>
                  <td>{t.cat}</td>
                  <td>{t.lang}</td>
                  <td style={{ maxWidth: '320px', fontSize: '12.5px', color: 'var(--ink-2)' }}>
                    {t.body}
                    {t.why && (
                      <div style={{ color: 'var(--bad)', marginTop: '3px' }}>
                        Meta: {t.why}
                      </div>
                    )}
                  </td>
                  <td><span className={`chip ${t.st}`}>{t.stt}</span></td>
                  <td>{t.q}</td>
                  <td className="r">{t.used}</td>
                  <td className="r" style={{ whiteSpace: 'nowrap' }}>
                    {canCreate && (a.status === 'rejected' || a.status === 'paused') ? (
                      <button
                        className="btn sm pri"
                        disabled={resubmit.isPending && resubmit.variables === a.id}
                        onClick={() => handleResubmit(a)}
                      >
                        Fix &amp; resubmit
                      </button>
                    ) : null}{' '}
                    <button className="btn sm" onClick={() => handleOpenDetails(a)}>
                      {canCreate ? 'Edit' : 'View'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="note i">
        <span className="ic">◈</span>
        <div>
          <b>Categories decide the price</b>
          Utility (order updates, reminders) costs less than Marketing (offers). Authentication is for login codes. Replies inside the 24-hour window are free.
        </div>
      </div>
    </>
  );
}

/* ───────── Template details (view, resubmit, delete) ───────── */

function TemplateDetails({ template: t, canManage, onDone }: { template: ApiTemplate; canManage: boolean; onDone: () => void }) {
  const { addToast, reportError, openSheet, closeSheet } = useApp();
  const del = useDeleteTemplate();
  const resubmit = useResubmitTemplate();
  const view = toTemplate(t);
  const samples = Array.from({ length: t.variableCount }, (_, i) => `{{${i + 1}}}`);

  return (
    <>
      <h2>{t.name}</h2>
      <p className="sub">
        {view.cat} · {view.lang} · <span className={`chip ${view.st}`}>{view.stt}</span>
        {t.status === 'approved' && <> · Quality {view.q}</>}
      </p>

      {t.rejectionReason && (
        <div className="note w" style={{ marginTop: 0 }}>
          <span className="ic">⚠</span>
          <div>
            <b>Meta rejected this template</b>
            {t.rejectionReason}
          </div>
        </div>
      )}

      <label className="f">Preview</label>
      <TemplatePreview header={t.headerText ?? ''} body={fillTemplate(t.body, samples)} footer={t.footer ?? ''} buttons={t.buttons} />

      <p className="hint">
        Meta does not allow changing an approved template’s text. To change it, create a new template and delete this one.
        Sent {t.usedCount} time(s).
      </p>

      {canManage && (
        <div style={{ display: 'flex', gap: '8px', marginTop: '14px', flexWrap: 'wrap' }}>
          <button
            className="btn"
            onClick={() =>
              openSheet(
                <TemplateCreator
                  initial={t}
                  onSaved={tpl => {
                    addToast(`Template “${tpl.name}” submitted to Meta for review.`);
                    closeSheet();
                  }}
                />
              )
            }
          >
            Copy as new template
          </button>
          {(t.status === 'rejected' || t.status === 'paused') && (
            <button
              className="btn pri"
              disabled={resubmit.isPending}
              onClick={() =>
                resubmit.mutate(t.id, {
                  onSuccess: () => {
                    addToast('Resubmitted to Meta for review.');
                    onDone();
                  },
                  onError: reportError
                })
              }
            >
              Resubmit to Meta
            </button>
          )}
          <span className="sp" style={{ flex: 1 }} />
          <button
            className="btn dgr"
            disabled={del.isPending}
            onClick={() => {
              if (!window.confirm(`Delete template “${t.name}”? It is also deleted on Meta.`)) return;
              del.mutate(t.id, {
                onSuccess: () => {
                  addToast(`Template “${t.name}” deleted.`);
                  onDone();
                },
                onError: reportError
              });
            }}
          >
            {del.isPending ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      )}
    </>
  );
}

function TemplatePreview({ header, body, footer, buttons }: { header: string; body: string; footer: string; buttons: TemplateButton[] }) {
  return (
    <div className="tpv">
      <div className="bb out" style={{ maxWidth: '100%' }}>
        {header && <b style={{ display: 'block', marginBottom: '4px' }}>{header}</b>}
        <span style={{ whiteSpace: 'pre-wrap' }}>{body}</span>
        {footer && <small style={{ display: 'block', marginTop: '4px', color: 'var(--ink-3)' }}>{footer}</small>}
        {buttons.length > 0 && (
          <div className="bt">
            {buttons.map((b, i) => (
              <span key={i}>
                {b.type === 'URL' ? '↗ ' : b.type === 'PHONE_NUMBER' ? '☏ ' : ''}
                {b.text}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────── New template ───────── */

interface ButtonDraft {
  type: TemplateButton['type'];
  text: string;
  value: string;
}

function variableNumbers(body: string): number[] {
  const found = new Set<number>();
  for (const m of body.matchAll(/\{\{(\d+)\}\}/g)) found.add(Number(m[1]));
  return [...found].sort((a, b) => a - b);
}

function TemplateCreator({ initial, onSaved }: { initial?: ApiTemplate; onSaved: (tpl: ApiTemplate) => void }) {
  const create = useCreateTemplate();
  const [name, setName] = useState(initial ? `${initial.name}_v2` : '');
  const [cat, setCat] = useState<CreateTemplateInput['category']>(initial?.category ?? 'utility');
  const [lang, setLang] = useState(initial?.language ?? 'en');
  const [header, setHeader] = useState(initial?.headerText ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [footer, setFooter] = useState(initial?.footer ?? '');
  const [samples, setSamples] = useState<string[]>([]);
  const [buttons, setButtons] = useState<ButtonDraft[]>(
    (initial?.buttons ?? []).map(b => ({ type: b.type, text: b.text, value: b.url ?? b.phoneNumber ?? '' }))
  );
  const [error, setError] = useState<string | null>(null);

  const vars = variableNumbers(body);
  const varCount = vars.length;
  const sequential = vars.every((n, i) => n === i + 1);

  const apiButtons: TemplateButton[] = buttons.map(b =>
    b.type === 'URL'
      ? { type: 'URL', text: b.text.trim(), url: b.value.trim() }
      : b.type === 'PHONE_NUMBER'
        ? { type: 'PHONE_NUMBER', text: b.text.trim(), phoneNumber: b.value.trim() }
        : { type: 'QUICK_REPLY', text: b.text.trim() }
  );

  const setSample = (i: number, v: string) =>
    setSamples(prev => {
      const next = [...prev];
      next[i] = v;
      return next;
    });

  const updateButton = (i: number, patch: Partial<ButtonDraft>) => setButtons(prev => prev.map((b, j) => (j === i ? { ...b, ...patch } : b)));

  const handleSubmit = () => {
    setError(null);
    if (!sequential) {
      setError('Number the variables in order: {{1}}, {{2}}, {{3}} …');
      return;
    }
    const examples = Array.from({ length: varCount }, (_, i) => (samples[i] ?? '').trim());
    if (examples.some(s => !s)) {
      setError('Meta needs a sample value for every variable.');
      return;
    }
    const parsed = createTemplateSchema.safeParse({
      name: name.trim(),
      category: cat,
      language: lang,
      headerText: header.trim() || null,
      body: body.trim(),
      footer: footer.trim() || null,
      buttons: apiButtons,
      examples
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setError(`${issue.path.join(' ') || 'Template'}: ${issue.message}`);
      return;
    }
    create.mutate(parsed.data, {
      onSuccess: tpl => onSaved(tpl),
      onError: err => setError(errorMessage(err))
    });
  };

  return (
    <>
      <h2>New template</h2>
      <p className="sub">Goes to Meta for review before it can be sent.</p>

      <label className="f" htmlFor="tName">Name</label>
      <input
        className="f-in"
        id="tName"
        value={name}
        placeholder="site_visit_confirm"
        onChange={e => setName(e.target.value.toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, ''))}
      />
      <p className="hint">Lower-case letters, numbers and underscores only.</p>

      <div className="f-row f2">
        <div>
          <label className="f">Category</label>
          <select className="f-in" value={cat} onChange={e => setCat(e.target.value as CreateTemplateInput['category'])}>
            <option value="utility">Utility</option>
            <option value="marketing">Marketing</option>
            <option value="authentication">Authentication</option>
          </select>
        </div>
        <div>
          <label className="f">Language</label>
          <select className="f-in" value={lang} onChange={e => setLang(e.target.value)}>
            {LANGUAGES.map(l => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
        </div>
      </div>

      <label className="f" htmlFor="tHead">Header (optional)</label>
      <input className="f-in" id="tHead" maxLength={60} value={header} onChange={e => setHeader(e.target.value)} />

      <label className="f" htmlFor="tBody">Body</label>
      <textarea
        className="f-in"
        id="tBody"
        rows={4}
        maxLength={1024}
        placeholder="Hi {{1}}, our team will visit {{2}} on {{3}} to take measurements."
        value={body}
        onChange={e => setBody(e.target.value)}
      />
      <p className="hint">{"{{1}}, {{2}} … are filled in when you send."}</p>

      {varCount > 0 && (
        <>
          <label className="f">Sample values (for Meta’s review)</label>
          <div className="f-row f2">
            {Array.from({ length: varCount }, (_, i) => (
              <div key={i}>
                <input
                  className="f-in"
                  placeholder={`{{${i + 1}}}`}
                  aria-label={`Sample for {{${i + 1}}}`}
                  value={samples[i] ?? ''}
                  onChange={e => setSample(i, e.target.value)}
                />
              </div>
            ))}
          </div>
        </>
      )}

      <label className="f" htmlFor="tFoot">Footer (optional)</label>
      <input className="f-in" id="tFoot" maxLength={60} value={footer} onChange={e => setFooter(e.target.value)} />

      <label className="f">Buttons</label>
      {buttons.map((b, i) => (
        <div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
          <select
            className="f-in"
            style={{ width: '130px', flex: 'none' }}
            value={b.type}
            onChange={e => updateButton(i, { type: e.target.value as TemplateButton['type'] })}
          >
            <option value="QUICK_REPLY">Quick reply</option>
            <option value="URL">Website</option>
            <option value="PHONE_NUMBER">Call phone</option>
          </select>
          <input className="f-in" placeholder="Button text" maxLength={25} value={b.text} onChange={e => updateButton(i, { text: e.target.value })} />
          {b.type !== 'QUICK_REPLY' && (
            <input
              className="f-in"
              placeholder={b.type === 'URL' ? 'https://…' : '+94 77 123 4567'}
              value={b.value}
              onChange={e => updateButton(i, { value: e.target.value })}
            />
          )}
          <button type="button" className="btn sm" aria-label="Remove button" onClick={() => setButtons(prev => prev.filter((_, j) => j !== i))}>
            ×
          </button>
        </div>
      ))}
      {buttons.length < 10 && (
        <button type="button" className="btn sm" onClick={() => setButtons(prev => [...prev, { type: 'QUICK_REPLY', text: '', value: '' }])}>
          + Add button
        </button>
      )}

      <label className="f">Preview</label>
      <TemplatePreview
        header={header}
        body={fillTemplate(body || 'Your message', samples.map((s, i) => s || `{{${i + 1}}}`))}
        footer={footer}
        buttons={apiButtons.filter(b => b.text)}
      />

      {error && (
        <div className="note w" style={{ marginTop: '12px' }}>
          <span className="ic">⚠</span>
          <div>
            <b>Not submitted</b>
            {error}
          </div>
        </div>
      )}

      <button
        className="btn pri"
        style={{ width: '100%', justifyContent: 'center', marginTop: '14px' }}
        disabled={create.isPending}
        onClick={handleSubmit}
      >
        {create.isPending ? 'Submitting…' : 'Submit for review'}
      </button>
    </>
  );
}
