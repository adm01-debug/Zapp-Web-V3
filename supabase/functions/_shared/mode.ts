/**
 * Modo WhatsApp unificado para edge functions (W7 — decoupling audit 2026-08-15).
 * Destino no repo: supabase/functions/_shared/mode.ts
 *
 * Contexto: existiam 2 fontes de verdade de "modo" desalinhadas
 *   (zapp.global_settings via RPC rpc_get_whatsapp_mode — DB-only — e
 *   whatsapp_connections.api_type per-connection). Este módulo dá às edges
 *   UMA fonte canônica: a RPC pública rpc_get_whatsapp_mode (unificada na
 *   migration 20260815090000_unify_whatsapp_mode.sql), com cache de 30s e
 *   fallback 'unofficial' (nunca lança para o chamador).
 *
 * Semântica de envio (resolveSendFunction):
 *   - grupo (@g.us)          → SEMPRE 'evolution'  (Meta não recebe envio
 *     iniciado pelo negócio em grupos fora do template; Evolution cobre)
 *   - 1:1 com modo 'cloud'/'official' → 'cloud'    (WhatsApp Cloud API / Meta)
 *   - 1:1 com modo 'unofficial'        → 'evolution' (Evolution API / Baileys)
 *   - modo inválido/erro de RPC        → fallback 'unofficial' → 'evolution'
 *
 * O frontend mantém o próprio resolver (src/lib/whatsappAdapterTransport.ts);
 * este módulo é o equivalente para o lado edge.
 */

// [FIX 2026-08-15] Tipo estrutural mínimo em vez de SupabaseClient pinado:
// consumidores importam supabase-js em versões distintas e os generics da
// classe não são compatíveis entre si (mesmo padrão de instance-pause.ts).
// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

/** Modos aceitos pela RPC unificada rpc_get_whatsapp_mode. */
export type WhatsAppMode = 'unofficial' | 'official' | 'cloud';

/** Função de envio resolvida (edge function que recebe o send). */
export type SendFunction = 'cloud' | 'evolution';

const VALID_MODES: readonly WhatsAppMode[] = ['unofficial', 'official', 'cloud'];
const MODE_CACHE_TTL_MS = 30_000;
const FALLBACK_MODE: WhatsAppMode = 'unofficial';

let cachedMode: WhatsAppMode | null = null;
let cacheExpiresAt = 0;

/**
 * true quando o JID é de grupo WhatsApp (@g.us).
 * Aceita null/undefined (retorna false) — chamadores de webhook nem sempre
 * têm remoteJid preenchido.
 */
export function isGroupJid(jid: string | null | undefined): boolean {
  return typeof jid === 'string' && jid.endsWith('@g.us');
}

/**
 * Lê o modo WhatsApp global via RPC rpc_get_whatsapp_mode, com cache de 30s.
 * Nunca lança: qualquer erro de rede/RPC ou valor inválido retornado pela RPC
 * cai em fallback 'unofficial' com console.warn. `force=true` ignora o cache
 * (usar após troca de modo pelo admin).
 */
export async function getWhatsAppMode(
  supabase: SupabaseClient,
  force = false,
): Promise<WhatsAppMode> {
  const now = Date.now();
  if (!force && cachedMode !== null && now < cacheExpiresAt) return cachedMode;

  try {
    const { data, error } = await supabase.rpc('rpc_get_whatsapp_mode');
    if (error) throw error;

    const mode = String(data ?? '').trim() as WhatsAppMode;
    if (VALID_MODES.includes(mode)) {
      cachedMode = mode;
      cacheExpiresAt = now + MODE_CACHE_TTL_MS;
      return mode;
    }

    console.warn(
      `getWhatsAppMode: valor inválido retornado pela RPC (${String(data)}); usando fallback '${FALLBACK_MODE}'`,
    );
  } catch (e) {
    console.warn('getWhatsAppMode: falha ao ler modo; usando fallback', {
      error: e instanceof Error ? e.message : String(e),
    });
  }

  cachedMode = FALLBACK_MODE;
  cacheExpiresAt = now + MODE_CACHE_TTL_MS;
  return FALLBACK_MODE;
}

/** Invalida o cache de modo (chamar após rpc_set_whatsapp_mode). */
export function invalidateWhatsAppModeCache(): void {
  cachedMode = null;
  cacheExpiresAt = 0;
}

/**
 * Resolve qual função de envio usar para um destinatário:
 * grupo (@g.us) → 'evolution' (sempre); 1:1 → segue o modo global.
 * Nunca lança — erros caem no fallback 'unofficial' → 'evolution'.
 */
export async function resolveSendFunction(
  supabase: SupabaseClient,
  remoteJid: string | null | undefined,
): Promise<SendFunction> {
  if (isGroupJid(remoteJid)) return 'evolution';

  const mode = await getWhatsAppMode(supabase);
  return mode === 'unofficial' ? 'evolution' : 'cloud';
}
