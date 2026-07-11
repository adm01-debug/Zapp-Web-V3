import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n"; // Initialize i18n 
import { getLogger } from "./lib/logger";
import { initSentry, SentryErrorBoundary } from "./lib/sentry";
import { initWebVitals } from "./lib/web-vitals";
import { registerExternalSessionBridge } from "./integrations/supabase/externalSessionBridge";

// Instala bridge dual-session (FATOR X external)
registerExternalSessionBridge();

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
          log.warn(`[A11Y] ${String(v.impact || 'UNKNOWN').toUpperCase()}: ${v.id} — ${v.description} (${v.nodes.length} element(s))`);
        });
      }
    });
    log.info('[A11Y] axe-core accessibility auditing enabled');
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <SentryErrorBoundary
    fallback={({ error, resetError }) => (
      <div role="alert" className="p-6  max-w-2xl mx-auto my-10 bg-card rounded-2xl border border-border shadow-xl">
        <h1 className="text-2xl font-bold mb-3 text-foreground">Algo deu errado</h1>
        <p className="text-muted-foreground mb-4">
          O erro foi registrado e nossa equipe foi notificada. Você pode tentar de novo:
        </p>
        <button onClick={resetError} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity">
          Tentar novamente
        </button>
        {import.meta.env.DEV && (
          <pre className="mt-4 p-3 bg-muted text-destructive rounded-lg overflow-auto text-xs ">
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
