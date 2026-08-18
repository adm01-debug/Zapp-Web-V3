/* eslint-disable react-refresh/only-export-components */
import { ReactNode, useEffect, useState } from 'react';
import { getLogger } from '@/lib/logger';
import { markTimeToMainScreen, recordAuthzFailure } from '@/lib/appMetrics';
import { getAppEnv, isDevBypassAllowed } from '@/lib/auth/devBypass';

const log = getLogger('ProtectedRoute');
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useUserRole, type AppRole } from '../hooks/useUserRole';
import { useRouteRoles } from '../hooks/useRouteRoles';

import { supabase } from '@/integrations/supabase/client';

// E51 51.7: auditoria de tentativa de bypass `dev` BLOQUEADA em produção.
// Throttle por path por sessão (evita spam de eventos a cada re-render).
const devBypassBlockLoggedPaths = new Set<string>();
function logDevBypassBlocked(path: string, roles: AppRole[]) {
  if (devBypassBlockLoggedPaths.has(path)) return;
  devBypassBlockLoggedPaths.add(path);
  void supabase
    .rpc('log_security_event', {
      p_event_type: 'dev_bypass_used',
      p_resource: path,
      p_action: 'route_access',
      p_status: 'blocked',
      p_details: {
        roles,
        env: getAppEnv(),
        reason: 'dev_bypass_not_allowed_in_production',
      },
    })
    .then(({ error }) => {
      if (error) log.warn('Failed to log blocked dev bypass', { error: error.message });
    })
    .then(undefined, (err: unknown) => {
      log.warn('[ProtectedRoute] Falha ao registrar bypass dev bloqueado (audit log):', err);
    });
}

/** Test-only: limpa o throttle de log de bypass bloqueado (E51). */
export function __resetDevBypassBlockLogForTest() {
  devBypassBlockLoggedPaths.clear();
}

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
  const {
    user,
    loading: authLoading,
    signOut,
    bootstrapError,
    bootstrapElapsedMs,
    retryBootstrap,
  } = useAuth();
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

  // Stale-session guard: verify JWT is still valid after auth state settles.
  // Must run inside useEffect — calling getSession() in the render body fires
  // twice under React StrictMode and can trigger a spurious logout when the
  // first call transiently returns null before GoTrue cache is warm.
  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data.session) {
          log.warn('[ProtectedRoute] Stale session detected — forcing redirect to /auth');
          void supabase.auth
            .signOut()
            .catch(() => {
              // Fallback: rede fora / GoTrue com erro — limpa a sessão local
              // mesmo assim para o usuário não ficar preso numa sessão inválida.
              try {
                Object.keys(localStorage).forEach((k) => {
                  if (k.startsWith('sb-') || k.startsWith('zapp')) localStorage.removeItem(k);
                });
                sessionStorage.clear();
              } catch {
                /* noop */
              }
            })
            .finally(() => {
              window.location.replace('/auth');
            });
        }
      })
      .then(undefined, (err: unknown) => {
        // getSession pode rejeitar por rede/timeout — sem este handler,
        // vira unhandled promise rejection no bootstrap de toda rota protegida.
        log.warn('[ProtectedRoute] getSession falhou na checagem de sessão:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, user]);

  // Tela de erro quando o backend nao respondeu no boot.
  // Precede o "loading" para evitar spinner infinito ou redirect que so vai
  // recair na mesma tela apos o /auth tentar carregar de novo.
  if (bootstrapError === 'timeout' || bootstrapError === 'offline') {
    const isOffline = bootstrapError === 'offline';
    const backendUrl = 'https://supabase.atomicabr.com.br';
    const elapsedLabel = bootstrapElapsedMs != null ? `${bootstrapElapsedMs}ms` : '—';
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-background p-6"
        role="alert"
        aria-live="assertive"
      >
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
          <h1 className="mb-2 text-xl font-semibold text-foreground">
            {isOffline ? 'Sem conexão com a internet' : 'Não foi possível conectar ao servidor'}
          </h1>
          <p className="mb-4 text-sm text-muted-foreground">
            {isOffline
              ? 'Parece que você está sem acesso à rede. Verifique sua conexão Wi-Fi ou dados móveis e tente novamente.'
              : 'O servidor não respondeu no tempo esperado. Pode ser instabilidade momentânea — tente novamente em alguns instantes.'}
          </p>
          <dl className="mb-5 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {!isOffline && (
              <>
                <dt>Backend:</dt>
                <dd className="truncate font-mono">{backendUrl}</dd> {/* @technical */}
                <dt>Tempo de resposta:</dt>
                <dd className="font-mono">{elapsedLabel}</dd> {/* @technical */}
              </>
            )}
            {isOffline && (
              <>
                <dt>Status de rede:</dt>
                <dd className="font-mono text-destructive">Offline</dd> {/* @technical */}
              </>
            )}
          </dl>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                void retryBootstrap();
              }}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Tentar novamente
            </button>
            <button
              type="button"
              onClick={() => {
                try {
                  Object.keys(localStorage).forEach((k) => {
                    if (k.startsWith('sb-') || k.startsWith('zapp')) localStorage.removeItem(k);
                  });
                  sessionStorage.clear();
                } catch {
                  /* noop */
                }
                void signOut().finally(() => {
                  window.location.href = '/auth';
                });
              }}
              className="rounded-md border border-border bg-card px-4 py-2 text-sm text-foreground hover:bg-accent"
            >
              Limpar dados e ir para login
            </button>
            <a
              href="/auth?debug=boot"
              className="text-center text-xs text-muted-foreground underline hover:text-foreground"
            >
              Abrir diagnóstico
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (timedOut) {
    recordAuthzFailure({ route: location.pathname, reason: 'timeout' });
    // E51 51.6 (anti-loop): se já estamos em /auth, redirecionar para
    // /auth?reason=timeout recairia na mesma tela → loop. Renderiza saída.
    if (location.pathname !== '/auth') {
      return <Navigate to="/auth?reason=timeout" state={{ from: location }} replace />;
    }
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-background p-6"
        role="alert"
        aria-live="assertive"
      >
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
          <h1 className="mb-2 text-xl font-semibold text-foreground">
            Tempo de carregamento excedido
          </h1>
          <p className="mb-5 text-sm text-muted-foreground">
            Não foi possível carregar suas permissões em 10s. Tente sair e entrar novamente.
          </p>
          <button
            type="button"
            onClick={() => {
              void signOut();
            }}
            className="rounded-md border border-border bg-card px-4 py-2 text-sm text-foreground hover:bg-accent"
          >
            Sair e tentar novamente
          </button>
        </div>
      </div>
    );
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

  if (!user || timedOut) {
    recordAuthzFailure({ route: location.pathname, reason: 'unauthenticated' });
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // Resolve effective required roles: DB override wins when present
  // overrideRoles === null  -> no override, use code default
  // overrideRoles === []    -> any authenticated user
  // overrideRoles === [...] -> explicit list
  const effectiveRoles: AppRole[] | undefined =
    overrideRoles === null ? requiredRoles : overrideRoles;

  // 'dev' bypass: só em ambientes allowlisted (E51) — em produção o papel dev
  // passa a exigir a mesma checagem RBAC/permissão dos demais papéis.
  const isDevUser = hasRole('dev' as AppRole);
  const devBypassAllowed = isDevBypassAllowed();
  if (isDevUser && devBypassAllowed) {
    // F3-02: registra bypass no log de auditoria com throttle por sessão
    void supabase.rpc('log_security_event', {
      p_event_type: 'dev_bypass_used',
      p_resource: location.pathname,
      p_action: 'route_access',
      p_status: 'bypassed',
      p_details: { roles },
    }).then(({ error }) => {
      if (error) log.warn('Failed to log dev bypass', { error: error.message });
    }).then(undefined, (err: unknown) => {
      log.warn('[ProtectedRoute] Falha ao registrar dev bypass (audit log):', err);
    });
    markTimeToMainScreen(location.pathname);
    return <>{children}</>;
  }

  if (effectiveRoles && effectiveRoles.length > 0) {
    const hasRequiredRole = effectiveRoles.some((role) => hasRole(role));
    if (!hasRequiredRole) {
      log.warn(
        `Unauthorized role access attempt to ${location.pathname}. Required: ${effectiveRoles.join(', ')}`
      );
      recordAuthzFailure({
        route: location.pathname,
        reason: 'role',
        required: effectiveRoles,
        current: roles,
      });

      void supabase
        .rpc('log_security_event', {
          p_event_type: 'unauthorized_access',
          p_resource: location.pathname,
          p_action: 'NAVIGATE',
          p_status: 'denied',
          p_details: { required_roles: effectiveRoles, current_roles: roles },
        })
        .then(({ error }) => {
          if (error) log.warn('Failed to log security event', { error: error.message });
        })
        .then(undefined, (err: unknown) => {
          log.warn('[ProtectedRoute] Falha ao registrar acesso não autorizado (audit log):', err);
        });

      // E51 51.7: tentativa de bypass dev bloqueada em produção
      if (isDevUser && !devBypassAllowed) {
        logDevBypassBlocked(location.pathname, roles);
      }

      if (fallback) return <>{fallback}</>;
      return <Navigate to="/access-denied" state={{ from: location }} replace />;
    }
  }

  // Check required permission
  if (requiredPermission && !hasPermission) {
    log.warn(
      `Unauthorized permission access attempt to ${location.pathname}. Required: ${requiredPermission}`
    );
    recordAuthzFailure({
      route: location.pathname,
      reason: 'permission',
      required: requiredPermission,
      current: roles,
    });

    void supabase
      .rpc('log_security_event', {
        p_event_type: 'unauthorized_access',
        p_resource: location.pathname,
        p_action: 'NAVIGATE',
        p_status: 'denied',
        p_details: { required_permission: requiredPermission },
      })
      .then(({ error }) => {
        if (error) log.warn('Failed to log security event', { error: error.message });
      })
      .then(undefined, (err: unknown) => {
        log.warn('[ProtectedRoute] Falha ao registrar permissão negada (audit log):', err);
      });

    // E51 51.7: tentativa de bypass dev bloqueada em produção
    if (isDevUser && !devBypassAllowed) {
      logDevBypassBlocked(location.pathname, roles);
    }

    if (fallback) return <>{fallback}</>;
    return <Navigate to="/access-denied" state={{ from: location }} replace />;
  }

  // F3-11: guard useRef — evita chamadas repetidas em re-renders
  markTimeToMainScreen(location.pathname);
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
