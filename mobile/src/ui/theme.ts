import { useColorScheme } from 'react-native';

export const brand = {
  primary: '#0F9D58',
  dark: '#0B3D2E'
};

export interface Palette {
  scheme: 'light' | 'dark';
  bg: string;
  card: string;
  card2: string;
  text: string;
  text2: string;
  text3: string;
  rule: string;
  primary: string;
  onPrimary: string;
  header: string;
  onHeader: string;
  bubbleIn: string;
  bubbleOut: string;
  bubbleNote: string;
  bubbleNoteText: string;
  chatBg: string;
  ok: string;
  warn: string;
  warnBg: string;
  bad: string;
  badBg: string;
  info: string;
  read: string;
  chip: string;
  chipActive: string;
  chipActiveText: string;
  overlay: string;
}

export const light: Palette = {
  scheme: 'light',
  bg: '#FFFFFF',
  card: '#FFFFFF',
  card2: '#F3F6F4',
  text: '#0E1A14',
  text2: '#4F625A',
  text3: '#8A9A93',
  rule: '#E3EAE6',
  primary: brand.primary,
  onPrimary: '#FFFFFF',
  header: brand.dark,
  onHeader: '#FFFFFF',
  bubbleIn: '#FFFFFF',
  bubbleOut: '#D9F7E5',
  bubbleNote: '#FFF4CC',
  bubbleNoteText: '#6B4E00',
  chatBg: '#EEF2EF',
  ok: '#0B8A5C',
  warn: '#A96C08',
  warnBg: '#FBEFD6',
  bad: '#BE3220',
  badBg: '#FBE3DE',
  info: '#0B6FD4',
  read: '#2B8BF2',
  chip: '#EEF2EF',
  chipActive: '#D3F0DF',
  chipActiveText: '#0B5C37',
  overlay: 'rgba(0,0,0,0.45)'
};

export const dark: Palette = {
  scheme: 'dark',
  bg: '#0B1410',
  card: '#111D18',
  card2: '#172821',
  text: '#E7EFEA',
  text2: '#9DB3A8',
  text3: '#6E8379',
  rule: '#1F332A',
  primary: '#22B56C',
  onPrimary: '#04140C',
  header: '#0F1F18',
  onHeader: '#E7EFEA',
  bubbleIn: '#172821',
  bubbleOut: '#0D4A33',
  bubbleNote: '#3A300D',
  bubbleNoteText: '#F2C94C',
  chatBg: '#08100C',
  ok: '#4CCB92',
  warn: '#E0AF59',
  warnBg: '#392C11',
  bad: '#F08370',
  badBg: '#3B1B15',
  info: '#4FA6F8',
  read: '#53BDEB',
  chip: '#172821',
  chipActive: '#0D4A33',
  chipActiveText: '#BFF0D4',
  overlay: 'rgba(0,0,0,0.6)'
};

export function useTheme(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}

/** Avatar colours `a1`…`a7`, matching the web app. */
const AVATARS: Record<string, { bg: string; fg: string; bgDark: string; fgDark: string }> = {
  a1: { bg: '#F7E4D6', fg: '#8A3F12', bgDark: '#4A2A15', fgDark: '#F7C9A6' },
  a2: { bg: '#E8E1F7', fg: '#4B2E8F', bgDark: '#2E2350', fgDark: '#CDBEF5' },
  a3: { bg: '#DDE7F8', fg: '#23458A', bgDark: '#1B2E52', fgDark: '#B5CCF4' },
  a4: { bg: '#E0F3EB', fg: '#0B6446', bgDark: '#0D3228', fgDark: '#9EE3C4' },
  a5: { bg: '#FBE3EF', fg: '#8A1F4E', bgDark: '#4A1A30', fgDark: '#F5B5D2' },
  a6: { bg: '#E6E9F0', fg: '#2E3550', bgDark: '#262B3A', fgDark: '#C3C9DA' },
  a7: { bg: '#FBEFD6', fg: '#7A4300', bgDark: '#3A2C10', fgDark: '#F2CF8C' }
};

export function avatarColors(key: string, scheme: 'light' | 'dark'): { bg: string; fg: string } {
  const c = AVATARS[key] ?? AVATARS.a6!;
  return scheme === 'dark' ? { bg: c.bgDark, fg: c.fgDark } : { bg: c.bg, fg: c.fg };
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const radius = { sm: 8, md: 12, lg: 18, pill: 999 };
