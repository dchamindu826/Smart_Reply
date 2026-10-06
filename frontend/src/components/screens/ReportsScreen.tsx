'use client';

import React, { useState } from 'react';
import { useApp } from '@/context/AppContext';
import SectionThemeToggle from '@/components/common/SectionThemeToggle';

export default function ReportsScreen() {
  const { addToast } = useApp();
  const [period, setPeriod] = useState('week');

  const d = [45, 62, 55, 80, 70, 92, 35];
  const n = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const mx = 92;

  return (
    <>
      <div className="ph">
        <div>
          <h1>Reports</h1>
          <p>This week · Madushan Aluminium</p>
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
          <button className="btn" onClick={() => addToast('Report exported as PDF.')}>
            Export PDF
          </button>
        </div>
      </div>

      <div className="stats">
        <div className="stat i">
          <span>Conversations</span>
          <b>184</b>
          <small>+12% on last week</small>
        </div>
        <div className="stat ok">
          <span>Resolved</span>
          <b>162</b>
          <small>88% of conversations</small>
        </div>
        <div className="stat w">
          <span>Avg first reply</span>
          <b>3m 40s</b>
          <small>Target 5 min</small>
        </div>
        <div className="stat">
          <span>Quotations sent</span>
          <b>21</b>
          <small>9 converted to advance paid</small>
        </div>
      </div>

      <div className="grid gmain">
        <div className="card">
          <div className="card-h">
            <h2>Chats per day</h2>
          </div>
          <div className="card-b">
            <div className="bars">
              {d.map((val, i) => (
                <div key={n[i]} className={val === mx ? 'hi' : ''}>
                  {val}
                  <i style={{ height: `${Math.round((val / mx) * 100)}%` }} />
                  {n[i]}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="card">
            <div className="card-h">
              <h2>Calls</h2>
            </div>
            <div className="card-b">
              <div className="split">
                <i style={{ flex: 46, background: 'var(--blue)' }} />
                <i style={{ flex: 4, background: 'var(--bad)' }} />
                <i style={{ flex: 2, background: 'var(--warn)' }} />
              </div>
              <div className="ln"><span>Answered</span><b>46 · 88%</b></div>
              <div className="ln"><span>Missed</span><b>4</b></div>
              <div className="ln"><span>Rejected</span><b>2</b></div>
            </div>
          </div>

          <div className="card">
            <div className="card-h">
              <h2>Top enquiries</h2>
            </div>
            <div className="card-b">
              <div className="ln"><span>Kitchen cabinets</span><b>41%</b></div>
              <div className="ln"><span>Wardrobes</span><b>33%</b></div>
              <div className="ln"><span>Bathroom vanities</span><b>19%</b></div>
              <div className="ln"><span>Other</span><b>7%</b></div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
