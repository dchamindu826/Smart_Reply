'use client';

import React from 'react';
import { useApp } from '@/context/AppContext';
import SectionThemeToggle from '@/components/common/SectionThemeToggle';

export default function BroadcastsScreen() {
  const { addToast } = useApp();

  return (
    <>
      <div className="ph">
        <div>
          <h1>Broadcasts</h1>
          <p>
            Send an approved marketing template to a labelled group. Only customers who opted in receive it.
          </p>
        </div>
        <div className="acts">
          <SectionThemeToggle />
          <button
            className="btn pri"
            onClick={() => addToast('New broadcast: pick a label and an approved template.')}
          >
            New broadcast
          </button>
        </div>
      </div>

      <div className="card">
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Audience</th>
                <th>Template</th>
                <th className="r">Sent</th>
                <th className="r">Read</th>
                <th className="r">Replied</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><b>Avurudu vanity offer</b></td>
                <td><span className="chip">Bathroom</span> 64 people</td>
                <td>avurudu_offer</td>
                <td className="r">—</td>
                <td className="r">—</td>
                <td className="r">—</td>
                <td><span className="chip b">Template rejected</span></td>
              </tr>
              <tr>
                <td><b>Installation reminders · week 39</b></td>
                <td><span className="chip i">Installation</span> 3 people</td>
                <td>installation_reminder</td>
                <td className="r">3</td>
                <td className="r">3</td>
                <td className="r">2</td>
                <td><span className="chip ok">Done</span></td>
              </tr>
              <tr>
                <td><b>Quotation follow-up</b></td>
                <td><span className="chip i">Quotation</span> 9 people</td>
                <td>quotation_ready</td>
                <td className="r">9</td>
                <td className="r">7</td>
                <td className="r">4</td>
                <td><span className="chip ok">Done</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="note w">
        <span className="ic">⚠</span>
        <div>
          <b>Keep broadcasts relevant</b>
          If many people block or report the number, Meta lowers the quality rating and the daily messaging limit.
        </div>
      </div>
    </>
  );
}
