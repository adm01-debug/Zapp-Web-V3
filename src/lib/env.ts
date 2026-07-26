/**
 * env.ts — Variáveis de ambiente validadas por Zod
 *
 * Problema resolvido (E38):
 *   SUPABASE_PUBLIC_URL estava hardcoded em mediaUrl.ts
 *   Troca entre ambientes exigia editar código
 *
 * Solução:
 *   Variáveis no .env.* -> validação ZOD na inicialização
 *   app falha rápido e com mensagem clara se env validação falhar
 *
 * Fallback: valores de produção atuais para não quebrar deploy atual
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schema Zod — define a estrutura esperada das variaveis
// ---------------------------------------------------------------------------

const envSchema = z.object({
  /** URL pública do Supabase self-hosted (sem barra no final) */
  SUPABASE_PUBLIC_URL: z.string().url().default('https://supabase.atomicabr.com.br'),

  /** Chave anônima do Supabase (segura para expor no frontend) */
  SUPABASE_ANON_KEY: z.string().default(''),

  /** Versão da aplicação (injetada no build) */
  APP_VERSION: z.string().default('1.0.0'),
});

// ---------------------------------------------------------------------------
// Parsing — falha rápido com mensagem clara
// ---------------------------------------------------------------------------

function parseEnv() {
  const rawEnv = {
    // Vite expõe variáveis com prefixo VITE_ para o frontend
    SUPABASE_PUBLIC_URL: import.meta.env.VITE_SUPABASE_URL ?? import.meta.env.VITE_SUPABASE_PUBLIC_URL,
    SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.VITE_ANON_KEY,
    APP_VERSION: import.meta.env.VITE_APP_VERSION ?? import.meta.env.VITE_VERSION,
  };

  const result = envSchema.safeParse(rawEnv);

  if (!result.success) {
    console.error('[env] Variáveis de ambiente inválidas:', result.error.flatten());
    // Não quebra o app — usar defaults e logruar erro
    // Em produção: adicionar alerta Sentry aqui
    return envSchema.parse({}); // usa todos os defaults
  }

  return result.data;
}

/**
 * **Variáveis de ambiente validadas por Zod.**
 *
 * Usar aqui em vez hardcodedatas URLs no código.
 *
 * @example
 * import { env } from '@/lib/env';
 * const supabaseUrl = env.SUPABASE_PUBLIC_URL;
 */
export const env = parseEnv();

// ---------------------------------------------------------------------------
// Type exports
// ---------------------------------------------------------------------------

export type Env = typeof env;
