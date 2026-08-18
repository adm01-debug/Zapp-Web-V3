/**
 * E36 — Configuração da seleção de fonte do inbox (dual-path zapp×evo).
 *
 * O `useInboxSource` escolhe ENTRE duas fontes de mensagens por configuração:
 *
 *   - 'evo'  — path cursor-based: `useMessagesCursor` →
 *              `rpc_list_messages_lite` (Evolution DB, PAGE_SIZE=50).
 *   - 'zapp' — path legado: `useMessages` → `zapp.messages` via
 *              `messageService.getAllMessagesForContact` (sem cursor).
 *   - 'auto' (DEFAULT) — evo quando disponível; fallback automático para o
 *              legado apenas quando o path evo falha, gravando telemetria
 *              `source_fallback` (evento `source_switch` em
 *              reconciliationTelemetry).
 *
 * Migração gradual: nada muda para quem não configura nada (default 'auto'),
 * e NÃO há migração de dados nesta fase — apenas a seleção de leitura.
 *
 * Ver docs/adr/dual-path-inbox.md.
 */

/** Modos de fonte suportados pela configuração. */
export type InboxSourceMode = 'evo' | 'zapp' | 'auto';

/** Decisão de paths para uma combinação (modo, disponibilidade do evo). */
export interface InboxSourcePaths {
  /** Path evo (cursor-based) ativo. */
  useEvo: boolean;
  /** Path legado (zapp.messages) ativo. */
  useLegacy: boolean;
  /** true quando o fallback automático engajou (auto + evo indisponível). */
  fallbackEngaged: boolean;
}

/** Tamanho de página do path evo (rpc_list_messages_lite p_limit). */
export const INBOX_SOURCE_PAGE_SIZE = 50;

/** Counter de telemetria em reconciliationTelemetry para fallbacks de fonte. */
export const SOURCE_FALLBACK_COUNTER = 'source_fallback';

/** Evento de telemetria para trocas de fonte (evo→zapp). */
export const SOURCE_SWITCH_EVENT = 'source_switch';

/** Variável de ambiente que seleciona o modo (Vite: VITE_*). */
export const INBOX_SOURCE_MODE_ENV = 'VITE_INBOX_SOURCE_MODE';

const VALID_MODES = new Set<InboxSourceMode>(['evo', 'zapp', 'auto']);

/**
 * Resolve o modo a partir do valor bruto de configuração.
 *
 * Valores válidos: 'evo' | 'zapp' | 'auto'. Ausência, string vazia ou valor
 * desconhecido → 'auto' (degradação segura — nunca quebra o inbox).
 */
export function resolveInboxSourceMode(envValue: string | undefined): InboxSourceMode {
  const value = (envValue ?? '').trim() as InboxSourceMode;
  return VALID_MODES.has(value) ? value : 'auto';
}

/**
 * Tabela de decisão pura: dado o modo configurado e a disponibilidade do path
 * evo, quais paths ficam ativos e se o fallback automático engajou.
 *
 *  mode    | evoAvailable | useEvo | useLegacy | fallbackEngaged
 *  --------|--------------|--------|-----------|-----------------
 *  'evo'   |      —       |  true  |  false    |      false      (forçado)
 *  'zapp'  |      —       |  false |  true     |      false      (forçado)
 *  'auto'  |     true     |  true  |  false    |      false
 *  'auto'  |     false    |  false |  true     |      true
 */
export function selectInboxSourcePaths(
  mode: InboxSourceMode,
  evoAvailable: boolean
): InboxSourcePaths {
  if (mode === 'evo') {
    return { useEvo: true, useLegacy: false, fallbackEngaged: false };
  }
  if (mode === 'zapp') {
    return { useEvo: false, useLegacy: true, fallbackEngaged: false };
  }
  // auto
  if (evoAvailable) {
    return { useEvo: true, useLegacy: false, fallbackEngaged: false };
  }
  return { useEvo: false, useLegacy: true, fallbackEngaged: true };
}
