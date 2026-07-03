/**
 * Registro central das instâncias Evolution API / partições de
 * `evolution_messages` e `evolution_conversations` no FATOR X.
 *
 * FATOR X v6.1: lista reduzida às instâncias REAIS existentes no banco
 * (`public.whatsapp_connections` / partições `evo.*`). As 14 instâncias
 * planejadas (setores/vendedores) foram removidas — validar input contra
 * nomes inexistentes gerava filtros que retornavam vazio silenciosamente.
 *
 * FONTE DE VERDADE dinâmica: `SELECT instance_name FROM whatsapp_connections`.
 * Esta constante é apenas o fallback estático de validação/UX. Ao criar uma
 * instância nova na Evolution API, adicione-a aqui E crie a partição no PG.
 */

export const WHATSAPP_INSTANCES = [
  // Produção principal (Promo Brindes — 551146375517)
  'wpp2',
  // Ambiente de testes
  'wpp_pink_test',
  // Fallback (não selecionável pelo usuário, partição default do PG)
  'default',
] as const;

export type WhatsAppInstance = (typeof WHATSAPP_INSTANCES)[number];

/** Instância default usada em todo o app quando nenhuma é especificada. */
export const DEFAULT_WHATSAPP_INSTANCE: WhatsAppInstance = 'wpp2';

/** Instâncias selecionáveis pela UI (exclui `default`, que é fallback do PG). */
export const SELECTABLE_WHATSAPP_INSTANCES = WHATSAPP_INSTANCES.filter(
  (i) => i !== 'default',
) as readonly WhatsAppInstance[];

export function isValidWhatsAppInstance(value: unknown): value is WhatsAppInstance {
  return typeof value === 'string' && (WHATSAPP_INSTANCES as readonly string[]).includes(value);
}

/**
 * Retorna a instância validada ou cai para `DEFAULT_WHATSAPP_INSTANCE`.
 * Use em pontos de entrada (querystring, localStorage, props externas).
 */
export function coerceWhatsAppInstance(value: unknown): WhatsAppInstance {
  return isValidWhatsAppInstance(value) ? value : DEFAULT_WHATSAPP_INSTANCE;
}
