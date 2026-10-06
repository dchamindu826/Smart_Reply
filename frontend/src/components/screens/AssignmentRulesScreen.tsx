'use client';

import React from 'react';
import { useApp } from '@/context/AppContext';
import SectionThemeToggle from '@/components/common/SectionThemeToggle';

export default function AssignmentRulesScreen() {
  const { addToast } = useApp();

  return (
    <>
      <div className="ph">
        <div>
          <h1>Assignment rules</h1>
          <p>How new chats and calls find a person.</p>
        </div>
        <div className="acts">
          <SectionThemeToggle />
          <button className="btn pri" onClick={() => addToast('Rules saved.')}>
            Save rules
          </button>
        </div>
      </div>

      <div className="grid g2">
        <div className="card">
          <div className="card-h">
            <h2>New chats</h2>
          </div>
          <div className="card-b">
            <label className="tgl">
              <input type="checkbox" defaultChecked />
              <span>Auto-assign round-robin to available staff</span>
            </label>
            <label className="tgl">
              <input type="checkbox" defaultChecked />
              <span>Returning customer goes to their last staff member</span>
            </label>
            <label className="tgl">
              <input type="checkbox" />
              <span>Skip staff with more than 8 open chats</span>
            </label>
            <label className="f">Unassigned alert after</label>
            <select className="f-in">
              <option>10 minutes</option>
              <option>5 minutes</option>
              <option>15 minutes</option>
            </select>
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <h2>Incoming calls</h2>
          </div>
          <div className="card-b">
            <label className="tgl">
              <input type="checkbox" defaultChecked />
              <span>Ring free staff first; skip anyone on a call</span>
            </label>
            <label className="tgl">
              <input type="checkbox" defaultChecked />
              <span>Ring the assigned staff member first for known customers</span>
            </label>
            <label className="tgl">
              <input type="checkbox" defaultChecked />
              <span>Missed call: send the missed_call_si template</span>
            </label>
            <label className="f">Ring for</label>
            <select className="f-in">
              <option>30 seconds, then next person</option>
              <option>20 seconds</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <h2>Keyword rules</h2>
          <span className="sp" />
          <button className="btn sm" onClick={() => addToast('New keyword rule.')}>
            Add rule
          </button>
        </div>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>If message contains</th>
                <th>Then</th>
                <th className="r">Matched this month</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code className="cmd">wardrobe</code> <code className="cmd">almirah</code></td>
                <td>Label <span className="chip">Wardrobe</span> · assign Nimal</td>
                <td className="r">14</td>
              </tr>
              <tr>
                <td><code className="cmd">vanity</code> <code className="cmd">bathroom</code></td>
                <td>Label <span className="chip">Bathroom</span> · assign Sachini</td>
                <td className="r">9</td>
              </tr>
              <tr>
                <td><code className="cmd">price</code> <code className="cmd">මිල</code></td>
                <td>Reply with /price-list</td>
                <td className="r">37</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
