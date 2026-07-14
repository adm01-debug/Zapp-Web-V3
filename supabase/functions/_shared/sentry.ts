/**
 * Sentry SDK for Edge Functions (Deno)
 *
 * Behavior:
 * - If SENTRY_DSN is empty/undefined → noop (zero overhead, zero network calls)
 * - If SENTRY_DSN is set → init with sane defaults for serverless + webhook functions
 *
 * Activation: set SENTRY_DSN in Supabase secrets (Settings > Secrets and Env Vars)
 *
 * Auto-tagged:
 * - environment: prod (default) | dev (via ENVIRONMENT env var)
 * - function: derived from request context (e.g., 'whatsapp-webhook')
 * - version: SENTRY_RELEASE or git sha (if available)
 */

const DSN = Deno.env.get('SENTRY_DSN');
const ENV = Deno.env.get('ENVIRONMENT') || 'prod';
const RELEASE = Deno.env.get('SENTRY_RELEASE') || 'unknown';

interface SentryEvent {
  event_id?: string;
  level?: 'fatal' | 'error' | 'warning' | 'info' | 'debug';
  message?: string;
  exception?: { values: Array<{ type: string; value: string; stacktrace?: unknown }> };
  tags?: Record<string, string>;
  contexts?: Record<string, unknown>;
  request?: Record<string, unknown>;
  timestamp?: number;
}

let initialized = false;

/**
 * Send event to Sentry via HTTP (Deno compatible)
 */
async function sendEvent(event: SentryEvent): Promise<void> {
  if (!DSN || DSN.trim() === '') return;

  try {
    const url = new URL(DSN);
    const projectId = url.pathname.split('/').pop();
    const dsn = new URL(DSN);
    const endpoint = `${dsn.origin}/api/${projectId}/envelope/`;

    const envelope = `${JSON.stringify({
      event_id: event.event_id || crypto.randomUUID(),
      sent_at: new Date().toISOString(),
    })}\n${JSON.stringify(event)}\n`;

    await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
      },
      body: envelope,
    }).catch(() => {
      // Silently fail if Sentry is unreachable (don't break function)
    });
  } catch (err) {
    console.error('[sentry] failed to send event:', err);
  }
}

/**
 * Initialize Sentry for Edge Functions
 */
export function initSentry(functionName: string): boolean {
  if (initialized) return true;

  if (!DSN || DSN.trim() === '') {
    if (Deno.env.get('DEBUG_SENTRY')) {
      console.info(
        '[sentry] DSN not configured — Sentry disabled (set SENTRY_DSN in Supabase secrets to enable)'
      );
    }
    return false;
  }

  try {
    console.info(
      `[sentry] initialized — env=${ENV} release=${RELEASE} function=${functionName}`
    );
    initialized = true;
    return true;
  } catch (err) {
    console.error('[sentry] init failed:', err);
    return false;
  }
}

/**
 * Capture exception in Sentry
 */
export async function captureException(
  err: unknown,
  context?: {
    functionName?: string;
    requestUrl?: string;
    userId?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<string | null> {
  if (!initialized || !DSN) return null;

  const event: SentryEvent = {
    level: 'error',
    timestamp: Math.floor(Date.now() / 1000),
    tags: {
      environment: ENV,
      function: context?.functionName || 'unknown',
    },
    contexts: {
      ...(context?.metadata && { custom: context.metadata }),
    },
  };

  if (context?.requestUrl) {
    event.request = { url: context.requestUrl };
  }

  if (err instanceof Error) {
    event.exception = {
      values: [
        {
          type: err.name,
          value: err.message,
          stacktrace: {
            frames: parseStackTrace(err.stack || ''),
          },
        },
      ],
    };
  } else {
    event.message = String(err);
  }

  const eventId = crypto.randomUUID();
  event.event_id = eventId;

  await sendEvent(event);
  return eventId;
}

/**
 * Capture message in Sentry
 */
export async function captureMessage(
  message: string,
  level: 'info' | 'warning' | 'debug' = 'info',
  context?: {
    functionName?: string;
    tags?: Record<string, string>;
  }
): Promise<string | null> {
  if (!initialized || !DSN) return null;

  const event: SentryEvent = {
    message,
    level,
    timestamp: Math.floor(Date.now() / 1000),
    tags: {
      environment: ENV,
      function: context?.functionName || 'unknown',
      ...context?.tags,
    },
  };

  const eventId = crypto.randomUUID();
  event.event_id = eventId;

  await sendEvent(event);
  return eventId;
}

/**
 * Parse JavaScript stack trace into Sentry frames format
 */
function parseStackTrace(stack: string) {
  const lines = stack.split('\n').slice(1); // Skip first line (message)
  return lines
    .map((line) => {
      const match = line.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/);
      if (match) {
        return {
          function: match[1],
          filename: match[2],
          lineno: parseInt(match[3]),
          colno: parseInt(match[4]),
        };
      }
      return null;
    })
    .filter(Boolean);
}

/**
 * Wrap a handler to automatically capture errors
 */
export function withSentry<T extends (...args: unknown[]) => Promise<Response>>(
  handler: T,
  functionName: string
): T {
  return (async (...args: unknown[]) => {
    initSentry(functionName);

    const req = args[0] as Request;
    const requestUrl = req.url;

    try {
      return await handler(...args);
    } catch (err) {
      await captureException(err, {
        functionName,
        requestUrl,
      });
      // Re-throw so function can handle it
      throw err;
    }
  }) as T;
}
