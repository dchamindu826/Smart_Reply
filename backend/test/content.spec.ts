import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { closeApp, createCompany, createUser, db, getApp, getWorker, signIn, TestCompany } from './helpers';
import { BroadcastRunner, parseMessagingLimit } from '../src/modules/content/broadcast.runner';
import { TemplateSync } from '../src/modules/content/template-sync';
import {
  auditLogs,
  broadcastRecipients,
  broadcasts,
  contactLabels,
  contacts,
  files,
  labels,
  messages,
  templates,
  userPermissions,
  whatsappAccounts
} from '../src/db/schema';

interface MetaCall {
  method: string;
  url: string;
  body: Record<string, unknown> | null;
}

/** Stub Meta: record Graph calls; template list comes from `metaTemplates`. */
let metaTemplates: Record<string, unknown>[] = [];
function stubMeta(): { calls: MetaCall[] } {
  const calls: MetaCall[] = [];
  const real = globalThis.fetch;
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith('http://meta.test')) return real(input, init);
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    calls.push({ method, url, body });
    const path = new URL(url).pathname;
    if (path.endsWith('/message_templates') && method === 'POST') {
      return new Response(JSON.stringify({ id: `tpl-${calls.length}`, status: 'PENDING', category: String(body?.category ?? 'UTILITY') }), { status: 200 });
    }
    if (path.endsWith('/message_templates') && method === 'GET') {
      return new Response(JSON.stringify({ data: metaTemplates, paging: { cursors: {} } }), { status: 200 });
    }
    if (path.endsWith('/messages')) {
      return new Response(JSON.stringify({ messaging_product: 'whatsapp', messages: [{ id: `wamid.${calls.length}` }] }), { status: 200 });
    }
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  });
  return { calls };
}

async function wabaOf(companyId: string): Promise<string> {
  const [a] = await db().select().from(whatsappAccounts).where(eq(whatsappAccounts.companyId, companyId));
  return a.wabaId;
}

async function approvedTemplate(companyId: string, name: string, category: 'marketing' | 'utility' = 'marketing', body = 'Hi {{1}}, our sale starts today!') {
  const [t] = await db()
    .insert(templates)
    .values({ companyId, name, language: 'en', category, status: 'approved', body, metaTemplateId: `meta-${name}` })
    .returning();
  return t;
}

async function uploadedFile(companyId: string, kind: 'image' | 'video' | 'document' = 'image') {
  const [f] = await db()
    .insert(files)
    .values({
      companyId,
      purpose: 'media',
      kind,
      name: `file.${kind === 'image' ? 'jpg' : kind === 'video' ? 'mp4' : 'pdf'}`,
      mime: kind === 'image' ? 'image/jpeg' : kind === 'video' ? 'video/mp4' : 'application/pdf',
      sizeBytes: 1000,
      storageKey: `test/${uuidv7()}`,
      uploaded: true
    })
    .returning();
  return f;
}

async function contact(companyId: string, phone: string, opts: { optIn?: boolean; blocked?: boolean; labelId?: string } = {}) {
  const [c] = await db()
    .insert(contacts)
    .values({ companyId, waId: phone, name: `Customer ${phone.slice(-4)}`, marketingOptIn: opts.optIn ?? true, blockedAt: opts.blocked ? new Date() : null })
    .returning();
  if (opts.labelId) await db().insert(contactLabels).values({ companyId, contactId: c.id, labelId: opts.labelId });
  return c;
}

describe('content', () => {
  let a: TestCompany;
  let b: TestCompany;
  let meta: ReturnType<typeof stubMeta>;

  beforeAll(async () => {
    await getApp();
    a = await createCompany({ staffCount: 2, whatsapp: true });
    b = await createCompany({ staffCount: 1, whatsapp: true });
  });
  beforeEach(() => {
    meta = stubMeta();
    metaTemplates = [];
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    await closeApp();
  });

  describe('templates', () => {
    it('submits a new template to Meta with the right body', async () => {
      const mgr = await signIn(a.manager);
      const res = await mgr.post('/api/v1/templates', {
        name: 'order_ready',
        category: 'utility',
        language: 'en',
        headerText: 'Order update',
        body: 'Hi {{1}}, your order {{2}} is ready.',
        footer: 'Reply STOP to opt out',
        buttons: [{ type: 'QUICK_REPLY', text: 'Thanks' }],
        examples: ['Kasun']
      });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ name: 'order_ready', status: 'pending', variableCount: 2, category: 'utility', quality: 'unknown' });

      const call = meta.calls.find(c => c.method === 'POST' && c.url.endsWith('/message_templates'));
      expect(call).toBeTruthy();
      expect(call!.url).toMatch(new RegExp(`^http://meta\\.test/v[0-9.]+/${await wabaOf(a.id)}/message_templates$`));
      expect(call!.body).toEqual({
        name: 'order_ready',
        language: 'en',
        category: 'UTILITY',
        parameter_format: 'positional',
        components: [
          { type: 'HEADER', format: 'TEXT', text: 'Order update' },
          { type: 'BODY', text: 'Hi {{1}}, your order {{2}} is ready.', example: { body_text: [['Kasun', 'sample']] } },
          { type: 'FOOTER', text: 'Reply STOP to opt out' },
          { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Thanks' }] }
        ]
      });
      const [row] = await db().select().from(templates).where(eq(templates.id, res.body.id));
      expect(row.metaTemplateId).toMatch(/^tpl-/);
      const audit = await db().select().from(auditLogs).where(and(eq(auditLogs.companyId, a.id), eq(auditLogs.action, 'template.create')));
      expect(audit).toHaveLength(1);

      const dup = await mgr.post('/api/v1/templates', { name: 'order_ready', category: 'utility', language: 'en', body: 'Again' });
      expect(dup.status).toBe(409);
      expect(dup.body.error.code).toBe('CONFLICT');
    });

    it('needs the createTemplates permission for staff', async () => {
      const staff = await signIn(a.staff[0]);
      const res = await staff.post('/api/v1/templates', { name: 'staff_tpl', category: 'utility', language: 'en', body: 'Hello' });
      expect(res.status).toBe(403);
      const list = await staff.get('/api/v1/templates');
      expect(list.status).toBe(200);
      expect(list.body.some((t: { name: string }) => t.name === 'order_ready')).toBe(true);
      expect((await staff.post('/api/v1/templates/sync')).status).toBe(403);
    });

    it('syncs statuses from Meta and disables templates Meta no longer has', async () => {
      const mgr = await signIn(a.manager);
      await db().insert(templates).values({ companyId: a.id, name: 'old_one', language: 'en', category: 'utility', status: 'approved', body: 'Old' });
      metaTemplates = [
        {
          id: 'tpl-meta-1',
          name: 'order_ready',
          language: 'en',
          status: 'APPROVED',
          category: 'UTILITY',
          quality_score: { score: 'GREEN' },
          components: [
            { type: 'HEADER', format: 'TEXT', text: 'Order update' },
            { type: 'BODY', text: 'Hi {{1}}, your order {{2}} is ready.' },
            { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Thanks' }] }
          ]
        },
        { id: 'tpl-meta-2', name: 'summer_sale', language: 'en', status: 'REJECTED', category: 'MARKETING', rejected_reason: 'INVALID_FORMAT', components: [{ type: 'BODY', text: 'Sale!' }] }
      ];
      const res = await mgr.post('/api/v1/templates/sync');
      expect(res.status).toBe(200);
      expect(res.body.updated).toBe(3);
      const list = (await mgr.get('/api/v1/templates')).body as { name: string; status: string; quality: string; rejectionReason: string | null; footer: string | null }[];
      const byName = Object.fromEntries(list.map(t => [t.name, t]));
      expect(byName.order_ready).toMatchObject({ status: 'approved', quality: 'high', footer: null });
      expect(byName.summer_sale).toMatchObject({ status: 'rejected', rejectionReason: 'Invalid format' });
      expect(byName.old_one.status).toBe('disabled');
      const approved = await mgr.get('/api/v1/templates?status=approved');
      expect(approved.body.map((t: { name: string }) => t.name)).toEqual(['order_ready']);
    });

    it('applies template status and quality webhooks', async () => {
      const sync = (await getWorker()).get(TemplateSync);
      await sync.applyWebhook(a.id, 'message_template_status_update', {
        event: 'REJECTED',
        message_template_id: 'tpl-meta-1',
        message_template_name: 'order_ready',
        message_template_language: 'en',
        reason: 'TAG_CONTENT_MISMATCH'
      });
      let [row] = await db().select().from(templates).where(and(eq(templates.companyId, a.id), eq(templates.name, 'order_ready')));
      expect(row.status).toBe('rejected');
      expect(row.rejectionReason).toBe('Tag content mismatch');
      const audit = await db().select().from(auditLogs).where(and(eq(auditLogs.companyId, a.id), eq(auditLogs.action, 'template.rejected')));
      expect(audit[0]?.actorKind).toBe('meta');

      await sync.applyWebhook(a.id, 'message_template_status_update', { event: 'APPROVED', message_template_id: 'tpl-meta-1', message_template_name: 'order_ready', message_template_language: 'en', reason: 'NONE' });
      await sync.applyWebhook(a.id, 'message_template_quality_update', { new_quality_score: 'RED', message_template_id: 'tpl-meta-1', message_template_name: 'order_ready', message_template_language: 'en' });
      [row] = await db().select().from(templates).where(eq(templates.id, row.id));
      expect(row).toMatchObject({ status: 'approved', quality: 'low', rejectionReason: null });

      // Company B's webhook never touches company A's template.
      await sync.applyWebhook(b.id, 'message_template_status_update', { event: 'PAUSED', message_template_id: 'tpl-meta-1', message_template_name: 'order_ready', message_template_language: 'en' });
      [row] = await db().select().from(templates).where(eq(templates.id, row.id));
      expect(row.status).toBe('approved');
    });

    it('resubmits a rejected template and deletes templates', async () => {
      const mgr = await signIn(a.manager);
      const [rejected] = await db().select().from(templates).where(and(eq(templates.companyId, a.id), eq(templates.name, 'summer_sale')));
      const res = await mgr.post(`/api/v1/templates/${rejected.id}/resubmit`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('pending');
      expect(meta.calls[0].method).toBe('DELETE');
      expect(meta.calls[0].url).toContain('name=summer_sale');
      expect(meta.calls[1]).toMatchObject({ method: 'POST', body: { name: 'summer_sale', category: 'MARKETING' } });

      const approved = (await mgr.get('/api/v1/templates?status=approved')).body[0] as { id: string };
      expect((await mgr.post(`/api/v1/templates/${approved.id}/resubmit`)).status).toBe(409);

      const del = await mgr.delete(`/api/v1/templates/${rejected.id}`);
      expect(del.status).toBe(200);
      expect((await mgr.get(`/api/v1/templates/${rejected.id}`)).status).toBe(404);
    });
  });

  describe('quick replies', () => {
    it('lets staff keep private replies and protects shared ones', async () => {
      const mgr = await signIn(a.manager);
      const s0 = await signIn(a.staff[0]);
      const s1 = await signIn(a.staff[1]);

      const shared = await mgr.post('/api/v1/quick-replies', { command: '/hours', title: 'Opening hours', text: 'We open at 9.' });
      expect(shared.status).toBe(201);
      expect(shared.body).toMatchObject({ scope: 'everyone', ownerUserId: a.manager.id, ownerName: a.manager.name });

      expect((await s0.post('/api/v1/quick-replies', { command: '/mine', title: 'Mine', text: 'x', scope: 'everyone' })).status).toBe(403);
      const own = await s0.post('/api/v1/quick-replies', { command: '/mine', title: 'Mine', text: 'My note', scope: 'only_me' });
      expect(own.status).toBe(201);

      expect((await mgr.post('/api/v1/quick-replies', { command: '/mine', title: 'Dup', text: 'x' })).status).toBe(409);

      const s0List = (await s0.get('/api/v1/quick-replies')).body as { command: string }[];
      expect(s0List.map(q => q.command).sort()).toEqual(['/hours', '/mine']);
      const s1List = (await s1.get('/api/v1/quick-replies')).body as { command: string }[];
      expect(s1List.map(q => q.command)).toEqual(['/hours']);

      expect((await s1.patch(`/api/v1/quick-replies/${own.body.id}`, { text: 'hack' })).status).toBe(404);
      expect((await s1.delete(`/api/v1/quick-replies/${own.body.id}`)).status).toBe(404);
      expect((await s0.patch(`/api/v1/quick-replies/${own.body.id}`, { text: 'Updated' })).body.text).toBe('Updated');
      expect((await s0.patch(`/api/v1/quick-replies/${own.body.id}`, { scope: 'everyone' })).status).toBe(403);

      expect((await s0.patch(`/api/v1/quick-replies/${shared.body.id}`, { text: 'changed' })).status).toBe(403);
      expect((await s0.delete(`/api/v1/quick-replies/${shared.body.id}`)).status).toBe(403);
      expect((await mgr.patch(`/api/v1/quick-replies/${own.body.id}`, { title: 'Checked' })).status).toBe(200);

      // A staff member with "edit shared quick replies" may change shared ones.
      const editor = await createUser(a.id, 'staff');
      await db().insert(userPermissions).values({ userId: editor.id, companyId: a.id, overrides: { editSharedQuickReplies: true } });
      const ed = await signIn(editor);
      const changed = await ed.patch(`/api/v1/quick-replies/${shared.body.id}`, { text: 'We open at 8.' });
      expect(changed.status).toBe(200);
      expect(changed.body.text).toBe('We open at 8.');
      expect((await ed.post('/api/v1/quick-replies', { command: '/promo', title: 'Promo', text: 'Sale', scope: 'everyone' })).status).toBe(201);
    });

    it('attaches only uploaded files of the same company', async () => {
      const mgr = await signIn(a.manager);
      const mine = await uploadedFile(a.id);
      const theirs = await uploadedFile(b.id);
      const ok = await mgr.post('/api/v1/quick-replies', { command: '/photo', title: 'Photo', fileIds: [mine.id] });
      expect(ok.status).toBe(201);
      expect(ok.body.attachments[0]).toMatchObject({ id: mine.id, kind: 'image' });
      expect((await mgr.post('/api/v1/quick-replies', { command: '/stolen', title: 'X', fileIds: [theirs.id] })).status).toBe(404);
    });
  });

  describe('catalog and media', () => {
    it('keeps prices as money and lets staff with editPrices change prices only', async () => {
      const mgr = await signIn(a.manager);
      const col = await mgr.post('/api/v1/catalog/collections', { name: 'Shoes' });
      expect(col.status).toBe(201);
      const img = await uploadedFile(a.id);
      const p = await mgr.post('/api/v1/catalog/products', { collectionId: col.body.id, name: 'Runner', priceMinor: 450000, oldPriceMinor: 500000, imageFileId: img.id });
      expect(p.status).toBe(201);
      expect(p.body).toMatchObject({ price: { amountMinor: 450000, currency: 'LKR' }, oldPrice: { amountMinor: 500000, currency: 'LKR' }, collectionName: 'Shoes' });
      expect(p.body.imageUrl).toBeTruthy();
      const cols = (await mgr.get('/api/v1/catalog/collections')).body as { id: string; productCount: number }[];
      expect(cols.find(c => c.id === col.body.id)?.productCount).toBe(1);
      expect((await mgr.get(`/api/v1/catalog/products?search=runn&collection=${col.body.id}`)).body).toHaveLength(1);

      const staff = await signIn(a.staff[0]);
      expect((await staff.get('/api/v1/catalog/products')).status).toBe(200);
      expect((await staff.patch(`/api/v1/catalog/products/${p.body.id}`, { priceMinor: 1 })).status).toBe(403);
      expect((await staff.post('/api/v1/catalog/products', { name: 'X', priceMinor: 1 })).status).toBe(403);

      const pricer = await createUser(a.id, 'staff');
      await db().insert(userPermissions).values({ userId: pricer.id, companyId: a.id, overrides: { editPrices: true } });
      const pr = await signIn(pricer);
      const priced = await pr.patch(`/api/v1/catalog/products/${p.body.id}`, { priceMinor: 399900 });
      expect(priced.status).toBe(200);
      expect(priced.body.price.amountMinor).toBe(399900);
      expect((await pr.patch(`/api/v1/catalog/products/${p.body.id}`, { name: 'Renamed' })).status).toBe(403);
    });

    it('runs the media gallery with per-user favourites and counters', async () => {
      const mgr = await signIn(a.manager);
      const staff = await signIn(a.staff[0]);
      const cat = await mgr.post('/api/v1/media/categories', { name: 'Promos' });
      expect(cat.status).toBe(201);
      expect((await mgr.post('/api/v1/media/categories', { name: 'promos' })).status).toBe(409);
      const video = await uploadedFile(a.id, 'video');
      const item = await mgr.post('/api/v1/media', { fileId: video.id, title: 'Shop tour', tags: ['tour'], categoryId: cat.body.id });
      expect(item.status).toBe(201);
      expect(item.body).toMatchObject({ kind: 'video', categoryName: 'Promos', favorite: false, addedBy: a.manager.name });
      const doc = await uploadedFile(a.id, 'document');
      expect((await mgr.post('/api/v1/media', { fileId: doc.id, title: 'Doc' })).status).toBe(400);
      expect((await staff.post('/api/v1/media', { fileId: video.id, title: 'Again' })).status).toBe(403);

      const fav = await staff.put(`/api/v1/media/${item.body.id}/favorite`, { favorite: true });
      expect(fav.body.favorite).toBe(true);
      expect((await staff.get('/api/v1/media?favorites=true')).body).toHaveLength(1);
      expect((await mgr.get('/api/v1/media?favorites=true')).body).toHaveLength(0);
      expect((await mgr.get('/api/v1/media?favorites=false')).body).toHaveLength(1);
      expect((await staff.get('/api/v1/media?search=tour&kind=video')).body).toHaveLength(1);

      const shared = await staff.post(`/api/v1/media/${item.body.id}/share`);
      expect(shared.body.shareCount).toBe(1);
      const dl = await staff.post(`/api/v1/media/${item.body.id}/download`);
      expect(dl.body.url).toBeTruthy();
      expect((await mgr.get(`/api/v1/media/${item.body.id}`)).body.downloadCount).toBe(1);
    });
  });

  describe('broadcasts', () => {
    it('sends only to opted-in, unblocked customers with the label', async () => {
      const mgr = await signIn(a.manager);
      const [vip] = await db().insert(labels).values({ companyId: a.id, name: 'VIP' }).returning();
      const ok1 = await contact(a.id, '94770000001', { labelId: vip.id });
      const ok2 = await contact(a.id, '94770000002', { labelId: vip.id });
      await contact(a.id, '94770000003', { labelId: vip.id, optIn: false });
      await contact(a.id, '94770000004', { labelId: vip.id, blocked: true });
      await contact(a.id, '94770000005'); // opted in, no label
      const tpl = await approvedTemplate(a.id, 'vip_sale');

      expect((await (await signIn(a.staff[0])).get('/api/v1/broadcasts')).status).toBe(403);
      expect((await mgr.post('/api/v1/broadcasts', { name: 'No vars', labelId: vip.id, templateId: tpl.id })).status).toBe(400);
      const created = await mgr.post('/api/v1/broadcasts', { name: 'VIP sale', labelId: vip.id, templateId: tpl.id, variables: ['friend'] });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({ status: 'draft', audience: 2, labelName: 'VIP', templateName: 'vip_sale' });

      const sent = await mgr.post(`/api/v1/broadcasts/${created.body.id}/send`);
      expect(sent.status).toBe(200);
      expect(sent.body.status).toBe('sending');
      const recips = await db().select().from(broadcastRecipients).where(eq(broadcastRecipients.broadcastId, created.body.id));
      expect(recips.map(r => r.contactId).sort()).toEqual([ok1.id, ok2.id].sort());

      const runner = (await getWorker()).get(BroadcastRunner);
      await runner.run(created.body.id);
      await runner.run(created.body.id); // safe to run twice
      const after = await db().select().from(broadcastRecipients).where(eq(broadcastRecipients.broadcastId, created.body.id));
      expect(after.every(r => r.status === 'sent' && r.messageId)).toBe(true);
      const msgs = await db().select().from(messages).where(and(eq(messages.companyId, a.id), eq(messages.templateId, tpl.id)));
      expect(msgs).toHaveLength(2);
      expect(msgs[0].body).toBe('Hi friend, our sale starts today!');
      const [bc] = await db().select().from(broadcasts).where(eq(broadcasts.id, created.body.id));
      expect(bc.status).toBe('done');

      await runner.onMessageStatus(after[0].messageId!, 'read');
      await runner.onMessageStatus(after[0].messageId!, 'delivered');
      await runner.onReply(a.id, after[1].contactId);
      const view = await mgr.get(`/api/v1/broadcasts/${created.body.id}`);
      expect(view.body).toMatchObject({ status: 'done', audience: 2, sent: 2, delivered: 2, read: 2, replied: 1, failed: 0 });
      expect((await mgr.post(`/api/v1/broadcasts/${created.body.id}/send`)).status).toBe(409);
    });

    it('stops at the messaging limit and when quality turns red', async () => {
      const c = await createCompany({ whatsapp: true });
      const mgr = await signIn(c.manager);
      for (let i = 0; i < 3; i++) await contact(c.id, `9477100000${i}`);
      const tpl = await approvedTemplate(c.id, 'promo', 'utility', 'Hello there');
      await db().update(whatsappAccounts).set({ messagingLimit: '2' }).where(eq(whatsappAccounts.companyId, c.id));
      const bc = await mgr.post('/api/v1/broadcasts', { name: 'All', labelId: null, templateId: tpl.id });
      expect(bc.body.audience).toBe(3);
      await mgr.post(`/api/v1/broadcasts/${bc.body.id}/send`);
      const runner = (await getWorker()).get(BroadcastRunner);
      await runner.run(bc.body.id);
      let rows = await db().select().from(broadcastRecipients).where(eq(broadcastRecipients.broadcastId, bc.body.id));
      expect(rows.filter(r => r.status === 'sent')).toHaveLength(2);
      expect(rows.filter(r => r.status === 'pending')).toHaveLength(1);
      expect((await db().select().from(broadcasts).where(eq(broadcasts.id, bc.body.id)))[0].status).toBe('sending');

      await db().update(whatsappAccounts).set({ messagingLimit: 'TIER_1K', qualityRating: 'RED' }).where(eq(whatsappAccounts.companyId, c.id));
      await runner.run(bc.body.id);
      rows = await db().select().from(broadcastRecipients).where(eq(broadcastRecipients.broadcastId, bc.body.id));
      expect(rows.filter(r => r.status === 'skipped')).toHaveLength(1);
      expect((await db().select().from(broadcasts).where(eq(broadcasts.id, bc.body.id)))[0].status).toBe('failed');
    });

    it('reads Meta messaging limits', () => {
      expect(parseMessagingLimit('TIER_250')).toBe(250);
      expect(parseMessagingLimit('TIER_1K')).toBe(1000);
      expect(parseMessagingLimit('TIER_100K')).toBe(100000);
      expect(parseMessagingLimit('2000')).toBe(2000);
      expect(parseMessagingLimit('TIER_UNLIMITED')).toBe(Number.POSITIVE_INFINITY);
      expect(parseMessagingLimit(null)).toBe(250);
      expect(parseMessagingLimit('weird')).toBe(250);
    });
  });

  describe('flows', () => {
    it('lets managers manage flows and blocks staff', async () => {
      const mgr = await signIn(a.manager);
      expect((await mgr.post('/api/v1/flows', { name: 'Prices', kind: 'keyword', replyText: 'See catalog' })).status).toBe(400);
      const f = await mgr.post('/api/v1/flows', { name: 'Prices', kind: 'keyword', keywords: ['Price'], replyText: 'See catalog' });
      expect(f.status).toBe(201);
      expect(f.body).toMatchObject({ keywords: ['price'], enabled: true, matchCount: 0 });
      const off = await mgr.patch(`/api/v1/flows/${f.body.id}`, { enabled: false });
      expect(off.body.enabled).toBe(false);
      expect((await (await signIn(a.staff[0])).get('/api/v1/flows')).status).toBe(403);
      expect((await (await signIn(b.manager)).patch(`/api/v1/flows/${f.body.id}`, { enabled: true })).status).toBe(404);
    });
  });

  it('answers 404 to another company for every content item', async () => {
    const mgrA = await signIn(a.manager);
    const mgrB = await signIn(b.manager);
    const tplId = ((await mgrA.get('/api/v1/templates')).body as { id: string }[])[0].id;
    const qrId = ((await mgrA.get('/api/v1/quick-replies')).body as { id: string }[])[0].id;
    const productId = ((await mgrA.get('/api/v1/catalog/products')).body as { id: string }[])[0].id;
    const mediaId = ((await mgrA.get('/api/v1/media')).body as { id: string }[])[0].id;
    const bcId = ((await mgrA.get('/api/v1/broadcasts')).body as { id: string }[])[0].id;

    expect((await mgrB.get(`/api/v1/templates/${tplId}`)).status).toBe(404);
    expect((await mgrB.delete(`/api/v1/templates/${tplId}`)).status).toBe(404);
    expect((await mgrB.post(`/api/v1/templates/${tplId}/resubmit`)).status).toBe(404);
    expect((await mgrB.patch(`/api/v1/quick-replies/${qrId}`, { text: 'x' })).status).toBe(404);
    expect((await mgrB.delete(`/api/v1/quick-replies/${qrId}`)).status).toBe(404);
    expect((await mgrB.get(`/api/v1/catalog/products/${productId}`)).status).toBe(404);
    expect((await mgrB.patch(`/api/v1/catalog/products/${productId}`, { priceMinor: 1 })).status).toBe(404);
    expect((await mgrB.get(`/api/v1/media/${mediaId}`)).status).toBe(404);
    expect((await mgrB.put(`/api/v1/media/${mediaId}/favorite`, { favorite: true })).status).toBe(404);
    expect((await mgrB.post(`/api/v1/media/${mediaId}/share`)).status).toBe(404);
    expect((await mgrB.get(`/api/v1/broadcasts/${bcId}`)).status).toBe(404);
    expect((await mgrB.post(`/api/v1/broadcasts/${bcId}/cancel`)).status).toBe(404);
    expect((await mgrB.get('/api/v1/templates')).body).toHaveLength(0);
    expect((await mgrB.get('/api/v1/quick-replies')).body).toHaveLength(0);
    expect((await mgrB.get('/api/v1/broadcasts')).body).toHaveLength(0);
    // Company B cannot broadcast with company A's template.
    expect((await mgrB.post('/api/v1/broadcasts', { name: 'x', labelId: null, templateId: tplId })).status).toBe(404);
  });
});
