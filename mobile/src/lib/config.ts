import { readSecure, writeSecure } from './storage';

const SERVER_KEY = 'sr.server';

/** The Android emulator reaches the host machine at 10.0.2.2. */
export const DEFAULT_SERVER = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:4000';

let server = DEFAULT_SERVER;

/** `https://api.example.com/` or `api.example.com` → `https://api.example.com`. */
export function normalizeServer(input: string): string {
  let s = input.trim().replace(/\/+$/, '');
  s = s.replace(/\/api\/v1$/, '');
  if (s && !/^https?:\/\//i.test(s)) s = `https://${s}`;
  return s;
}

export function isValidServer(input: string): boolean {
  const s = normalizeServer(input);
  return /^https?:\/\/[^\s/]+(:\d+)?(\/[^\s]*)?$/i.test(s);
}

export function getServer(): string {
  return server;
}

export function apiBase(): string {
  return `${server}/api/v1`;
}

export async function loadServer(): Promise<string> {
  const saved = await readSecure(SERVER_KEY);
  if (saved) server = saved;
  return server;
}

export async function saveServer(input: string): Promise<string> {
  server = normalizeServer(input) || DEFAULT_SERVER;
  await writeSecure(SERVER_KEY, server);
  return server;
}
