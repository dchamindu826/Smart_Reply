/** Small helpers used by the API, web app and mobile app. */

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Digits only, with the country code. `0771234567` becomes `94771234567` when the default country is 94. */
export function normalizePhone(input: string, defaultCountryCode = '94'): string {
  const raw = input.trim();
  let digits = raw.replace(/\D/g, '');
  if (raw.startsWith('+')) return digits;
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('0')) digits = defaultCountryCode + digits.slice(1);
  else if (digits.length <= 9) digits = defaultCountryCode + digits;
  return digits;
}

/** `94771234567` → `+94 77 123 4567`. Other countries get `+<digits>` with light grouping. */
export function formatPhone(waId: string): string {
  const d = waId.replace(/\D/g, '');
  if (d.startsWith('94') && d.length === 11) return `+94 ${d.slice(2, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  if (d.length > 6) return `+${d.slice(0, d.length - 7)} ${d.slice(-7, -4)} ${d.slice(-4)}`;
  return `+${d}`;
}

/** Hide the middle of a phone number for logs: `94771234567` → `9477****567`. */
export function maskPhone(waId: string): string {
  const d = waId.replace(/\D/g, '');
  if (d.length <= 6) return '****';
  return d.slice(0, 4) + '****' + d.slice(-3);
}

export function maskSecret(secret: string | null | undefined): string | null {
  if (!secret) return null;
  if (secret.length <= 8) return '••••';
  return `${secret.slice(0, 4)}••••${secret.slice(-4)}`;
}

export const AVATAR_COLORS = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'] as const;
export function avatarColorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/** Count `{{1}}`, `{{2}}` … placeholders in a template body. */
export function templateVariableCount(body: string): number {
  const found = new Set<string>();
  for (const m of body.matchAll(/\{\{(\d+)\}\}/g)) found.add(m[1]);
  return found.size;
}

export function fillTemplate(body: string, variables: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (_, n: string) => variables[Number(n) - 1] ?? `{{${n}}}`);
}

export function formatMoney(amountMinor: number, currency = 'LKR'): string {
  const major = amountMinor / 100;
  const symbol = currency === 'LKR' ? 'Rs. ' : `${currency} `;
  return symbol + major.toLocaleString('en-US', { minimumFractionDigits: major % 1 ? 2 : 0, maximumFractionDigits: 2 });
}
