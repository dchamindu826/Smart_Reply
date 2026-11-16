'use client';

import React, { useState } from 'react';
import { useAdminAudit } from '@/features/admin';
import { PageHead, QueryState, fmtDateTime } from './ui';

export default function AuditScreen() {
  const audit = useAdminAudit();
  const [search, setSearch] = useState('');
  const s = search.trim().toLowerCase();
  return (
    <>
      <PageHead title="Audit log" sub="Every change made by LUMI AI admins and support sessions, newest first.">
        <button className="btn" onClick={() => void audit.refetch()} disabled={audit.isFetching}>
          Refresh
        </button>
      </PageHead>
      <div className="card">
        <div className="card-h">
          <label className="sr" htmlFor="au-search">Filter audit log</label>
          <input
            id="au-search"
            className="f-in"
            style={{ maxWidth: 320 }}
            placeholder="Filter by company, person or action"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <QueryState q={audit} empty={{ title: 'Nothing logged yet' }}>
          {rows => {
            const list = rows.filter(r => !s || [r.companyName ?? '', r.actorName, r.action, r.summary].join(' ').toLowerCase().includes(s));
            if (list.length === 0) return <p className="hint" style={{ padding: '14px 15px', margin: 0 }}>No entry matches “{search}”.</p>;
            return (
              <div className="tw">
                <table>
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Who</th>
                      <th>Company</th>
                      <th>Action</th>
                      <th>What happened</th>
                      <th>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map(r => (
                      <tr key={r.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(r.at)}</td>
                        <td>
                          {r.actorName} <span className="chip">{r.actorKind}</span>
                        </td>
                        <td>{r.companyName ?? 'Platform'}</td>
                        <td>
                          <span className="chip i">{r.action}</span>
                        </td>
                        <td>{r.summary}</td>
                        <td>{r.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }}
        </QueryState>
      </div>
    </>
  );
}
