/**
 * Structured JSON logging with hard redaction of anything that looks like a
 * credential. Nothing in this file should ever be replaced by console.log:
 * every log line is machine-parseable and safe to ship to a log drain.
 */
type Level = 'debug' | 'info' | 'warn' | 'error';

const REDACT_KEYS = [
  'password',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'accesstokenencrypted',
  'refreshtokenencrypted',
  'secret',
  'apikey',
  'api_key',
  'authorization',
  'cookie',
  'codeverifier',
  'tokenhash',
  'clientsecret',
];

const REDACTED = '[redacted]';

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[depth-limit]';
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Error) return { name: value.name, message: value.message };

  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    out[key] = REDACT_KEYS.includes(key.toLowerCase().replace(/[-_]/g, '')) ? REDACTED : redact(raw, depth + 1);
  }
  return out;
}

// Tests set this so a passing run is not buried in structured log lines.
const SILENT = process.env['LOG_SILENT'] === 'true';

function emit(level: Level, event: string, data?: Record<string, unknown>): void {
  if (SILENT) return;

  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...(data ? (redact(data) as Record<string, unknown>) : {}),
  });
  if (level === 'error') process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}

export const logger = {
  debug: (event: string, data?: Record<string, unknown>) => {
    if (process.env.NODE_ENV !== 'production') emit('debug', event, data);
  },
  info: (event: string, data?: Record<string, unknown>) => emit('info', event, data),
  warn: (event: string, data?: Record<string, unknown>) => emit('warn', event, data),
  error: (event: string, data?: Record<string, unknown>) => emit('error', event, data),
};

export type Logger = typeof logger;
