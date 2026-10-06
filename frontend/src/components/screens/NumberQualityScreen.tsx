'use client';

import React from 'react';

export default function NumberQualityScreen() {
  return (
    <>
      <div className="ph">
        <div>
          <h1>Number &amp; quality</h1>
          <p>Health of the WhatsApp Business number, as Meta reports it.</p>
        </div>
      </div>

      <div className="stats">
        <div className="stat ok">
          <span>Quality rating</span>
          <b>High</b>
          <small>No blocks in 7 days</small>
        </div>
        <div className="stat i">
          <span>Messaging limit</span>
          <b>1K</b>
          <small>Customers per 24h · next tier 10K</small>
        </div>
        <div className="stat">
          <span>Name status</span>
          <b>Approved</b>
          <small>Madushan Aluminium</small>
        </div>
        <div className="stat">
          <span>Business username</span>
          <b>@madushanalu</b>
          <small>Reserved</small>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <h2>Connection</h2>
          <span className="chip ok">Cloud API</span>
        </div>
        <div className="card-b">
          <div className="ln"><span>Phone number</span><b>+94 77 123 4567</b></div>
          <div className="ln"><span>Phone number ID</span><b>1098 •••• 4412</b></div>
          <div className="ln"><span>WhatsApp Business account</span><b>Madushan Aluminium (verified)</b></div>
          <div className="ln"><span>Two-step verification</span><b>On</b></div>
          <div className="ln"><span>Registered</span><b>22 Sep 2026</b></div>
        </div>
      </div>
    </>
  );
}
