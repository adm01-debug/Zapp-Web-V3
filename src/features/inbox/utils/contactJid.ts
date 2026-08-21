/**
 * Deriva o JID canônico do contato (etapa 92 do plano ChatPanel — regra
 * extraída do useMemo do ChatPanel para ser testável).
 *
 * Preferência: `remote_jid` canônico (presente para grupos, @lid e broadcast,
 * onde phone é null). Fallback: deriva do phone para contatos legados.
 * Estratégias B/C podem ter gravado um JID completo (ex.: 120363...@g.us) no
 * campo phone — anexar @s.whatsapp.net produziria um JID com sufixo duplo.
 */
export function deriveContactJid(
  remoteJid: string | null | undefined,
  phone: string | null | undefined
): string {
  if (remoteJid) return remoteJid;
  if (!phone) return '';
  if (phone.includes('@')) return phone;
  return `${phone}@s.whatsapp.net`;
}
