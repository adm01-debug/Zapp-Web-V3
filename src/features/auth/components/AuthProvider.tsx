import { useState, useEffect, useCallback, useRef, useMemo, ReactNode } from 'react';
import { User, Session, type AuthError } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { authService, Profile, invalidateUserCache } from '../services/authService';
import { log } from '@/lib/logger';
import { AuthContext } from '../context/AuthContext';
import {
  supabase,
  SUPABASE_RESOLVED_URL,
  getSupabaseSemaphoreState,
} from '@/integrations/supabase/client';
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
// Timeout ADAPTATIVO do getProfile.
//
// O getProfile NÃO é marcado como auth request (/auth/v1/), então passa pelo
// semáforo de concorrência do retryFetch (4 slots) e pode esperar 10-20s na
// fila quando a inbox satura com 48+ RPCs. Um timeout fixo de 8s matava o
// perfil exatamente nesse cenário (log: "Timeout (8000ms) em getProfile").
//
// Estratégia: base 15s + 250ms por request enfileirado no semáforo (cap 30s).
// Quando o semáforo está ocioso, o timeout volta ao piso de 15s — o perfil
// nunca mais morre por fila, mas também não pendura para sempre.
// ---------------------------------------------------------------------------
const PROFILE_BASE_TIMEOUT_MS = 15_000;
const PROFILE_TIMEOUT_MAX_MS = 30_000;
const PROFILE_EXTRA_MS_PER_QUEUED_REQUEST = 250;
const PROFILE_SLOW_WARN_THRESHOLD_MS = 5_000;

// ---------------------------------------------------------------------------
// Prazo da revalidação de sessão no boot (padrão da casa — f12-errors-checklist:
// 8000ms → 4000ms). Quando o access_token persistido JÁ expirou, este prazo vira
// o VEREDITO do bootstrap: se o GoTrue não responder a tempo, decidimos como
// não-autenticado (a sessão otimista é um fantasma que só geraria 401s) em vez
// de esperar o SIGNED_OUT, que num backend degradado pode levar 7s+.
// ---------------------------------------------------------------------------
const GET_SESSION_TIMEOUT_MS = 4_000;

/** true quando o access_token persistido já expirou (sessão otimista inutilizável). */
function isAccessTokenExpired(session: Session): boolean {
  const exp = session.expires_at;
  return typeof exp !== 'number' || !isFinite(exp) || exp <= 0 || exp * 1000 <= Date.now();
}

function getProfileTimeoutMs(): number {
  const sem = getSupabaseSemaphoreState();
  if (!sem.saturated) return PROFILE_BASE_TIMEOUT_MS;
  const extra = sem.queueLength * PROFILE_EXTRA_MS_PER_QUEUED_REQUEST;
  return Math.min(PROFILE_BASE_TIMEOUT_MS + extra, PROFILE_TIMEOUT_MAX_MS);
}

// ---------------------------------------------------------------------------
// Caches TTL + single-flight para profile/roles do usuário logado.
//
// O refreshAll() é disparado por CADA evento de auth (INITIAL_SESSION,
// TOKEN_REFRESHED, SIGNED_IN, USER_UPDATED...) e o fetch de
// profiles?select=*&user_id=... + user_roles?select=role&user_id=... +
// role_permissions repetia a cada disparo (tempestade vista em produção).
// Com TTL de 5min (staleTime equivalente p/ dados quase-estáticos) e
// single-flight por userId, eventos em rajada e remounts servem do cache.
//
// force=true SÓ nos caminhos que exigem frescor imediato:
//   - realtime postgres_changes (UPDATE na linha → dados mudaram);
//   - refreshProfile/refreshRoles/refreshPermissions manuais
//     (AvatarUpload pós-upload, mutações de permissão no admin).
// Erros NÃO entram no cache — apenas são deduplicados em voo.
// ---------------------------------------------------------------------------
const AUTH_DATA_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

interface ProfileCacheEntry {
  userId: string;
  data: Profile;
  fetchedAt: number;
}

interface RolesCacheEntry {
  userId: string;
  roles: string[];
  permissions: string[];
  fetchedAt: number;
}

/** Resultado do fetch compartilhado — 'aborted' permite o joiner re-tentar. */
type FetchOutcome = 'ok' | 'aborted' | 'failed';

let profileCache: ProfileCacheEntry | null = null;
let rolesCache: RolesCacheEntry | null = null;
const profileInflight = new Map<string, Promise<FetchOutcome>>();
const rolesInflight = new Map<string, Promise<FetchOutcome>>();

/** Limpa os caches TTL de profile/roles (signOut/SIGNED_OUT). */
function clearAuthDataCaches(): void {
  profileCache = null;
  rolesCache = null;
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
      .sort((a, b) => Number(a.slice(baseKey.length + 1)) - Number(b.slice(baseKey.length + 1)));
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
        (Session & { currentSession?: Session }) | { currentSession?: Session };
      const session = (
        'access_token' in parsed && parsed.access_token
          ? parsed
          : (parsed as { currentSession?: Session }).currentSession
      ) as Session | undefined;
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

  const fetchProfile = useCallback(
    async (userId: string, signal?: AbortSignal, force = false) => {
      // Cache TTL (5min): eventos de auth em rajada e remounts não repetem o
      // GET profiles?select=*&user_id=... — dados quase-estáticos.
      if (
        !force &&
        profileCache &&
        profileCache.userId === userId &&
        Date.now() - profileCache.fetchedAt < AUTH_DATA_CACHE_TTL_MS
      ) {
        setProfile(profileCache.data);
        return;
      }
      // Single-flight: joiner aguarda a MESMA promise do iniciador. Se o
      // iniciador foi abortado (refreshAll mais novo), o joiner re-tenta com
      // o próprio signal — nunca fica sem o fetch. Em force=true (ex.: UPDATE
      // via realtime) NÃO deduplicar: o fetch em voo pode ter começado ANTES
      // da mudança e retornaria dado velho (R3 regression review da onda).
      const existing = profileInflight.get(userId);
      if (existing && !force) {
        const outcome = await existing;
        if (outcome !== 'aborted') return;
      }

      const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const timeoutMs = getProfileTimeoutMs();
      const run = (async (): Promise<FetchOutcome> => {
        try {
          const { data, error } = await withTimeout(
            authService.getProfile(userId, signal),
            timeoutMs,
            'getProfile'
          );
          const elapsedMs = Math.round(
            (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt
          );
          // Perfil lento (>5s) é sintoma de semáforo saturado ou backend degradado —
          // warn (não error) para debug futuro sem poluir o console de erro.
          if (elapsedMs > PROFILE_SLOW_WARN_THRESHOLD_MS) {
            log.warn(
              `[Auth] getProfile lento (${elapsedMs}ms; timeout=${timeoutMs}ms; semáforo=${JSON.stringify(
                getSupabaseSemaphoreState()
              )})`
            );
          }
          if (error || !data) {
            if ((error as { name?: string } | null)?.name === 'AbortError') return 'aborted';
            log.error('[Auth] Failed to fetch profile for user:', userId, error);
            return 'failed';
          }
          profileCache = { userId, data, fetchedAt: Date.now() };
          setProfile(data);
          return 'ok';
        } catch (err: unknown) {
          if ((err as Error)?.name === 'AbortError') return 'aborted';
          log.error('[Auth] Failed to fetch profile for user:', userId, err);
          return 'failed';
        }
      })();
      profileInflight.set(userId, run);
      try {
        await run;
      } finally {
        if (profileInflight.get(userId) === run) profileInflight.delete(userId);
      }
    },
    []
  );

  const fetchRolesAndPermissions = useCallback(
    async (userId: string, signal?: AbortSignal, force = false) => {
      // Cache TTL (5min): user_roles?select=role&user_id=... +
      // role_permissions não repetem a cada evento de auth / remount.
      if (
        !force &&
        rolesCache &&
        rolesCache.userId === userId &&
        Date.now() - rolesCache.fetchedAt < AUTH_DATA_CACHE_TTL_MS
      ) {
        setRoles(rolesCache.roles);
        setPermissions(rolesCache.permissions);
        return;
      }
      const existing = rolesInflight.get(userId);
      // Mesmo padrão do profile: force=true (realtime/manual) não deduplica
      // no in-flight — R3 regression review da onda.
      if (existing && !force) {
        const outcome = await existing;
        if (outcome !== 'aborted') return;
      }

      const run = (async (): Promise<FetchOutcome> => {
        try {
          if (!supabase) {
            log.error('[Auth] Supabase client not initialized for user:', userId);
            return 'failed';
          }
          const { data: userRoles, error } = await withTimeout(
            Promise.resolve(
              supabase
                .from('user_roles')
                .select('role')
                .eq('user_id', userId)
                .abortSignal(signal ?? new AbortController().signal)
            ),
            8000,
            'fetchRoles'
          );
          if (error || !userRoles) {
            if ((error as { name?: string } | null)?.name === 'AbortError') return 'aborted';
            log.error('[Auth] Failed to fetch roles for user:', userId, error);
            return 'failed';
          }
          const roleNames = userRoles.map((r) => r.role);

          // Guard empty-in (R14 regression review): usuário sem roles não tem
          // permissões — pular a query role_permissions (evita `role=in.()`).
          if (roleNames.length === 0) {
            rolesCache = { userId, roles: [], permissions: [], fetchedAt: Date.now() };
            setRoles([]);
            setPermissions([]);
            return 'ok';
          }

          const { data: userPermissions, error: permError } = await withTimeout(
            Promise.resolve(
              supabase
                .from('role_permissions')
                // FIX #1: Schema correto — role_permissions tem (role, permission_id), não 'permission'
                // JOIN com permissions table para resolver nomes das permissões
                .select('permission_id, permissions!inner(name)')
                .in('role', roleNames)
                .abortSignal(signal ?? new AbortController().signal)
            ),
            8000,
            'fetchPermissions'
          );
          if (permError || !userPermissions) {
            if ((permError as { name?: string } | null)?.name === 'AbortError') return 'aborted';
            log.error('[Auth] Failed to fetch permissions for user:', userId, permError);
            return 'failed';
          }
          const permNames = userPermissions
            .map((p) => {
              // p.permissions pode ser array (PostgREST join) ou objeto
              const perm = Array.isArray(p.permissions) ? p.permissions[0] : p.permissions;
              return (perm as { name?: string } | null)?.name;
            })
            .filter((n): n is string => typeof n === 'string');
          rolesCache = { userId, roles: roleNames, permissions: permNames, fetchedAt: Date.now() };
          setRoles(roleNames);
          setPermissions(permNames);
          return 'ok';
        } catch (err: unknown) {
          if ((err as Error)?.name === 'AbortError') return 'aborted';
          log.error('[Auth] Failed to fetch roles/permissions for user:', userId, err);
          return 'failed';
        }
      })();
      rolesInflight.set(userId, run);
      try {
        await run;
      } finally {
        if (rolesInflight.get(userId) === run) rolesInflight.delete(userId);
      }
    },
    []
  );

  const refreshAll = useCallback(
    async (userId: string, options: { showLoading?: boolean } = {}) => {
      const { showLoading = true } = options;
      // Cancela qualquer refresh anterior ainda em voo (ex.: signIn dispara
      // refreshAll e o onAuthStateChange dispara outro logo em seguida — sem
      // abort, o mais antigo podia sobrescrever estado com dados stale e
      // manter loading travado).
      refreshAbortRef.current?.abort();
      const controller = new AbortController();
      refreshAbortRef.current = controller;
      const { signal } = controller;
      if (showLoading) setLoading(true);
      try {
        await Promise.all([fetchProfile(userId, signal), fetchRolesAndPermissions(userId, signal)]);
      } finally {
        // Só o refresh mais recente libera o loading: se um refresh antigo
        // foi abortado por um novo, quem gerencia o estado é o novo.
        if (refreshAbortRef.current === controller) {
          refreshAbortRef.current = null;
          setLoading(false);
        }
      }
    },
    [fetchProfile, fetchRolesAndPermissions]
  );

  const bootstrapRunRef = useRef(0);
  // AbortController do refreshAll: aborta fetches em voo quando um novo
  // refresh começa ou o provider desmonta (evita corrida de estado, requisições
  // órfãs e loading travado).
  const refreshAbortRef = useRef<AbortController | null>(null);
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

  // Decide o estado não-autenticado de forma DETERMINÍSTICA, sem depender da
  // latência do evento SIGNED_OUT do supabase-js (que num GoTrue degradado pode
  // levar 7s+ para rejeitar um refresh de token morto). Limpa o estado e a
  // sessão persistida — o ProtectedRoute então redireciona para /auth no
  // próximo render. O signOut({ scope: 'local' }) também dispara o commit
  // guard do supabase-js, que descarta tokens rotacionados depois do prazo
  // (evita re-hidratação tardia via TOKEN_REFRESHED atrasado).
  const forceUnauthenticated = useCallback(
    async (runId: number, reason: string, elapsedMs: number) => {
      if (runId !== bootstrapRunRef.current) return;
      log.warn(`[Auth] Estado não-autenticado forçado (${reason}, ${elapsedMs}ms).`);
      setBootstrapElapsedMs(elapsedMs);
      setProfile(null);
      setRoles([]);
      setPermissions([]);
      setUser(null);
      setSession(null);
      setLoading(false);
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch {
        // signOut local não deve rejeitar; o estado já foi limpo acima.
      }
    },
    []
  );

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
      setLoading(false);
      // Já temos sessão utilizável → o safety-net não deve marcar timeout.
      clearBootstrapSafetyNet();
    } else {
      // ── Offline sem cache: sinaliza para o ProtectedRoute exibir UI de offline ──
      // Sem sessão persistida E sem rede → não há o que fazer além de avisar o utilizador.
      // Quando a rede voltar, o listener 'online' no useEffect dispara retryBootstrap()
      // automaticamente. Com rede: fast-fall para /auth como antes.
      //
      // guard de try/catch: navigator.onLine pode lançar em ambientes restritos
      // (ex.: extensões de browser, workers com políticas estritas).
      const isOffline = (() => {
        try {
          return typeof navigator !== 'undefined' && !navigator.onLine;
        } catch {
          return false;
        }
      })();
      if (isOffline) {
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
    //
    // CASO ESPECIAL — access_token persistido JÁ expirado: a sessão otimista é
    // um fantasma (toda chamada à API retornaria 401). Aqui o getSession() vira
    // o VEREDITO do bootstrap com prazo de GET_SESSION_TIMEOUT_MS (4000ms,
    // padrão da casa): se o GoTrue não responder a tempo — ou responder que não
    // há sessão — decidimos como não-autenticado imediatamente (forceUnauthenticated)
    // em vez de esperar o SIGNED_OUT, que num backend degradado pode levar 7s+
    // (evidência: authz_failure at:7074ms).
    const cachedTokenExpired = isAccessTokenExpired(cached);
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    try {
      const result = await withTimeout(supabase.auth.getSession(), GET_SESSION_TIMEOUT_MS, 'getSession');
      if (runId !== bootstrapRunRef.current) return;
      const elapsedMs = Math.round(
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt
      );
      setBootstrapElapsedMs(elapsedMs);
      log.info(
        `[Auth] getSession OK em ${elapsedMs}ms — session=${result.data.session ? 'present' : 'null'}`
      );
      // Sessão validada: busca profile/roles (adiado da hidratação).
      if (result.data.session && cached?.user?.id) {
        void refreshAll(cached.user.id, { showLoading: false }).catch((err) => {
          log.debug('[Auth] Erro ao atualizar perfil/roles pós-getSession:', err);
        });
      } else if (cached?.user) {
        // Veredito do backend: NÃO há sessão válida (refresh token morto/revogado).
        // O supabase-js normalmente emite SIGNED_OUT, mas num GoTrue degradado
        // essa resposta pode levar 7s+ — decidimos agora, sem esperar o evento.
        await forceUnauthenticated(runId, 'getSession-null', elapsedMs);
      }
    } catch (err) {
      if (runId !== bootstrapRunRef.current) return;
      const elapsedMs = Math.round(
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt
      );
      setBootstrapElapsedMs(elapsedMs);
      // AbortError é esperado (StrictMode remount, navegação, timeout).
      // O app continua com a sessão do cache. Não poluir o console.
      if ((err as Error)?.name === 'AbortError') {
        log.debug('[Auth] getSession abortado — sessão do cache mantida.');
        return;
      }
      if (cachedTokenExpired) {
        // Prazo (4000ms) estourado com access_token já expirado: a sessão
        // otimista é um fantasma e o veredito do GoTrue pode nunca chegar
        // (backend degradado). Decide como não-autenticado agora, em vez de
        // segurar o usuário por 7s+ esperando um SIGNED_OUT que não vem.
        await forceUnauthenticated(runId, 'getSession-timeout-expired-token', elapsedMs);
        return;
      }
      // Não-fatal: já renderizámos a partir do cache. Apenas registamos.
      log.warn(
        `[Auth] Revalidação em background lenta (${elapsedMs}ms) — mantendo sessão do cache. URL=${SUPABASE_RESOLVED_URL}`,
        err
      );
    }
  }, [refreshAll, clearBootstrapSafetyNet, forceUnauthenticated]);

  // Ref (para guards síncronos) + state (para reativos na UI) de retry em andamento.
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

      // Invalidação do single-flight/cache do getUser: identidade pode ter
      // mudado (SIGNED_IN), sumido (SIGNED_OUT) ou sido atualizada
      // (TOKEN_REFRESHED renova claims/metadata). Profile/roles usam TTL de
      // 5min + key por userId — só precisam de clear explícito no SIGNED_OUT.
      if (event === 'SIGNED_OUT') {
        invalidateUserCache();
        clearAuthDataCaches();
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        invalidateUserCache();
      }

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
      // Cancela refresh em voo no unmount (ex.: logout rápido durante bootstrap).
      refreshAbortRef.current?.abort();
      refreshAbortRef.current = null;
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

    // zapp.profiles / zapp.user_roles são as tabelas físicas.
    // public.profiles / public.user_roles são VIEW proxies → nunca emitem CDC.
    // Topic único por mount (sufixo random) — evita reutilizar instância de
    // canal já inscrita cujo teardown (removeChannel assíncrono) não terminou.
    const profileChannel = supabase
      .channel(`profile-updates-${user.id}:${Math.random().toString(36).slice(2, 10)}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'zapp',
          table: 'profiles',
          // profiles.id is a surrogate UUID; auth.uid() lives in profiles.user_id
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          // UPDATE real na linha → força fetch fresco (ignora cache TTL).
          void fetchProfile(user.id, undefined, true);
        }
      )
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') {
          log.warn('[AuthProvider] profile channel subscription status:', status);
        }
      });

    const rolesChannel = supabase
      .channel(`roles-updates-${user.id}:${Math.random().toString(36).slice(2, 10)}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'zapp',
          table: 'user_roles',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          // UPDATE real na linha → força fetch fresco (ignora cache TTL).
          void fetchRolesAndPermissions(user.id, undefined, true);
        }
      )
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') {
          log.warn('[AuthProvider] roles channel subscription status:', status);
        }
      });

    return () => {
      profileChannel.unsubscribe();
      supabase.removeChannel(profileChannel);
      rolesChannel.unsubscribe();
      supabase.removeChannel(rolesChannel);
    };
  }, [user, fetchProfile, fetchRolesAndPermissions]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      try {
        // Identidade nova → descarta o cache curto do getUser.
        invalidateUserCache();
        const { data, error } = await authService.signIn(email, password);
        if (error) return { error };
        if (data?.user) {
          await refreshAll(data.user.id);
        }
        return { error: null };
      } catch (e) {
        log.error('[Auth] Sign in error:', e);
        return { error: e as AuthError };
      }
    },
    [refreshAll]
  );

  const signUp = useCallback(
    async (email: string, password: string, name: string) => {
      try {
        // Identidade nova → descarta o cache curto do getUser.
        invalidateUserCache();
        const { data, error } = await authService.signUp(email, password, name);
        if (error) return { error };
        if (data?.user) {
          await refreshAll(data.user.id);
        }
        return { error: null };
      } catch (e) {
        log.error('[Auth] Sign up error:', e);
        return { error: e as AuthError };
      }
    },
    [refreshAll]
  );

  const signOut = useCallback(async () => {
    try {
      await authService.signOut();
    } catch (e) {
      log.error('[Auth] Sign out error:', e);
    } finally {
      // Fallback local: mesmo se o signOut remoto falhar/rejeitar, a UI nunca
      // fica presa numa sessão fantasma — estado e cache são limpos sempre.
      // Caches TTL (getUser/profile/roles) também são descartados para a
      // próxima sessão nunca herdar dados da anterior.
      invalidateUserCache();
      clearAuthDataCaches();
      setUser(null);
      setSession(null);
      setProfile(null);
      setRoles([]);
      setPermissions([]);
      setLoading(false);
      queryClient.clear();
    }
  }, [queryClient]);

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    // Manual (ex.: AvatarUpload pós-upload) → força frescor, ignora TTL.
    await fetchProfile(user.id, undefined, true);
  }, [user, fetchProfile]);

  const refreshRoles = useCallback(async () => {
    if (!user) return;
    // Manual (ex.: mutações de permissão no admin) → força frescor.
    await fetchRolesAndPermissions(user.id, undefined, true);
  }, [user, fetchRolesAndPermissions]);

  const refreshPermissions = useCallback(async () => {
    if (!user) return;
    await fetchRolesAndPermissions(user.id, undefined, true);
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
      signIn,
      signUp,
      signOut,
      refreshProfile,
      refreshRoles,
      refreshPermissions,
    ]
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}
