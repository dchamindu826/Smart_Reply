'use client';

import React, { useState } from 'react';
import { useApp } from '@/context/AppContext';
import SectionThemeToggle from '@/components/common/SectionThemeToggle';

export default function ProgressScreen() {
  const { staff } = useApp();
  const [period, setPeriod] = useState('week');

  return (
    <>
      <div className="ph">
        <div>
          <h1>Progress</h1>
          <p>Each person against their weekly target of resolved chats.</p>
        </div>
        <div className="acts">
          <div className="seg">
            <button
              aria-pressed={period === 'today'}
              className={period === 'today' ? 'active' : ''}
              onClick={() => setPeriod('today')}
            >
              Today
            </button>
            <button
              aria-pressed={period === 'week'}
              className={period === 'week' ? 'active' : ''}
              onClick={() => setPeriod('week')}
            >
              This week
            </button>
            <button
              aria-pressed={period === 'month'}
              className={period === 'month' ? 'active' : ''}
              onClick={() => setPeriod('month')}
            >
              Month
            </button>
          </div>
          <SectionThemeToggle />
        </div>
      </div>

      <div className="card">
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Target progress</th>
                <th className="r">Resolved</th>
                <th className="r">Avg first reply</th>
                <th className="r">Calls answered</th>
                <th className="r">Missed</th>
              </tr>
            </thead>
            <tbody>
              {staff.map(s => (
                <tr key={s.id}>
                  <td>
                    <div className="emp">
                      <i className="av">{s.i}</i>
                      <span>
                        <b>{s.n}</b>
                        <span>{s.stt}</span>
                      </span>
                    </div>
                  </td>
                  <td style={{ minWidth: '200px' }}>
                    <div className="meter">
                      <i style={{ width: `${s.done}%` }} />
                    </div>
                    <span className="hint">{s.done} of 100</span>
                  </td>
                  <td className="r">{s.res}</td>
                  <td className="r">{s.rep}</td>
                  <td className="r">{s.calls}</td>
                  <td className="r">{s.miss}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="note w">
        <span className="ic">⚠</span>
        <div>
          <b>Ruwan’s first reply is 5m 20s</b>
          Above the 5-minute target on 3 of 5 days. Most slow replies were after 17:00.
        </div>
      </div>
    </>
  );
}
