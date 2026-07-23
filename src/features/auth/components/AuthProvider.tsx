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
  const [bootstrapError, setBootstrapError] = useState<'timeout' | 'offline' | null>(null);
  const [bootstrapElapsedMs, setBootstrapElapsedMs] = useState<number | null>(null);
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
    async (userId: string, { showLoading = true } = {}) => {
      // showLoading=false em eventos de token refresh silencioso (TOKEN_REFRESHED)
      // para evitar flash de tela de carregamento em sessões já autenticadas.
      if (showLoading) setLoading(true);
      // A11y/robustez: garante que loading NUNCA fique preso se um fetch rejeitar.
      try {
        await Promise.all([fetchProfile(userId), fetchRolesAndPermissions(userId)]);
      } finally {
        setLoading(false);
      }
    },
    [fetchProfile, fetchRolesAndPermissions]
  );

  // Ref para permitir retry manual via UI
  const bootstrapRunRef = useRef(0);
  // Ref para o safety-net timeout de bootstrap — acessível por runBootstrap
  // para cancelar quando o bootstrap resolve ANTES de onAuthStateChange disparar.
  // Sem essa ref, utilizadores sem sessão recebem bootstrapError='timeout'
  // espúrio 10s após o carregamento (BUG C).
  const bootstrapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runBootstrap = useCallback(async () => {
    const runId = ++bootstrapRunRef.current;
    setLoading(true);
    setBootstrapError(null);

    // Fast-fall: se nao ha token no localStorage, pulamos a chamada HTTP.
    // NOTA: Object.keys(localStorage) pode lançar SecurityError em modo privado
    // restrito ou quando cookies/storage são bloqueados por política do browser
    // (BUG D). O try-catch garante que o bootstrap degrada graciosamente.
    const hasLocalToken = typeof window !== 'undefined' && (() => {
      try {
        return Object.keys(localStorage).some((k) => k.includes('-auth-token'));
      } catch {
        // localStorage inacessível — assume sem token; getSession() não é chamado.
        return false;
      }
    })();
    if (!hasLocalToken) {
      log.info('[Auth] Sem token local — pulando getSession().');
      setLoading(false);
      setBootstrapElapsedMs(0);
      // Sem token → onAuthStateChange não vai disparar → cancela o safety-net
      // para evitar erro de timeout espúrio 10s depois (BUG C).
      if (bootstrapTimeoutRef.current !== null) {
        clearTimeout(bootstrapTimeoutRef.current);
        bootstrapTimeoutRef.current = null;
      }
      return;
    }

    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    try {
      const result = await withTimeout(supabase.auth.getSession(), 8000, 'getSession');
      const elapsedMs = Math.round(
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt
      );
      if (runId !== bootstrapRunRef.current) return;
      setBootstrapElapsedMs(elapsedMs);
      const initialSession = result.data.session;
      log.info(
        `[Auth] getSession OK em ${elapsedMs}ms — session=${initialSession ? 'present' : 'null'}`
      );
      if (!initialSession) {
        setLoading(false);
        // Sessão nula: onAuthStateChange pode não disparar se não havia sessão
        // anterior → cancela o safety-net para evitar erro de timeout espúrio (BUG C).
        if (bootstrapTimeoutRef.current !== null) {
          clearTimeout(bootstrapTimeoutRef.current);
          bootstrapTimeoutRef.current = null;
        }
      }
    } catch (err) {
      const elapsedMs = Math.round(
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt
      );
      if (runId !== bootstrapRunRef.current) return;
      setBootstrapElapsedMs(elapsedMs);
      const isOffline =
        typeof navigator !== 'undefined' && 'onLine' in navigator && !navigator.onLine;
      log.error(
        `[Auth] getSession falhou/${isOffline ? 'offline' : 'timeout'} após ${elapsedMs}ms — URL=${SUPABASE_RESOLVED_URL}`,
        err
      );
      // I07: distingue timeout de offline para o ProtectedRoute exibir mensagem correta.
      setBootstrapError(isOffline ? 'offline' : 'timeout');
      setLoading(false);
      // Bootstrap resolveu com erro — cancela o safety-net para evitar
      // double-set e log desnecessário 10s depois (BUG C).
      if (bootstrapTimeoutRef.current !== null) {
        clearTimeout(bootstrapTimeoutRef.current);
        bootstrapTimeoutRef.current = null;
      }
    }
  }, []);

  const retryBootstrap = useCallback(async () => {
    await runBootstrap();
  }, [runBootstrap]);

  useEffect(() => {
    let mounted = true;

    if (!verifyHttpOnlyCookieAuth()) {
      log.error('[Auth] Security check failed: httpOnly cookies not properly configured');
    }

    // Safety net final (10s): se ainda estiver em loading quando disparar,
    // marca como timeout para o ProtectedRoute exibir tela de erro.
    // Armazenado em bootstrapTimeoutRef para que runBootstrap possa cancelá-lo
    // nos caminhos sem sessão (sem onAuthStateChange) — evitando erro espúrio (BUG C).
    bootstrapTimeoutRef.current = setTimeout(() => {
      if (!mounted) return;
      log.error('[Auth] Bootstrap safety-net (10s) — forçando loading=false.');
      setBootstrapError((prev) => prev ?? 'timeout');
      setLoading(false);
      bootstrapTimeoutRef.current = null;
    }, 10000);

    log.info(`[Auth] Supabase URL em uso: ${SUPABASE_RESOLVED_URL}`);
    void runBootstrap();

    const subscription = authService.onAuthStateChange((event, session) => {
      if (!mounted) return;
      log.info(`[Auth] Event: ${event}`);
      if (bootstrapTimeoutRef.current !== null) {
        clearTimeout(bootstrapTimeoutRef.current);
        bootstrapTimeoutRef.current = null;
      }
      setBootstrapError(null);

      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        // TOKEN_REFRESHED é renovação silenciosa — não exibir loading (I06).
        // SIGNED_IN, USER_UPDATED etc. implicam mudança de identidade → loading.
        const showLoading = event !== 'TOKEN_REFRESHED';
        refreshAll(session.user.id, { showLoading });
      } else {
        setProfile(null);
        setRoles([]);
        setPermissions([]);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      if (bootstrapTimeoutRef.current !== null) {
        clearTimeout(bootstrapTimeoutRef.current);
        bootstrapTimeoutRef.current = null;
      }
      subscription.unsubscribe();
    };
  }, [refreshAll, runBootstrap]);


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
          log.info('[Auth] Role change detected, refetching roles and permissions...');
          // fetchRoles e fetchPermissions são aliases de fetchRolesAndPermissions.
          // Chamar os dois em sequência fazia a 2ª chamada ser sempre um no-op
          // (fetchingRolesRef.current já true pelo guard). Chamada única aqui.
          void fetchRolesAndPermissions(user.id);
        }
      )
      .subscribe();

    return () => {
      profileChannel.unsubscribe();
      supabase.removeChannel(profileChannel);
      rolesChannel.unsubscribe();
      supabase.removeChannel(rolesChannel);
    };
  }, [user, profile?.id, fetchRolesAndPermissions]); // eslint-disable-line react-hooks/exhaustive-deps

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
        try {
          Object.keys(localStorage)
            .filter((k) => k.startsWith('sb-') && k.includes('-auth-token'))
            .forEach((k) => localStorage.removeItem(k));
        } catch {
          // localStorage bloqueado (modo privado / política de segurança) — ignora.
        }
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
      bootstrapError,
      bootstrapElapsedMs,
      retryBootstrap,
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
      bootstrapError,
      bootstrapElapsedMs,
      retryBootstrap,
      refreshProfile,
      refreshRoles,
      refreshPermissions,
    ]
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}
