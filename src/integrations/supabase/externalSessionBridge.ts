/**
 * External Session Bridge — Self-Hosted (Dual-session hardening)
 *
 * Pós-consolidação (2026-07-15): `externalSupabase === supabase` — o app usa
 * apenas um Supabase (self-hosted AtomicaBR, schema `zapp`). O shim
 * externalClient foi eliminado destes imports; o bridge é mantido como no-op
 * para compatibilidade de API (main.tsx chama registerExternalSessionBridge):
 *
 *  - `mirrorExternalSignIn` / `mirrorExternalSignOut`: no-ops permanentes — um
 *    2º signInWithPassword no mesmo GoTrue invalidaria o token corrente.
 *  - `registerExternalSessionBridge`: instala listener no-op, idempotente,
 *    retornando cleanup capturável.
 *  - Falhas NUNCA bloqueiam o fluxo principal (catch silencioso + log).
 *
 * FIX 2026-07-16 (a): return type `void` → `() => void` para permitir capturar
 *   e invocar a função de cleanup da subscription onAuthStateChange.
 */
import { createLogger } from '@/lib/logger';

const log = createLogger('externalSessionBridge');

let bridgeInstalled = false;

/**
 * Faz login no external com as mesmas credenciais do principal.
 *
 * ✅ Pós-consolidação single-DB: `externalSupabase === supabase` (o shim
 * externalClient era um alias do cliente principal). Um 2º signInWithPassword
 * no mesmo GoTrue criaria uma nova sessão e invalidaria o token corrente —
 * por isso este mirror é um no-op permanente. Se um client external separado
 * for reintroduzido, reimplementar aqui.
 */
export async function mirrorExternalSignIn(email: string, password: string): Promise<void> {
  void email;
  void password;
}

/** Logout no external — no-op: o signOut do client principal encerra a única sessão. */
export async function mirrorExternalSignOut(): Promise<void> {
  // No-op pós-consolidação: external === main (single-DB). Um signOut extra
  // aqui seria redundante.
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

  // ── Pós-consolidação (fix bootstrap-hang) ──────────────────────────────────
  // externalSupabase === supabase (shim single-DB): NÃO há dual-session a
  // hidratar, e o bridge completo era redundante (chamadas de auth duplicadas
  // no boot + handler onAuthStateChange com chamadas async inline). Instala-se
  // como no-op permanente.
  log.debug('external === main (single-DB) — bridge instalado como no-op');

  return () => {
    bridgeInstalled = false;
  };
}
