import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { getLogger } from '@/lib/logger';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/features/auth';
import { ThemeProvider } from '@/components/ThemeProvider';
import { AriaAnnouncer } from '@/hooks/useAriaAnnouncer';
import { Toaster as SonnerToaster } from 'sonner';
import { InAppNotificationProvider } from '@/components/mobile/InAppNotificationProvider';

// Lazy imports for code splitting (non-critical paths)
const Index = lazy(() => import('./pages/Index'));
const Login = lazy(() => import('./pages/Auth'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const AccessDenied = lazy(() => import('./pages/AccessDenied'));
const ChatPopup = lazy(() => import('./pages/ChatPopup'));
const EasterEggsProvider = lazy(() => import("@/components/effects/EasterEggs").then(m => ({ default: m.EasterEggsProvider })));

// Deferred non-critical providers loaded after first paint
const RealtimeSentimentAlertProvider = lazy(() =>
  import('@/components/notifications/RealtimeSentimentAlertProvider').then((m) => ({
    default: m.RealtimeSentimentAlertProvider,
  }))
);
const IncomingCallAlert = lazy(() =>
  import('@/components/calls/IncomingCallAlert').then((m) => ({ default: m.IncomingCallAlert }))
);
const InAppNotificationProvider = lazy(() =>
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
    <Suspense fallback={null}>
      <RealtimeSentimentAlertProvider />
      <IncomingCallAlert />
      <InAppNotificationProvider>
        <EasterEggsProvider />
      </InAppNotificationProvider>
    </Suspense>
  );
}

/**
 * Deferred hooks component — lazy-loaded so hooks don't run until after first paint.
 * Plain function (no forwardRef): renders nothing, exists only to call hooks.
 */
const DeferredHooks = lazy(() =>
  import('@/hooks/useServiceWorker').then((swMod) =>
    import('@/features/auth').then((spMod) => ({
      default: function DeferredHooksInner(): null {
        swMod.useServiceWorker();
        spMod.useScreenProtection();
        return null;
      },
    }))
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
      <ThemeDebugger />
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
        <TransitionProvider defaultVariant="fade">
          <AppRoutes />
        </TransitionProvider>
        <BuildValidationOverlay />
        <HardResetButton />
      </GlobalKeyboardProvider>
    </BrowserRouter>
  );
}

const App = () => (
  <AppProviders>
    <AppContent />
  </AppProviders>
);

export default App;
