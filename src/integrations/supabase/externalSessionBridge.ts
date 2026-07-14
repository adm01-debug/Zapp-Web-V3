/**
 * External Session Bridge — FATOR X (Dual-session hardening)
 *
 * Mantém a sessão do `externalSupabase` (self-hosted) espelhada com a sessão
 * do client principal (Lovable Cloud). Estratégia:
 *
 *  - Login email/senha: `mirrorExternalSignIn` é chamado pelo `authService`
 *    (a senha só existe nesse momento). Se o usuário não existe no external,
 *    faz auto-provisionamento via `signUp` e depois `signIn`.
 *  - Login social / magic link: `onAuthStateChange` capta `SIGNED_IN` sem
 *    credenciais — apenas registra warning (dual-session não é possível sem
 *    senha; leituras dependerão do fallback anon do external).
 *  - Logout: propagado nos dois lados.
 *  - Refresh: cada client mantém o próprio (`autoRefreshToken: true`).
 *  - Falhas do external NUNCA bloqueiam o principal (catch silencioso + log).
 */
import type { AuthError } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { supabase } from './client';
import { externalSupabase, isExternalConfigured } from './externalClient';
import { createLogger } from '@/lib/logger';

const log = createLogger('externalSessionBridge');

// Auto-provisioning creates an account on the external Supabase instance the
// first time a user logs in.  Disabled by default: requires explicit opt-in via
// VITE_EXTERNAL_SESSION_BRIDGE_AUTO_PROVISION=true in the deploy environment.
const AUTO_PROVISION_ENABLED =
  import.meta.env.VITE_EXTERNAL_SESSION_BRIDGE_AUTO_PROVISION === 'true';

let bridgeInstalled = false;
let socialWarningEmitted = false;

/**
 * Returns true when an AuthError strongly suggests the user does not exist
 * in the external GoTrue instance, making auto-signup a reasonable recovery.
 *
 * Parentheses on the third condition make operator precedence explicit:
 * (!msg.includes('email not confirmed') && msg.includes('not found'))
 * reads unambiguously as: "message contains 'not found' but is NOT a
 * 'confirmation pending' error".
 */
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
 * Se o usuário não existir no external, faz auto-provisionamento (signUp + signIn).
 * Silencioso em erro — não deve derrubar o fluxo principal.
 */
export async function mirrorExternalSignIn(email: string, password: string): Promise<void> {
  if (!isExternalConfigured) return;
  try {
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
        toast.warning('Sessão dual indisponível', {
          description: 'Usuário não encontrado no servidor externo. Contate o administrador.',
        });
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
        toast.error('Falha ao provisionar sessão externa', {
          description: signUpErr.message,
        });
        return;
      }
      const { error: retryErr } = await externalSupabase.auth.signInWithPassword({ email, password });
      if (retryErr) {
        log.warn('external sign-in após provisionamento falhou', { message: retryErr.message });
        toast.warning('Sessão externa indisponível', {
          description: retryErr.message,
        });
      } else {
        log.info('external provisionado e autenticado', { email });
      }
      return;
    }

    log.warn('external mirror sign-in falhou', { message: error.message });
    toast.warning('Sessão externa indisponível', {
      description: 'Falha ao sincronizar com o servidor externo. Funcionalidades offline podem ser afetadas.',
    });
  } catch (e) {
    log.warn('external mirror sign-in exception', { err: (e as Error).message });
  }
}

/** Logout no external — silencioso em erro. */
export async function mirrorExternalSignOut(): Promise<void> {
  if (!isExternalConfigured) return;
  try {
    await externalSupabase.auth.signOut();
  } catch (e) {
    log.warn('external sign-out exception', { err: (e as Error).message });
  }
}

/**
 * Instala listener global no client principal. Idempotente.
 * Deve ser chamado 1x no boot (main.tsx).
 */
export function registerExternalSessionBridge(): void {
  if (bridgeInstalled) return;
  bridgeInstalled = true;

  if (!isExternalConfigured) {
    log.debug('external não configurado — bridge no-op');
    return;
  }

  // Hidratação inicial: se principal está logado mas external não, avisa
  // (não temos senha em memória — só um novo signIn ou login social resolve).
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

  // ✅ Fix: guardar subscription para poder cancelar se necessário
  const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
    try {
      if (event === 'SIGNED_OUT') {
        await mirrorExternalSignOut();
        socialWarningEmitted = false;
        return;
      }

      if (event === 'SIGNED_IN' && session) {
        // Se o external já tem sessão válida, nada a fazer (foi feito via authService).
        const { data } = await externalSupabase.auth.getSession();
        if (data.session?.user?.email === session.user.email) return;

        // Sem senha em mãos (login social / magic link / recovery).
        if (!socialWarningEmitted) {
          socialWarningEmitted = true;
          log.warn(
            'SIGNED_IN sem credenciais (social/OAuth) — dual-session external indisponível para este usuário até login por senha',
            { provider: session.user.app_metadata?.provider },
          );
        }
      }

      // TOKEN_REFRESHED / USER_UPDATED: cada client gerencia o próprio refresh.
    } catch (e) {
      log.debug('onAuthStateChange handler exception', { err: (e as Error).message });
    }
  });

  log.info('external session bridge instalado');

  // ✅ Fix: retornar função de cleanup para evitar memory leak em re-mount
  return () => {
    authSubscription.unsubscribe();
    log.debug('external session bridge desmontado');
  };
}
