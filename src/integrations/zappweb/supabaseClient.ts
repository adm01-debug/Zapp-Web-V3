/**
 * Zap Webb — Supabase Client (LEITURA + Realtime)
 *
 * FATOR X v6.1: este módulo REEXPORTA o client principal autenticado
 * (`@/integrations/supabase/client`). Após a consolidação single-database,
 * manter um terceiro client `anon` aqui era inseguro E não-funcional:
 * o `anon` teve todos os grants revogados no domínio `evolution_*`
 * (hardening v6.1.1) — leituras/updates/realtime exigem `authenticated`.
 *
 * A API pública do módulo (zappSupabase / ZAPPWEB_INSTANCE / ZAPPWEB_CONFIG)
 * foi preservada para não quebrar os consumidores existentes.
 *
 * ⚠️  Toda ESCRITA de mensagens vai pela Evolution API
 *     (ver `src/integrations/zappweb/evolutionClient.ts`) ou pela RPC
 *     `send_message_v2` (fila `zapp.outbound_message_queue`).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

/** Default Evolution/WhatsApp instance name, overridable via VITE_ZAPPWEB_INSTANCE env var. */
export const ZAPPWEB_INSTANCE = (import.meta.env.VITE_ZAPPWEB_INSTANCE ||
  'wpp2') as string;

/** Client autenticado compartilhado (sessão do usuário logado). */
export const zappSupabase: SupabaseClient = supabase as unknown as SupabaseClient; // ignore-audit — SupabaseClient<Database> ≠ SupabaseClient<unknown> structurally; same runtime object

export const ZAPPWEB_CONFIG = {
  url: import.meta.env.VITE_SUPABASE_URL as string,
  /** @deprecated anon key nao e mais usada (client autenticado compartilhado). */
  anonKey: '',
  instance: ZAPPWEB_INSTANCE,
} as const;
