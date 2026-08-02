
import { supabase } from '@/integrations/supabase/client';
import {
  mirrorExternalSignIn,
  mirrorExternalSignOut,
} from '@/integrations/supabase/externalSessionBridge';
import { Session } from '@supabase/supabase-js';
import type { AuthError, PostgrestError } from '@supabase/supabase-js';
import { createLogger } from '@/lib/logger';

const log = createLogger('authService');

/** Limpa chaves de sessão locais (fallback quando o signOut remoto falha). */
function clearLocalAuthStorage(): void {
  try {
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith('sb-') || k.startsWith('zapp')) localStorage.removeItem(k);
    });
  } catch {
    /* localStorage bloqueado — nada a fazer */
  }
  try {
    sessionStorage.clear();
  } catch {
    /* noop */
  }
}

/** Profile. */
export interface Profile {
  id: string;
  user_id: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
  role: string;
  max_chats: number;
  department_id: string | null;
  department: string | null;
}

/** auth Service. */
export const authService = {
  async getSession() {
    return await supabase.auth.getSession();
  },

  async getUser() {
    return await supabase.auth.getUser();
  },

  async signIn(email: string, password: string) {
    const result = await supabase.auth.signInWithPassword({ email, password });
    if (!result.error) {
      // dual-session: replica login no self-hosted com as mesmas credenciais
      // mirrorExternalSignIn has an internal try/catch and never rejects — .catch() is dead code
      void mirrorExternalSignIn(email, password);
    }
    return result;
  },

  async signUp(email: string, password: string, name: string) {
    const redirectUrl = `${window.location.origin}/`;
    const result = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: { name },
      },
    });
    if (!result.error) {
      void mirrorExternalSignIn(email, password);
    }
    return result;
  },

  async signOut(): Promise<{ error: AuthError | null }> {
    // Mirror externo nunca bloqueia o logout local (no-op pós-consolidação).
    await mirrorExternalSignOut();

    try {
      return await supabase.auth.signOut();
    } catch (err) {
      // Fallback local: rede indisponível ou GoTrue com erro. Sem isto, o
      // usuário ficaria "logado" com uma sessão morta e a UI presa. Garante
      // que a sessão local seja destruída mesmo offline.
      log.warn('[authService] signOut remoto falhou — aplicando fallback local', err);
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch {
        // Último recurso: limpeza manual do storage.
        clearLocalAuthStorage();
      }
      return { error: err as AuthError };
    }
  },

  async getProfile(
    userId: string,
    signal?: AbortSignal
  ): Promise<{ data: Profile | null; error: PostgrestError | null }> {
    const { data, error } = await (supabase
      .from('profiles') as unknown as {
        select: (s: string) => {
          eq: (c: string, v: string) => {
            abortSignal: (sig: AbortSignal) => {
              maybeSingle: () => Promise<{ data: Profile | null; error: PostgrestError | null }>;
            };
          };
        };
      })
      .select('*')
      .eq('user_id', userId)
      .abortSignal(signal ?? new AbortController().signal)
      .maybeSingle();

    return { data: (data as Profile | null) ?? null, error };
  },

  onAuthStateChange(callback: (event: string, session: Session | null) => void) {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(callback);
    return subscription;
  },
};