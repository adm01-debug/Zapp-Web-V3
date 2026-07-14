import { Route } from 'react-router-dom';
import { ProtectedRoute } from '@/features/auth';
import { lazyWithRetry } from '@/lib/lazyWithRetry';

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
const AdminConnectionsPage = lazyWithRetry(() => import('@/pages/admin/Connections'));
const PerformanceDashboard = lazyWithRetry(() => import('@/pages/admin/PerformanceDashboard'));
const AdminSecurityLogsPage = lazyWithRetry(() => import('@/pages/admin/AdminSecurityLogsPage'));

/**
 * Returns a React fragment of /admin/* Route elements.
 * Called as {adminRoutes()} inside <Routes> so the fragment inlines
 * directly — React Router v6 requires Route elements (or Fragments) as
 * direct children of <Routes>, so this must NOT be used as <AdminRoutes />.
 */
export function adminRoutes() {
  return (
    <>
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
    </>
  );
}
