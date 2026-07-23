/* eslint-disable react-refresh/only-export-components */
import { ReactNode, useEffect, useState } from 'react';
import { getLogger } from '@/lib/logger';

const log = getLogger('ProtectedRoute');
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useUserRole, type AppRole } from '../hooks/useUserRole';
import { useRouteRoles } from '../hooks/useRouteRoles';

import { supabase } from '@/integrations/supabase/client';

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRoles?: AppRole[];
  requiredPermission?: string;
  fallback?: ReactNode;
  /** Override the path used to look up dynamic role overrides. Defaults to location.pathname. */
  routePath?: string;
}

/** Route guard that redirects unauthenticated users and enforces role/permission requirements before rendering children. */
export function ProtectedRoute({
  children,
  requiredRoles,
  requiredPermission,
  fallback,
  routePath,
}: ProtectedRouteProps) {
  const { user, loading: authLoading, signOut } = useAuth();
  const { roles, loading: rolesLoading, hasRole } = useUserRole();
  const location = useLocation();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [permissionChecking, setPermissionChecking] = useState(false);
  const [loadingElapsed, setLoadingElapsed] = useState(0);
  const [timedOut, setTimedOut] = useState(false);

  // Dynamic override from route_permissions table.
  // Skip lookup while unauthenticated — RLS forbids anon SELECT and would spam
  // "permission denied" warnings on the /auth screen.
  const overrideRoles = useRouteRoles(user ? (routePath ?? location.pathname) : undefined);

  const loading = authLoading || (rolesLoading && roles.length === 0) || permissionChecking;

  // Safety timer: se loading persistir >10s, força fallback para /auth
  useEffect(() => {
    if (!loading) {
      setLoadingElapsed(0);
      setTimedOut(false);
      return;
    }
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - start) / 1000);
      setLoadingElapsed(elapsed);
      if (elapsed >= 10) {
        log.error('[ProtectedRoute] Loading timeout after 10s — forçando redirect para /auth');
        setTimedOut(true);
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [loading]);

  useEffect(() => {
    let isMounted = true;

    if (!authLoading && user && requiredPermission) {
      setPermissionChecking(true);
      supabase
        .rpc('user_has_permission', {
          _user_id: user.id,
          _permission_name: requiredPermission,
        })
        .then(
          ({ data, error }) => {
            if (!isMounted) return;
            if (error) {
              log.error('Permission check failed:', error.message);
              setHasPermission(false);
            } else {
              setHasPermission(data === true);
            }
            setPermissionChecking(false);
          },
          (err) => {
            if (!isMounted) return;
            log.error('Permission check threw:', err);
            setHasPermission(false);
            setPermissionChecking(false);
          }
        );
    } else if (!requiredPermission) {
      setHasPermission(true);
    }

    return () => {
      isMounted = false;
    };
  }, [authLoading, user, requiredPermission]);

  if (timedOut) {
    return <Navigate to="/auth?reason=timeout" state={{ from: location }} replace />;
  }

  if (loading || (requiredPermission && user && hasPermission === null)) {
    const step = authLoading
      ? 'Carregando sessão...'
      : rolesLoading
      ? 'Verificando permissões...'
      : 'Preparando aplicação...';
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-background"
        role="status"
        aria-busy="true"
        aria-live="polite"
        aria-label="Verificando acesso"
      >
        <div className="flex flex-col items-center gap-4 px-6 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
          <p className="animate-pulse text-muted-foreground">{step}</p>
          {loadingElapsed >= 5 && (
            <div className="flex flex-col items-center gap-2">
              <p className="text-xs text-muted-foreground">
                A conexão está demorando mais do que o esperado ({loadingElapsed}s).
              </p>
              <button
                type="button"
                onClick={() => {
                  void signOut().finally(() => {
                    window.location.href = '/auth';
                  });
                }}
                className="rounded-md border border-border bg-card px-4 py-2 text-sm text-foreground hover:bg-accent"
              >
                Sair e tentar novamente
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }


  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // Resolve effective required roles: DB override wins when present
  // overrideRoles === null  -> no override, use code default
  // overrideRoles === []    -> any authenticated user
  // overrideRoles === [...] -> explicit list
  const effectiveRoles: AppRole[] | undefined =
    overrideRoles === null ? requiredRoles : overrideRoles;

  // 'dev' always has access
  const isDev = hasRole('dev' as AppRole);
  if (isDev) {
    return <>{children}</>;
  }

  if (effectiveRoles && effectiveRoles.length > 0) {
    // 'dev' always has access
    const hasRequiredRole =
      hasRole('dev' as AppRole) || effectiveRoles.some((role) => hasRole(role));
    if (!hasRequiredRole) {
      log.warn(
        `Unauthorized role access attempt to ${location.pathname}. Required: ${effectiveRoles.join(', ')}`
      );

      // Log event to Supabase
      // fire-and-forget: não bloquear navegação
      void supabase.rpc('log_security_event', {
        p_event_type: 'unauthorized_access',
        p_resource: location.pathname,
        p_action: 'NAVIGATE',
        p_status: 'denied',
        p_details: { required_roles: effectiveRoles, current_roles: roles },
      });

      if (fallback) return <>{fallback}</>;
      return <Navigate to="/access-denied" state={{ from: location }} replace />;
    }
  }

  // Check required permission
  if (requiredPermission && !hasPermission) {
    log.warn(
      `Unauthorized permission access attempt to ${location.pathname}. Required: ${requiredPermission}`
    );

    // Log already happens inside RPC 'check_user_permission' if we used it,
    // but here we might be checking differently. Let's ensure logging.
    // fire-and-forget: não bloquear navegação
    void supabase.rpc('log_security_event', {
      p_event_type: 'unauthorized_access',
      p_resource: location.pathname,
      p_action: 'NAVIGATE',
      p_status: 'denied',
      p_details: { required_permission: requiredPermission },
    });

    if (fallback) return <>{fallback}</>;
    return <Navigate to="/access-denied" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

// Higher-order component for permission-based rendering
/** with Permission function. */
export function withPermission<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  permission: string
) {
  return function PermissionWrapper(props: P) {
    return (
      <ProtectedRoute requiredPermission={permission}>
        <WrappedComponent {...props} />
      </ProtectedRoute>
    );
  };
}