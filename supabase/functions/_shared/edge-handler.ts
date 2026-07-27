/**
 * withEdgeHandler — centralized Deno.serve handler wrapper
 *
 * Composes CORS preflight, Sentry init, request-ID injection, timing
 * measurement, and structured error response into a single decorator.
 *
 * Usage:
 *   Deno.serve(withEdgeHandler('my-function', async (req, ctx) => {
 *     // ctx.requestId, ctx.startedAt available
 *     return new Response('ok');
 *   }));
 *
 * What it does automatically:
 *   1. handleCors: returns 204 for OPTIONS without touching the handler
 *   2. initSentry: initializes once per isolate
 *   3. ctx.requestId: unique ID injected into every response as x-request-id
 *   4. captureException: reports unhandled errors to Sentry before responding
 *   5. Structured 500: returns JSON error body instead of an opaque crash
 *   6. x-response-time: milliseconds added to every response
 */

import { handleCors, getCorsHeaders } from './validation.ts';
import { initSentry, captureException } from './sentry.ts';

export interface EdgeHandlerContext {
  readonly requestId: string;
  readonly startedAt: number;
  readonly functionName: string;
}

type EdgeHandlerFn = (req: Request, ctx: EdgeHandlerContext) => Promise<Response>;

function generateRequestId(): string {
  // 12 random hex bytes → 24-char ID, e.g. "a3f1b2c4d5e6f7a8b9c0d1e2"
  const arr = new Uint8Array(12);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Wrap a Deno edge-function handler with cross-cutting concerns.
 *
 * @param functionName - Used for Sentry tagging and x-function-name header.
 * @param handler - Async function receiving (req, ctx) and returning a Response.
 */
export function withEdgeHandler(
  functionName: string,
  handler: EdgeHandlerFn
): (req: Request) => Promise<Response> {
  initSentry(functionName);

  return async (req: Request): Promise<Response> => {
    // 1. CORS preflight — must come first, no logging needed
    const corsResponse = handleCors(req);
    if (corsResponse) return corsResponse;

    const requestId = generateRequestId();
    const startedAt = Date.now();
    const corsHeaders = getCorsHeaders(req);
    const baseHeaders: Record<string, string> = {
      ...corsHeaders,
      'x-request-id': requestId,
      'x-function-name': functionName,
    };

    const ctx: EdgeHandlerContext = { requestId, startedAt, functionName };

    try {
      const response = await handler(req, ctx);
      // Inject timing + request-ID onto the successful response.
      const elapsed = Date.now() - startedAt;
      const headers = new Headers(response.headers);
      headers.set('x-request-id', requestId);
      headers.set('x-response-time', String(elapsed));
      if (!headers.has('x-function-name')) {
        headers.set('x-function-name', functionName);
      }
      // Merge CORS headers so they're never lost even when the handler
      // builds its own Response without calling getCorsHeaders.
      for (const [k, v] of Object.entries(corsHeaders)) {
        if (!headers.has(k)) headers.set(k, v);
      }
      return new Response(response.body, { status: response.status, headers });
    } catch (err) {
      const elapsed = Date.now() - startedAt;
      console.error(
        `[${functionName}] unhandled error after ${elapsed}ms | request-id=${requestId}`,
        err
      );
      await captureException(err, {
        functionName,
        requestUrl: req.url,
        metadata: { requestId, elapsedMs: elapsed },
      });
      return new Response(
        JSON.stringify({
          error: 'Internal server error',
          requestId,
          functionName,
        }),
        {
          status: 500,
          headers: {
            ...baseHeaders,
            'Content-Type': 'application/json',
            'x-response-time': String(elapsed),
          },
        }
      );
    }
  };
}
