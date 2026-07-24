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
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timerId: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timerId = setTimeout(() => reject(new Error(`[Auth] Timeout (${ms}ms) em ${label}`)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timerId));
}

// ---------------------------------------------------------------------------
// Leitura SÍNCRONA da sessão persistida (localStorage) para hidratação otimista.
//
// O supabase-js persiste a sessão em `sb-<ref>-auth-token`. No boot, em vez de
// bloquear o first paint numa chamada de rede (getSession() força um refresh de
// token sob o navigator.locks e pode pendurar por segundos quando o lock está
// contido ou o edge trava), lemos a sessão já gravada e renderizamos na hora.
// O onAuthStateChange do supabase-js continua sendo a fonte de verdade: emite
// TOKEN_REFRESHED em sucesso ou SIGNED_OUT se o refresh token for inválido,
// reconciliando o estado no próximo tick. Isto NÃO substitui o refresh — apenas
// impede que uma revalidação lenta transforme uma sessão válida numa tela de erro.
//
// Robusto a: storage inacessível (modo privado), valor em base64 (UTF-8), chunks
// (`...-auth-token.0/.1`) e ao shape legado v1 (`{ currentSession }`).
// ---------------------------------------------------------------------------
function readPersistedSession(): Session | null {
  if (typeof window === 'undefined') return null;
  let raw: string | null = null;
  try {
    const keys = Object.keys(localStorage).filter((k) => k.includes('-auth-token'));
    if (keys.length === 0) return null;
    // Chave-base = a mais curta que casa (chunks acrescentam sufixo `.N`).
    const baseKey =
      keys.filter((k) => /-auth-token$/.test(k)).sort((a, b) => a.length - b.length)[0] ??
      keys.sort((a, b) => a.length - b.length)[0];
    const chunkKeys = keys
      .filter((k) => k.startsWith(`${baseKey}.`))
      .sort(
        (a, b) => Number(a.slice(baseKey.length + 1)) - Number(b.slice(baseKey.length + 1))
      );
    raw =
      chunkKeys.length > 0
        ? chunkKeys.map((k) => localStorage.getItem(k) ?? '').join('')
        : localStorage.getItem(baseKey);
  } catch {
    // localStorage bloqueado por política do browser — segue o fluxo normal.
    return null;
  }
  if (!raw) return null;

  const tryParse = (text: string): Session | null => {
    try {
      const parsed = JSON.parse(text) as
        | (Session & { currentSession?: Session })
        | { currentSession?: Session };
      const session = ('access_token' in parsed && parsed.access_token
        ? parsed
        : (parsed as { currentSession?: Session }).currentSession) as Session | undefined;
      return session?.user && session?.refresh_token ? session : null;
    } catch {
      return null;
    }
  };

  // Caminho comum (localStorage puro): JSON direto.
  const direct = tryParse(raw);
  if (direct) return direct;

  // Fallback: valor prefixado `base64-` (decodifica UTF-8 corretamente).
  if (raw.startsWith('base64-')) {
    try {
      const bin = atob(raw.slice('base64-'.length));
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      return tryParse(new TextDecoder().decode(bytes));
    } catch {
      return null;
    }
  }
  return null;
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

  const clearBootstrapSafetyNet = useCallback(() => {
    if (bootstrapTimeoutRef.current !== null) {
      clearTimeout(bootstrapTimeoutRef.current);
      bootstrapTimeoutRef.current = null;
    }
  }, []);

  const runBootstrap = useCallback(async () => {
    const runId = ++bootstrapRunRef.current;
    setLoading(true);
    setBootstrapError(null);

    // ── 1) Hidratação otimista a partir da sessão persistida (SEM rede) ──────
    // Se há sessão gravada, renderizamos imediatamente com a identidade em
    // cache. NÃO bloqueamos o first paint numa chamada de rede. O
    // onAuthStateChange reconcilia depois (TOKEN_REFRESHED / SIGNED_OUT).
    const cached = readPersistedSession();
    if (cached?.user) {
      if (runId !== bootstrapRunRef.current) return;
      setSession(cached);
      setUser(cached.user);
      // profile/roles em background — guards internos evitam corrida com o
      // refetch que o onAuthStateChange dispara em seguida.
      void refreshAll(cached.user.id, { showLoading: false });
      setLoading(false);
      // Já temos sessão utilizável → o safety-net não deve marcar timeout.
      clearBootstrapSafetyNet();
    } else {
      // Sem sessão persistida → não há o que recuperar: pula getSession() e vai
      // direto para a tela de login. (Fast-fall: evita HTTP desnecessário.)
      // Object.keys(localStorage) já é tolerado por readPersistedSession (que
      // trata SecurityError em modo privado retornando null).
      log.info('[Auth] Sem sessão local — indo para login.');
      setLoading(false);
      setBootstrapElapsedMs(0);
      clearBootstrapSafetyNet();
      return;
    }

    // ── 2) Revalidação em BACKGROUND — não bloqueia o app já renderizado ─────
    // getSession() dispara o refresh single-flight sob o navigator.locks do
    // supabase-js. Se travar (lock contido / edge lento), o withTimeout rejeita,
    // mas como já hidratámos do cache isto NÃO é fatal: o onAuthStateChange é a
    // fonte de verdade e promove ou rebaixa a sessão no próximo tick. Nunca mais
    // transformamos uma revalidação lenta numa tela de erro para quem tem sessão.
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    try {
      const result = await withTimeout(supabase.auth.getSession(), 8000, 'getSession');
      if (runId !== bootstrapRunRef.current) return;
      const elapsedMs = Math.round(
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt
      );
      setBootstrapElapsedMs(elapsedMs);
      log.info(
        `[Auth] getSession OK em ${elapsedMs}ms — session=${result.data.session ? 'present' : 'null'}`
      );
      // Se o backend confirmar que NÃO há sessão (refresh token revogado/expirado),
      // o supabase-js emite SIGNED_OUT via onAuthStateChange e o app vai para /auth.
    } catch (err) {
      if (runId !== bootstrapRunRef.current) return;
      const elapsedMs = Math.round(
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt
      );
      setBootstrapElapsedMs(elapsedMs);
      // Não-fatal: já renderizámos a partir do cache. Apenas registamos.
      log.warn(
        `[Auth] Revalidação em background lenta (${elapsedMs}ms) — mantendo sessão do cache. URL=${SUPABASE_RESOLVED_URL}`,
        err
      );
    }
  }, [refreshAll, clearBootstrapSafetyNet]);

  const retryBootstrap = useCallback(async () => {
    // Reseta o safety-net timeout para o retry — sem isso, se getSession
    // travar durante uma retentativa, loading=true fica preso para sempre
    // (bootstrapTimeoutRef foi zerado quando o primeiro erro foi setado).
    if (bootstrapTimeoutRef.current !== null) {
      clearTimeout(bootstrapTimeoutRef.current);
    }
    bootstrapTimeoutRef.current = setTimeout(() => {
      log.error('[Auth] Bootstrap safety-net (10s) no retry — forçando loading=false.');
      setBootstrapError((prev) => prev ?? 'timeout');
      setLoading(false);
      bootstrapTimeoutRef.current = null;
    }, 10000);
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
        // INITIAL_SESSION apenas confirma a sessão que já hidratámos do cache no
        // boot → também silencioso, senão pisca o spinner logo após o first paint.
        // SIGNED_IN, USER_UPDATED etc. implicam mudança de identidade → loading.
        const showLoading = event !== 'TOKEN_REFRESHED' && event !== 'INITIAL_SESSION';
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
