'use client';

import React from 'react';
import { useAdminUsage } from '@/features/admin';
import { useAdmin } from './AdminContext';
import { PageHead, QueryState, bytes, money, num } from './ui';

export default function UsageScreen() {
  const { go } = useAdmin();
  const usage = useAdminUsage();
  return (
    <>
      <PageHead title="Usage" sub="Messages, calls, storage, Meta cost and AI replies for each company." />
      <div className="card">
        <QueryState q={usage} empty={{ title: 'No usage yet' }}>
          {rows => (
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>Company</th>
                    <th className="r">Messages in</th>
                    <th className="r">Messages out</th>
                    <th className="r">Calls</th>
                    <th className="r">Storage</th>
                    <th className="r">Meta cost</th>
                    <th className="r">AI replies</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.companyId} style={{ cursor: 'pointer' }} onClick={() => go('company', { company: r.companyId })}>
                      <td>
                        <b>{r.companyName}</b>
                      </td>
                      <td className="r">{num(r.messagesIn)}</td>
                      <td className="r">{num(r.messagesOut)}</td>
                      <td className="r">{num(r.calls)}</td>
                      <td className="r">{bytes(r.storageBytes)}</td>
                      <td className="r">{money(r.metaCost)}</td>
                      <td className="r">{num(r.aiReplies)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </QueryState>
      </div>
    </>
  );
}
