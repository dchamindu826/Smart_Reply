/**
 * AI voice agent: routing hand-off, booking tools, admin and bookings API, and full calls
 * against a fake Gemini (REST, streamed TTS and a Live WebSocket) with real WebRTC audio.
 */
import { createServer, IncomingMessage, Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { WebSocketServer, WebSocket as WsSocket } from 'ws';
import { v7 as uuidv7 } from 'uuid';
import { closeApp, createCompany, createUser, db, getApp, getWorker, signIn, TestCompany } from './helpers';
import { encrypt } from '../src/common/crypto';
import { env } from '../src/config';
import { aiAddons, aiBotSettings, bookings, callEvents, calls, contacts, platformSettings, whatsappAccounts } from '../src/db/schema';
import { Queues } from '../src/infra/queues';
import { Platform } from '../src/meta/platform';
import { CallsEngine } from '../src/modules/calls/calls.engine';
import { VoiceAgent } from '../src/voice/agent.service';
import { rms } from '../src/voice/audio';
import { VoiceBus } from '../src/voice/bus';
import { CallMedia } from '../src/voice/media';
import { VoiceTools, slotStarts, zonedTime } from '../src/voice/tools';
import { VoiceProcessModule } from '../src/voice/voice.module';

/* ───────── Fake Gemini ───────── */

const tone = (ms: number, rate: number, amp = 9000): Int16Array => {
  const n = Math.round((rate * ms) / 1000);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.round(amp * Math.sin((2 * Math.PI * 330 * i) / rate));
  return out;
};
const b64 = (pcm: Int16Array) => Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength).toString('base64');

const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo' }).format(new Date(Date.now() + 86_400_000));

const gemini = {
  brainCalls: 0,
  ttsCalls: 0,
  transcribeCalls: 0,
  summaryCalls: 0,
  liveSetups: 0,
  liveAudioIn: 0,
  keys: new Set<string>()
};

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise(resolve => {
    let s = '';
    req.on('data', c => (s += c));
    req.on('end', () => resolve(s));
  });
}

interface FakePart {
  text?: string;
  functionResponse?: { name: string };
  inlineData?: unknown;
}

function brainReply(body: { contents: { role: string; parts: FakePart[] }[] }): unknown {
  const last = body.contents[body.contents.length - 1];
  const response = last.parts.find(p => p.functionResponse)?.functionResponse?.name;
  if (!response) return { functionCall: { name: 'check_availability', args: { date: tomorrow } } };
  if (response === 'check_availability') {
    return { functionCall: { name: 'create_booking', args: { date: tomorrow, time: '11:00', service: 'Eye test', customer_name: 'Nimal' } } };
  }
  return { text: 'හරි, ඔයාගේ booking එක හෙට උදේ දහයට දැම්මා.' };
}

async function startFakeGemini(): Promise<{ server: Server; url: string }> {
  const server = createServer(async (req, res) => {
    gemini.keys.add(String(req.headers['x-goog-api-key'] ?? ''));
    const raw = await readBody(req);
    const body = JSON.parse(raw || '{}') as { contents: { role: string; parts: FakePart[] }[] };
    const allText = JSON.stringify(body.contents ?? []);
    if (req.url?.includes(':streamGenerateContent')) {
      gemini.ttsCalls++;
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      for (let i = 0; i < 2; i++) {
        const event = { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: b64(tone(300, 24000)) } }] } }] };
        res.write(`data: ${JSON.stringify(event)}\r\n\r\n`);
      }
      res.end();
      return;
    }
    let part: unknown;
    if (allText.includes('Write exactly what the caller says')) {
      gemini.transcribeCalls++;
      part = { text: 'මට හෙට booking එකක් ඕන' };
    } else if (allText.includes('Summarise this phone call')) {
      gemini.summaryCalls++;
      part = { text: 'The caller booked an eye test for tomorrow at 10:00.' };
    } else {
      gemini.brainCalls++;
      part = brainReply(body);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [part] } }], usageMetadata: { totalTokenCount: 10 } }));
  });
  const wss = new WebSocketServer({ server });
  wss.on('connection', (ws: WsSocket) => {
    let audioIn = 0;
    let asked = false;
    const speak = (text: string) => {
      ws.send(JSON.stringify({ serverContent: { outputTranscription: { text } } }));
      ws.send(JSON.stringify({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: b64(tone(400, 24000)) } }] } } }));
      ws.send(JSON.stringify({ serverContent: { turnComplete: true } }));
    };
    ws.on('message', data => {
      const msg = JSON.parse(String(data)) as { setup?: unknown; realtimeInput?: { text?: string; audio?: unknown }; toolResponse?: unknown };
      if (msg.setup) {
        gemini.liveSetups++;
        ws.send(JSON.stringify({ setupComplete: {} }));
      } else if (msg.realtimeInput?.text) {
        speak('ආයුබෝවන්!');
      } else if (msg.realtimeInput?.audio) {
        audioIn++;
        gemini.liveAudioIn++;
        if (audioIn >= 15 && !asked) {
          asked = true;
          ws.send(JSON.stringify({ serverContent: { inputTranscription: { text: 'ස්තූතියි, එච්චරයි' } } }));
          ws.send(JSON.stringify({ toolCall: { functionCalls: [{ id: 'c1', name: 'end_call', args: {} }] } }));
        }
      } else if (msg.toolResponse) {
        speak('ස්තූතියි! සුභ දවසක්.');
      }
    });
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
  return { server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

/* ───────── Fake Meta ───────── */

const metaCalls: { action: string; callId: string; sdp?: string }[] = [];
function stubMeta(): void {
  const real = globalThis.fetch;
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith('http://meta.test')) return real(input, init);
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    if (url.endsWith('/calls')) {
      const session = body.session as { sdp?: string } | undefined;
      metaCalls.push({ action: String(body.action), callId: String(body.call_id), sdp: session?.sdp });
    }
    if (url.endsWith('/messages')) return new Response(JSON.stringify({ messaging_product: 'whatsapp', messages: [{ id: `wamid.${Date.now()}` }] }), { status: 200 });
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  });
}

/* ───────── Helpers ───────── */

async function until<T>(fn: () => Promise<T | null | undefined | false> | T | null | undefined | false, ms = 15000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('Timed out waiting');
    await new Promise(r => setTimeout(r, 50));
  }
}

async function enableVoice(companyId: string, patch: Partial<typeof aiBotSettings.$inferInsert> = {}): Promise<void> {
  await db().insert(aiAddons).values({ companyId, status: 'active', monthlyReplyLimit: 100 }).onConflictDoUpdate({ target: aiAddons.companyId, set: { status: 'active' } });
  await db()
    .insert(aiBotSettings)
    .values({ companyId, voiceBotEnabled: true, ...patch })
    .onConflictDoUpdate({ target: aiBotSettings.companyId, set: { voiceBotEnabled: true, ...patch } });
}

async function incomingCall(companyId: string, waCallId: string, sdp: string, from = '94771234567'): Promise<typeof calls.$inferSelect> {
  const [wa] = await db().select().from(whatsappAccounts).where(eq(whatsappAccounts.companyId, companyId));
  await (await getWorker()).get(CallsEngine).handleCallWebhook(companyId, {
    messaging_product: 'whatsapp',
    metadata: { phone_number_id: wa.phoneNumberId },
    contacts: [{ profile: { name: 'Nimal Perera' }, wa_id: from }],
    calls: [{ id: waCallId, from, to: '94770000000', event: 'connect', timestamp: String(Math.floor(Date.now() / 1000)), direction: 'USER_INITIATED', session: { sdp_type: 'offer', sdp } }]
  });
  const [row] = await db().select().from(calls).where(and(eq(calls.companyId, companyId), eq(calls.waCallId, waCallId)));
  return row;
}

const loudFrames = (frames: Int16Array[]) => frames.filter(f => rms(f) > 2000).length;

describe('AI voice agent', () => {
  let a: TestCompany;
  let b: TestCompany;
  let voice: INestApplicationContext;
  let agent: VoiceAgent;
  let fake: { server: Server; url: string };

  beforeAll(async () => {
    const app = await getApp();
    await getWorker();
    stubMeta();
    fake = await startFakeGemini();
    env.GEMINI_API_URL = fake.url;
    a = await createCompany({ staffCount: 1, whatsapp: true });
    b = await createCompany({ staffCount: 1, whatsapp: true });
    await db().insert(platformSettings).values({ id: 1 }).onConflictDoNothing();
    await db().update(platformSettings).set({ geminiApiKeyEnc: encrypt('gemini-test-key') }).where(eq(platformSettings.id, 1));
    app.get(Platform).invalidate();
    (await getWorker()).get(Platform, { strict: false }).invalidate();
    voice = await NestFactory.createApplicationContext(VoiceProcessModule, { logger: ['error'] });
    voice.get(Platform, { strict: false }).invalidate();
    agent = voice.get(VoiceAgent);
  });

  afterAll(async () => {
    await agent?.stopAll();
    await voice?.close();
    fake?.server.close();
    vi.unstubAllGlobals();
    await closeApp();
  });

  it('works out slots and local times', () => {
    const hours = { enabled: true, timezone: 'Asia/Colombo', weekly: [{ day: 'MONDAY' as const, open: '0900', close: '1100' }], holidays: [{ date: '2026-12-07' }] };
    expect(slotStarts(hours, '2026-11-30', 30)).toEqual(['0900', '0930', '1000', '1030']);
    expect(slotStarts(hours, '2026-12-01', 30)).toEqual([]); // Tuesday: closed
    expect(slotStarts(hours, '2026-12-07', 30)).toEqual([]); // holiday
    expect(zonedTime('2026-11-30', '1000', 'Asia/Colombo').toISOString()).toBe('2026-11-30T04:30:00.000Z');
  });

  it('leaves calls to people when the voice agent is off', async () => {
    const row = await incomingCall(b.id, `wacid.v.${uuidv7()}`, 'v=0\r\n');
    expect(row.handledByAi).toBe(false);
    expect(row.ringingUserIds.length).toBeGreaterThan(0);
  });

  it('hands calls to the AI by the company rule and blocks staff from answering them', async () => {
    await enableVoice(a.id, { voiceAnswerWhen: 'always' });
    const row = await incomingCall(a.id, `wacid.v.${uuidv7()}`, 'v=0\r\n');
    expect(row.handledByAi).toBe(true);
    expect(row.outcome).toBe('ringing');
    expect(row.ringingUserIds).toEqual([]);
    const job = await (await getApp()).get(Queues).queues.voice.getJob(`voice-${row.id}`);
    expect(job?.name).toBe('voice.answer');
    await job?.remove();

    const mgr = await signIn(a.manager);
    const res = await mgr.post(`/api/v1/calls/${row.id}/answer`, { sdpAnswer: 'v=0\r\n'.padEnd(40, ' ') });
    expect(res.status).toBe(409);

    // The AI could not take it: the normal missed-call rule runs.
    await (await getWorker()).get(CallsEngine).aiUnavailable(row.id, 'busy');
    const [after] = await db().select().from(calls).where(eq(calls.id, row.id));
    expect(after.outcome).toBe('missed');
  });

  it('with "calls nobody answers", rings people first and then hands over', async () => {
    await enableVoice(a.id, { voiceAnswerWhen: 'no_answer' });
    const row = await incomingCall(a.id, `wacid.v.${uuidv7()}`, 'v=0\r\n');
    expect(row.handledByAi).toBe(false);
    expect(row.ringingUserIds.length).toBeGreaterThan(0);
    await (await getWorker()).get(CallsEngine).ringTimeout(row.id, 0);
    const [after] = await db().select().from(calls).where(eq(calls.id, row.id));
    expect(after.handledByAi).toBe(true);
    expect(after.outcome).toBe('ringing');
    await (await getApp()).get(Queues).queues.voice.remove(`voice-${row.id}`);
  });

  it('books, refuses taken slots and keeps bookings inside the company', async () => {
    const [contact] = await db().insert(contacts).values({ companyId: a.id, waId: '94775550000', name: 'Kamal' }).returning();
    const ctx = {
      companyId: a.id,
      contactId: contact.id,
      callId: null,
      timezone: 'Asia/Colombo',
      hours: { enabled: false, timezone: 'Asia/Colombo', weekly: [], holidays: [] },
      booking: { enabled: true, services: ['Eye test', 'Frame fitting'], slotMinutes: 30, capacity: 1, daysAhead: 14 },
      dryRun: false
    };
    const tools = new VoiceTools(db(), ctx);
    const free = (await tools.run('check_availability', { date: tomorrow })) as { freeTimes: string[] };
    expect(free.freeTimes).toContain('10:00');
    expect(await tools.run('create_booking', { date: tomorrow, time: '10:00' })).toMatchObject({ error: expect.stringContaining('which service') });
    const made = (await tools.run('create_booking', { date: tomorrow, time: '10:00', service: 'eye test' })) as { ok: boolean; booking_id: string };
    expect(made.ok).toBe(true);
    expect(await tools.run('create_booking', { date: tomorrow, time: '10:00', service: 'Eye test' })).toMatchObject({ error: 'That time is not free.' });
    expect(await tools.run('check_availability', { date: '2020-01-01' })).toMatchObject({ error: 'That date has passed.' });
    const info = (await tools.run('get_customer_info')) as { name: string; upcomingBookings: { booking_id: string }[] };
    expect(info.name).toBe('Kamal');
    expect(info.upcomingBookings.map(x => x.booking_id)).toContain(made.booking_id);

    // A test call never writes.
    const dry = new VoiceTools(db(), { ...ctx, dryRun: true });
    expect(await dry.run('create_booking', { date: tomorrow, time: '10:30', service: 'Eye test' })).toMatchObject({ ok: true, test: true });
    expect((await db().select().from(bookings).where(eq(bookings.companyId, a.id))).length).toBe(1);

    const mgrA = await signIn(a.manager);
    const listA = await mgrA.get('/api/v1/bookings');
    expect(listA.status).toBe(200);
    expect(listA.body.map((x: { id: string }) => x.id)).toContain(made.booking_id);
    const mgrB = await signIn(b.manager);
    expect((await mgrB.get('/api/v1/bookings')).body).toEqual([]);
    expect((await mgrB.patch(`/api/v1/bookings/${made.booking_id}`, { status: 'cancelled' })).status).toBe(404);
    const done = await mgrA.patch(`/api/v1/bookings/${made.booking_id}`, { status: 'done' });
    expect(done.body.status).toBe('done');
  });

  it('lets only the system admin use the voice tools and save voice settings', async () => {
    const mgr = await signIn(a.manager);
    expect((await mgr.get('/api/v1/admin/ai/voice/status')).status).toBe(403);
    expect((await mgr.post(`/api/v1/admin/companies/${a.id}/ai/voice/preview`, {})).status).toBe(403);
    const admin = await signIn(await createUser(null, 'system_admin'));
    const status = await admin.get('/api/v1/admin/ai/voice/status');
    expect(status.status).toBe(200);
    expect(status.body.geminiKeySet).toBe(true);
    const current = (await admin.get(`/api/v1/admin/companies/${a.id}/ai/settings`)).body;
    const saved = await admin.put(`/api/v1/admin/companies/${a.id}/ai/settings`, { ...current, voiceMode: 'studio', voiceTtsVoice: 'Hali', voiceServices: 'Eye test' });
    expect(saved.status).toBe(200);
    expect(saved.body.voiceTtsVoice).toBe('Hali');
    const wavRes = await admin.post(`/api/v1/admin/companies/${a.id}/ai/voice/preview`, { text: 'ආයුබෝවන්' }).buffer(true);
    expect(wavRes.status).toBe(200);
    expect(wavRes.headers['content-type']).toContain('audio/wav');
    expect(gemini.keys.has('gemini-test-key')).toBe(true);
  });

  it('Studio mode: greets, hears the caller, books with tools and speaks the answer (test call)', async () => {
    await enableVoice(a.id, { voiceMode: 'studio', voiceBookingEnabled: true, voiceServices: 'Eye test', voiceLanguage: 'sinhala' });
    const browser = await CallMedia.offer();
    const heard: Int16Array[] = [];
    browser.media.onAudio(pcm => heard.push(pcm));
    const testId = uuidv7();
    const bus = voice.get(VoiceBus);
    const answer = bus.waitTestAnswer(testId, 20);
    await agent.testCall({ testId, companyId: a.id, sdpOffer: browser.sdpOffer, mode: 'studio' });
    const got = await answer;
    expect(got?.sdpAnswer).toContain('a=candidate');
    await browser.applyAnswer(got!.sdpAnswer!);
    await browser.media.connected(10000);

    await until(() => loudFrames(heard) > 15); // the greeting
    const before = gemini.brainCalls;
    heard.length = 0;
    browser.media.play(tone(1200, 48000, 12000), 48000); // the caller talks…
    await until(() => gemini.brainCalls >= before + 3, 20000); // …availability, booking, answer
    await until(() => loudFrames(heard) > 15, 20000); // the spoken answer
    expect(gemini.transcribeCalls).toBeGreaterThan(0);

    agent.onControl({ action: 'hangup', testId });
    const result = await until(async () => {
      const r = await bus.readTest(testId);
      return r?.status === 'ended' ? r : null;
    });
    expect(result.bookings).toHaveLength(1);
    expect(result.transcript.some(l => l.role === 'caller')).toBe(true);
    expect(result.transcript.some(l => l.role === 'agent')).toBe(true);
    await browser.media.close();
  });

  it('Live mode: answers a real WhatsApp call, ends it, saves the transcript and summary', async () => {
    await enableVoice(a.id, { voiceMode: 'live', voiceAnswerWhen: 'always' });
    const phone = await CallMedia.offer(); // stands in for Meta's media server
    const heard: Int16Array[] = [];
    phone.media.onAudio(pcm => heard.push(pcm));
    const waCallId = `wacid.v.${uuidv7()}`;
    const row = await incomingCall(a.id, waCallId, phone.sdpOffer);
    expect(row.handledByAi).toBe(true);
    await (await getApp()).get(Queues).queues.voice.remove(`voice-${row.id}`);

    const setups = gemini.liveSetups;
    await agent.answerCall(row.id);
    expect(metaCalls.filter(c => c.callId === waCallId).map(c => c.action)).toEqual(['pre_accept', 'accept']);
    const [ongoing] = await db().select().from(calls).where(eq(calls.id, row.id));
    expect(ongoing.outcome).toBe('ongoing');
    const [ev] = await db().select().from(callEvents).where(and(eq(callEvents.callId, row.id), eq(callEvents.kind, 'ai_answered')));
    expect(ev).toBeTruthy();

    // Meta hands our answer to the phone; audio flows; the Live model greets and later ends the call.
    const accepted = metaCalls.find(c => c.callId === waCallId && c.action === 'accept');
    await phone.applyAnswer(accepted!.sdp!);
    await phone.media.connected(10000);
    await until(() => gemini.liveSetups > setups);
    await until(() => loudFrames(heard) > 10); // greeting
    phone.media.play(tone(2000, 48000, 12000), 48000); // the caller speaks; the fake model then calls end_call
    const ended = await until(async () => {
      const [r] = await db().select().from(calls).where(eq(calls.id, row.id));
      return r.outcome === 'answered' && r.aiSummary ? r : null;
    }, 25000);
    expect(ended.durationSeconds).not.toBeNull();
    expect(ended.aiSummary).toContain('eye test');
    const transcript = ended.transcript as { role: string; text: string }[];
    expect(transcript.some(l => l.role === 'agent' && l.text.includes('ආයුබෝවන්'))).toBe(true);
    expect(transcript.some(l => l.role === 'caller')).toBe(true);
    expect(metaCalls.filter(c => c.callId === waCallId).map(c => c.action)).toContain('terminate');
    const [addon] = await db().select().from(aiAddons).where(eq(aiAddons.companyId, a.id));
    expect(addon.voiceSecondsThisMonth).toBeGreaterThan(0);
    await phone.media.close();
  });
});
