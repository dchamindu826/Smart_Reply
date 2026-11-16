import { spawn } from 'node:child_process';

/**
 * Browsers record voice notes as WebM/Opus or MP4/AAC. WhatsApp shows a voice message only
 * for OGG/Opus, so the worker re-wraps WebM/Opus into OGG without re-encoding, and
 * re-encodes anything else to Opus. Needs `ffmpeg` on the worker (installed in the Docker image).
 */
export async function toOggOpus(input: Buffer, mime: string): Promise<Buffer> {
  const copy = mime === 'audio/webm' || mime === 'audio/ogg';
  const args = ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-vn', '-ac', '1'];
  if (copy && mime === 'audio/webm') args.push('-c:a', 'copy');
  else args.push('-c:a', 'libopus', '-b:a', '32k');
  args.push('-f', 'ogg', 'pipe:1');
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const out: Buffer[] = [];
    const errs: Buffer[] = [];
    p.stdout.on('data', (d: Buffer) => out.push(d));
    p.stderr.on('data', (d: Buffer) => errs.push(d));
    p.on('error', err => reject(new Error(`ffmpeg is not installed on the worker (${err.message})`)));
    p.on('close', code => {
      if (code === 0) resolve(Buffer.concat(out));
      else reject(new Error(`ffmpeg failed: ${Buffer.concat(errs).toString().slice(0, 300)}`));
    });
    p.stdin.end(input);
  });
}

export function needsVoiceConversion(mime: string): boolean {
  return mime !== 'audio/ogg' && mime.startsWith('audio/');
}
