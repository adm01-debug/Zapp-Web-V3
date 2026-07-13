import { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '@/features/auth';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkles } from 'lucide-react';
import NotFound from '@/pages/NotFound';
import { PageTransition } from '@/components/transitions';
import { lazyWithRetry } from '@/lib/lazyWithRetry';
// GAP FIX C: import from shared module (was local function without stale-chunk
// detection). The old local version caused 3 retries x 1s = 3s delay before
// reload for hash-mismatch errors. Now all 50+ URL routes get instant reload.
import { adminRoutes } from './AdminRoutes';
import { debugRoutes } from './DebugRoutes';

const Index = lazyWithRetry(() => import('@/pages/Index'));
const Auth = lazyWithRetry(() => import('@/pages/Auth'));
const ForgotPassword = lazyWithRetry(() => import('@/pages/ForgotPassword'));
const ResetPassword = lazyWithRetry(() => import('@/pages/ResetPassword'));
const VerifyEmail = lazyWithRetry(() => import('@/pages/VerifyEmail'));
const SSOCallback = lazyWithRetry(() => import('@/pages/SSOCallback'));
const TwoFactorAuth = lazyWithRetry(() => import('@/pages/TwoFactorAuth'));
const DesignSystem = lazyWithRetry(() => import('@/pages/DesignSystem'));
const QueueDetails = lazyWithRetry(() => import('@/pages/QueueDetails'));
const QueuesComparison = lazyWithRetry(() => import('@/pages/QueuesComparison'));
const SLADashboard = lazyWithRetry(() => import('@/pages/SLADashboard'));
const SLAHistory = lazyWithRetry(() => import('@/pages/SLAHistory'));
const SLAAlertPreferences = lazyWithRetry(() => import('@/pages/SLAAlertPreferences'));
const SLAAlertHistory = lazyWithRetry(() => import('@/pages/SLAAlertHistory'));
const AccessDenied = lazyWithRetry(() => import('@/pages/AccessDenied'));
const Install = lazyWithRetry(() => import('@/pages/Install'));
const ChatPopup = lazyWithRetry(() => import('@/pages/ChatPopup'));
const InboxPage = lazyWithRetry(() => import('@/pages/inbox/InboxPage'));
const OAuthConsent = lazyWithRetry(() => import('@/pages/OAuthConsent'));

function RouteLoadingFallback() {
  return (
    <div
      className="flex h-screen items-center justify-center bg-background"
      role="status"
      aria-busy="true"
      aria-label="Carregando"
    >
      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-16 w-16 animate-pulse items-center justify-center rounded-2xl bg-primary/20">
          <Sparkles className="h-8 w-8 text-primary" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <Skeleton className="mx-auto h-4 w-32" />
          <Skeleton className="mx-auto h-3 w-24" />
        </div>
        <span className="sr-only">Carregando...</span>
      </div>
    </div>
  );
}

export function AppRoutes() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <PageTransition>
        <Routes>
          <Route
            path="/design-system"
            element={
              <ProtectedRoute requiredRoles={['admin', 'dev']}>
                <DesignSystem />
              </ProtectedRoute>
            }
          />
          <Route path="/access-denied" element={<AccessDenied />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/auth/callback" element={<SSOCallback />} />
          <Route path="/2fa" element={<TwoFactorAuth />} />
          <Route
            path="/install"
            element={
              <ProtectedRoute requiredRoles={['admin']}>
                <Install />
              </ProtectedRoute>
            }
          />
          <Route
            path="/chat-popup/:contactId"
            element={
              <ProtectedRoute>
                <ChatPopup />
              </ProtectedRoute>
            }
          />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Index />
              </ProtectedRoute>
            }
          />
          <Route
            path="/inbox"
            element={
              <ProtectedRoute>
                <InboxPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/queue/:id"
            element={
              <ProtectedRoute>
                <QueueDetails />
              </ProtectedRoute>
            }
          />
          <Route
            path="/queues/comparison"
            element={
              <ProtectedRoute>
                <QueuesComparison />
              </ProtectedRoute>
            }
          />
          <Route
            path="/sla"
            element={
              <ProtectedRoute>
                <SLADashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/sla/history"
            element={
              <ProtectedRoute>
                <SLAHistory />
              </ProtectedRoute>
            }
          />
          <Route
            path="/sla/preferences"
            element={
              <ProtectedRoute>
                <SLAAlertPreferences />
              </ProtectedRoute>
            }
          />
          <Route
            path="/sla/alerts"
            element={
              <ProtectedRoute>
                <SLAAlertHistory />
              </ProtectedRoute>
            }
          />
          {/* Debug routes — each gated to admin/dev roles (FIX P0) */}
          {debugRoutes()}
          {/* Admin routes */}
          {adminRoutes()}
          {/* Compat redirects: /login e /chat-popup (sem :contactId) existiam antes
              da migração para AppRoutes. Deep-links externos e bookmarks continuam
              funcionando após a refatoração do App.tsx. */}
          <Route path="/login" element={<Navigate to="/auth" replace />} />
          <Route path="/chat-popup" element={<Navigate to="/" replace />} />
          <Route
            path="/connections"
            element={<Navigate to="/?view=connections&tab=connections" replace />}
          />
          <Route
            path="/integrations"
            element={<Navigate to="/?view=connections&tab=integrations" replace />}
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </PageTransition>
    </Suspense>
  );
}
