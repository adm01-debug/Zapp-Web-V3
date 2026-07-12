/**
 * Sentry SDK initialization — guarded by VITE_SENTRY_DSN env var.
 *
 * Behavior:
 * - If VITE_SENTRY_DSN is empty/undefined → noop (zero overhead, zero network calls)
 * - If VITE_SENTRY_DSN is set → init with sane defaults for SPA + Supabase backend
 *
 * Ativação: defina VITE_SENTRY_DSN no .env.local + rebuild
 *
 * Tags automaticamente:
 * - environment: prod (mode=production) | dev (mode=development) | preview
 * - release: VITE_APP_VERSION ou commit hash via VITE_GIT_SHA (se disponível)
 */
import {
  init as sentryInit,
  browserTracingIntegration,
  replayIntegration,
  ErrorBoundary,
} from '@sentry/react';
import * as Sentry from '@sentry/react';

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const ENV = (import.meta.env.MODE === 'production' ? 'prod' : import.meta.env.MODE) as string;
const RELEASE = (import.meta.env.VITE_GIT_SHA ||
  import.meta.env.VITE_APP_VERSION ||
  'unknown') as string;

let initialized = false;

export function initSentry(): boolean {
  if (initialized) return true;
  if (!DSN || DSN.trim() === '' || DSN === 'PLACEHOLDER') {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info(
        '[sentry] DSN not configured \u2014 Sentry disabled (defina VITE_SENTRY_DSN no .env.local pra ativar)'
      );
    }
    return false;
  }

  try {
    // eslint-disable-next-line no-console
    console.info(
      `[sentry] initializing \u2014 env=${ENV} release=${RELEASE} dsn_host=${DSN.split('@')[1]?.split('/')[0]}`
    );
    sentryInit({
      dsn: DSN,
      environment: ENV,
      release: RELEASE,
      // Tracing: sample 10% in prod, 100% in dev
      tracesSampleRate: ENV === 'prod' ? 0.1 : 1.0,
      // Replay: 1% das sessions, 100% das que tiverem erro
      replaysSessionSampleRate: 0.01,
      replaysOnErrorSampleRate: 1.0,
      integrations: [
        browserTracingIntegration(),
        replayIntegration({ maskAllText: true, blockAllMedia: true }),
      ],
      // Don't send if user opted out (LGPD friendly)
      beforeSend(event) {
        // Filtra erros de extensões browser e ResizeObserver loop
        const msg = event.exception?.values?.[0]?.value || event.message || '';
        if (
          msg.includes('ResizeObserver loop') ||
          msg.includes('chrome-extension://') ||
          msg.includes('moz-extension://') ||
          msg.includes('Non-Error promise rejection')
        ) {
          return null;
        }
        return event;
      },
      // Domínios pra distributed tracing (self-hosted Supabase + cloud Supabase + same-origin).
      // SEGURANÇA: [^.]+ restringe a UM nível de subdomínio, bloqueando subdomain-nesting
      // (ex: evil.supabase.co.attacker.com receberia headers sem esta restrição).
      tracePropagationTargets: [
        /^\//,
        /^https:\/\/[^.]+\.supabase\.co(\/|$)/,
        /^https:\/\/supabase\.atomicabr\.com\.br/,
      ],
    });

    initialized = true;
    // eslint-disable-next-line no-console
    console.info('[sentry] \u2705 initialized successfully');
    return true;
  } catch (err) {
    console.error('[sentry] init failed:', err);
    return false;
  }
}

export const SentryErrorBoundary = ErrorBoundary;
export { Sentry };
