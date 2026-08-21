/**
 * Etapa 92 do plano ChatPanel — derivação do JID canônico do contato.
 * A regra alimenta o canal `typing:${jid}` e o realtime do chat: JID errado
 * = indicador de digitação morto (bug corrigido no Bloco 0, dfeca77).
 */
import { describe, it, expect } from 'vitest';
import { deriveContactJid } from '../contactJid';

describe('deriveContactJid', () => {
  it('prefere o remote_jid canônico quando presente (grupos/@lid/broadcast)', () => {
    expect(deriveContactJid('120363000000000001@g.us', '5511999887766')).toBe(
      '120363000000000001@g.us'
    );
    expect(deriveContactJid('987654@lid', null)).toBe('987654@lid');
  });

  it('deriva do phone puro com sufixo @s.whatsapp.net (contato legado)', () => {
    expect(deriveContactJid(null, '5511999887766')).toBe('5511999887766@s.whatsapp.net');
    expect(deriveContactJid(undefined, '5511999887766')).toBe('5511999887766@s.whatsapp.net');
  });

  it('phone que já é JID completo passa intacto (estratégias B/C) — nunca sufixo duplo', () => {
    expect(deriveContactJid(null, '120363000000000001@g.us')).toBe('120363000000000001@g.us');
    expect(deriveContactJid(null, '5511999887766@s.whatsapp.net')).toBe(
      '5511999887766@s.whatsapp.net'
    );
  });

  it('sem remote_jid e sem phone → string vazia (canal de typing desabilitado)', () => {
    expect(deriveContactJid(null, null)).toBe('');
    expect(deriveContactJid(undefined, undefined)).toBe('');
    expect(deriveContactJid('', '')).toBe('');
  });
});
