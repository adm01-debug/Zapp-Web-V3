/**
 * Supabase Session Storage Adapter
 *
 * IMPORTANTE: O Supabase JS SDK precisa de acesso JavaScript aos tokens de
 * sessão para injetá-los no header Authorization de cada requisição. Por isso,
 * httpOnly cookies NÃO funcionam nesta arquitetura SPA — o browser não expõe
 * httpOnly cookies para JavaScript, tornando impossível que o SDK os leia.
 *
 * A camada de proteção XSS é fornecida por:
 *  - Content-Security-Policy (CSP) rigorosa
 *  - Sanitização de `dangerouslySetInnerHTML` e inputs externos
 *  - JWTs de curta duração + rotação automática de refresh tokens
 *
 * Este adapter usa `localStorage` (padrão Supabase) com fallback in-memory
 * para SSR/ambientes sem window.
 *
 * HISTÓRICO — BUG RAIZ (fix 2026-07-16):
 * A implementação anterior descartava silenciosamente qualquer setItem/getItem
 * cuja chave contivesse 'auth' ou 'token' — exatamente as chaves que o SDK usa
 * (sb-*-auth-token). Isso causava perda total da sessão após login e todos os
 * requests iam sem JWT → 401 em cascata em toda a aplicação.
 */

interface StorageAdapter {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
  removeItem(key: string): Promise<void> | void;
}

// ── In-memory fallback para SSR / ambientes sem localStorage ────────────────
class InMemoryStorage implements StorageAdapter {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

// ── localStorage wrapper com SSR-safety e quota-guard ───────────────────────
function createLocalStorageAdapter(): StorageAdapter {
  return {
    getItem(key: string): string | null {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    setItem(key: string, value: string): void {
      try {
        localStorage.setItem(key, value);
      } catch {
        // QuotaExceededError ou modo privado restrito — ignora silenciosamente.
        // O SDK vai operar sem persistência nesta sessão do browser.
      }
    },
    removeItem(key: string): void {
      try {
        localStorage.removeItem(key);
      } catch {
        // ignore
      }
    },
  };
}

/**
 * Storage global do Supabase client.
 * Usa localStorage em browsers e in-memory em SSR.
 */
export const cookieStorage: StorageAdapter =
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
    ? createLocalStorageAdapter()
    : new InMemoryStorage();

/**
 * @deprecated Mantido apenas para compatibilidade com call sites existentes.
 * Sempre retorna `true` — a proteção real é via CSP + JWTs de curta duração.
 */
export function verifyHttpOnlyCookieAuth(): boolean {
  return true;
}
