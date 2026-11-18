import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import IORedis from 'ioredis';
import { closeApp, createCompany, createUser, db, getApp, getWorker, signIn, Agent, TestCompany } from './helpers';
import { AiEngine } from '../src/modules/ai/ai.engine';
import { Platform } from '../src/meta/platform';
import { aiAddons, aiBotLogs, assignmentRules, contacts, conversations, messages } from '../src/db/schema';

interface AiAnswer {
  reply: string;
  intent: string;
  confidence: number;
  handoff: boolean;
  reason: string;
}

let answer: AiAnswer = { reply: 'Yes, the 1kg pack is Rs. 2,500.', intent: 'price_inquiry', confidence: 92, handoff: false, reason: 'catalog price' };
let aiCalls = 0;

function stubFetch(): void {
  const real = globalThis.fetch;
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith('http://ai.test')) {
      aiCalls++;
      const body = JSON.parse(String(init?.body)) as { model: string; response_format?: unknown; messages: { role: string }[] };
      expect(body.model).toBe('gpt-test');
      expect(body.response_format).toEqual({ type: 'json_object' });
      expect(body.messages[0].role).toBe('system');
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }], usage: { total_tokens: 123 } }), { status: 200 });
    }
    if (url.startsWith('http://meta.test')) {
      return new Response(JSON.stringify({ messaging_product: 'whatsapp', messages: [{ id: `wamid.${Date.now()}` }] }), { status: 200 });
    }
    return real(input, init);
  });
}

let seq = 0;
async function inbound(companyId: string, text: string): Promise<{ messageId: string; conversationId: string }> {
  seq++;
  const waId = `9477${String(Date.now()).slice(-5)}${seq}`.slice(0, 11);
  const [c] = await db().insert(contacts).values({ companyId, waId, name: `Customer ${seq}` }).returning();
  const [conv] = await db()
    .insert(conversations)
    .values({ companyId, contactId: c.id, lastInboundAt: new Date(), windowExpiresAt: new Date(Date.now() + 23 * 3600_000), botActive: true })
    .returning();
  const [m] = await db()
    .insert(messages)
    .values({ companyId, conversationId: conv.id, direction: 'in', type: 'text', body: text, senderKind: 'customer', status: 'delivered', waMessageId: `wamid.in.${seq}.${Date.now()}` })
    .returning();
  return { messageId: m.id, conversationId: conv.id };
}

const SETTINGS = {
  chatBotEnabled: true,
  voiceBotEnabled: false,
  chatBotMode: 'always',
  personaName: 'Sara',
  languageMode: 'trilingual',
  systemPrompt: 'You sell spices for Lanka Spice.',
  confidenceThreshold: 70,
  autoHandoffOnNegotiation: true,
  autoHandoffOnComplaint: true,
  autoHandoffOnStaffRequest: true,
  welcomeMessage: '',
  fallbackMessage: 'Thank you. One of our team will reply shortly.',
  voiceModel: '',
  voiceGreeting: '',
  autoTranscribeCalls: false,
  autoSummarizeCalls: false,
  missedCallAutoFollowup: false,
  missedCallMessageTemplate: '',
  voiceLanguage: 'trilingual',
  voiceSpeed: 1,
  model: ''
};

describe('AI bot', () => {
  let co: TestCompany;
  let adm: Agent;
  let mgr: Agent;
  let staff: Agent;
  let engine: AiEngine;

  beforeAll(async () => {
    const redis = new IORedis(process.env.REDIS_URL!);
    await redis.flushdb();
    redis.disconnect();
    await getApp();
    co = await createCompany({ staffCount: 1, whatsapp: true });
    await db().insert(assignmentRules).values({ companyId: co.id });
    adm = await signIn(await createUser(null, 'system_admin'));
    mgr = await signIn(co.manager);
    staff = await signIn(co.staff[0]);
    const w = await getWorker();
    engine = w.get(AiEngine, { strict: false });
    const put = await adm.put('/api/v1/admin/ai/platform', {
      provider: 'openai',
      apiKey: 'sk-test-key-1234567890',
      defaultModel: 'gpt-test',
      baseUrl: 'http://ai.test/v1',
      defaultPrompt: 'You work for a Sri Lankan business.',
      globalOff: false
    });
    expect(put.status).toBe(200);
    expect(put.body.apiKeyMasked).not.toContain('1234567890ab');
    w.get(Platform, { strict: false }).invalidate();
  });
  beforeEach(() => {
    stubFetch();
    aiCalls = 0;
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    await closeApp();
  });

  it('does nothing while the add-on is off', async () => {
    const { messageId } = await inbound(co.id, 'How much is the cinnamon?');
    expect(await engine.maybeReply(messageId)).toBe(false);
    expect(aiCalls).toBe(0);
    expect(await db().select().from(aiBotLogs).where(eq(aiBotLogs.messageId, messageId))).toHaveLength(0);
  });

  it('lets managers see and edit their bot settings, but not the admin routes', async () => {
    const status = await mgr.get('/api/v1/ai/status');
    expect(status.status).toBe(200);
    expect(status.body.status).toBe('off');
    const settings = await mgr.get('/api/v1/ai/settings');
    expect(settings.status).toBe(200);
    expect(settings.body).toHaveProperty('systemPrompt');
    expect(settings.body.knowledgeDocuments).toBe(0);
    expect((await mgr.get('/api/v1/ai/logs?channel=chat')).status).toBe(200);
    expect((await staff.get('/api/v1/ai/status')).status).toBe(403);

    const saved = await mgr.put('/api/v1/ai/settings', SETTINGS);
    expect(saved.status).toBe(200);
    expect(saved.body.personaName).toBe(SETTINGS.personaName);
    expect((await staff.put('/api/v1/ai/settings', SETTINGS)).status).toBe(403);
    for (const [method, path] of [
      ['post', '/api/v1/ai/settings'],
      ['post', '/api/v1/ai/activate'],
      ['put', '/api/v1/ai/addon'],
      ['post', '/api/v1/ai/knowledge'],
      ['post', '/api/v1/ai/examples'],
      ['post', '/api/v1/ai/simulate']
    ] as const) {
      expect((await mgr[method](path, SETTINGS)).status).toBe(404);
    }
    for (const [method, path] of [
      ['put', `/api/v1/admin/companies/${co.id}/ai/settings`],
      ['put', `/api/v1/admin/companies/${co.id}/ai/addon`],
      ['post', `/api/v1/admin/companies/${co.id}/ai/knowledge`],
      ['post', `/api/v1/admin/companies/${co.id}/ai/examples`],
      ['post', `/api/v1/admin/companies/${co.id}/ai/simulate`],
      ['put', '/api/v1/admin/ai/platform']
    ] as const) {
      expect((await mgr[method](path, SETTINGS)).status).toBe(403);
    }
  });

  it('records an activation request and shows it to admins first', async () => {
    const res = await mgr.post('/api/v1/ai/activation-request', { message: 'Please turn on the bot for night time.' });
    expect(res.status).toBe(200);
    expect(res.body.requestedAt).toBeTruthy();
    expect(res.body.requestedByName).toBe(co.manager.name);
    const list = await adm.get('/api/v1/admin/ai/companies');
    expect(list.status).toBe(200);
    expect(list.body[0].companyId).toBe(co.id);
  });

  it('replies when active and counts usage', async () => {
    const activate = await adm.put(`/api/v1/admin/companies/${co.id}/ai/addon`, { status: 'active', monthlyReplyLimit: 100 });
    expect(activate.status).toBe(200);
    expect(activate.body.status).toBe('active');
    expect(activate.body.requestedAt).toBeNull();
    const saved = await adm.put(`/api/v1/admin/companies/${co.id}/ai/settings`, SETTINGS);
    expect(saved.status).toBe(200);
    expect(saved.body.systemPrompt).toBe(SETTINGS.systemPrompt);
    const kn = await adm.post(`/api/v1/admin/companies/${co.id}/ai/knowledge`, { title: 'Prices', source: 'text', text: 'Cinnamon 1kg Rs. 2,500. Delivery island-wide in 2 days.' });
    expect(kn.status).toBe(201);
    expect(kn.body.characters).toBeGreaterThan(10);

    const { messageId, conversationId } = await inbound(co.id, 'How much is cinnamon 1kg?');
    expect(await engine.maybeReply(messageId)).toBe(true);
    expect(aiCalls).toBe(1);
    const out = await db()
      .select()
      .from(messages)
      .where(and(eq(messages.conversationId, conversationId), eq(messages.direction, 'out')));
    expect(out).toHaveLength(1);
    expect(out[0].senderKind).toBe('bot');
    expect(out[0].body).toBe(answer.reply);
    const [log] = await db().select().from(aiBotLogs).where(eq(aiBotLogs.messageId, messageId));
    expect(log.status).toBe('handled');
    expect(log.tokensUsed).toBe(123);
    expect(log.confidence).toBe(92);
    const [addon] = await db().select().from(aiAddons).where(eq(aiAddons.companyId, co.id));
    expect(addon.repliesThisMonth).toBe(1);
    expect(addon.tokensThisMonth).toBe(123);
    expect(addon.usageMonth).toBe(new Date().toISOString().slice(0, 7));

    // Safe to run twice.
    expect(await engine.maybeReply(messageId)).toBe(false);
    expect(aiCalls).toBe(1);

    const logs = await mgr.get('/api/v1/ai/logs');
    expect(logs.body[0].status).toBe('handled');
    expect((await mgr.get('/api/v1/ai/status')).body.repliesThisMonth).toBe(1);
  });

  it('hands off to a person on low confidence', async () => {
    answer = { reply: 'Maybe?', intent: 'other', confidence: 30, handoff: false, reason: 'not sure' };
    const { messageId, conversationId } = await inbound(co.id, 'Do you have organic turmeric from Jaffna?');
    expect(await engine.maybeReply(messageId)).toBe(true);
    const [log] = await db().select().from(aiBotLogs).where(eq(aiBotLogs.messageId, messageId));
    expect(log.status).toBe('handed_off');
    const [conv] = await db().select().from(conversations).where(eq(conversations.id, conversationId));
    expect(conv.botActive).toBe(false);
    const rows = await db().select().from(messages).where(eq(messages.conversationId, conversationId));
    expect(rows.some(r => r.direction === 'out' && r.senderKind === 'bot' && r.body === SETTINGS.fallbackMessage)).toBe(true);
    expect(rows.some(r => r.direction === 'system' && r.body.startsWith('AI bot handed off: low confidence'))).toBe(true);
    const [contact] = await db().select().from(contacts).where(eq(contacts.id, conv.contactId));
    expect(contact.ownerUserId).toBe(co.staff[0].id);
  });

  it('hands off when the customer asks for a person, whatever the model says', async () => {
    answer = { reply: 'Sure!', intent: 'other', confidence: 99, handoff: false, reason: '' };
    const { messageId } = await inbound(co.id, 'manussayek ekka katha karanna one');
    expect(await engine.maybeReply(messageId)).toBe(true);
    const [log] = await db().select().from(aiBotLogs).where(eq(aiBotLogs.messageId, messageId));
    expect(log.status).toBe('handed_off');
  });

  it('simulates without sending or counting', async () => {
    answer = { reply: 'Yes, Rs. 2,500.', intent: 'price_inquiry', confidence: 95, handoff: false, reason: '' };
    const [before] = await db().select().from(aiAddons).where(eq(aiAddons.companyId, co.id));
    const res = await adm.post(`/api/v1/admin/companies/${co.id}/ai/simulate`, { message: 'Price of cinnamon?' });
    expect(res.status).toBe(200);
    expect(res.body.reply).toBe('Yes, Rs. 2,500.');
    expect(res.body.handoff).toBe(false);
    expect(res.body.tokensUsed).toBe(123);
    const [after] = await db().select().from(aiAddons).where(eq(aiAddons.companyId, co.id));
    expect(after.repliesThisMonth).toBe(before.repliesThisMonth);

    const logs = await adm.get(`/api/v1/admin/companies/${co.id}/ai/logs`);
    const ex = await adm.post(`/api/v1/admin/companies/${co.id}/ai/examples/from-log/${logs.body[0].id}`, { idealAnswer: 'Let me connect you to our team.' });
    expect(ex.status).toBe(201);
    expect((await adm.get(`/api/v1/admin/companies/${co.id}/ai/examples`)).body).toHaveLength(1);
  });

  it('stops at the monthly limit', async () => {
    await adm.put(`/api/v1/admin/companies/${co.id}/ai/addon`, { status: 'active', monthlyReplyLimit: 1 });
    const { messageId } = await inbound(co.id, 'Hello again');
    expect(await engine.maybeReply(messageId)).toBe(false);
    expect(aiCalls).toBe(0);
  });
});
