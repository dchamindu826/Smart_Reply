'use client';

import React from 'react';
import { useApp } from '@/context/AppContext';
import SectionThemeToggle from '@/components/common/SectionThemeToggle';

export default function LabelsScreen() {
  const { addToast } = useApp();

  return (
    <>
      <div className="ph">
        <div>
          <h1>Labels</h1>
          <p>Labels sort chats in the inbox and pick audiences for broadcasts.</p>
        </div>
        <div className="acts">
          <SectionThemeToggle />
          <button className="btn pri" onClick={() => addToast('New label created.')}>
            New label
          </button>
        </div>
      </div>

      <div className="card">
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Label</th>
                <th>Meaning</th>
                <th className="r">Chats</th>
                <th>Auto-apply rule</th>
                <th className="r" />
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><span className="chip i">Quotation</span></td>
                <td>Customer asked for a price</td>
                <td className="r">9</td>
                <td>When a quotation_ready template is sent</td>
                <td className="r">
                  <button className="btn sm" onClick={() => addToast('Label editor opened.')}>
                    Edit
                  </button>
                </td>
              </tr>
              <tr>
                <td><span className="chip w">Site visit</span></td>
                <td>Measurement visit booked</td>
                <td className="r">4</td>
                <td>When /measure is used</td>
                <td className="r">
                  <button className="btn sm" onClick={() => addToast('Label editor opened.')}>
                    Edit
                  </button>
                </td>
              </tr>
              <tr>
                <td><span className="chip ok">Advance paid</span></td>
                <td>50% advance received</td>
                <td className="r">6</td>
                <td>Manual</td>
                <td className="r">
                  <button className="btn sm" onClick={() => addToast('Label editor opened.')}>
                    Edit
                  </button>
                </td>
              </tr>
              <tr>
                <td><span className="chip i">Installation</span></td>
                <td>Installation date fixed</td>
                <td className="r">3</td>
                <td>When installation_reminder is sent</td>
                <td className="r">
                  <button className="btn sm" onClick={() => addToast('Label editor opened.')}>
                    Edit
                  </button>
                </td>
              </tr>
              <tr>
                <td><span className="chip b">Hot lead</span></td>
                <td>Likely to order this week</td>
                <td className="r">2</td>
                <td>Manual</td>
                <td className="r">
                  <button className="btn sm" onClick={() => addToast('Label editor opened.')}>
                    Edit
                  </button>
                </td>
              </tr>
              <tr>
                <td><span className="chip">Wardrobe</span></td>
                <td>Asked about wardrobes</td>
                <td className="r">5</td>
                <td>Message contains “wardrobe”</td>
                <td className="r">
                  <button className="btn sm" onClick={() => addToast('Label editor opened.')}>
                    Edit
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
