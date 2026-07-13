import { Route } from 'react-router-dom';
import { ProtectedRoute } from '@/features/auth';
import { lazyWithRetry } from '@/lib/lazyWithRetry';

const SendStatusBusDebug = lazyWithRetry(() => import('@/pages/SendStatusBusDebug'));
const RealtimeFanoutDebug = lazyWithRetry(() => import('@/pages/RealtimeFanoutDebug'));
const BackendDiagnostics = lazyWithRetry(() => import('@/pages/BackendDiagnostics'));

/**
 * Returns a React fragment of /debug/* Route elements.
 * Called as {debugRoutes()} inside <Routes> so the fragment inlines
 * directly — React Router v6 requires Route elements (or Fragments) as
 * direct children of <Routes>, so this must NOT be used as <DebugRoutes />.
 */
export function debugRoutes() {
  return (
    <>
      {/* FIX P0: /debug/send-status-bus had no role gate — restricted to
          admin/dev roles, consistent with /debug/backend and /debug/realtime-fanout. */}
      <Route
        path="/debug/send-status-bus"
        element={
          <ProtectedRoute requiredRoles={['admin', 'dev']}>
            <SendStatusBusDebug />
          </ProtectedRoute>
        }
      />
      {/* FIX P0: /debug/realtime-fanout had no role gate — any authenticated user
          could access realtime diagnostics. Restricted to admin/dev roles,
          consistent with /debug/backend. */}
      <Route
        path="/debug/realtime-fanout"
        element={
          <ProtectedRoute requiredRoles={['admin', 'dev']}>
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
    </>
  );
}
