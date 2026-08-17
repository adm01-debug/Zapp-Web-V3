import type { SipStatus } from '@/features/inbox';

/**
 * Veredito honesto do botão "Atender" de chamadas recebidas.
 *
 * O web app NÃO tem caminho de áudio para chamadas RECEBIDAS:
 *  - o UserAgent SIP é somente outbound (`makeCall`/`Inviter` — ver
 *    `voip-security-gaps.test.ts`: "GAP: No incoming call support");
 *  - o alerta chega pelo webhook do WhatsApp/Evolution (broadcast
 *    `call_received` / postgres_changes em `zapp.calls`), não por um
 *    INVITE SIP — não existe sessão SIP para aceitar.
 *
 * Atender de verdade exigiria suporte a `Invitation` no UA + roteamento no
 * servidor SIP (fora do escopo atual). Enquanto isso não existe, o clique em
 * "Atender" SEMPRE retorna um aviso honesto (nunca no-op, nunca UI de chamada
 * falsa). Quando o suporte a INVITE de entrada for implementado, este veredito
 * é substituído pelo fluxo real de aceite.
 */
export const INBOUND_ANSWER_UNSUPPORTED_NOTICE =
  'Atendimento de chamadas recebidas ainda não é suportado no web app — atenda pelo WhatsApp.';
export const INBOUND_ANSWER_NO_VOIP_NOTICE =
  'VoIP não conectado — não é possível atender no navegador. Atenda pelo WhatsApp.';

/** Retorna o aviso honesto do "Atender" para o status SIP atual — sempre um texto não-vazio. */
export function getInboundAnswerNotice(sipStatus: SipStatus): string {
  if (sipStatus !== 'registered') return INBOUND_ANSWER_NO_VOIP_NOTICE;
  return INBOUND_ANSWER_UNSUPPORTED_NOTICE;
}
