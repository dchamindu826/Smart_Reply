/** Environment settings. Every value is documented in `backend/.env.example`. */
import 'dotenv/config';
import { z } from 'zod';

const bool = z
  .string()
  .optional()
  .transform(v => v === 'true' || v === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  /** Public URL of the web app, for links in emails and CORS. */
  APP_URL: z.string().url().default('http://localhost:3000'),
  /** Public URL of the API (used for the Meta webhook callback and local file links). */
  API_URL: z.string().url().default('http://localhost:4000'),
  /** Extra allowed browser origins, comma separated. */
  CORS_ORIGINS: z.string().default(''),
  DATABASE_URL: z.string().min(1),
  DATABASE_POOL_MAX: z.coerce.number().int().default(10),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  /** 32+ random characters. Signs access tokens. */
  JWT_SECRET: z.string().min(32),
  /** 64 hex characters (32 bytes). Encrypts Meta tokens and API keys at rest. */
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'ENCRYPTION_KEY must be 64 hex characters'),
  ACCESS_TOKEN_MINUTES: z.coerce.number().int().default(15),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().default(30),
  COOKIE_DOMAIN: z.string().default(''),
  COOKIE_SECURE: z
    .string()
    .optional()
    .transform(v => (v === undefined ? undefined : v === 'true' || v === '1')),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./storage'),
  S3_ENDPOINT: z.string().default(''),
  S3_PUBLIC_ENDPOINT: z.string().default(''),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('smart-reply'),
  S3_ACCESS_KEY: z.string().default(''),
  S3_SECRET_KEY: z.string().default(''),
  S3_FORCE_PATH_STYLE: bool,
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  SMTP_FROM: z.string().default('Smart Reply <no-reply@example.com>'),
  /** Used once by `npm run db:seed` to create the first system admin. */
  SEED_ADMIN_EMAIL: z.string().default(''),
  SEED_ADMIN_PASSWORD: z.string().default(''),
  SEED_ADMIN_NAME: z.string().default('LUMI AI Admin'),
  /** Optional: Meta settings can also be set in the admin console. These are used when the database has none. */
  META_APP_ID: z.string().default(''),
  META_APP_SECRET: z.string().default(''),
  META_VERIFY_TOKEN: z.string().default(''),
  META_GRAPH_VERSION: z.string().default('v26.0'),
  META_GRAPH_URL: z.string().default('https://graph.facebook.com'),
  /** Firebase service account JSON (one line) for push notifications. Empty disables push. */
  FCM_SERVICE_ACCOUNT_JSON: z.string().default(''),
  /** Expo push (mobile app). Empty access token still works for Expo's public endpoint. */
  EXPO_ACCESS_TOKEN: z.string().default(''),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  /** When true the API serves the OpenAPI-like route list at /api/docs. */
  ENABLE_DOCS: bool,
  TRUST_PROXY: bool
});

export type Env = z.infer<typeof envSchema>;

function load(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map(i => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment settings:\n${lines}\nSee backend/.env.example.`);
  }
  return parsed.data;
}

export const env: Env = load();
export const isProd = env.NODE_ENV === 'production';
export const cookieSecure = env.COOKIE_SECURE ?? isProd;
