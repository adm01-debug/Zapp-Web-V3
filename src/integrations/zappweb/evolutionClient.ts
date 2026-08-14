/**
 * @deprecated V3 ARQUIVADO 2026-08-14 — etapa 23 do PLANO_DESACOPLAMENTO_V3_100_ETAPAS.md
 *
 * ZappWebbDemoPage agora usa evolution-proxy diretamente via supabase.functions.invoke.
 * Este arquivo foi esvaziado. Ver src/_archive/evolutionClient.archived.ts para histórico.
 *
 * Mapa de migração:
 *   sendText()         → supabase.functions.invoke('evolution-proxy', { body: { method:'POST', path:'/message/sendText/{instance}', body: {number, text} } })
 *   markChatRead()     → supabase.functions.invoke('evolution-proxy', { body: { method:'PUT',  path:'/chat/markChatUnread/{instance}',  body: {number, unread:false} } })
 *   getConnectionState → supabase.functions.invoke('evolution-proxy', { body: { method:'GET',  path:'/instance/connectionState/{instance}' } })
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const sendText    = (): never => { throw new Error('[V3] Use evolution-proxy via supabase.functions.invoke'); };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const sendMedia   = (): never => { throw new Error('[V3] Use evolution-proxy via supabase.functions.invoke'); };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const sendWhatsAppAudio = (): never => { throw new Error('[V3] Use evolution-proxy via supabase.functions.invoke'); };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const markChatRead = (): never => { throw new Error('[V3] Use evolution-proxy via supabase.functions.invoke'); };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const fetchInstances = (): never => { throw new Error('[V3] Use evolution-proxy via supabase.functions.invoke'); };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const connectionState = (): never => { throw new Error('[V3] Use evolution-proxy via supabase.functions.invoke'); };
export const getEvolutionCredentials = connectionState;
export const stripJid = (jid: string) => (jid || '').replace(/@s\.whatsapp\.net$/i, '').replace(/@c\.us$/i, '');
export type { EvolutionCredentials } from './types';
