'use client';

import React, { useRef, useState } from 'react';
import type { AdminCompany, AiAddon, AiBotLog, AiBotSettings, AiSimulateResponse } from '@smart-reply/shared';
import { uploadFile } from '@/lib/upload';
import {
  SimulateTurn,
  useAddExample,
  useAddKnowledge,
  useAddonPlans,
  useAiCompanies,
  useCompanyAiLogs,
  useCompanyAiSettings,
  useExampleFromLog,
  useExamples,
  useKnowledge,
  useRemoveExample,
  useRemoveKnowledge,
  useSaveCompanyAiSettings,
  useSetAddon,
  useSimulate
} from '@/features/admin';
import { useAdmin } from './AdminContext';
import { AiChip, Loading, QueryState, fmtDate, fmtDateTime, fromDateInput, money, num, toDateInput } from './ui';

/* ───────── Add-on ───────── */

function AddonCard({ companyId, addon }: { companyId: string; addon: AiAddon }) {
  const { toast, reportError } = useAdmin();
  const plans = useAddonPlans();
  const save = useSetAddon(companyId);
  const [f, setF] = useState({
    status: addon.status,
    planId: addon.planId ?? '',
    limit: String(addon.monthlyReplyLimit),
    until: toDateInput(addon.activeUntil)
  });

  const pickPlan = (planId: string) => {
    const p = plans.data?.find(x => x.id === planId);
    setF({ ...f, planId, limit: p ? String(p.monthlyReplyLimit) : f.limit });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const limit = Number(f.limit);
    if (!Number.isInteger(limit) || limit < 0) {
      toast('Monthly reply limit must be a whole number.');
      return;
    }
    save.mutate(
      { status: f.status, planId: f.planId || null, monthlyReplyLimit: limit, activeUntil: fromDateInput(f.until) },
      { onSuccess: a => toast(`AI add-on is now ${a.status}.`), onError: reportError }
    );
  };

  return (
    <form className="card" onSubmit={submit}>
      <div className="card-h">
        <h2>AI add-on</h2>
        <AiChip status={addon.status} />
        {addon.requestedAt && addon.status !== 'active' ? <span className="chip w">Requested {fmtDate(addon.requestedAt)}</span> : null}
        <span className="sp" />
        <button className="btn sm pri" type="submit" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save add-on'}
        </button>
      </div>
      <div className="card-b">
        {addon.requestedAt && addon.status !== 'active' ? (
          <div className="note i">
            <span className="ic">i</span>
            <div>
              <b>Activation requested</b>
              {addon.requestedByName ?? 'The manager'} asked for the AI bot on {fmtDateTime(addon.requestedAt)}. Choose a plan and set the status to active.
            </div>
          </div>
        ) : null}
        <div className="f-row f2">
          <div>
            <label className="f" htmlFor="ad-status" style={{ marginTop: 0 }}>Status</label>
            <select className="f-in" id="ad-status" value={f.status} onChange={e => setF({ ...f, status: e.target.value as AiAddon['status'] })}>
              <option value="off">Off</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="expired">Expired</option>
            </select>
          </div>
          <div>
            <label className="f" htmlFor="ad-plan" style={{ marginTop: 0 }}>Plan</label>
            <select className="f-in" id="ad-plan" value={f.planId} onChange={e => pickPlan(e.target.value)}>
              <option value="">No plan</option>
              {plans.data?.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} · {money(p.price)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="f-row f2">
          <div>
            <label className="f" htmlFor="ad-limit">Monthly reply limit</label>
            <input className="f-in" id="ad-limit" type="number" min={0} value={f.limit} onChange={e => setF({ ...f, limit: e.target.value })} />
          </div>
          <div>
            <label className="f" htmlFor="ad-until">Active until</label>
            <input className="f-in" id="ad-until" type="date" value={f.until} onChange={e => setF({ ...f, until: e.target.value })} />
          </div>
        </div>
        <div className="ln" style={{ marginTop: 10 }}>
          <span>This month</span>
          <b>
            {num(addon.repliesThisMonth)} / {num(addon.monthlyReplyLimit)} replies · {num(addon.tokensThisMonth)} tokens · {money(addon.costThisMonth)}
          </b>
        </div>
        <div className="ln">
          <span>Activated</span>
          <b>{fmtDate(addon.activatedAt)}</b>
        </div>
      </div>
    </form>
  );
}

/* ───────── Settings ───────── */

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="tgl">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function SettingsCard({ companyId, initial }: { companyId: string; initial: AiBotSettings }) {
  const { toast, reportError } = useAdmin();
  const save = useSaveCompanyAiSettings(companyId);
  const [s, setS] = useState<AiBotSettings>(initial);
  const set = <K extends keyof AiBotSettings>(k: K, v: AiBotSettings[K]) => setS(prev => ({ ...prev, [k]: v }));
  const text = (k: { [K in keyof AiBotSettings]: AiBotSettings[K] extends string ? K : never }[keyof AiBotSettings]) => ({
    value: s[k] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k, e.target.value)
  });

  return (
    <form
      className="card"
      onSubmit={e => {
        e.preventDefault();
        save.mutate(s, { onSuccess: () => toast('AI bot settings saved.'), onError: reportError });
      }}
    >
      <div className="card-h">
        <h2>Bot settings</h2>
        <span className="sp" />
        <button className="btn sm pri" type="submit" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save settings'}
        </button>
      </div>
      <div className="card-b">
        <Check label="Chat bot on" checked={s.chatBotEnabled} onChange={v => set('chatBotEnabled', v)} />
        <Check label="Voice bot on" checked={s.voiceBotEnabled} onChange={v => set('voiceBotEnabled', v)} />
        <div className="f-row f2">
          <div>
            <label className="f" htmlFor="as-persona">Persona name</label>
            <input className="f-in" id="as-persona" maxLength={60} {...text('personaName')} />
          </div>
          <div>
            <label className="f" htmlFor="as-model">Model (empty = platform default)</label>
            <input className="f-in" id="as-model" maxLength={80} {...text('model')} />
          </div>
        </div>
        <div className="f-row f2">
          <div>
            <label className="f" htmlFor="as-lang">Language</label>
            <select className="f-in" id="as-lang" value={s.languageMode} onChange={e => set('languageMode', e.target.value as AiBotSettings['languageMode'])}>
              <option value="trilingual">Sinhala, Tamil and English</option>
              <option value="sinhala">Sinhala</option>
              <option value="english">English</option>
            </select>
          </div>
          <div>
            <label className="f" htmlFor="as-mode">Chat bot answers</label>
            <select className="f-in" id="as-mode" value={s.chatBotMode} onChange={e => set('chatBotMode', e.target.value as AiBotSettings['chatBotMode'])}>
              <option value="always">Always</option>
              <option value="after_hours">After hours only</option>
              <option value="staff_busy">When staff are busy</option>
            </select>
          </div>
        </div>
        <label className="f" htmlFor="as-prompt">System prompt</label>
        <textarea className="f-in" id="as-prompt" rows={8} maxLength={16000} {...text('systemPrompt')} />
        <p className="hint">Company-specific instructions. Added to the platform default prompt, knowledge and training examples.</p>

        <label className="f" htmlFor="as-thr">Confidence threshold: {s.confidenceThreshold}%</label>
        <input
          id="as-thr"
          type="range"
          min={0}
          max={100}
          step={1}
          style={{ width: '100%', accentColor: 'var(--blue)' }}
          value={s.confidenceThreshold}
          onChange={e => set('confidenceThreshold', Number(e.target.value))}
        />
        <p className="hint">Below this, the bot hands the chat to a person and sends the fallback message.</p>

        <label className="f">Hand off to a person when</label>
        <Check label="The customer negotiates price" checked={s.autoHandoffOnNegotiation} onChange={v => set('autoHandoffOnNegotiation', v)} />
        <Check label="The customer complains" checked={s.autoHandoffOnComplaint} onChange={v => set('autoHandoffOnComplaint', v)} />
        <Check label="The customer asks for staff" checked={s.autoHandoffOnStaffRequest} onChange={v => set('autoHandoffOnStaffRequest', v)} />

        <label className="f" htmlFor="as-welcome">Welcome message</label>
        <textarea className="f-in" id="as-welcome" maxLength={1024} {...text('welcomeMessage')} />
        <label className="f" htmlFor="as-fallback">Fallback message</label>
        <textarea className="f-in" id="as-fallback" maxLength={1024} {...text('fallbackMessage')} />

        <label className="f">Calls</label>
        <Check label="Transcribe calls" checked={s.autoTranscribeCalls} onChange={v => set('autoTranscribeCalls', v)} />
        <Check label="Summarise calls" checked={s.autoSummarizeCalls} onChange={v => set('autoSummarizeCalls', v)} />
        <Check label="Follow up missed calls on WhatsApp" checked={s.missedCallAutoFollowup} onChange={v => set('missedCallAutoFollowup', v)} />
        <label className="f" htmlFor="as-missed">Missed-call message</label>
        <textarea className="f-in" id="as-missed" maxLength={1024} {...text('missedCallMessageTemplate')} />
        <div className="f-row f2">
          <div>
            <label className="f" htmlFor="as-vmodel">Voice model</label>
            <input className="f-in" id="as-vmodel" maxLength={60} {...text('voiceModel')} />
          </div>
          <div>
            <label className="f" htmlFor="as-vlang">Voice language</label>
            <select className="f-in" id="as-vlang" value={s.voiceLanguage} onChange={e => set('voiceLanguage', e.target.value as AiBotSettings['voiceLanguage'])}>
              <option value="trilingual">Sinhala, Tamil and English</option>
              <option value="sinhala">Sinhala</option>
              <option value="english">English</option>
            </select>
          </div>
        </div>
        <label className="f" htmlFor="as-vgreet">Voice greeting</label>
        <textarea className="f-in" id="as-vgreet" maxLength={1024} {...text('voiceGreeting')} />
        <label className="f" htmlFor="as-vspeed">Voice speed: {s.voiceSpeed.toFixed(2)}×</label>
        <input
          id="as-vspeed"
          type="range"
          min={0.8}
          max={1.2}
          step={0.05}
          style={{ width: '100%', accentColor: 'var(--blue)' }}
          value={s.voiceSpeed}
          onChange={e => set('voiceSpeed', Number(e.target.value))}
        />
      </div>
    </form>
  );
}

/* ───────── Knowledge ───────── */

function AddKnowledgeSheet({ companyId }: { companyId: string }) {
  const { toast, reportError, closeSheet } = useAdmin();
  const add = useAddKnowledge(companyId);
  const [mode, setMode] = useState<'text' | 'upload' | 'catalog'>('text');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim() || (mode === 'catalog' ? 'Product catalog' : file?.name ?? '');
    if (!t) {
      toast('Give the document a title.');
      return;
    }
    try {
      if (mode === 'upload') {
        if (!file) {
          toast('Choose a file first.');
          return;
        }
        setUploading(true);
        const fileId = await uploadFile(file, file.name, 'knowledge');
        setUploading(false);
        await add.mutateAsync({ title: t, source: 'upload', fileId });
      } else if (mode === 'catalog') {
        await add.mutateAsync({ title: t, source: 'catalog' });
      } else {
        await add.mutateAsync({ title: t, source: 'text', text: body });
      }
      toast(`“${t}” added to the bot’s knowledge.`);
      closeSheet();
    } catch (err) {
      setUploading(false);
      reportError(err);
    }
  };

  const busy = uploading || add.isPending;
  return (
    <form onSubmit={e => void submit(e)}>
      <h2>Add knowledge</h2>
      <p className="sub">What the bot may use to answer customers: price lists, FAQs, delivery terms.</p>
      <div className="seg" role="group" aria-label="Source">
        <button type="button" aria-pressed={mode === 'text'} onClick={() => setMode('text')}>Paste text</button>
        <button type="button" aria-pressed={mode === 'upload'} onClick={() => setMode('upload')}>Upload file</button>
        <button type="button" aria-pressed={mode === 'catalog'} onClick={() => setMode('catalog')}>From catalog</button>
      </div>
      <label className="f" htmlFor="kn-title">Title</label>
      <input
        className="f-in"
        id="kn-title"
        maxLength={120}
        placeholder={mode === 'catalog' ? 'Product catalog' : mode === 'upload' ? 'Uses the file name if empty' : 'For example: Delivery and warranty'}
        value={title}
        onChange={e => setTitle(e.target.value)}
      />
      {mode === 'text' ? (
        <>
          <label className="f" htmlFor="kn-text">Text</label>
          <textarea className="f-in" id="kn-text" rows={12} required value={body} onChange={e => setBody(e.target.value)} />
        </>
      ) : mode === 'upload' ? (
        <>
          <label className="f" htmlFor="kn-file">File</label>
          <input
            className="f-in"
            id="kn-file"
            type="file"
            accept=".pdf,.txt,.md,.csv,.docx,text/plain,application/pdf"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
          />
          <p className="hint">PDF, Word, text or CSV. The text is extracted on the server.</p>
        </>
      ) : (
        <p className="hint">Builds one document from the company’s active products: names, prices and descriptions.</p>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
        <button className="btn pri" type="submit" disabled={busy}>
          {uploading ? 'Uploading…' : add.isPending ? 'Adding…' : 'Add'}
        </button>
        <button className="btn" type="button" onClick={closeSheet}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function KnowledgeCard({ companyId }: { companyId: string }) {
  const { toast, reportError, openSheet } = useAdmin();
  const docs = useKnowledge(companyId);
  const remove = useRemoveKnowledge(companyId);
  return (
    <div className="card">
      <div className="card-h">
        <h2>Knowledge</h2>
        {docs.data ? <span className="chip">{docs.data.length}</span> : null}
        <span className="sp" />
        <button className="btn sm" onClick={() => openSheet(<AddKnowledgeSheet companyId={companyId} />)}>
          Add knowledge
        </button>
      </div>
      <QueryState q={docs} empty={{ title: 'No knowledge yet', text: 'Paste text, upload a file or build from the catalog.' }}>
        {list => (
          <>
            {list.map(d => (
              <div className="list-row" key={d.id}>
                <span className={`dot ${d.status === 'ready' ? 'ok' : d.status === 'failed' ? 'b' : 'w'}`} />
                <div className="bd">
                  <b>{d.title}</b>
                  <span>
                    {d.source} · {num(d.characters)} characters · {d.status} · {d.addedBy} · {fmtDate(d.createdAt)}
                  </span>
                </div>
                <div className="rt">
                  <button
                    className="btn sm dgr"
                    disabled={remove.isPending}
                    aria-label={`Delete ${d.title}`}
                    onClick={() => {
                      if (!window.confirm(`Delete “${d.title}” from the bot’s knowledge?`)) return;
                      remove.mutate(d.id, { onSuccess: () => toast('Document deleted.'), onError: reportError });
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </QueryState>
    </div>
  );
}

/* ───────── Training examples ───────── */

function ExampleSheet({ companyId, log }: { companyId: string; log?: AiBotLog }) {
  const { toast, reportError, closeSheet } = useAdmin();
  const add = useAddExample(companyId);
  const fromLog = useExampleFromLog(companyId);
  const [q, setQ] = useState(log?.userInput ?? '');
  const [a, setA] = useState(log?.botOutput ?? '');
  const busy = add.isPending || fromLog.isPending;
  const done = {
    onSuccess: () => {
      toast('Training example saved.');
      closeSheet();
    },
    onError: reportError
  };
  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        if (log) fromLog.mutate({ logId: log.id, idealAnswer: a.trim() }, done);
        else add.mutate({ question: q.trim(), idealAnswer: a.trim() }, done);
      }}
    >
      <h2>{log ? 'Make training example' : 'Add training example'}</h2>
      <p className="sub">The bot learns to answer questions like this the way you write here.</p>
      <label className="f" htmlFor="ex-q">Customer question</label>
      <textarea className="f-in" id="ex-q" required maxLength={2000} readOnly={!!log} value={q} onChange={e => setQ(e.target.value)} />
      {log ? <p className="hint">From the chat with {log.contactName} on {fmtDateTime(log.timestamp)}.</p> : null}
      <label className="f" htmlFor="ex-a">Ideal answer</label>
      <textarea className="f-in" id="ex-a" rows={6} required maxLength={4000} value={a} onChange={e => setA(e.target.value)} />
      <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
        <button className="btn pri" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save example'}
        </button>
        <button className="btn" type="button" onClick={closeSheet}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function ExamplesCard({ companyId }: { companyId: string }) {
  const { toast, reportError, openSheet } = useAdmin();
  const examples = useExamples(companyId);
  const remove = useRemoveExample(companyId);
  return (
    <div className="card">
      <div className="card-h">
        <h2>Training examples</h2>
        {examples.data ? <span className="chip">{examples.data.length}</span> : null}
        <span className="sp" />
        <button className="btn sm" onClick={() => openSheet(<ExampleSheet companyId={companyId} />)}>
          Add example
        </button>
      </div>
      <QueryState q={examples} empty={{ title: 'No examples yet', text: 'Add a question with its ideal answer, or make one from a bot log.' }}>
        {list => (
          <>
            {list.map(x => (
              <div className="list-row" key={x.id}>
                <div className="bd">
                  <b>{x.question}</b>
                  <span style={{ display: 'block', whiteSpace: 'pre-wrap' }}>{x.idealAnswer}</span>
                  <span>
                    {x.approvedBy} · {fmtDate(x.createdAt)}
                  </span>
                </div>
                <div className="rt">
                  <button
                    className="btn sm dgr"
                    disabled={remove.isPending}
                    aria-label="Delete example"
                    onClick={() => {
                      if (!window.confirm('Delete this training example?')) return;
                      remove.mutate(x.id, { onSuccess: () => toast('Example deleted.'), onError: reportError });
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </QueryState>
    </div>
  );
}

/* ───────── Simulator ───────── */

interface SimTurn extends SimulateTurn {
  meta?: AiSimulateResponse;
}

function Simulator({ companyId }: { companyId: string }) {
  const { reportError } = useAdmin();
  const sim = useSimulate(companyId);
  const [turns, setTurns] = useState<SimTurn[]>([]);
  const [msg, setMsg] = useState('');
  const end = useRef<HTMLDivElement>(null);

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    const text = msg.trim();
    if (!text || sim.isPending) return;
    const history = turns.slice(-20).map(t => ({ role: t.role, text: t.text.slice(0, 2000) }));
    setTurns(t => [...t, { role: 'user', text }]);
    setMsg('');
    sim.mutate(
      { message: text, history },
      {
        onSuccess: r => {
          setTurns(t => [...t, { role: 'bot', text: r.reply, meta: r }]);
          setTimeout(() => end.current?.scrollIntoView({ block: 'nearest' }), 0);
        },
        onError: err => {
          setTurns(t => t.slice(0, -1));
          setMsg(text);
          reportError(err);
        }
      }
    );
  };

  return (
    <div className="card">
      <div className="card-h">
        <h2>Simulator</h2>
        <span className="sp" />
        {turns.length ? (
          <button className="btn sm" onClick={() => setTurns([])}>
            Clear
          </button>
        ) : null}
      </div>
      <div className="card-b" style={{ maxHeight: 420, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }} aria-live="polite">
        {turns.length === 0 ? (
          <p className="hint" style={{ margin: 0 }}>
            Type what a customer might ask. Uses this company’s saved settings, knowledge and examples. Nothing is sent on WhatsApp.
          </p>
        ) : null}
        {turns.map((t, i) => (
          <div key={i} className={`adm-bubble ${t.role}`}>
            <div style={{ whiteSpace: 'pre-wrap' }}>{t.text || <em>(empty reply)</em>}</div>
            {t.meta ? (
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
                <span className="chip i">{t.meta.intent}</span>
                <span className={`chip ${t.meta.confidence >= 70 ? 'ok' : t.meta.confidence >= 40 ? 'w' : 'b'}`}>{t.meta.confidence}% sure</span>
                {t.meta.handoff ? <span className="chip w">Hands off</span> : null}
                <span className="chip">
                  {t.meta.latencyMs} ms · {t.meta.tokensUsed} tokens
                </span>
              </div>
            ) : null}
            {t.meta?.suggestedActions.length ? <p className="hint">{t.meta.suggestedActions.join(' · ')}</p> : null}
          </div>
        ))}
        {sim.isPending ? <Loading text="Bot is thinking…" /> : null}
        <div ref={end} />
      </div>
      <form onSubmit={send} style={{ display: 'flex', gap: 6, padding: '0 15px 14px' }}>
        <label className="sr" htmlFor="sim-msg">Customer message</label>
        <input className="f-in" id="sim-msg" maxLength={2000} placeholder="Customer message" value={msg} onChange={e => setMsg(e.target.value)} />
        <button className="btn pri" type="submit" disabled={sim.isPending || !msg.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}

/* ───────── Logs ───────── */

export function LogsTable({ logs, onMakeExample }: { logs: AiBotLog[]; onMakeExample?: (l: AiBotLog) => void }) {
  return (
    <div className="tw">
      <table>
        <thead>
          <tr>
            <th>When</th>
            <th>Contact</th>
            <th>Customer said</th>
            <th>Bot replied</th>
            <th>Intent</th>
            <th className="r">Confidence</th>
            <th>Result</th>
            {onMakeExample ? <th className="r" /> : null}
          </tr>
        </thead>
        <tbody>
          {logs.map(l => (
            <tr key={l.id}>
              <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(l.timestamp)}</td>
              <td>
                <div className="emp">
                  <span>
                    <b>{l.contactName}</b>
                    <span>
                      {l.channel} · {l.contactPhone}
                    </span>
                  </span>
                </div>
              </td>
              <td style={{ maxWidth: 260 }}>{l.userInput}</td>
              <td style={{ maxWidth: 300 }}>{l.botOutput}</td>
              <td>
                <span className="chip i">{l.intent}</span>
              </td>
              <td className="r">{l.confidence}%</td>
              <td>
                <span className={`chip ${l.status === 'handed_off' ? 'w' : 'ok'}`}>{l.status.replace('_', ' ')}</span>
                {l.agent ? <div className="hint">{l.agent}</div> : null}
              </td>
              {onMakeExample ? (
                <td className="r">
                  <button className="btn sm" onClick={() => onMakeExample(l)}>
                    Make training example
                  </button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LogsCard({ companyId }: { companyId: string }) {
  const { openSheet } = useAdmin();
  const logs = useCompanyAiLogs(companyId);
  return (
    <div className="card">
      <div className="card-h">
        <h2>Bot logs</h2>
        <span className="sp" />
        <button className="btn sm" onClick={() => void logs.refetch()} disabled={logs.isFetching}>
          Refresh
        </button>
      </div>
      <QueryState q={logs} empty={{ title: 'No bot replies yet', text: 'Replies the bot sends to customers appear here.' }}>
        {list => <LogsTable logs={list} onMakeExample={l => openSheet(<ExampleSheet companyId={companyId} log={l} />)} />}
      </QueryState>
    </div>
  );
}

/* ───────── Tab ───────── */

export default function AiBotTab({ company }: { company: AdminCompany }) {
  const ai = useAiCompanies();
  const settings = useCompanyAiSettings(company.id);
  const row = ai.data?.find(r => r.companyId === company.id);

  return (
    <>
      <div className="grid gmain">
        <div>
          {ai.isLoading ? (
            <div className="card">
              <Loading />
            </div>
          ) : row ? (
            <AddonCard key={company.id} companyId={company.id} addon={row.addon} />
          ) : (
            <QueryState q={ai}>{() => null}</QueryState>
          )}
          <QueryState q={settings}>{s => <SettingsCard key={company.id} companyId={company.id} initial={s} />}</QueryState>
        </div>
        <div>
          <Simulator companyId={company.id} />
          <KnowledgeCard companyId={company.id} />
          <ExamplesCard companyId={company.id} />
        </div>
      </div>
      <LogsCard companyId={company.id} />
    </>
  );
}
