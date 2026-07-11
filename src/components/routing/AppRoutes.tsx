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
const SendStatusBusDebug = lazyWithRetry(() => import('@/pages/SendStatusBusDebug'));
const RealtimeFanoutDebug = lazyWithRetry(() => import('@/pages/RealtimeFanoutDebug'));
const BackendDiagnostics = lazyWithRetry(() => import('@/pages/BackendDiagnostics'));
const RolesPage = lazyWithRetry(() => import('@/pages/admin/RolesPage'));
const DepartmentsPage = lazyWithRetry(() => import('@/pages/admin/DepartmentsPage'));
const RateLimitDashboard = lazyWithRetry(() => import('@/pages/admin/RateLimitDashboard'));
const HmacSelfTestPage = lazyWithRetry(() => import('@/pages/admin/HmacSelfTestPage'));
const AdminChannelsPage = lazyWithRetry(() => import('@/pages/admin/AdminChannelsPage'));
const AdminQueuesPage = lazyWithRetry(() => import('@/pages/admin/AdminQueuesPage'));
const AdminOperationsPage = lazyWithRetry(() => import('@/pages/admin/AdminOperationsPage'));
const AdminProvidersPage = lazyWithRetry(() => import('@/pages/admin/AdminProvidersPage'));
const AdminFailedAuthMessagesPage = lazyWithRetry(
  () => import('@/pages/admin/AdminFailedAuthMessagesPage')
);
const RoutePermissionsPage = lazyWithRetry(() => import('@/pages/admin/RoutePermissionsPage'));
// AdminStressTestPage removido (P3 orphan cleanup — tabelas stress_test_* não existem no schema)
const AdminInboxSyncStatusPage = lazyWithRetry(
  () => import('@/pages/admin/AdminInboxSyncStatusPage')
);
const AdminExternalDbExplorerPage = lazyWithRetry(
  () => import('@/pages/admin/AdminExternalDbExplorerPage')
);
const SelfHostedHealthPage = lazyWithRetry(() => import('@/pages/admin/SelfHostedHealthPage'));
const AdminEvoApiHealthPage = lazyWithRetry(() => import('@/pages/admin/AdminEvoApiHealthPage'));
const ZappWebbDemoPage = lazyWithRetry(() => import('@/pages/admin/ZappWebbDemoPage'));
const AdminAutomationsPage = lazyWithRetry(() => import('@/pages/admin/AdminAutomationsPage'));
const AdminAutomationLogsPage = lazyWithRetry(
  () => import('@/pages/admin/AdminAutomationLogsPage')
);
const AdminWhatsAppModePage = lazyWithRetry(() => import('@/pages/admin/AdminWhatsAppModePage'));
const AdminWhatsAppLogsPage = lazyWithRetry(() => import('@/pages/admin/AdminWhatsAppLogsPage'));
const AdminEmailStatusPage = lazyWithRetry(() => import('@/pages/admin/AdminEmailStatusPage'));
const AdminEmailAuditPage = lazyWithRetry(() => import('@/pages/admin/AdminEmailAuditPage'));
const AuditEvidenceDashboard = lazyWithRetry(() => import('@/pages/admin/AuditEvidenceDashboard'));
const AdminDevDiagnosticsPage = lazyWithRetry(
  () => import('@/pages/admin/AdminDevDiagnosticsPage')
);
const AdminBridgeStatusPage = lazyWithRetry(() => import('@/pages/admin/AdminBridgeStatusPage'));
const AdminSecurityLogsPage = lazyWithRetry(() => import('@/pages/admin/AdminSecurityLogsPage'));
const AccessDenied = lazyWithRetry(() => import('@/pages/AccessDenied'));
const Install = lazyWithRetry(() => import('@/pages/Install'));
const ChatPopup = lazyWithRetry(() => import('@/pages/ChatPopup'));
const InboxPage = lazyWithRetry(() => import('@/pages/inbox/InboxPage'));
const AdminConnectionsPage = lazyWithRetry(() => import('@/pages/admin/Connections'));
const PerformanceDashboard = lazyWithRetry(() => import('@/pages/admin/PerformanceDashboard'));
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
          <Route
            path="/debug/send-status-bus"
            element={
              <ProtectedRoute>
                <SendStatusBusDebug />
              </ProtectedRoute>
            }
          />
          <Route
            path="/debug/realtime-fanout"
            element={
              <ProtectedRoute>
                <RealtimeFanoutDebug />
              </ProtectedRoute>
            }
          />
          {/* FIX P0: /debug/backend previously had no auth guard — any anonymous user
              could access internal infrastructure diagnostics. Now restricted to
              admin/dev roles, consistent with /admin/dev-diagnostics and
              /admin/self-hosted-health. */}
          <Route
            path="/debug/backend"
            element={
              <ProtectedRoute requiredRoles={['admin', 'dev']}>
                <BackendDiagnostics />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/roles"
            element={
              <ProtectedRoute requiredRoles={['admin']}>
                <RolesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/departments"
            element={
              <ProtectedRoute requiredRoles={['admin']}>
                <DepartmentsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/rate-limit"
            element={
              <ProtectedRoute requiredRoles={['admin']}>
                <RateLimitDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/hmac-selftest"
            element={
              <ProtectedRoute requiredRoles={['admin', 'supervisor']}>
                <HmacSelfTestPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/operations"
            element={
              <ProtectedRoute requiredRoles={['admin', 'supervisor']}>
                <AdminOperationsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/channels"
            element={
              <ProtectedRoute requiredRoles={['admin', 'supervisor']}>
                <AdminChannelsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/queues"
            element={
              <ProtectedRoute requiredRoles={['admin', 'supervisor']}>
                <AdminQueuesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/providers"
            element={
              <ProtectedRoute requiredRoles={['admin', 'supervisor']}>
                <AdminProvidersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/failed-auth-messages"
            element={
              <ProtectedRoute requiredRoles={['admin']}>
                <AdminFailedAuthMessagesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/route-permissions"
            element={
              <ProtectedRoute requiredRoles={['admin']}>
                <RoutePermissionsPage />
              </ProtectedRoute>
            }
          />
          {/* /admin/stress-test removido — dependia de stress_test_runs/stress_test_metrics (tabelas inexistentes). */}
          <Route
            path="/admin/inbox-sync-status"
            element={
              <ProtectedRoute requiredRoles={['admin', 'supervisor']}>
                <AdminInboxSyncStatusPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/external-db-explorer"
            element={
              <ProtectedRoute requiredRoles={['admin', 'dev']}>
                <AdminExternalDbExplorerPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/self-hosted-health"
            element={
              <ProtectedRoute requiredRoles={['admin', 'dev']}>
                <SelfHostedHealthPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/evo-api-health"
            element={
              <ProtectedRoute requiredRoles={['admin', 'dev']}>
                <AdminEvoApiHealthPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/bridge-status"
            element={
              <ProtectedRoute requiredRoles={['admin', 'dev', 'supervisor']}>
                <AdminBridgeStatusPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/connections"
            element={
              <ProtectedRoute requiredRoles={['admin']}>
                <AdminConnectionsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/security-logs"
            element={
              <ProtectedRoute requiredRoles={['admin', 'dev']}>
                <AdminSecurityLogsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/zappweb-demo"
            element={
              <ProtectedRoute requiredRoles={['admin', 'dev', 'manager']}>
                <ZappWebbDemoPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/automations"
            element={
              <ProtectedRoute requiredRoles={['admin', 'supervisor']}>
                <AdminAutomationsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/automations/logs"
            element={
              <ProtectedRoute requiredRoles={['admin', 'supervisor']}>
                <AdminAutomationLogsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/whatsapp-mode"
            element={
              <ProtectedRoute requiredRoles={['admin', 'supervisor']}>
                <AdminWhatsAppModePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/whatsapp-logs"
            element={
              <ProtectedRoute requiredRoles={['admin', 'supervisor']}>
                <AdminWhatsAppLogsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/email-status"
            element={
              <ProtectedRoute requiredRoles={['admin', 'supervisor']}>
                <AdminEmailStatusPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/email-audit"
            element={
              <ProtectedRoute requiredRoles={['admin', 'supervisor']}>
                <AdminEmailAuditPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/audit-evidence"
            element={
              <ProtectedRoute requiredRoles={['admin']}>
                <AuditEvidenceDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/dev-diagnostics"
            element={
              <ProtectedRoute requiredRoles={['dev']}>
                <AdminDevDiagnosticsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/performance"
            element={
              <ProtectedRoute requiredRoles={['admin', 'dev']}>
                <PerformanceDashboard />
              </ProtectedRoute>
            }
          />
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
