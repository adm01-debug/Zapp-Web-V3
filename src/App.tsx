import { Suspense, useEffect, useState } from 'react';
import { lazyWithRetry } from '@/lib/lazyWithRetry';
import { ErrorBoundary } from '@/components/errors/ErrorBoundary';
import { BrowserRouter } from 'react-router-dom';
import { getLogger } from '@/lib/logger';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { GlobalKeyboardProvider } from '@/components/keyboard/GlobalKeyboardProvider';
import { SkipLinks } from '@/components/ui/skip-link';
import { LiveRegion } from '@/components/ui/visually-hidden';
import { ThemeInitializer } from '@/components/ThemeInitializer';
import { ThemeDebugger } from '@/components/debug/ThemeDebugger';
import { AppProviders } from '@/components/providers/AppProviders';
import { AppRoutes } from '@/components/routing/AppRoutes';
import { ServiceWorkerUpdateBanner } from '@/components/system/ServiceWorkerUpdateBanner';
// FIX perf TTM phase-07: widgets de debug agora são lazy — renderizam null em
// produção mas seus módulos (Button/Badge/ScrollArea/Card/etc.) eram incluídos
// no chunk inicial por estarem importados estaticamente aqui.
const BuildValidationOverlay = lazyWithRetry(() =>
  import('@/components/debug/BuildValidationOverlay').then((m) => ({
    default: m.BuildValidationOverlay,
  }))
);
const HardResetButton = lazyWithRetry(() =>
  import('@/components/debug/HardResetButton').then((m) => ({ default: m.HardResetButton }))
);
const SwDebugWidget = lazyWithRetry(() =>
  import('@/components/debug/SwDebugWidget').then((m) => ({ default: m.SwDebugWidget }))
);
const ThemeDebugger = lazyWithRetry(() =>
  import('@/components/debug/ThemeDebugger').then((m) => ({ default: m.ThemeDebugger }))
);

import { useThemeAudit } from '@/hooks/useThemeAudit';
import { TransitionProvider } from '@/components/transitions';

const log = getLogger('App');

// Deferred non-critical providers loaded after first paint
const RealtimeSentimentAlertProvider = lazyWithRetry(() =>
  import('@/components/notifications/UnifiedNotificationProviders').then((m) => ({
    default: m.RealtimeSentimentAlertProvider,
  }))
);
const IncomingCallAlert = lazyWithRetry(() =>
  import('@/components/calls/IncomingCallAlert').then((m) => ({ default: m.IncomingCallAlert }))
);
const EasterEggsProvider = lazyWithRetry(() =>
  import('@/components/effects/EasterEggs').then((m) => ({ default: m.EasterEggsProvider }))
);
const InAppNotificationProvider = lazyWithRetry(() =>
  import('@/components/mobile/InAppNotificationProvider').then((m) => ({
    default: m.InAppNotificationProvider,
  }))
);

/**
 * Side-effect-only providers loaded after first paint.
 * These components provide context via React context, not via children prop.
 * No children are passed — EasterEggsProvider renders its own content.
 */
function DeferredProviders() {
  return (
    <ErrorBoundary fallback={null}>
      <Suspense fallback={null}>
        <RealtimeSentimentAlertProvider />
        <IncomingCallAlert />
        <InAppNotificationProvider>
          <EasterEggsProvider />
        </InAppNotificationProvider>
      </Suspense>
    </ErrorBoundary>
  );
}

/**
 * Deferred hooks component — lazy-loaded so hooks don't run until after first paint.
 * Plain function (no forwardRef): renders nothing, exists only to call hooks.
 */
const DeferredHooks = lazyWithRetry(() =>
  import('@/hooks/useServiceWorker').then((swMod) =>
    import('@/features/auth').then((spMod) =>
      import('@/lib/buildVersion').then((bvMod) => ({
        default: function DeferredHooksInner(): null {
          swMod.useServiceWorker();
          spMod.useScreenProtection();
          useEffect(() => {
            // Skip in dev / iframe preview / kill-switch — same policy as SW.
            if (import.meta.env?.DEV) return;
            try {
              if (window.self !== window.top) return;
              const host = window.location.hostname;
              if (
                host.startsWith('id-preview--') ||
                host.startsWith('preview--') ||
                host.endsWith('.lovableproject.com') ||
                host.endsWith('.lovableproject-dev.com') ||
                host.endsWith('.beta.lovable.dev')
              ) return;
              if (new URL(window.location.href).searchParams.get('sw') === 'off') return;
            } catch { /* noop */ }
            return bvMod.startBuildVersionWatcher();
          }, []);
          return null;
        },
      }))
    )
  )
);

function AppContent() {
  useThemeAudit();
  const [deferredReady, setDeferredReady] = useState(false);

  // Defer non-critical features to after first paint
  useEffect(() => {
    let timerId: ReturnType<typeof setTimeout> | undefined;
    const id = requestAnimationFrame(() => {
      timerId = setTimeout(() => setDeferredReady(true), 800);
    });
    return () => {
      cancelAnimationFrame(id);
      clearTimeout(timerId);
    };
  }, []);

  // Hide the initial boot loader once the App is mounted
  useEffect(() => {
    log.info('AppContent mounted, checking root loader status');

    // Immediate check if React has already rendered something inside #root
    const root = document.getElementById('root');
    if (root && root.childElementCount > 0) {
      log.info('React content detected, hiding loader immediately');
      if (window.__zappHideRootLoader) window.__zappHideRootLoader();
    }

    // Small delay to ensure first paint is done
    const timer = setTimeout(() => {
      if (typeof window !== 'undefined') {
        if (window.__zappHideRootLoader) {
          window.__zappHideRootLoader();
        } else {
          const loader = document.getElementById('root-loading');
          if (loader) {
            loader.style.opacity = '0';
            setTimeout(() => {
              if (loader.parentNode) loader.remove();
            }, 400);
          }
        }
      }
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  // Global error handling for TimeoutError and InvalidStateError is now
  // consolidated in main.tsx to avoid duplicate handler firing order issues.

  return (
    <BrowserRouter>
      <ThemeInitializer />
      <Suspense fallback={null}>
        <ThemeDebugger />
      </Suspense>
      <SkipLinks />
      <LiveRegion />
      <GlobalKeyboardProvider>
        {deferredReady && <DeferredProviders />}
        {deferredReady && (
          <Suspense fallback={null}>
            <DeferredHooks />
          </Suspense>
        )}
        <Toaster />
        <Sonner />
        <ServiceWorkerUpdateBanner />
        <Suspense fallback={null}>
          <SwDebugWidget />
        </Suspense>

        <TransitionProvider defaultVariant="fade">
          <AppRoutes />
        </TransitionProvider>
        <Suspense fallback={null}>
          <BuildValidationOverlay />
          <HardResetButton />
        </Suspense>
      </GlobalKeyboardProvider>
    </BrowserRouter>
  );
}

const App = () => (
  <AppProviders>
    <AppContent />
  </AppProviders>
);

/** Default export. */
export default App;