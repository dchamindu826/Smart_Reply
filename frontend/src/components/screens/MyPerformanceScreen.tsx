'use client';

import React from 'react';
import { useApp } from '@/context/AppContext';

export default function MyPerformanceScreen() {
  const { addToast } = useApp();

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const values = [9, 13, 8, 17, 12, 0, 0];
  const mx = 17;

  return (
    <>
      <div className="ph">
        <div>
          <h1>My performance</h1>
          <p>Nimal Bandara · this week</p>
        </div>
        <div className="acts">
          <button className="btn" onClick={() => addToast('Your report exported as PDF.')}>
            Export
          </button>
        </div>
      </div>

      <div className="stats">
        <div className="stat ok">
          <span>Score</span>
          <b>92</b>
          <small>Reply time, resolved, calls</small>
        </div>
        <div className="stat i">
          <span>Chats handled</span>
          <b>64</b>
          <small>Team avg 49</small>
        </div>
        <div className="stat">
          <span>Avg reply</span>
          <b>2m 10s</b>
          <small>Fastest on the team</small>
        </div>
        <div className="stat w">
          <span>Missed / rejected</span>
          <b>2</b>
          <small>Both while on another call</small>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <h2>Resolved per day</h2>
        </div>
        <div className="card-b">
          <div className="bars">
            {values.map((v, i) => (
              <div key={days[i]} className={v === mx ? 'hi' : ''}>
                {v}
                <i style={{ height: `${Math.max(4, Math.round((v / mx) * 100))}%` }} />
                {days[i]}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
