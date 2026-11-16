import type { Call } from '@smart-reply/shared';
import { callReducer, endsCall, idleCall, type CallState } from './state';

const call = (over: Partial<Call> = {}): Call => ({
  id: 'call1',
  contactId: 'ct1',
  contact: { id: 'ct1', name: 'Nimal', initials: 'NI', phone: '+94 77 123 4567', avatarColor: 'a1' },
  direction: 'in',
  outcome: 'ringing',
  handledBy: null,
  startedAt: '2026-11-16T10:00:00Z',
  answeredAt: null,
  endedAt: null,
  durationSeconds: null,
  note: '',
  hasRecording: false,
  recordingUrl: null,
  hasSummary: false,
  summary: null,
  ivrOption: null,
  ...over
});

const ringing = (): CallState => callReducer(idleCall, { type: 'ringing', call: call(), sdpOffer: 'v=0 offer' });

describe('call state', () => {
  it('rings, answers and connects', () => {
    let s = ringing();
    expect(s).toMatchObject({ phase: 'incoming', direction: 'in', sdpOffer: 'v=0 offer' });
    s = callReducer(s, { type: 'answering' });
    expect(s.phase).toBe('connecting');
    s = callReducer(s, { type: 'connected', at: 5 });
    expect(s).toMatchObject({ phase: 'active', connectedAt: 5 });
  });

  it('ends when someone else answers first', () => {
    const s = callReducer(ringing(), { type: 'updated', call: call({ outcome: 'answered', handledBy: { userId: 'u2', name: 'Kamala' } }) }, 'u1');
    expect(s).toMatchObject({ phase: 'ended', message: 'Answered by Kamala' });
  });

  it('keeps our own answer going', () => {
    let s = callReducer(ringing(), { type: 'answering' });
    s = callReducer(s, { type: 'updated', call: call({ outcome: 'answered', handledBy: { userId: 'u1', name: 'Me' } }) }, 'u1');
    expect(s.phase).toBe('connecting');
  });

  it('ends on a missed or finished call', () => {
    expect(callReducer(ringing(), { type: 'updated', call: call({ outcome: 'missed' }) }).message).toBe('Missed call');
    const active = { ...ringing(), phase: 'active' as const };
    expect(endsCall(active, call({ outcome: 'answered', endedAt: '2026-11-16T10:05:00Z' }))).toBe(true);
    expect(endsCall(active, call({ outcome: 'ongoing' }))).toBe(false);
  });

  it('ignores a second ringing call while busy and other calls updates', () => {
    const s = callReducer(ringing(), { type: 'answering' });
    expect(callReducer(s, { type: 'ringing', call: call({ id: 'call2' }), sdpOffer: 'x' })).toBe(s);
    expect(callReducer(s, { type: 'updated', call: call({ id: 'call2', outcome: 'missed' }) })).toBe(s);
  });

  it('dials out and connects when the answer arrives', () => {
    let s = callReducer(idleCall, { type: 'dial', peer: { contactId: 'ct1', name: 'Nimal', initials: 'NI', phone: '', avatarColor: 'a1' } });
    s = callReducer(s, { type: 'placed', call: call({ direction: 'out' }) });
    expect(s).toMatchObject({ phase: 'dialing', direction: 'out' });
    s = callReducer(s, { type: 'connected', at: 1 });
    expect(s.phase).toBe('active');
    expect(callReducer(callReducer(s, { type: 'end', message: null }), { type: 'reset' })).toEqual(idleCall);
  });
});
