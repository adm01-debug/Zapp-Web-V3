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

export function ProtectedRoute({
  children,
  requiredRoles,
  requiredPermission,
  fallback,
  routePath,
}: ProtectedRouteProps) {
  const { user, loading: authLoading } = useAuth();
  const { roles, loading: rolesLoading, hasRole } = useUserRole();
  const location = useLocation();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [permissionChecking, setPermissionChecking] = useState(false);

  // Dynamic override from route_permissions table.
  const overrideRoles = useRouteRoles(routePath ?? location.pathname);

  const loading = authLoading || (rolesLoading && roles.length === 0) || permissionChecking;

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

  // Removed redundant and potentially looping re-fetch logic for roles.
  // useUserRole already handles initial fetch and real-time updates.

  if (loading || (requiredPermission && user && hasPermission === null)) {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-background"
        role="status"
        aria-busy="true"
        aria-label="Verificando acesso"
      >
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
          <p className="animate-pulse text-muted-foreground">Verificando acesso e permissões...</p>
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
      supabase.rpc('log_security_event', {
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
    supabase.rpc('log_security_event', {
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
