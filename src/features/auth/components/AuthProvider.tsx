import { useState, useEffect, useCallback, useRef, useMemo, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { authService, Profile } from '../services/authService';
import { log } from '@/lib/logger';
import { AuthContext } from '../context/AuthContext';
import { supabase, SUPABASE_RESOLVED_URL } from '@/integrations/supabase/client';
import { verifyHttpOnlyCookieAuth } from '@/integrations/supabase/cookieStorage';

/**
 * Componente central que fornece o estado de autenticação para toda a aplicação.
 * Encapsula a lógica de sessão do Supabase e sincronização do perfil do usuário.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchingProfileRef = useRef(false);
  const fetchingRolesRef = useRef(false);
  const fetchingPermissionsRef = useRef(false);
  const queryClient = useQueryClient();

  const withTimeout = <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> =>
    Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`[Auth] Timeout (${ms}ms) em ${label}`)), ms)
      ),
    ]);

  const fetchProfile = useCallback(async (userId: string) => {
    if (fetchingProfileRef.current) return;
    fetchingProfileRef.current = true;
    try {
      const { data, error } = await withTimeout(
        authService.getProfile(userId),
        5000,
        'fetchProfile'
      );
      if (!error && data) {
        setProfile(data);
      } else if (error) {
        log.error('[Auth] Error fetching profile:', error);
      }
    } catch (err: unknown) {
      log.error('[Auth] Failed to fetch profile for user:', userId, err);
      setProfile(null);
    } finally {
      fetchingProfileRef.current = false;
    }
  }, []);

  const fetchRolesAndPermissions = useCallback(async (userId: string) => {
    if (fetchingRolesRef.current) return;
    fetchingRolesRef.current = true;
    fetchingPermissionsRef.current = true;
    try {
      if (!supabase) {
        log.error('[Auth] Supabase client not initialized for user:', userId);
        setRoles([]);
        setPermissions([]);
        return;
      }
      const { data: userRoles, error } = await withTimeout(
        Promise.resolve(supabase.from('user_roles').select('role').eq('user_id', userId)),
        5000,
        'fetchRoles'
      );


      if (error || !userRoles) {
        if (error) log.error('[Auth] Error fetching roles:', error);
        setRoles([]);
        setPermissions([]);
        return;
      }

      const roleNames = userRoles.map((r) => r.role as string);
      setRoles(roleNames);

      if (roleNames.length === 0) {
        setPermissions([]);
        return;
      }

      const { data: perms } = await withTimeout(
        Promise.resolve(
          supabase
            .from('role_permissions')
            .select('permissions(name)')
            .in(
              'role',
              roleNames as Array<'admin' | 'agent' | 'dev' | 'manager' | 'special_agent' | 'supervisor'>
            )
        ),
        5000,
        'fetchPermissions'
      );


      if (perms) {
        const permNames = (perms as Array<{ permissions: { name: string } | null }>)
          .map((p) => p.permissions?.name)
          .filter((n): n is string => typeof n === 'string');
        setPermissions([...new Set(permNames)]);
      }
    } catch (err: unknown) {
      log.error('[Auth] Failed to fetch roles/permissions for user:', userId, err);
      setRoles([]);
      setPermissions([]);
    } finally {
      fetchingRolesRef.current = false;
      fetchingPermissionsRef.current = false;
    }
  }, []);


  const fetchRoles = useCallback(
    (userId: string) => fetchRolesAndPermissions(userId),
    [fetchRolesAndPermissions]
  );
  const fetchPermissions = useCallback(
    (userId: string) => fetchRolesAndPermissions(userId),
    [fetchRolesAndPermissions]
  );

  const refreshAll = useCallback(
    async (userId: string) => {
      setLoading(true);
      // A11y/robustez: garante que loading NUNCA fique preso se um fetch rejeitar.
      try {
        await Promise.all([fetchProfile(userId), fetchRolesAndPermissions(userId)]);
      } finally {
        setLoading(false);
      }
    },
    [fetchProfile, fetchRolesAndPermissions]
  );

  useEffect(() => {
    let mounted = true;

    // Verify that auth tokens are stored in httpOnly cookies (XSS-resistant)
    if (!verifyHttpOnlyCookieAuth()) {
      log.error('[Auth] Security check failed: httpOnly cookies not properly configured');
    }

    // Safety net: se onAuthStateChange NUNCA disparar (Supabase inacessível,
    // CORS, DNS, etc.), força fim do loading após 12s para o ProtectedRoute
    // conseguir redirecionar em vez de travar na tela de "Verificando acesso".
    const bootstrapTimeout = setTimeout(() => {
      if (!mounted) return;
      log.error('[Auth] Bootstrap timeout (12s) — Supabase inacessivel. Forçando loading=false.');
      setLoading(false);
    }, 12000);

    // Diagnóstico: registra a URL do Supabase em uso + duração do getSession()
    // para facilitar debug de travamento na tela "Verificando acesso...".
    log.info(`[Auth] Supabase URL em uso: ${SUPABASE_RESOLVED_URL}`);

    // Explicit getSession() com timeout: se o backend não responder, saímos do
    // loading imediatamente em vez de esperar o INITIAL_SESSION que pode nunca vir.
    (async () => {
      const startedAt =
        typeof performance !== 'undefined' ? performance.now() : Date.now();
      try {
        const result = await withTimeout(
          supabase.auth.getSession(),
          4000,
          'getSession'
        );
        const elapsedMs = Math.round(
          (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt
        );
        if (!mounted) return;
        const initialSession = result.data.session;
        log.info(
          `[Auth] getSession OK em ${elapsedMs}ms — session=${initialSession ? 'present' : 'null'}`
        );
        if (!initialSession) {
          // Sem sessão — libera imediatamente para redirecionar a /auth
          setLoading(false);
        }
        // Se houver sessão, deixamos o onAuthStateChange (INITIAL_SESSION)
        // disparar refreshAll normalmente.
      } catch (err) {
        const elapsedMs = Math.round(
          (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt
        );
        if (!mounted) return;
        log.error(`[Auth] getSession falhou/timeout após ${elapsedMs}ms — URL=${SUPABASE_RESOLVED_URL}`, err);
        setLoading(false);
      }
    })();

    const subscription = authService.onAuthStateChange((event, session) => {
      if (!mounted) return;
      log.info(`[Auth] Event: ${event}`);
      clearTimeout(bootstrapTimeout);

      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        refreshAll(session.user.id);
      } else {
        setProfile(null);
        setRoles([]);
        setPermissions([]);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      clearTimeout(bootstrapTimeout);
      subscription.unsubscribe();
    };
  }, [refreshAll]);


  useEffect(() => {
    if (!user) return;

    const profileChannel = supabase
      .channel(`profile-updates-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'zapp',
          table: 'profiles',
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          log.info('[Auth] Profile update detected via real-time', payload);
          if (payload.eventType === 'DELETE') {
            setProfile(null);
          } else {
            await fetchProfile(user.id);
          }
        }
      )
      .subscribe();

    const rolesChannel = supabase
      .channel(`role-updates-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'zapp',
          table: 'user_roles',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          log.info('[Auth] Role change detected, refetching...');
          fetchRoles(user.id);
          fetchPermissions(user.id);
        }
      )
      .subscribe();

    return () => {
      profileChannel.unsubscribe();
      supabase.removeChannel(profileChannel);
      rolesChannel.unsubscribe();
      supabase.removeChannel(rolesChannel);
    };
  }, [user, profile?.id, fetchRoles, fetchPermissions]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.id);
  }, [user, fetchProfile]);

  const refreshRoles = useCallback(async () => {
    if (user) await fetchRoles(user.id);
  }, [user, fetchRoles]);

  const refreshPermissions = useCallback(async () => {
    if (user) await fetchPermissions(user.id);
  }, [user, fetchPermissions]);

  const signIn = async (email: string, password: string) => {
    return await authService.signIn(email, password);
  };

  const signUp = async (email: string, password: string, name: string) => {
    return await authService.signUp(email, password, name);
  };

  const signOut = async () => {
    try {
      await authService.signOut();
      if (typeof window !== 'undefined') {
        Object.keys(localStorage)
          .filter((k) => k.startsWith('sb-') && k.includes('-auth-token'))
          .forEach((k) => localStorage.removeItem(k));
      }
    } catch (e) {
      log.warn('[Auth] Error during signOut:', e);
    } finally {
      setProfile(null);
      setRoles([]);
      setPermissions([]);
      queryClient.clear();
    }
  };

  const contextValue = useMemo(
    () => ({
      user,
      session,
      profile,
      roles,
      permissions,
      loading,
      signIn,
      signUp,
      signOut,
      refreshProfile,
      refreshRoles,
      refreshPermissions,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      user,
      session,
      profile,
      roles,
      permissions,
      loading,
      refreshProfile,
      refreshRoles,
      refreshPermissions,
    ]
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}
