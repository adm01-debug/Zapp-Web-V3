import { useState, useEffect, useCallback, useRef, useMemo, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { authService, Profile } from '../services/authService';
import { log } from '@/lib/logger';
import { AuthContext } from '../context/AuthContext';
import { supabase, SUPABASE_RESOLVED_URL } from '@/integrations/supabase/client';
import { verifyHttpOnlyCookieAuth } from '@/integrations/supabase/cookieStorage';

// ---------------------------------------------------------------------------
// Utilitário de timeout para promises — definido no escopo do módulo para
// evitar recriação em cada render do AuthProvider.
//
// Cancela o timer interno quando a promise resolve antes do timeout (evita
// timers órfãos que ficavam ativos por até 5s depois do resultado chegar).
// ---------------------------------------------------------------------------
// Safety-net do bootstrap de Auth. DEVE ser maior que o timeout do fetch do
// Supabase client (SUPABASE_FETCH_TIMEOUT_MS = 12s): assim, se um refresh de
// token pendurar, o boundedFetch aborta (~12s), o INITIAL_SESSION resolve e
// limpa o loading ANTES deste backstop declarar 'timeout' fatal. Se este valor
// fosse ≤12s, o safety-net dispararia a tela de erro no meio de um refresh que
// ainda ia resolver — exatamente o bug de bootstrap que estamos corrigindo.
const BOOTSTRAP_SAFETY_NET_MS = 15_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timerId: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timerId = setTimeout(() => reject(new Error(`[Auth] Timeout (${ms}ms) em ${label}`)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timerId));
}

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
      // FIX (bootstrap-hang): esta chamada de getSession é REDUNDANTE com o
      // evento INITIAL_SESSION que onAuthStateChange (abaixo) sempre emite em
      // supabase-js v2 — com a sessão real ou null. Se o getSession do bootstrap
      // demora (ex.: um refresh de token que pendura por rede momentaneamente
      // degradada), tratá-lo como falha FATAL mostrava a tela de erro cheia do
      // ProtectedRoute prematuramente, mesmo quando o INITIAL_SESSION entregaria
      // a sessão válida logo em seguida (ou governaria o logout corretamente).
      //
      // Portanto: só declaramos erro fatal quando o browser está REALMENTE
      // offline (aí a tela de erro/retry é o comportamento certo). Quando há
      // conectividade, apenas registramos e deixamos o INITIAL_SESSION governar
      // o estado; o safety-net (useEffect) permanece como backstop final.
      if (isOffline) {
        setBootstrapError('offline');
        setLoading(false);
        if (bootstrapTimeoutRef.current !== null) {
          clearTimeout(bootstrapTimeoutRef.current);
          bootstrapTimeoutRef.current = null;
        }
      } else {
        log.info('[Auth] getSession lento/pendurado — aguardando INITIAL_SESSION governar o estado (não-fatal).');
        // NÃO seta bootstrapError e NÃO cancela o safety-net: o INITIAL_SESSION
        // deve chegar e limpar loading; se nada resolver, o safety-net cobre.
      }
    }
  }, []);

  const retryBootstrap = useCallback(async () => {
    // Reseta o safety-net timeout para o retry — sem isso, se getSession
    // travar durante uma retentativa, loading=true fica preso para sempre
    // (bootstrapTimeoutRef foi zerado quando o primeiro erro foi setado).
    if (bootstrapTimeoutRef.current !== null) {
      clearTimeout(bootstrapTimeoutRef.current);
    }
    bootstrapTimeoutRef.current = setTimeout(() => {
      log.error('[Auth] Bootstrap safety-net no retry — forçando loading=false.');
      setBootstrapError((prev) => prev ?? 'timeout');
      setLoading(false);
      bootstrapTimeoutRef.current = null;
    }, BOOTSTRAP_SAFETY_NET_MS);
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
      log.error('[Auth] Bootstrap safety-net — forçando loading=false.');
      setBootstrapError((prev) => prev ?? 'timeout');
      setLoading(false);
      bootstrapTimeoutRef.current = null;
    }, BOOTSTRAP_SAFETY_NET_MS);

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
      // supabase.removeChannel() já chama unsubscribe() internamente (supabase-js v2).
      // Chamar os dois causava double-cleanup e potenciais warnings de estado inválido.
      supabase.removeChannel(profileChannel);
      supabase.removeChannel(rolesChannel);
    };
  // Nota sobre deps: omitimos profile?.id intencionalmente — os canais
  // são filtrados por user.id (não profile.id), então re-subscribing quando
  // profile carrega seria desnecessário e causaria breve janela sem subscrição.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, fetchRolesAndPermissions]);

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
