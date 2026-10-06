'use client';

import React from 'react';
import { useApp } from '@/context/AppContext';

export default function ProfileSettingsScreen() {
  const { addToast } = useApp();

  return (
    <>
      <div className="ph">
        <div>
          <h1>Profile settings</h1>
          <p>What customers see when you reply.</p>
        </div>
        <div className="acts">
          <button className="btn pri" onClick={() => addToast('Profile saved.')}>
            Save
          </button>
        </div>
      </div>

      <div className="grid g2">
        <div className="card">
          <div className="card-h">
            <h2>Profile</h2>
          </div>
          <div className="card-b">
            <label className="f" htmlFor="pfName">Name shown to customers</label>
            <input className="f-in" id="pfName" defaultValue="Nimal" />

            <label className="f">Language</label>
            <select className="f-in" defaultValue="English + Sinhala">
              <option>English + Sinhala</option>
              <option>Sinhala</option>
              <option>Tamil</option>
            </select>

            <label className="f" htmlFor="pfSig">Signature</label>
            <input className="f-in" id="pfSig" defaultValue="– Nimal, Madushan Aluminium" />
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <h2>Notifications</h2>
          </div>
          <div className="card-b">
            <label className="tgl">
              <input type="checkbox" defaultChecked />
              <span>New chat assigned to me</span>
            </label>
            <label className="tgl">
              <input type="checkbox" defaultChecked />
              <span>Incoming call ringtone</span>
            </label>
            <label className="tgl">
              <input type="checkbox" />
              <span>Every message in my chats</span>
            </label>
          </div>
        </div>
      </div>
    </>
  );
}
