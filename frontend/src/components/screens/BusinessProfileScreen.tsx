'use client';

import React from 'react';
import { useApp } from '@/context/AppContext';

export default function BusinessProfileScreen() {
  const { addToast } = useApp();

  return (
    <>
      <div className="ph">
        <div>
          <h1>Business profile</h1>
          <p>What customers see when they open the chat.</p>
        </div>
        <div className="acts">
          <button className="btn pri" onClick={() => addToast('Profile updated on WhatsApp.')}>
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
            <label className="f" htmlFor="bpName">Display name</label>
            <input className="f-in" id="bpName" defaultValue="Madushan Aluminium" />

            <label className="f" htmlFor="bpAbout">About</label>
            <input className="f-in" id="bpAbout" defaultValue="Kitchen cabinets · vanities · wardrobes" />

            <label className="f" htmlFor="bpAddr">Address</label>
            <input className="f-in" id="bpAddr" defaultValue="No. 45, Kandy Road, Kadawatha" />

            <label className="f" htmlFor="bpWeb">Website</label>
            <input className="f-in" id="bpWeb" defaultValue="madushanaluminium.lk" />

            <label className="f" htmlFor="bpMail">Email</label>
            <input className="f-in" id="bpMail" defaultValue="info@madushanaluminium.lk" />
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <h2>Greeting &amp; away</h2>
          </div>
          <div className="card-b">
            <label className="tgl">
              <input type="checkbox" defaultChecked />
              <span>Greeting for first-time customers</span>
            </label>
            <textarea className="f-in" style={{ margin: '6px 0 10px' }} defaultValue="ආයුබෝවන්! Madushan Aluminium. Kitchen, bathroom, wardrobe ගැන අහන්න." />

            <label className="tgl">
              <input type="checkbox" defaultChecked />
              <span>Away message outside call hours</span>
            </label>
            <textarea className="f-in" style={{ marginTop: '6px' }} defaultValue="We’re closed now. We’ll reply from 9am tomorrow." />
          </div>
        </div>
      </div>
    </>
  );
}
