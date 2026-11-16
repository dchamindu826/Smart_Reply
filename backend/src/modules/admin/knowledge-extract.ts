/**
 * Text from uploaded knowledge files without extra dependencies: plain text, Markdown and CSV
 * as UTF-8; DOCX by reading `word/document.xml` from the zip with node:zlib. PDF is not
 * supported yet.
 */
import { inflateRawSync } from 'node:zlib';

export const KNOWLEDGE_MAX_CHARS = 200_000;
const TEXT_MIMES = new Set(['text/plain', 'text/markdown', 'text/csv', 'text/x-markdown']);
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export type Extracted = { ok: true; text: string } | { ok: false; reason: string };

function zipEntry(buf: Buffer, name: string): Buffer | null {
  // End of central directory record: scan back from the end.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const entries = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < entries && p + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) return null;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const entryName = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    if (entryName === name) {
      if (buf.readUInt32LE(local) !== 0x04034b50) return null;
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + compSize);
      if (method === 0) return Buffer.from(data);
      if (method === 8) return inflateRawSync(data, { maxOutputLength: 50 * 1024 * 1024 });
      return null;
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

export function docxText(buf: Buffer): string | null {
  const xml = zipEntry(buf, 'word/document.xml');
  if (!xml) return null;
  const s = xml
    .toString('utf8')
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '');
  return decodeXml(s).replace(/\n{3,}/g, '\n\n').trim();
}

export function extractText(mime: string, bytes: Buffer): Extracted {
  if (TEXT_MIMES.has(mime)) return { ok: true, text: bytes.toString('utf8').replace(/^\uFEFF/, '').slice(0, KNOWLEDGE_MAX_CHARS) };
  if (mime === DOCX) {
    try {
      const t = docxText(bytes);
      if (t) return { ok: true, text: t.slice(0, KNOWLEDGE_MAX_CHARS) };
    } catch {
      // fall through
    }
    return { ok: false, reason: 'Word file could not be read — paste the text instead' };
  }
  if (mime === 'application/pdf') return { ok: false, reason: 'PDF text extraction not supported yet — paste the text instead' };
  return { ok: false, reason: `${mime} files are not supported — paste the text instead` };
}
