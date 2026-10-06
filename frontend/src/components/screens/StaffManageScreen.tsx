'use client';

import React from 'react';
import { useApp } from '@/context/AppContext';
import SectionThemeToggle from '@/components/common/SectionThemeToggle';

export default function StaffManageScreen() {
  const { staff, addToast } = useApp();

  return (
    <>
      <div className="ph">
        <div>
          <h1>Staff manage</h1>
          <p>
            Who answers chats and calls on +94 77 123 4567. Each person logs in to the app with their own account.
          </p>
        </div>
        <div className="acts">
          <SectionThemeToggle />
          <button className="btn pri" onClick={() => addToast('Invite sent by SMS and email.')}>
            Add staff
          </button>
        </div>
      </div>

      <div className="card">
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th>Status</th>
                <th className="r">Open chats</th>
                <th className="r">Avg reply</th>
                <th className="r">Calls today</th>
                <th>Can</th>
                <th className="r" />
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <div className="emp">
                    <i className="av">MP</i>
                    <span>
                      <b>Madushan P.</b>
                      <span>Owner · 077 123 4567</span>
                    </span>
                  </div>
                </td>
                <td><span className="chip i">Manager</span></td>
                <td><span className="chip ok">Available</span></td>
                <td className="r">0</td>
                <td className="r">—</td>
                <td className="r">0</td>
                <td>Everything</td>
                <td className="r">
                  <button className="btn sm" onClick={() => addToast('Profile opened.')}>
                    Edit
                  </button>
                </td>
              </tr>
              {staff.map(s => (
                <tr key={s.id}>
                  <td>
                    <div className="emp">
                      <i className={`av st ${s.st}`}>{s.i}</i>
                      <span>
                        <b>{s.n}</b>
                        <span>Staff · Sales</span>
                      </span>
                    </div>
                  </td>
                  <td><span className="chip">Staff</span></td>
                  <td>
                    <span className="scs">
                      <span className={`chip sc ${s.call.st === 'available' ? 'ok' : 'w'}`}>
                        ☏ {s.stt}
                      </span>
                    </span>
                  </td>
                  <td className="r">{s.open}</td>
                  <td className="r">{s.rep}</td>
                  <td className="r">{s.calls}</td>
                  <td>Own chats · calls · templates</td>
                  <td className="r">
                    <button className="btn sm" onClick={() => addToast('Profile opened.')}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid g2">
        <div className="card">
          <div className="card-h">
            <h2>What staff can do</h2>
          </div>
          <div className="card-b">
            <label className="tgl">
              <input type="checkbox" defaultChecked />
              <span>Reply and call customers assigned to them</span>
            </label>
            <label className="tgl">
              <input type="checkbox" defaultChecked />
              <span>Send approved templates</span>
            </label>
            <label className="tgl">
              <input type="checkbox" />
              <span>See chats assigned to others</span>
              <small>Off</small>
            </label>
            <label className="tgl">
              <input type="checkbox" />
              <span>Create or edit templates</span>
              <small>Manager only</small>
            </label>
            <label className="tgl">
              <input type="checkbox" defaultChecked />
              <span>Export their own performance</span>
            </label>
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <h2>Seats</h2>
            <span className="chip">Growth plan</span>
          </div>
          <div className="card-b">
            <div className="ln">
              <span>Used</span>
              <b>4 of 5</b>
            </div>
            <div className="meter" style={{ margin: '6px 0 10px' }}>
              <i style={{ width: '80%' }} />
            </div>
            <div className="ln">
              <span>Mobile app</span>
              <b>Android + iOS</b>
            </div>
            <div className="ln">
              <span>Web dashboard</span>
              <b>Included</b>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
