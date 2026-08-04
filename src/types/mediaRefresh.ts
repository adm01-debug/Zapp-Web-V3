/**
 * Tipo compartilhado para auto-refresh de mídia expirada.
 *
 * Sempre que um <img>/<video>/<audio> tiver origem em uma mensagem do
 * WhatsApp/Evolution, o componente pode aceitar este `refreshKey` para
 * permitir re-hidratação automática via `useMediaUrl` quando o WhatsApp
 * devolver 410/403 na URL assinada.
 */
export interface MediaRefreshKey {
  instanceName: string;
  remoteJid: string;
  fromMe: boolean;
  /** Evolution `external_id` (key.id na payload original do WhatsApp). */
  id: string;
  /** FIX 2026-08-03 (Gap 4): tipo da mensagem WhatsApp para skip-list de mídia.
   *  Stickers, ephemerals e outros tipos nunca produzem base64 válido via Evolution.
   *  Passar aqui evita 23+ tentativas desnecessárias de refresh por sessão. */
  messageType?: string | null;
}
