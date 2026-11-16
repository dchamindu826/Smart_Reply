import type { QuickReply } from '@smart-reply/shared';
import { matchQuickReplies } from '@/features/content/hooks';
import { buildUrl } from './api';
import { isValidServer, normalizeServer } from './config';
import { parseErrorBody } from './errors';
import { checkSendable, guessMime } from './upload';
import { reachableUrl } from './urls';

describe('server address', () => {
  it('normalises what people type', () => {
    expect(normalizeServer('api.example.com/')).toBe('https://api.example.com');
    expect(normalizeServer(' http://10.0.2.2:4000/api/v1 ')).toBe('http://10.0.2.2:4000');
    expect(isValidServer('not a url')).toBe(false);
    expect(isValidServer('http://192.168.1.5:4000')).toBe(true);
  });

  it('makes API file links reachable from the phone', () => {
    const server = 'http://192.168.1.5:4000';
    expect(reachableUrl('http://localhost:4000/api/v1/files/x/content?sig=1', server)).toBe('http://192.168.1.5:4000/api/v1/files/x/content?sig=1');
    expect(reachableUrl('/api/v1/files/x', server)).toBe('http://192.168.1.5:4000/api/v1/files/x');
    expect(reachableUrl('https://bucket.s3.amazonaws.com/a', server)).toBe('https://bucket.s3.amazonaws.com/a');
  });
});

describe('api helpers', () => {
  it('builds query strings without empty values', () => {
    expect(buildUrl('https://x/api/v1', '/conversations', { filter: 'all', search: '', cursor: undefined, limit: 50 })).toBe(
      'https://x/api/v1/conversations?filter=all&limit=50'
    );
  });

  it('reads the API error shape', () => {
    const e = parseErrorBody({ error: { code: 'WINDOW_CLOSED', message: 'The 24-hour window is closed.' } }, 409);
    expect(e.code).toBe('WINDOW_CLOSED');
    expect(e.message).toBe('The 24-hour window is closed.');
    expect(parseErrorBody('<html>', 502).code).toBe('INTERNAL');
  });
});

describe('uploads', () => {
  it('guesses MIME types WhatsApp accepts', () => {
    expect(guessMime('voice.m4a', null)).toBe('audio/mp4');
    expect(guessMime('photo.JPG', 'application/octet-stream')).toBe('image/jpeg');
    expect(guessMime('x.png', 'image/jpg')).toBe('image/jpeg');
  });

  it('rejects files WhatsApp would refuse', () => {
    expect(checkSendable('image/jpeg', 1000)).toBe('image');
    expect(() => checkSendable('image/heic', 1000)).toThrow('does not accept');
    expect(() => checkSendable('image/png', 6 * 1024 * 1024)).toThrow('too large');
  });
});

describe('quick replies', () => {
  const qr = (command: string, title: string) => ({ id: command, command, title }) as QuickReply;
  it('matches by command prefix or title', () => {
    const list = [qr('/price', 'Price list'), qr('/hours', 'Opening hours'), qr('/thanks', 'Thank you')];
    expect(matchQuickReplies(list, '/').map(q => q.id)).toHaveLength(3);
    expect(matchQuickReplies(list, '/pr').map(q => q.id)).toEqual(['/price']);
    expect(matchQuickReplies(list, '/opening').map(q => q.id)).toEqual(['/hours']);
  });
});
