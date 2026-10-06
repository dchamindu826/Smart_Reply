'use client';

import React from 'react';
import { useApp } from '@/context/AppContext';

export default function RolesScreen() {
  const { setScreen } = useApp();

  return (
    <>
      <div className="ph">
        <div>
          <h1>Roles &amp; users</h1>
          <p>Two roles for a small team. Add more when you need them.</p>
        </div>
        <div className="acts">
          <button className="btn pri" onClick={() => setScreen('staff')}>
            Staff manage
          </button>
        </div>
      </div>

      <div className="card">
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Can…</th>
                <th>Manager</th>
                <th>Staff</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Reply to assigned chats and calls</td>
                <td>✓</td>
                <td>✓</td>
              </tr>
              <tr>
                <td>See every chat</td>
                <td>✓</td>
                <td>—</td>
              </tr>
              <tr>
                <td>Assign and transfer chats</td>
                <td>✓</td>
                <td>Transfer own</td>
              </tr>
              <tr>
                <td>Send approved templates</td>
                <td>✓</td>
                <td>✓</td>
              </tr>
              <tr>
                <td>Create templates, broadcasts</td>
                <td>✓</td>
                <td>—</td>
              </tr>
              <tr>
                <td>Catalog &amp; pricing</td>
                <td>✓</td>
                <td>View</td>
              </tr>
              <tr>
                <td>Reports, billing, settings</td>
                <td>✓</td>
                <td>Own performance</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
