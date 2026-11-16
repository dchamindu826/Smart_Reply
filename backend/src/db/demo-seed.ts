/**
 * DEVELOPMENT ONLY: a demo company with a manager, staff, customers, chats and calls so the
 * web and mobile apps have something to show. Refuses to run when NODE_ENV=production.
 *
 *   npm run db:seed:demo -w backend
 *
 * Sign in as manager@demo.test / staff1@demo.test / staff2@demo.test with password Demo12345!
 */
import 'dotenv/config';
import { hash } from '@node-rs/argon2';
import { eq } from 'drizzle-orm';
import { DEFAULT_STAFF_PERMISSIONS, avatarColorFor, initialsOf } from '@smart-reply/shared';
import { createDb, createPool } from './client';
import {
  aiAddons,
  aiBotSettings,
  assignmentRules,
  businessProfiles,
  callSettings,
  calls,
  companies,
  contactLabels,
  contacts,
  conversations,
  ivrMenus,
  labels,
  messages,
  plans,
  presence,
  productCollections,
  products,
  quickReplies,
  rolePermissions,
  templates,
  users
} from './schema';

const PASSWORD = 'Demo12345!';

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') throw new Error('The demo seed never runs in production.');
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const pool = createPool(url, 1);
  const db = createDb(pool);

  const [existing] = await db.select().from(companies).where(eq(companies.slug, 'demo-aluminium')).limit(1);
  if (existing) {
    console.log('Demo company already exists.');
    await pool.end();
    return;
  }

  const [plan] = await db.select().from(plans).limit(1);
  const [co] = await db
    .insert(companies)
    .values({ name: 'Demo Aluminium', slug: 'demo-aluminium', planId: plan?.id ?? null, seatLimit: 10, timezone: 'Asia/Colombo' })
    .returning();
  const companyId = co.id;
  const passwordHash = await hash(PASSWORD, { memoryCost: 19456, timeCost: 2, parallelism: 1 });

  const person = async (role: 'manager' | 'staff', name: string, email: string, title: string) => {
    const [u] = await db
      .insert(users)
      .values({ companyId, role, name, initials: initialsOf(name), email, title, passwordHash, status: 'active', avatarColor: avatarColorFor(email) })
      .returning();
    for (const channel of ['call', 'chat'] as const) await db.insert(presence).values({ userId: u.id, channel, companyId, status: 'available' });
    return u;
  };
  const mgr = await person('manager', 'Madushan Perera', 'manager@demo.test', 'Owner');
  const s1 = await person('staff', 'Nimal Silva', 'staff1@demo.test', 'Sales');
  const s2 = await person('staff', 'Sachini Fernando', 'staff2@demo.test', 'Sales');

  await db.insert(rolePermissions).values({ companyId, staff: DEFAULT_STAFF_PERMISSIONS });
  await db.insert(callSettings).values({ companyId });
  await db.insert(assignmentRules).values({ companyId });
  await db.insert(ivrMenus).values({ companyId });
  await db.insert(aiAddons).values({ companyId });
  await db.insert(aiBotSettings).values({ companyId, personaName: 'Demo assistant' });
  await db.insert(businessProfiles).values({ companyId, displayName: 'Demo Aluminium', about: 'Aluminium kitchens and wardrobes' });

  const [hot] = await db.insert(labels).values({ companyId, name: 'Hot lead', color: 'b', meaning: 'Ready to buy' }).returning();
  const [quote] = await db.insert(labels).values({ companyId, name: 'Quotation sent', color: 'i', meaning: 'Waiting for reply' }).returning();
  await db.insert(labels).values({ companyId, name: 'Installed', color: 'ok', meaning: 'Job done' });

  const people = [
    { name: 'Kasun Perera', waId: '94772345678', city: 'Kandy', owner: s1.id, label: quote.id },
    { name: 'Mohamed Rizwan', waId: '94713456789', city: 'Colombo', owner: null, label: hot.id },
    { name: 'Dilani Fernando', waId: '94765678901', city: 'Galle', owner: s2.id, label: null },
    { name: 'Tharindu Silva', waId: '94701234567', city: 'Kurunegala', owner: s2.id, label: null }
  ];
  const now = Date.now();
  let i = 0;
  for (const p of people) {
    const [c] = await db
      .insert(contacts)
      .values({ companyId, waId: p.waId, name: p.name, profileName: p.name, city: p.city, ownerUserId: p.owner, avatarColor: avatarColorFor(p.waId), marketingOptIn: true })
      .returning();
    if (p.label) await db.insert(contactLabels).values({ companyId, contactId: c.id, labelId: p.label });
    const lastIn = new Date(now - (i * 3 + 1) * 3600_000);
    const [conv] = await db
      .insert(conversations)
      .values({
        companyId,
        contactId: c.id,
        lastMessageAt: new Date(lastIn.getTime() + 60_000),
        lastInboundAt: lastIn,
        windowExpiresAt: new Date(lastIn.getTime() + 24 * 3600_000),
        unreadCount: i === 1 ? 1 : 0,
        lastPreview: 'Thank you, we will send the quotation today.'
      })
      .returning();
    await db.insert(messages).values([
      { companyId, conversationId: conv.id, direction: 'in', type: 'text', body: `Hi, I need a price for a ${['pantry cupboard', 'wardrobe', 'bathroom vanity', 'kitchen'][i]}.`, senderKind: 'customer', status: 'delivered', waMessageId: `demo.in.${i}`, createdAt: lastIn },
      { companyId, conversationId: conv.id, direction: 'out', type: 'text', body: 'Thank you, we will send the quotation today.', senderKind: 'user', senderUserId: p.owner ?? mgr.id, status: 'read', waMessageId: `demo.out.${i}`, createdAt: new Date(lastIn.getTime() + 60_000) }
    ]);
    await db.insert(calls).values({
      companyId,
      contactId: c.id,
      direction: i % 2 ? 'out' : 'in',
      outcome: i === 2 ? 'missed' : 'answered',
      handledByUserId: i === 2 ? null : (p.owner ?? mgr.id),
      startedAt: new Date(now - (i + 2) * 3600_000),
      answeredAt: i === 2 ? null : new Date(now - (i + 2) * 3600_000 + 8000),
      endedAt: new Date(now - (i + 2) * 3600_000 + 190_000),
      durationSeconds: i === 2 ? null : 182
    });
    i++;
  }

  await db.insert(templates).values([
    { companyId, name: 'quotation_ready', category: 'utility', language: 'en', status: 'approved', quality: 'high', body: 'Hi {{1}}, your quotation {{2}} is ready. Reply to this message with any questions.' },
    { companyId, name: 'new_year_offer', category: 'marketing', language: 'en', status: 'pending', body: 'Season offer: 10% off aluminium pantry cupboards until 30 April.' }
  ]);
  await db.insert(quickReplies).values([
    { companyId, command: '/hello', title: 'Greeting', text: 'Hello! Thank you for contacting Demo Aluminium. How can we help?', scope: 'everyone', ownerUserId: mgr.id },
    { companyId, command: '/bank-details', title: 'Bank details', text: 'Bank: Example Bank · Account: 000000000 · Name: Demo Aluminium', scope: 'everyone', ownerUserId: mgr.id }
  ]);
  const [kitchen] = await db.insert(productCollections).values({ companyId, name: 'Kitchen', position: 0 }).returning();
  await db.insert(products).values([
    { companyId, collectionId: kitchen.id, name: 'Pantry cupboard (per ft)', sku: 'KIT-PAN', priceMinor: 1850000, currency: 'LKR', priceUnit: 'per ft' },
    { companyId, collectionId: kitchen.id, name: 'Overhead cabinet (per ft)', sku: 'KIT-OVH', priceMinor: 1450000, currency: 'LKR', priceUnit: 'per ft' }
  ]);

  console.log(`Demo company ready. Sign in as manager@demo.test, staff1@demo.test or staff2@demo.test with ${PASSWORD}`);
  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
