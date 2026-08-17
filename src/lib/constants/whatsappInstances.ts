/**
 * Registro central das instâncias Evolution API.
 *
 * FONTE DE VERDADE dinâmica: `SELECT instance_name, is_active FROM whatsapp_connections`.
 * Esta constante é o fallback estático de validação/UX.
 *
 * INSTÂNCIAS (reverificado contra o banco em 2026-07-26):
 *  - wpp2          : instância PRODUTIVA. is_active=true, status='connected',
 *                    12.527 conversas, mensagens até 2026-07-24.
 *  - wpp_pink_test : instância de TESTE. is_active=false, status='archived',
 *                    0 mensagens e 0 conversas — nunca recebeu tráfego.
 *
 * ATENCAO: até 2026-07-26 ACTIVE_WHATSAPP_INSTANCE apontava para
 * `wpp_pink_test`, o que zerava a sidebar, zerava a abertura de conversas e
 * disparava o fallback "sem filtro de instância" a cada carga da Inbox.
 *
 * Para adicionar uma nova instância:
 *  1. Adicione-a em WHATSAPP_INSTANCES abaixo.
 *  2. Crie as partições no PG se necessário.
 *  3. Configure o webhook na Evolution API.
 */

/** Whatsapp Instances constant. */
export const WHATSAPP_INSTANCES = [
  // Instância PRODUTIVA atual — is_active=true, status='connected' (reverificado 2026-07-26)
  'wpp2',
  // Instância de TESTE legada — is_active=false, status='archived', nunca recebeu tráfego
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
export const ACTIVE_WHATSAPP_INSTANCE: WhatsAppInstance = 'wpp2';

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
