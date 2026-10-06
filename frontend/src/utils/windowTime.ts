export function getWinClass(exp?: number): 'g' | 'y' | 'r' | 'x' {
  if (!exp) return 'x';
  const ms = exp - Date.now();
  if (ms <= 0) return 'x';
  if (ms <= 2 * 3600000) return 'r';
  if (ms >= 20 * 3600000) return 'g';
  return 'y';
}

export function getWinText(exp?: number): string {
  if (!exp) return 'Closed';
  const ms = exp - Date.now();
  if (ms <= 0) return 'Closed';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(s).padStart(2, '0')}s`;
}
