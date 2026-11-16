/**
 * Production seed. Safe to run more than once. Creates:
 * - the platform settings row,
 * - default plans and AI add-on plans (only when there are none),
 * - the first system admin from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD (only when no system admin exists).
 * It creates no demo companies or customers.
 */
import 'dotenv/config';
import { hash } from '@node-rs/argon2';
import { eq, sql } from 'drizzle-orm';
import { initialsOf } from '@smart-reply/shared';
import { createDb, createPool } from './client';
import { aiAddonPlans, platformSettings, plans, users } from './schema';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const pool = createPool(url, 1);
  const db = createDb(pool);

  await db.insert(platformSettings).values({ id: 1 }).onConflictDoNothing();

  const [{ n: planCount }] = await db.select({ n: sql<number>`count(*)::int` }).from(plans);
  if (planCount === 0) {
    await db.insert(plans).values([
      { name: 'Starter', seatLimit: 5, priceMinor: 1500000, currency: 'LKR', features: ['Chats', 'Calls', 'Templates', 'Quick replies'] },
      { name: 'Growth', seatLimit: 20, priceMinor: 4500000, currency: 'LKR', features: ['Everything in Starter', 'Broadcasts', 'Reports', 'IVR'] },
      { name: 'Business', seatLimit: 100, priceMinor: 12000000, currency: 'LKR', features: ['Everything in Growth', 'Priority support'] }
    ]);
    console.log('Created default plans.');
  }

  const [{ n: aiCount }] = await db.select({ n: sql<number>`count(*)::int` }).from(aiAddonPlans);
  if (aiCount === 0) {
    await db.insert(aiAddonPlans).values([
      { name: 'AI Chat 1,000', priceMinor: 750000, currency: 'LKR', monthlyReplyLimit: 1000, voiceIncluded: false },
      { name: 'AI Chat 5,000', priceMinor: 2500000, currency: 'LKR', monthlyReplyLimit: 5000, voiceIncluded: false }
    ]);
    console.log('Created default AI add-on plans.');
  }

  const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.role, 'system_admin')).limit(1);
  if (!admin) {
    const email = (process.env.SEED_ADMIN_EMAIL ?? '').trim().toLowerCase();
    const password = process.env.SEED_ADMIN_PASSWORD ?? '';
    if (!email || password.length < 10) {
      console.warn('No system admin yet. Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (10+ characters) and run the seed again.');
    } else {
      const name = process.env.SEED_ADMIN_NAME || 'LUMI AI Admin';
      await db.insert(users).values({
        companyId: null,
        role: 'system_admin',
        name,
        initials: initialsOf(name),
        title: 'System admin',
        email,
        passwordHash: await hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 }),
        status: 'active'
      });
      console.log(`Created system admin ${email}. Remove SEED_ADMIN_PASSWORD from the environment now.`);
    }
  }
  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
