import { lazy, Suspense, useEffect, useState } from 'react';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/features/auth';
import { ThemeProvider } from '@/components/ThemeProvider';
import { AriaAnnouncer } from '@/hooks/useAriaAnnouncer';
import { Toaster as SonnerToaster } from 'sonner';
import { InAppNotificationProvider } from '@/components/notifications/InAppNotificationProvider';

// Lazy imports for code splitting (non-critical paths)
const Index = lazy(() => import('./pages/Index'));
const Login = lazy(() => import('./pages/Auth'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const AccessDenied = lazy(() => import('./pages/AccessDenied'));
const ChatPopup = lazy(() => import('./pages/ChatPopup'));
const EasterEggsProvider = lazy(() => import("@/components/effects/EasterEggs").then(m => ({ default: m.EasterEggsProvider })));

// These components provide context via React context, not via children prop.
// No children are passed — EasterEggsProvider renders its own content.
const queryClient = new QueryClient();

function App() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setIsReady(true);
  }, []);

  if (!isReady) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="system" storageKey="zapp-ui-theme">
        <TooltipProvider>
          <BrowserRouter>
            <AuthProvider>
              <AriaAnnouncer />
              <Toaster />
              <SonnerToaster position="top-right" richColors />
              <Suspense fallback={null}>
                <InAppNotificationProvider>
                  <EasterEggsProvider>{null}</EasterEggsProvider>
                </InAppNotificationProvider>
              </Suspense>
              <Routes>
                <Route path="/" element={<Suspense fallback={null}><Index /></Suspense>} />
                <Route path="/login" element={<Suspense fallback={null}><Login /></Suspense>} />
                <Route path="/forgot-password" element={<Suspense fallback={null}><ForgotPassword /></Suspense>} />
                <Route path="/reset-password" element={<Suspense fallback={null}><ResetPassword /></Suspense>} />
                <Route path="/access-denied" element={<Suspense fallback={null}><AccessDenied /></Suspense>} />
                <Route path="/chat-popup" element={<Suspense fallback={null}><ChatPopup /></Suspense>} />
              </Routes>
            </AuthProvider>
          </BrowserRouter>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
