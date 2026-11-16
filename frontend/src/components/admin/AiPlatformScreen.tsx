'use client';

import React, { useState } from 'react';
import type { AdminAiCompanyRow, AiAddonPlan, PlatformAiSettings } from '@smart-reply/shared';
import { useAddonPlans, useAiCompanies, useAllAiLogs, usePlatformAi, useSaveAddonPlan, useSavePlatformAi, useSetAddon } from '@/features/admin';
import { useAdmin } from './AdminContext';
import { LogsTable } from './AiBotTab';
import { AiChip, PageHead, QueryState, fmtDate, fmtDateTime, money, num, rupeesToMinor } from './ui';

function ProviderCard({ initial }: { initial: PlatformAiSettings }) {
  const { toast, reportError } = useAdmin();
  const save = useSavePlatformAi();
  const [f, setF] = useState({
    provider: initial.provider,
    apiKey: '',
    defaultModel: initial.defaultModel,
    baseUrl: initial.baseUrl,
    defaultPrompt: initial.defaultPrompt,
    globalOff: initial.globalOff
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (f.globalOff !== initial.globalOff && f.globalOff && !window.confirm('Turn the AI bot off for every company? No company bot replies until you turn it back on.')) return;
    save.mutate(
      {
        provider: f.provider,
        apiKey: f.apiKey.trim() || undefined,
        defaultModel: f.defaultModel.trim(),
        baseUrl: f.baseUrl.trim(),
        defaultPrompt: f.defaultPrompt,
        globalOff: f.globalOff
      },
      {
        onSuccess: () => {
          setF(prev => ({ ...prev, apiKey: '' }));
          toast('AI platform settings saved.');
        },
        onError: reportError
      }
    );
  };
  return (
    <form className="card" onSubmit={submit}>
      <div className="card-h">
        <h2>AI provider</h2>
        {initial.globalOff ? <span className="chip b">All bots off</span> : null}
        <span className="sp" />
        <button className="btn sm pri" type="submit" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
      <div className="card-b">
        <div className="f-row f2">
          <div>
            <label className="f" htmlFor="ap-prov" style={{ marginTop: 0 }}>Provider</label>
            <select className="f-in" id="ap-prov" value={f.provider} onChange={e => setF({ ...f, provider: e.target.value as PlatformAiSettings['provider'] })}>
              <option value="none">None</option>
              <option value="openai">OpenAI-compatible</option>
              <option value="anthropic">Anthropic</option>
            </select>
          </div>
          <div>
            <label className="f" htmlFor="ap-model" style={{ marginTop: 0 }}>Default model</label>
            <input className="f-in" id="ap-model" maxLength={80} value={f.defaultModel} onChange={e => setF({ ...f, defaultModel: e.target.value })} />
          </div>
        </div>
        <label className="f" htmlFor="ap-key">API key</label>
        <input
          className="f-in"
          id="ap-key"
          type="password"
          autoComplete="off"
          minLength={10}
          placeholder={initial.apiKeyMasked ? `${initial.apiKeyMasked} (saved; type to replace)` : 'Not set'}
          value={f.apiKey}
          onChange={e => setF({ ...f, apiKey: e.target.value })}
        />
        <label className="f" htmlFor="ap-url">Base URL (optional)</label>
        <input className="f-in" id="ap-url" type="url" placeholder="Provider default" value={f.baseUrl} onChange={e => setF({ ...f, baseUrl: e.target.value })} />
        <label className="f" htmlFor="ap-prompt">Default prompt</label>
        <textarea className="f-in" id="ap-prompt" rows={7} maxLength={8000} value={f.defaultPrompt} onChange={e => setF({ ...f, defaultPrompt: e.target.value })} />
        <p className="hint">Used for every company, before the company’s own system prompt.</p>
        <label className="tgl" style={{ marginTop: 10 }}>
          <input type="checkbox" checked={f.globalOff} onChange={e => setF({ ...f, globalOff: e.target.checked })} />
          <span>Kill switch: turn every company’s AI bot off</span>
        </label>
      </div>
    </form>
  );
}

function AddonPlanSheet({ plan }: { plan: AiAddonPlan | null }) {
  const { toast, reportError, closeSheet } = useAdmin();
  const save = useSaveAddonPlan();
  const [f, setF] = useState({
    name: plan?.name ?? '',
    price: plan ? String(plan.price.amountMinor / 100) : '',
    limit: String(plan?.monthlyReplyLimit ?? 1000),
    voice: plan?.voiceIncluded ?? false
  });
  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        const priceMinor = rupeesToMinor(f.price);
        const limit = Number(f.limit);
        if (!Number.isFinite(priceMinor) || priceMinor < 0 || !Number.isInteger(limit) || limit < 0) {
          toast('Enter a price in rupees and a whole number of replies.');
          return;
        }
        save.mutate(
          { id: plan?.id ?? null, body: { name: f.name.trim(), priceMinor, currency: 'LKR', monthlyReplyLimit: limit, voiceIncluded: f.voice } },
          {
            onSuccess: p => {
              toast(`Add-on plan “${p.name}” saved.`);
              closeSheet();
            },
            onError: reportError
          }
        );
      }}
    >
      <h2>{plan ? `Edit ${plan.name}` : 'New AI add-on plan'}</h2>
      <p className="sub">The AI bot is a separately paid add-on. Each plan sets its monthly reply allowance.</p>
      <label className="f" htmlFor="adp-name">Name</label>
      <input className="f-in" id="adp-name" required maxLength={60} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
      <div className="f-row f2">
        <div>
          <label className="f" htmlFor="adp-price">Price a month (Rs.)</label>
          <input className="f-in" id="adp-price" type="number" min={0} step="0.01" required value={f.price} onChange={e => setF({ ...f, price: e.target.value })} />
        </div>
        <div>
          <label className="f" htmlFor="adp-limit">Replies a month</label>
          <input className="f-in" id="adp-limit" type="number" min={0} required value={f.limit} onChange={e => setF({ ...f, limit: e.target.value })} />
        </div>
      </div>
      <label className="tgl" style={{ marginTop: 10 }}>
        <input type="checkbox" checked={f.voice} onChange={e => setF({ ...f, voice: e.target.checked })} />
        <span>Voice bot included</span>
      </label>
      <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
        <button className="btn pri" type="submit" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save plan'}
        </button>
        <button className="btn" type="button" onClick={closeSheet}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function QuickActivate({ row, plans }: { row: AdminAiCompanyRow; plans: AiAddonPlan[] }) {
  const { toast, reportError } = useAdmin();
  const set = useSetAddon(row.companyId);
  const [planId, setPlanId] = useState(row.addon.planId ?? plans[0]?.id ?? '');
  if (row.addon.status === 'active') return null;
  return (
    <span style={{ display: 'inline-flex', gap: 6 }}>
      <label className="sr" htmlFor={`qa-${row.companyId}`}>Plan for {row.companyName}</label>
      <select className="f-in" id={`qa-${row.companyId}`} style={{ width: 'auto', padding: '3px 6px', fontSize: 12 }} value={planId} onChange={e => setPlanId(e.target.value)}>
        {plans.map(p => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <button
        className="btn sm pri"
        disabled={set.isPending || !planId}
        onClick={() => {
          const plan = plans.find(p => p.id === planId);
          if (!plan) return;
          set.mutate(
            { status: 'active', planId: plan.id, monthlyReplyLimit: plan.monthlyReplyLimit, activeUntil: row.addon.activeUntil },
            { onSuccess: () => toast(`AI bot activated for ${row.companyName}.`), onError: reportError }
          );
        }}
      >
        Activate
      </button>
    </span>
  );
}

export default function AiPlatformScreen() {
  const { go, openSheet } = useAdmin();
  const ai = usePlatformAi();
  const plans = useAddonPlans();
  const companies = useAiCompanies();
  const logs = useAllAiLogs();

  return (
    <>
      <PageHead title="AI platform" sub="The AI provider all company bots use, the add-on plans you sell, and which companies have the bot." />
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <QueryState q={ai}>{s => <ProviderCard initial={s} />}</QueryState>
        <div className="card">
          <div className="card-h">
            <h2>Add-on plans</h2>
            <span className="sp" />
            <button className="btn sm" onClick={() => openSheet(<AddonPlanSheet plan={null} />)}>
              New plan
            </button>
          </div>
          <QueryState q={plans} empty={{ title: 'No add-on plans', text: 'Create a plan before activating the AI bot.' }}>
            {list => (
              <>
                {list.map(p => (
                  <div className="list-row" key={p.id}>
                    <div className="bd">
                      <b>{p.name}</b>
                      <span>
                        {money(p.price)} a month · {num(p.monthlyReplyLimit)} replies{p.voiceIncluded ? ' · voice included' : ''}
                      </span>
                    </div>
                    <div className="rt">
                      <button className="btn sm" onClick={() => openSheet(<AddonPlanSheet plan={p} />)}>
                        Edit
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </QueryState>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <h2>Companies</h2>
          <span className="hint" style={{ margin: 0 }}>Pending requests first</span>
        </div>
        <QueryState q={companies} empty={{ title: 'No companies yet' }}>
          {rows => (
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Status</th>
                    <th>Plan</th>
                    <th className="r">Replies this month</th>
                    <th className="r">Cost this month</th>
                    <th>Active until</th>
                    <th>Request</th>
                    <th className="r" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.companyId}>
                      <td>
                        <button className="btn sm" style={{ border: 0, padding: 0, background: 'none' }} onClick={() => go('company', { company: r.companyId, tab: 'ai' })}>
                          <b>{r.companyName}</b>
                        </button>
                      </td>
                      <td>
                        <AiChip status={r.addon.status} />
                      </td>
                      <td>{r.addon.planName ?? '—'}</td>
                      <td className="r">
                        {num(r.addon.repliesThisMonth)} / {num(r.addon.monthlyReplyLimit)}
                      </td>
                      <td className="r">{money(r.addon.costThisMonth)}</td>
                      <td>{fmtDate(r.addon.activeUntil)}</td>
                      <td>
                        {r.addon.requestedAt ? (
                          <span className="chip w">
                            {fmtDateTime(r.addon.requestedAt)}
                            {r.addon.requestedByName ? ` · ${r.addon.requestedByName}` : ''}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="r" style={{ whiteSpace: 'nowrap' }}>
                        {plans.data?.length ? <QuickActivate row={r} plans={plans.data} /> : null}{' '}
                        <button className="btn sm" onClick={() => go('company', { company: r.companyId, tab: 'ai' })}>
                          Configure
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </QueryState>
      </div>

      <div className="card">
        <div className="card-h">
          <h2>All bot logs</h2>
          <span className="sp" />
          <button className="btn sm" onClick={() => void logs.refetch()} disabled={logs.isFetching}>
            Refresh
          </button>
        </div>
        <QueryState q={logs} empty={{ title: 'No bot replies yet', text: 'Replies from every company’s bot appear here.' }}>
          {list => <LogsTable logs={list} />}
        </QueryState>
      </div>
    </>
  );
}
