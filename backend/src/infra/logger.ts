import pino from 'pino';
import { env, isProd } from '../config';

/**
 * Application logger. Never log message text, full phone numbers or tokens:
 * use `maskPhone()` from @smart-reply/shared and log ids instead.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: ['password', '*.password', 'token', '*.token', 'accessToken', '*.accessToken', 'authorization', '*.authorization', 'body.text', 'text'],
    censor: '[redacted]'
  },
  ...(isProd ? {} : { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } } })
});
