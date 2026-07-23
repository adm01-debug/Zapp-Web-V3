/**
 * Registro central das instâncias Evolution API.
 *
 * FONTE DE VERDADE dinâmica: `SELECT instance_name, is_active FROM whatsapp_connections`.
 * Esta constante é o fallback estático de validação/UX.
 *
 * INSTÂNCIAS ATIVAS (verificado 2026-07-03):
 *  - wpp_pink_test: instância principal ATIVA (5342 msgs, 2203 convs)
 *  - wpp2          : instância legada (1.8M msgs histórico até Maio 2026)
 *
 * Para adicionar uma nova instância:
 *  1. Adicione-a em WHATSAPP_INSTANCES abaixo.
 *  2. Crie as partições no PG se necessário.
 *  3. Configure o webhook na Evolution API.
 */

/** Whatsapp Instances constant. */
export const WHATSAPP_INSTANCES = [
  // Instância legada — dados históricos até Maio 2026
  'wpp2',
  // Instância ATIVA atual — dados de Maio 2026 em diante
  'wpp_pink_test',
  // Fallback interno do PG (não selecionável pelo usuário)
  'default',
] as const;

/** Whats App Instance type alias. */
export type WhatsAppInstance = (typeof WHATSAPP_INSTANCES)[number];

/**
 * Instância default LEGADA — mantida para retrocompatibilidade.
 * ATENÇÃO: Use ACTIVE_WHATSAPP_INSTANCE para novas interações.
 * @deprecated Prefira ALL_INSTANCES_FILTER (null) ou ACTIVE_WHATSAPP_INSTANCE.
 */
export const DEFAULT_WHATSAPP_INSTANCE: WhatsAppInstance = 'wpp2';

/**
 * Instância atualmente ATIVA (recebe mensagens novas).
 * Atualizar quando a instância principal mudar.
 */
export const ACTIVE_WHATSAPP_INSTANCE: WhatsAppInstance = 'wpp_pink_test';

/**
 * Valor sentinela para indicar "todas as instâncias" nas RPCs.
 * Passe null como p_instance para não filtrar por instância.
 */
export const ALL_INSTANCES_FILTER = null;

/** Instâncias selecionáveis pela UI (exclui `default`). */
export const SELECTABLE_WHATSAPP_INSTANCES = WHATSAPP_INSTANCES.filter(
  (i) => i !== 'default',
) as readonly WhatsAppInstance[];

/** Returns true if value is one of the registered WhatsApp instance identifiers. */
export function isValidWhatsAppInstance(value: unknown): value is WhatsAppInstance {
  return typeof value === 'string' && (WHATSAPP_INSTANCES as readonly string[]).includes(value);
}

/**
 * Retorna a instância validada ou cai para `ACTIVE_WHATSAPP_INSTANCE`.
 * Use em pontos de entrada (querystring, localStorage, props externas).
 */
export function coerceWhatsAppInstance(value: unknown): WhatsAppInstance {
  return isValidWhatsAppInstance(value) ? value : ACTIVE_WHATSAPP_INSTANCE;
}
