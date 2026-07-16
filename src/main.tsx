import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './i18n'; // Initialize i18n
import { getLogger } from './lib/logger';
import { initSentry, SentryErrorBoundary } from './lib/sentry';
import { initWebVitals } from './lib/webVitals';
import { registerExternalSessionBridge } from './integrations/supabase/externalSessionBridge';
import { initializeSilentErrorPrevention } from './lib/silentErrorPrevention';

// Instala bridge dual-session (FATOR X external)
registerExternalSessionBridge();

// Initialize silent error prevention (MELHORIA #11)
initializeSilentErrorPrevention();

declare global {
  interface Window {
    __zappHideRootLoader?: () => void;
  }
}

// Init Sentry first (no-op se VITE_SENTRY_DSN não estiver configurada)
const sentryEnabled = initSentry();

const log = getLogger('App');
if (sentryEnabled) log.info('Sentry SDK ativo');
log.info('Initialized at', new Date().toISOString());

/**
 * Consolidated unhandledrejection handler.
 *
 * Handles both logging and suppression in a single listener to avoid the
 * double-handler problem (previously main.tsx logged everything, then
 * App.tsx registered a second handler to suppress some errors — but
 * main.tsx fired first, logging errors that the second handler would
 * have silenced).
 *
 * Suppresses:
 * - TimeoutError: expected browser timeout from storage/IDB operations
 * - InvalidStateError: expected from service worker / IDB lifecycle events
 */
window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  const reason = event.reason;
  if (reason && typeof reason === 'object' && 'name' in reason) {
    const name = (reason as { name: string }).name;
    if (name === 'TimeoutError' || name === 'InvalidStateError') {
      // Known browser noise — suppress silently.
      event.preventDefault();
      return;
    }
  }
  log.error('Unhandled promise rejection:', event.reason);
});

window.addEventListener('error', (event) => {
  log.error('Unhandled error:', event.error || event.message);
});

// Initialize Web Vitals monitoring
initWebVitals();

// Accessibility auditing in development mode
if (import.meta.env.DEV) {
  import('@axe-core/react').then((axe) => {
    axe.default(React, ReactDOM, 1000, undefined, undefined, (results) => {
      const violations = results?.violations;
      if (violations?.length) {
        log.warn(`[A11Y] ${violations.length} accessibility violation(s) detected`);
        violations.forEach((v) => {
          log.warn(
            `[A11Y] ${String(v.impact || 'UNKNOWN').toUpperCase()}: ${v.id} — ${v.description} (${v.nodes.length} element(s))`
          );
        });
      }
    });
    log.info('[A11Y] axe-core accessibility auditing enabled');
  });
}

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
ReactDOM.createRoot(document.getElementById('root')!).render(
  <SentryErrorBoundary
    fallback={({ error, resetError }) => (
      <div
        role="alert"
        className="mx-auto my-10 max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-xl"
      >
        <h1 className="mb-3 text-2xl font-bold text-foreground">Algo deu errado</h1>
        <p className="mb-4 text-muted-foreground">
          O erro foi registrado e nossa equipe foi notificada. Você pode tentar de novo:
        </p>
        <button type="button"
          onClick={resetError}
          className="rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          Tentar novamente
        </button>
        {import.meta.env.DEV && (
          <pre className="mt-4 overflow-auto rounded-lg bg-muted p-3 text-xs text-destructive">
            {String(error?.toString?.() ?? error)}
          </pre>
        )}
      </div>
    )}
    showDialog={false}
  >
    <App />
  </SentryErrorBoundary>
);

// window.__zappHideRootLoader is now called from App.tsx useEffect for better reliability
