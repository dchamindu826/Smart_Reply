// Draws the Smart Reply app icons into ../assets without any image library.
// A green rounded square with a white chat bubble; run with `npm run icons`.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');
mkdirSync(out, { recursive: true });

const GREEN = [0x0f, 0x9d, 0x58];
const DARK = [0x0b, 0x3d, 0x2e];
const WHITE = [0xff, 0xff, 0xff];

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}
function inTriangle(px, py, [ax, ay], [bx, by], [cx, cy]) {
  const s = (ax - cx) * (py - cy) - (ay - cy) * (px - cx);
  const t = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
  if (s < 0 !== t < 0 && s !== 0 && t !== 0) return false;
  const d = (cx - bx) * (py - by) - (cy - by) * (px - bx);
  return d === 0 || d < 0 === s + t <= 0;
}

/** The bubble in unit coordinates (0..1) of its box. */
function inBubble(u, v) {
  if (inRoundRect(u, v, 0.0, 0.0, 1.0, 0.72, 0.2)) return true;
  return inTriangle(u, v, [0.18, 0.6], [0.42, 0.66], [0.12, 0.95]);
}
function inDot(u, v) {
  for (const cx of [0.28, 0.5, 0.72]) if ((u - cx) ** 2 + (v - 0.36) ** 2 <= 0.068 ** 2) return true;
  return false;
}

/**
 * paint(x, y) returns [r, g, b, a] for a point in 0..1 canvas coordinates.
 * Each pixel is sampled 4×4 times for smooth edges.
 */
function render(w, h, paint) {
  const buf = Buffer.alloc(w * h * 4);
  const S = 4;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const [pr, pg, pb, pa] = paint((x + (sx + 0.5) / S) / w, (y + (sy + 0.5) / S) / h);
          r += pr * pa; g += pg * pa; b += pb * pa; a += pa;
        }
      }
      const i = (y * w + x) * 4;
      buf[i] = a ? Math.round(r / a) : 0;
      buf[i + 1] = a ? Math.round(g / a) : 0;
      buf[i + 2] = a ? Math.round(b / a) : 0;
      buf[i + 3] = Math.round((a / (S * S)) * 255);
    }
  }
  return buf;
}

/** Bubble with three dots, drawn inside the square [bx0, by0]..[bx0 + size]. */
function bubblePaint(bx0, by0, size, bubble, dots, fallback) {
  return (x, y) => {
    const u = (x - bx0) / size;
    const v = (y - by0) / size;
    if (inBubble(u, v)) return inDot(u, v) ? [...dots, 1] : [...bubble, 1];
    return fallback(x, y);
  };
}

const transparent = () => [0, 0, 0, 0];

function write(name, w, h, paint) {
  writeFileSync(join(out, name), png(w, h, render(w, h, paint)));
  console.log('wrote', name, `${w}x${h}`);
}

// App icon: full-bleed green (iOS masks the corners itself) with a white bubble.
write('icon.png', 1024, 1024, bubblePaint(0.22, 0.25, 0.56, WHITE, GREEN, (x, y) => {
  const shade = y > 0.5 ? DARK.map((c, i) => Math.round(GREEN[i] + (c - GREEN[i]) * (y - 0.5) * 0.6)) : GREEN;
  return [...shade, 1];
}));

// Android adaptive foreground: the bubble inside the 66% safe zone on transparent.
write('adaptive-icon.png', 1024, 1024, bubblePaint(0.3, 0.32, 0.4, WHITE, GREEN, transparent));

// Splash: rounded green square with the bubble; background colour comes from app.config.
write('splash.png', 1024, 1024, (x, y) => {
  if (!inRoundRect(x, y, 0.3, 0.3, 0.7, 0.7, 0.09)) return [0, 0, 0, 0];
  return bubblePaint(0.39, 0.4, 0.22, WHITE, GREEN, () => [...DARK, 1])(x, y);
});

// Android notification icon: white silhouette only (Android tints it).
write('notification-icon.png', 96, 96, (x, y) => {
  const u = (x - 0.12) / 0.76;
  const v = (y - 0.14) / 0.76;
  return inBubble(u, v) && !inDot(u, v) ? [...WHITE, 1] : [0, 0, 0, 0];
});

// Favicon for web export.
write('favicon.png', 48, 48, bubblePaint(0.2, 0.24, 0.6, WHITE, GREEN, (x, y) =>
  inRoundRect(x, y, 0, 0, 1, 1, 0.22) ? [...GREEN, 1] : [0, 0, 0, 0]
));
