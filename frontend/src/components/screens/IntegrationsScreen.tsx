'use client';

import React from 'react';
import { useApp } from '@/context/AppContext';

export default function IntegrationsScreen() {
  const { addToast } = useApp();

  return (
    <>
      <div className="ph">
        <div>
          <h1>Webhooks &amp; API</h1>
          <p>How Smart Reply talks to Meta. Your developer needs these; staff never do.</p>
        </div>
        <div className="acts">
          <button
            className="btn"
            onClick={() => addToast('Test event sent. 200 OK in 180 ms.')}
          >
            Send test event
          </button>
        </div>
      </div>

      <div className="grid g2">
        <div className="card">
          <div className="card-h">
            <h2>Meta webhook</h2>
            <span className="chip ok">Verified</span>
          </div>
          <div className="card-b">
            <div className="ln">
              <span>Callback URL</span>
              <b>https://app.smartreply.lk/api/webhooks/whatsapp</b>
            </div>
            <div className="ln">
              <span>Fields</span>
              <b>messages · calls · message_template_status_update</b>
            </div>
            <div className="ln">
              <span>Last event</span>
              <b>10:50:12 · call.terminate</b>
            </div>
            <div className="ln">
              <span>Failures (24h)</span>
              <b>0</b>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <h2>Recent events</h2>
          </div>
          <div className="list-row">
            <span className="dot ok" />
            <div className="bd">
              <b>messages · text</b>
              <span>Kasun Perera · 10:46</span>
            </div>
          </div>
          <div className="list-row">
            <span className="dot ok" />
            <div className="bd">
              <b>calls · connect</b>
              <span>Kasun Perera · 10:45</span>
            </div>
          </div>
          <div className="list-row">
            <span className="dot w" />
            <div className="bd">
              <b>message_template_status_update · REJECTED</b>
              <span>avurudu_offer · 09:12</span>
            </div>
          </div>
          <div className="list-row">
            <span className="dot ok" />
            <div className="bd">
              <b>statuses · read</b>
              <span>quotation_ready · 10:47</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
