/**
 * External Session Bridge — FATOR X (Dual-session hardening)
 *
 * Pós-consolidação (2026-07-15): `externalSupabase === supabase` — o app usa
 * apenas um Supabase (self-hosted AtomicaBR, schema `zapp`). Este bridge é
 * mantido para compatibilidade mas foi endurecido:
 *
 *  - `mirrorExternalSignIn`: early-return se sessão ativa detectada, evitando
 *    double signIn que invalida o token corrente no GoTrue single-DB.
 *  - Login social / magic link: warning one-shot (sem credenciais em memória).
 *  - Logout: propagado.
 *  - Falhas NUNCA bloqueiam o fluxo principal (catch silencioso + log).
 *
 * FIX 2026-07-16 (a): return type `void` → `() => void` para permitir capturar
 *   e invocar a função de cleanup da subscription onAuthStateChange.
 *
 * FIX 2026-07-16 (b): `socialWarningEmitted` agora é resetado no cleanup.
 *   Antes o estado module-level não era limpo, causando supressão permanente
 *   do warning OAuth em cenários de re-registro (principalmente em testes).
 */
import type { AuthError } from '@supabase/supabase-js';
import { supabase } from './client';
import { externalSupabase, isExternalConfigured } from './externalClient';
import { createLogger } from '@/lib/logger';

const log = createLogger('externalSessionBridge');

const AUTO_PROVISION_ENABLED =
  import.meta.env.VITE_EXTERNAL_SESSION_BRIDGE_AUTO_PROVISION === 'true';

let bridgeInstalled = false;
let socialWarningEmitted = false;

function isUserNotFound(err: AuthError | null): boolean {
  if (!err) return false;
  const msg = err.message?.toLowerCase() ?? '';
  return (
    msg.includes('invalid login credentials') ||
    msg.includes('user not found') ||
    (!msg.includes('email not confirmed') && msg.includes('not found'))
  );
}

/**
 * Faz login no external com as mesmas credenciais do principal.
 *
 * ✅ Guard pós-consolidação single-DB:
 * externalSupabase === supabase. Um 2º signInWithPassword no mesmo GoTrue
 * cria uma nova sessão e invalida o token corrente. O early-return abaixo
 * previne esse double-login quando o usuário já está autenticado.
 */
export async function mirrorExternalSignIn(email: string, password: string): Promise<void> {
  if (!isExternalConfigured) return;
  // Guard pós-consolidação: enquanto externalSupabase === supabase (mesmo client,
  // mesmo GoTrue), um 2º signInWithPassword rotaciona/invalida o token corrente
  // e um getSession extra apenas adiciona contenção. Não há dual-session real a
  // manter, então isto é um no-op. Se um client external separado for
  // reintroduzido (externalSupabase !== supabase), o mirror reativa sozinho.
  if ((externalSupabase as unknown) === (supabase as unknown)) return;
  try {
    const { data: existing } = await externalSupabase.auth.getSession();
    if (existing.session?.user?.email === email) {
      log.debug('mirrorExternalSignIn: sessão já ativa — skip', { email });
      return;
    }

    const { error } = await externalSupabase.auth.signInWithPassword({ email, password });
    if (!error) {
      log.debug('external mirror sign-in ok', { email });
      return;
    }

    if (isUserNotFound(error)) {
      if (!AUTO_PROVISION_ENABLED) {
        log.warn(
          'external user ausente e auto-provisionamento desabilitado ' +
          '(habilite VITE_EXTERNAL_SESSION_BRIDGE_AUTO_PROVISION=true)',
          { email },
        );
        return;
      }

      log.info('external user ausente — provisionando via signUp', { email });
      const { error: signUpErr } = await externalSupabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/` },
      });
      if (signUpErr) {
        log.warn('external auto-signup falhou', { message: signUpErr.message });
        return;
      }
      const { error: retryErr } = await externalSupabase.auth.signInWithPassword({ email, password });
      if (retryErr) {
        log.warn('external sign-in após provisionamento falhou', { message: retryErr.message });
      } else {
        log.info('external provisionado e autenticado', { email });
      }
      return;
    }

    log.warn('external mirror sign-in falhou', { message: error.message });
  } catch (e) {
    log.warn('external mirror sign-in exception', { err: (e as Error).message });
  }
}

/** Logout no external — silencioso em erro. */
export async function mirrorExternalSignOut(): Promise<void> {
  if (!isExternalConfigured) return;
  // No-op enquanto external === main: o signOut do client principal já encerra
  // a única sessão existente. Um signOut extra aqui é redundante.
  if ((externalSupabase as unknown) === (supabase as unknown)) return;
  try {
    await externalSupabase.auth.signOut();
  } catch (e) {
    log.warn('external sign-out exception', { err: (e as Error).message });
  }
}

/**
 * Instala listener global no client principal. Idempotente.
 * Deve ser chamado 1x no boot (main.tsx).
 *
 * Retorna função de cleanup capturável:
 *   const cleanup = registerExternalSessionBridge();
 *   cleanup(); // desinstala subscription (útil em SSR/testes)
 */
export function registerExternalSessionBridge(): () => void {
  if (bridgeInstalled) return () => {};
  bridgeInstalled = true;

  if (!isExternalConfigured) {
    log.debug('external não configurado — bridge no-op');
    return () => {};
  }

  // ── Guard pós-consolidação (fix bootstrap-hang) ──────────────────────────
  // Enquanto externalSupabase === supabase (shim single-DB), NÃO há dual-session
  // a hidratar. A hidratação inicial fazia Promise.all([getSession, getSession])
  // — duas chamadas IDÊNTICAS ao mesmo client no exato momento do boot — e o
  // handler onAuthStateChange abaixo faz chamadas async de auth inline, um
  // anti-pattern documentado que serializa/atrasa a próxima chamada de auth do
  // client. Ambos contribuíam para a contenção no bootstrap de Auth. Como o
  // bridge é inteiramente redundante neste modo, instala-se como no-op. Se um
  // client external separado voltar (externalSupabase !== supabase), o bridge
  // completo reativa automaticamente.
  if (externalSupabase === supabase) {
    log.debug('external === main (single-DB) — bridge instalado como no-op');
    return () => {
      bridgeInstalled = false;
    };
  }

  void (async () => {
    try {
      const [{ data: mainSess }, { data: extSess }] = await Promise.all([
        supabase.auth.getSession(),
        externalSupabase.auth.getSession(),
      ]);
      if (mainSess.session && !extSess.session) {
        log.warn(
          'sessão principal ativa sem sessão external — usuário precisa refazer login para hidratar dual-session',
        );
      }
    } catch (e) {
      log.debug('hidratação inicial falhou', { err: (e as Error).message });
    }
  })();

  const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
    try {
      if (event === 'SIGNED_OUT') {
        await mirrorExternalSignOut();
        socialWarningEmitted = false;
        return;
      }

      if (event === 'SIGNED_IN' && session) {
        const { data } = await externalSupabase.auth.getSession();
        if (data.session?.user?.email === session.user.email) return;

        if (!socialWarningEmitted) {
          socialWarningEmitted = true;
          log.warn(
            'SIGNED_IN sem credenciais (social/OAuth) — dual-session external indisponível para este usuário até login por senha',
            { provider: session.user.app_metadata?.provider },
          );
        }
      }
    } catch (e) {
      log.debug('onAuthStateChange handler exception', { err: (e as Error).message });
    }
  });

  log.info('external session bridge instalado');

  return () => {
    authSubscription.unsubscribe();
    bridgeInstalled = false;
    socialWarningEmitted = false; // FIX(b): reset para permitir warning correto em re-registro
    log.debug('external session bridge desmontado');
  };
}
