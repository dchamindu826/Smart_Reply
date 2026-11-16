'use client';

import React from 'react';
import { useAdminHealth, useAiCompanies } from '@/features/admin';
import { useAdmin } from './AdminContext';
import { ErrorNote, Loading, PageHead, QueryState, fmtDateTime, num } from './ui';

export default function OverviewScreen() {
  const { go } = useAdmin();
  const health = useAdminHealth();
  const ai = useAiCompanies();
  const h = health.data;
  const pending = ai.data?.filter(r => r.addon.requestedAt && r.addon.status !== 'active') ?? [];
  const queueFailed = h?.queues.reduce((s, q) => s + q.failed, 0) ?? 0;
  const queueWaiting = h?.queues.reduce((s, q) => s + q.waiting + q.delayed, 0) ?? 0;

  return (
    <>
      <PageHead title="Platform overview" sub="Health of Smart Reply across every company. Refreshes every 30 seconds.">
        <button className="btn" onClick={() => void health.refetch()} disabled={health.isFetching}>
          {health.isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
        <button className="btn pri" onClick={() => go('companies')}>
          Companies
        </button>
      </PageHead>

      {health.isLoading ? (
        <div className="card">
          <Loading />
        </div>
      ) : health.error || !h ? (
        <div className="card">
          <ErrorNote error={health.error} onRetry={() => void health.refetch()} />
        </div>
      ) : (
        <>
          <div className="stats">
            <div className="stat i" onClick={() => go('companies')} style={{ cursor: 'pointer' }}>
              <span>Companies</span>
              <b>{num(h.companies)}</b>
              <small>{num(h.activeUsers)} active users</small>
            </div>
            <div className={`stat ${h.webhookFailures24h ? 'b' : 'ok'}`} onClick={() => go('meta')} style={{ cursor: 'pointer' }}>
              <span>Webhook failures (24h)</span>
              <b>{num(h.webhookFailures24h)}</b>
              <small>{h.webhookFailures24h ? 'Open Meta & webhook to replay' : 'All events processed'}</small>
            </div>
            <div className={`stat ${h.lowQualityNumbers.length ? 'w' : 'ok'}`}>
              <span>Low-quality numbers</span>
              <b>{h.lowQualityNumbers.length}</b>
              <small>Yellow or red quality rating</small>
            </div>
            <div className={`stat ${queueFailed ? 'b' : ''}`}>
              <span>Queued jobs</span>
              <b>{num(queueWaiting)}</b>
              <small>{queueFailed ? `${queueFailed} failed jobs` : 'No failed jobs'}</small>
            </div>
          </div>

          <div className="grid gmain">
            <div>
              <div className="card">
                <div className="card-h">
                  <h2>AI activation requests</h2>
                  {pending.length ? <span className="chip w">{pending.length}</span> : null}
                  <span className="sp" />
                  <button className="btn sm" onClick={() => go('ai')}>
                    AI platform
                  </button>
                </div>
                <QueryState q={ai}>
                  {() =>
                    pending.length === 0 ? (
                      <p className="hint" style={{ padding: '14px 15px', margin: 0 }}>
                        No company is waiting for the AI bot.
                      </p>
                    ) : (
                      <>
                        {pending.map(r => (
                          <div className="list-row" key={r.companyId}>
                            <span className="dot w" />
                            <div className="bd">
                              <b>{r.companyName}</b>
                              <span>
                                Requested {fmtDateTime(r.addon.requestedAt)}
                                {r.addon.requestedByName ? ` by ${r.addon.requestedByName}` : ''}
                              </span>
                            </div>
                            <div className="rt">
                              <button className="btn sm pri" onClick={() => go('company', { company: r.companyId, tab: 'ai' })}>
                                Set up AI
                              </button>
                            </div>
                          </div>
                        ))}
                      </>
                    )
                  }
                </QueryState>
              </div>

              <div className="card">
                <div className="card-h">
                  <h2>Low-quality numbers</h2>
                </div>
                {h.lowQualityNumbers.length === 0 ? (
                  <p className="hint" style={{ padding: '14px 15px', margin: 0 }}>
                    Every connected number has a green or unknown rating.
                  </p>
                ) : (
                  h.lowQualityNumbers.map(n => (
                    <div className="list-row" key={n.companyId}>
                      <span className={`dot ${n.qualityRating === 'RED' ? 'b' : 'w'}`} />
                      <div className="bd">
                        <b>{n.companyName}</b>
                        <span>
                          {n.displayPhone} · {n.qualityRating.toLowerCase()}
                        </span>
                      </div>
                      <div className="rt">
                        <button className="btn sm" onClick={() => go('company', { company: n.companyId, tab: 'whatsapp' })}>
                          Open
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-h">
                <h2>Job queues</h2>
              </div>
              <div className="tw">
                <table>
                  <thead>
                    <tr>
                      <th>Queue</th>
                      <th className="r">Waiting</th>
                      <th className="r">Active</th>
                      <th className="r">Delayed</th>
                      <th className="r">Failed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {h.queues.map(q => (
                      <tr key={q.name}>
                        <td>{q.name}</td>
                        <td className="r">{q.waiting}</td>
                        <td className="r">{q.active}</td>
                        <td className="r">{q.delayed}</td>
                        <td className="r">{q.failed ? <span className="chip b">{q.failed}</span> : 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
