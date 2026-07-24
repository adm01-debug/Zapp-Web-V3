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
// (`...-auth-token.0/.1`), ao shape legado v1 (`{ currentSession }`) e a sessões
// com expires_at malformado (null, string, NaN, Infinity, ≤0).
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
      if (!session?.user || !session?.refresh_token) return null;
      // Valida expires_at: deve ser número positivo finito (rejeita null, strings,
      // NaN, Infinity, 0, negativos — todos indicam sessão corrompida ou inválida).
      const exp = session.expires_at;
      if (typeof exp !== 'number' || !isFinite(exp) || exp <= 0) return null;
      return session;
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
  const queryClient = useQueryClient();

  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [bootstrapError, setBootstrapError] = useState<'timeout' | 'offline' | null>(null);
  const [bootstrapElapsedMs, setBootstrapElapsedMs] = useState<number | null>(null);

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await withTimeout(
        authService.getProfile(userId),
        8000,
        'getProfile'
      );
      if (error || !data) {
        log.error('[Auth] Failed to fetch profile for user:', userId, error);
        return;
      }
      setProfile(data);
    } catch (err: unknown) {
      log.error('[Auth] Failed to fetch profile for user:', userId, err);
    }
  }, []);

  const fetchRolesAndPermissions = useCallback(async (userId: string) => {
    try {
      if (!supabase) {
        log.error('[Auth] Supabase client not initialized for user:', userId);
        return;
      }
      const { data: userRoles, error } = await withTimeout(
        Promise.resolve(supabase.from('user_roles').select('role').eq('user_id', userId)),
        8000,
        'fetchRoles'
      );
      if (error || !userRoles) {
        log.error('[Auth] Failed to fetch roles for user:', userId, error);
        return;
      }
      const roleNames = userRoles.map((r) => r.role as string);
      setRoles(roleNames);

      const { data: userPermissions, error: permError } = await withTimeout(
        Promise.resolve(
          supabase
            .from('role_permissions')
            .select('permission_id, permissions(name)')
            .in('role', roleNames)
        ),
        8000,
        'fetchPermissions'
      );
      if (permError || !userPermissions) {
        log.error('[Auth] Failed to fetch permissions for user:', userId, permError);
        return;
      }
      const permNames = userPermissions
        .map((p) => {
          const perm = p.permissions as { name: string } | null;
          return perm?.name ?? null;
        })
        .filter((n): n is string => typeof n === 'string');
      setPermissions(permNames);
    } catch (err: unknown) {
      log.error('[Auth] Failed to fetch roles/permissions for user:', userId, err);
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
    async (userId: string, options: { showLoading?: boolean } = {}) => {
      const { showLoading = true } = options;
      if (showLoading) setLoading(true);
      await Promise.all([fetchProfile(userId), fetchRolesAndPermissions(userId)]);
      setLoading(false);
    },
    [fetchProfile, fetchRolesAndPermissions]
  );

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
      void refreshAll(cached.user.id, { showLoading: false }).catch((err) => {
        log.error('[Auth] Erro ao atualizar perfil/roles em background pós-hidratação:', err);
      });
      setLoading(false);
      // Já temos sessão utilizável → o safety-net não deve marcar timeout.
      clearBootstrapSafetyNet();
    } else {
      // ── Offline sem cache: sinaliza para o ProtectedRoute exibir UI de offline ──
      // Sem sessão persistida E sem rede → não há o que fazer além de avisar o utilizador.
      // Quando a rede voltar, o listener 'online' no useEffect dispara retryBootstrap()
      // automaticamente. Com rede: fast-fall para /auth como antes.
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        log.warn('[Auth] Dispositivo offline e sem sessão local — aguardando rede.');
        setLoading(false);
        setBootstrapError('offline');
        setBootstrapElapsedMs(0);
        clearBootstrapSafetyNet();
        return;
      }
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

  // Ref (para guards síncronos) + state (para reactivos na UI) de retry em andamento.
  const isRetryingRef = useRef(false);
  const [isRetrying, setIsRetrying] = useState(false);

  const retryBootstrap = useCallback(async () => {
    // Idempotência: ignora tap duplo enquanto já há um retry em andamento.
    if (isRetryingRef.current) {
      log.debug('[Auth] retryBootstrap: retry já em andamento — ignorando.');
      return;
    }
    isRetryingRef.current = true;
    setIsRetrying(true);
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
      isRetryingRef.current = false;
      setIsRetrying(false);
    }, 10000);
    try {
      await runBootstrap();
    } finally {
      isRetryingRef.current = false;
      setIsRetrying(false);
    }
  }, [runBootstrap]);

  useEffect(() => {
    let mounted = true;

    if (!verifyHttpOnlyCookieAuth()) {
      log.error('[Auth] Security check failed: httpOnly cookies not properly configured');
    }

    // Safety net final (10s): failsafe para caminhos imprevistos.
    //
    // NOTA DE DESIGN: Em execução normal, clearBootstrapSafetyNet() é chamado
    // SINCRONAMENTE dentro de runBootstrap() (antes do primeiro await) em AMBOS
    // os ramos (cache-hit e no-cache). Logo este timer é sempre cancelado antes
    // de disparar no boot inicial — permanece aqui como proteção contra regressões
    // futuras (ex.: se um caminho novo omitir clearBootstrapSafetyNet).
    //
    // Nos retries via retryBootstrap(), o timer é re-armado intencionalmente
    // para cobrir o getSession() que roda em foreground (pode travar).
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

    // ── Auto-reconnect: quando a rede volta após estado 'offline' ──────────────
    // O listener 'online' dispara retryBootstrap() automaticamente para que o
    // utilizador não precise recarregar a página manualmente.
    const handleOnline = () => {
      if (!mounted) return;
      log.info('[Auth] Rede restaurada — disparando retry de bootstrap.');
      void retryBootstrap();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
    }

    return () => {
      mounted = false;
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
      }
      if (bootstrapTimeoutRef.current !== null) {
        clearTimeout(bootstrapTimeoutRef.current);
        bootstrapTimeoutRef.current = null;
      }
      subscription.unsubscribe();
    };
  }, [refreshAll, runBootstrap, retryBootstrap]);


  useEffect(() => {
    if (!user) return;

    const profileChannel = supabase
      .channel(`profile-updates-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${user.id}`,
        },
        () => {
          void fetchProfile(user.id);
        }
      )
      .subscribe();

    const rolesChannel = supabase
      .channel(`roles-updates-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_roles',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void fetchRolesAndPermissions(user.id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(profileChannel);
      supabase.removeChannel(rolesChannel);
    };
  }, [user, fetchProfile, fetchRolesAndPermissions]);

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await authService.signIn(email, password);
      if (error) return { error };
      if (data?.user) {
        await refreshAll(data.user.id);
      }
      return { error: null };
    } catch (e) {
      log.error('[Auth] Sign in error:', e);
      return { error: e as any };
    }
  };

  const signUp = async (email: string, password: string, name: string) => {
    try {
      const { data, error } = await authService.signUp(email, password, name);
      if (error) return { error };
      if (data?.user) {
        await refreshAll(data.user.id);
      }
      return { error: null };
    } catch (e) {
      log.error('[Auth] Sign up error:', e);
      return { error: e as any };
    }
  };

  const signOut = async () => {
    try {
      await authService.signOut();
      setUser(null);
      setSession(null);
      setProfile(null);
      setRoles([]);
      setPermissions([]);
      setLoading(false);
      queryClient.clear();
    } catch (e) {
      log.error('[Auth] Sign out error:', e);
    }
  };

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    await fetchProfile(user.id);
  }, [user, fetchProfile]);

  const refreshRoles = useCallback(async () => {
    if (!user) return;
    await fetchRolesAndPermissions(user.id);
  }, [user, fetchRolesAndPermissions]);

  const refreshPermissions = useCallback(async () => {
    if (!user) return;
    await fetchRolesAndPermissions(user.id);
  }, [user, fetchRolesAndPermissions]);

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
      isRetrying,
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
      isRetrying,
      retryBootstrap,
      refreshProfile,
      refreshRoles,
      refreshPermissions,
    ]
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}
