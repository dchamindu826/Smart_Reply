'use client';

import React from 'react';
import { useApp } from '@/context/AppContext';
import SectionThemeToggle from '@/components/common/SectionThemeToggle';

export default function BillingScreen() {
  const { addToast } = useApp();

  return (
    <>
      <div className="ph">
        <div>
          <h1>Meta usage &amp; billing</h1>
          <p>Meta charges per delivered template. Replies inside the 24-hour window are free.</p>
        </div>
        <div className="acts">
          <SectionThemeToggle />
          <button className="btn" onClick={() => addToast('Invoice downloaded.')}>
            Download invoice
          </button>
        </div>
      </div>

      <div className="stats">
        <div className="stat">
          <span>Month to date</span>
          <b>Rs 3,430</b>
          <small>Meta messaging</small>
        </div>
        <div className="stat ok">
          <span>Free replies</span>
          <b>1,284</b>
          <small>Inside the 24h window</small>
        </div>
        <div className="stat i">
          <span>Templates delivered</span>
          <b>118</b>
          <small>Utility 96 · Marketing 18 · Auth 4</small>
        </div>
        <div className="stat">
          <span>Smart Reply plan</span>
          <b>Growth</b>
          <small>5 seats · renews 1 Oct</small>
        </div>
      </div>

      <div className="card">
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th className="r">Delivered</th>
                <th className="r">Cost</th>
                <th>Used for</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><span className="chip">Marketing</span></td>
                <td className="r">18</td>
                <td className="r">Rs 2,450</td>
                <td>Offers, broadcasts</td>
              </tr>
              <tr>
                <td><span className="chip i">Utility</span></td>
                <td className="r">96</td>
                <td className="r">Rs 860</td>
                <td>Quotations, reminders, missed calls</td>
              </tr>
              <tr>
                <td><span className="chip">Authentication</span></td>
                <td className="r">4</td>
                <td className="r">Rs 120</td>
                <td>Login codes</td>
              </tr>
              <tr>
                <td><span className="chip ok">Service</span></td>
                <td className="r">1,284</td>
                <td className="r">Free</td>
                <td>Replies inside the window</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <p className="hint">
        Rates are demo figures. Meta publishes per-country prices; Sri Lanka numbers are billed at the Rest of Asia Pacific rate.
      </p>
    </>
  );
}
