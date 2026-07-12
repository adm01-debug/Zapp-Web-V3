import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured, warnSupabaseUnconfigured } from '@/integrations/supabase/client';
import { type AppRole } from './useUserRole';
import { getLogger } from '@/lib/logger';

const log = getLogger('useRouteRoles');

/**
 * Cache values:
 *  - missing key : not yet fetched
 *  - null        : fetched, no override exists for this path (use code default)
 *  - AppRole[]   : fetched, explicit override (empty array = any authenticated)
 */
const cache = new Map<string, AppRole[] | null>();
const inflight = new Map<string, Promise<void>>();

function fetchRoles(path: string): Promise<void> {
  const existing = inflight.get(path);
  if (existing) return existing;
  // No Supabase → no override lookup. Cache `null` so callers fall back to
  // their hard-coded `requiredRoles`, and so we never re-enter or hit network.
  if (!isSupabaseConfigured) {
    warnSupabaseUnconfigured('useRouteRoles');
    cache.set(path, null);
    return Promise.resolve();
  }
  const p = (async () => {
    try {
      const { data, error } = await supabase
        .from('route_permissions')
        .select('allowed_roles')
        .eq('path', path)
        .maybeSingle();
      
      if (error) {
        log.warn('Error fetching route roles', { path, error: error.message });
        cache.set(path, null);
      } else if (!data) {
        cache.set(path, null);
      } else {
        cache.set(path, (data.allowed_roles as AppRole[]) ?? []);
      }
    } catch (err) {
      log.error('Critical error fetching route roles', { path, err });
      cache.set(path, null);
    } finally {
      inflight.delete(path);
    }
  })();
  inflight.set(path, p);
  return p;
}

/**
 * Returns the dynamic role override for a route path. Non-blocking:
 * returns `null` immediately while the override is loading, so callers
 * fall back to their hard-coded `requiredRoles`. Once the fetch resolves,
 * the hook re-renders once with the actual override.
 */
export function useRouteRoles(path: string | undefined): AppRole[] | null {
  const initial = path && cache.has(path) ? (cache.get(path) ?? null) : null;
  const [roles, setRoles] = useState<AppRole[] | null>(initial);

  useEffect(() => {
    if (!path) {
      setRoles(prev => (prev === null ? prev : null));
      return;
    }
    if (cache.has(path)) {
      const cached = cache.get(path) ?? null;
      setRoles(prev => (prev === cached ? prev : cached));
      return;
    }
    let cancelled = false;
    fetchRoles(path).then(() => {
      if (cancelled) return;
      const cached = cache.get(path) ?? null;
      setRoles(prev => (prev === cached ? prev : cached));
    }).catch((err: unknown) => {
      // fetchRoles already handles and logs errors internally; this catch
      // guards against any unexpected escape. Log it so silent auth failures
      // surface in monitoring rather than being swallowed.
      log.error('Unhandled error in fetchRoles for path', { path, err });
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return roles;
}

export function invalidateRouteRolesCache(path?: string) {
  if (path) cache.delete(path);
  else cache.clear();
}
