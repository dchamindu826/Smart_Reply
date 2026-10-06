'use client';

import React, { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { Template } from '@/types';
import SectionThemeToggle from '@/components/common/SectionThemeToggle';

export default function TemplatesScreen() {
  const { role, templates, addTemplate, openSheet, closeSheet, addToast } = useApp();
  const isStaff = role === 'staff';

  const [filter, setFilter] = useState('all');

  const filteredTemplates = templates.filter(t => {
    if (filter === 'all') return true;
    return t.st === filter;
  });

  const handleOpenNewTemplateSheet = () => {
    let name = 'site_visit_confirm';
    let cat = 'Utility';
    let lang = 'English';
    let body = 'Hi {{1}}, our team will visit {{2}} on {{3}} to take measurements.';
    let buttons = 'Confirm, Change time';

    openSheet(
      <TemplateCreator
        onSave={(newTpl) => {
          addTemplate(newTpl);
          closeSheet();
        }}
      />
    );
  };

  return (
    <>
      <div className="ph">
        <div>
          <h1>Message templates</h1>
          <p>
            Needed to message a customer after the 24-hour window closes. Meta reviews each template, usually within minutes.
          </p>
        </div>
        <div className="acts">
          <SectionThemeToggle />
          {!isStaff && (
            <button className="btn pri" onClick={handleOpenNewTemplateSheet}>
              New template
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <div className="seg">
            {[
              { id: 'all', label: `All ${templates.length}` },
              { id: 'ok', label: 'Approved' },
              { id: 'w', label: 'In review' },
              { id: 'b', label: 'Rejected' }
            ].map(tab => (
              <button
                key={tab.id}
                aria-pressed={filter === tab.id}
                className={filter === tab.id ? 'active' : ''}
                onClick={() => setFilter(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Language</th>
                <th>Body</th>
                <th>Status</th>
                <th>Quality</th>
                <th className="r">Sent</th>
                <th className="r" />
              </tr>
            </thead>
            <tbody>
              {filteredTemplates.map(t => (
                <tr key={t.n}>
                  <td><b>{t.n}</b></td>
                  <td>{t.cat}</td>
                  <td>{t.lang}</td>
                  <td style={{ maxWidth: '320px', fontSize: '12.5px', color: 'var(--ink-2)' }}>
                    {t.body}
                    {t.why && (
                      <div style={{ color: 'var(--bad)', marginTop: '3px' }}>
                        Meta: {t.why}
                      </div>
                    )}
                  </td>
                  <td><span className={`chip ${t.st}`}>{t.stt}</span></td>
                  <td>{t.q}</td>
                  <td className="r">{t.used}</td>
                  <td className="r">
                    {!isStaff && (
                      t.st === 'b' ? (
                        <button
                          className="btn sm pri"
                          onClick={() => addToast('Resubmitted to Meta for review.')}
                        >
                          Fix &amp; resubmit
                        </button>
                      ) : (
                        <button
                          className="btn sm"
                          onClick={() => addToast('Template editor opened.')}
                        >
                          Edit
                        </button>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="note i">
        <span className="ic">◈</span>
        <div>
          <b>Categories decide the price</b>
          Utility (order updates, reminders) costs less than Marketing (offers). Authentication is for login codes. Replies inside the 24-hour window are free.
        </div>
      </div>
    </>
  );
}

function TemplateCreator({ onSave }: { onSave: (tpl: Template) => void }) {
  const [name, setName] = useState('site_visit_confirm');
  const [cat, setCat] = useState('Utility');
  const [lang, setLang] = useState('English');
  const [body, setBody] = useState('Hi {{1}}, our team will visit {{2}} on {{3}} to take measurements.');
  const [buttons, setButtons] = useState('Confirm, Change time');

  const btnList = buttons.split(',').map(b => b.trim()).filter(Boolean);

  return (
    <>
      <h2>New template</h2>
      <p className="sub">Goes to Meta for review before it can be sent.</p>

      <label className="f" htmlFor="tName">Name</label>
      <input
        className="f-in"
        id="tName"
        value={name}
        onChange={e => setName(e.target.value)}
      />

      <div className="f-row f2">
        <div>
          <label className="f">Category</label>
          <select className="f-in" value={cat} onChange={e => setCat(e.target.value)}>
            <option>Utility</option>
            <option>Marketing</option>
            <option>Authentication</option>
          </select>
        </div>
        <div>
          <label className="f">Language</label>
          <select className="f-in" value={lang} onChange={e => setLang(e.target.value)}>
            <option>English</option>
            <option>Sinhala</option>
            <option>Tamil</option>
          </select>
        </div>
      </div>

      <label className="f" htmlFor="tBody">Body</label>
      <textarea
        className="f-in"
        id="tBody"
        rows={4}
        value={body}
        onChange={e => setBody(e.target.value)}
      />
      <p className="hint">{"{{1}}, {{2}} … are filled in when you send."}</p>

      <label className="f" htmlFor="tBtns">Buttons (comma-separated)</label>
      <input
        className="f-in"
        id="tBtns"
        value={buttons}
        onChange={e => setButtons(e.target.value)}
      />

      <label className="f">Preview</label>
      <div className="tpv">
        <div className="bb out" style={{ maxWidth: '100%' }}>
          {body.replace('{{1}}', 'Kasun').replace('{{2}}', 'Kandy').replace('{{3}}', 'Saturday 10am')}
          {btnList.length > 0 && (
            <div className="bt">
              {btnList.map((b, i) => (
                <span key={i}>{b}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      <button
        className="btn pri"
        style={{ width: '100%', justifyContent: 'center', marginTop: '14px' }}
        onClick={() => {
          onSave({
            n: name,
            cat,
            lang,
            st: 'w',
            stt: 'In review',
            q: '—',
            used: 0,
            body,
            btn: btnList
          });
        }}
      >
        Submit for review
      </button>
    </>
  );
}
