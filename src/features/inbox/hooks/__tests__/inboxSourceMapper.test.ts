/**
 * E36 — CONTRATO DO MAPPER evo-lite → Message (path cursor-based).
 *
 * RED: `mapEvolutionLiteToChatMessage` será exportado de
 * `src/features/inbox/hooks/useInboxSource.ts` — hoje o hook NÃO exporta
 * mapper (import falha = RED legítimo).
 *
 * O contrato garante que o path evo (useMessagesCursor →
 * rpc_list_messages_lite → EvolutionMessageLite) entrega `Message[]` no MESMO
 * shape do path legado (useMessages → zapp.messages), preservando a interface
 * unificada consumida por useRealtimeInbox.
 */
import { describe, it, expect } from 'vitest';
import { mapEvolutionLiteToChatMessage } from '../useInboxSource';
import type { EvolutionMessageLite } from '@/types/evolutionExternal';

function lite(overrides: Partial<EvolutionMessageLite> = {}): EvolutionMessageLite {
  return {
    id: 'm1',
    message_id: 'WA-message-id-1',
    remote_jid: '5511999999999@s.whatsapp.net',
    from_me: false,
    direction: 'inbound',
    status: 'delivered',
    message_type: 'conversation',
    content: 'Olá',
    media_url: null,
    media_mimetype: null,
    media_type: null,
    media_filename: null,
    caption: null,
    quoted_message_id: null,
    is_starred: false,
    is_important: false,
    sent_by_bot: false,
    push_name: 'Cliente',
    instance_name: 'default',
    created_at: '2026-08-18T10:00:00.000Z',
    status_at: '2026-08-18T10:00:01.000Z',
    deleted_at: null,
    ...overrides,
  };
}

describe('mapEvolutionLiteToChatMessage — contrato do path evo', () => {
  it('texto: content, sender contact, tipo text, timestamp Date, conversationId injetado', () => {
    const msg = mapEvolutionLiteToChatMessage(lite(), '5511999999999@s.whatsapp.net');
    expect(msg.id).toBe('m1');
    expect(msg.conversationId).toBe('5511999999999@s.whatsapp.net');
    expect(msg.content).toBe('Olá');
    expect(msg.sender).toBe('contact');
    expect(msg.type).toBe('text');
    expect(msg.timestamp).toBeInstanceOf(Date);
    expect(msg.timestamp.toISOString()).toBe('2026-08-18T10:00:00.000Z');
    expect(msg.external_id).toBe('WA-message-id-1');
  });

  it('from_me=true → sender agent', () => {
    const msg = mapEvolutionLiteToChatMessage(lite({ from_me: true, direction: 'outbound' }), 'c1');
    expect(msg.sender).toBe('agent');
  });

  it('imagem: type image, mediaUrl preenchido, content fallback "[Imagem]"', () => {
    const msg = mapEvolutionLiteToChatMessage(
      lite({
        message_type: 'imageMessage',
        media_url: 'https://cdn/img.jpg',
        content: null,
        caption: null,
      }),
      'c1'
    );
    expect(msg.type).toBe('image');
    expect(msg.mediaUrl).toBe('https://cdn/img.jpg');
    expect(msg.content).toBe('[Imagem]');
  });

  it('caption como fallback de content (áudio)', () => {
    const msg = mapEvolutionLiteToChatMessage(
      lite({ message_type: 'audioMessage', content: null, caption: 'Transcrição' }),
      'c1'
    );
    expect(msg.type).toBe('audio');
    expect(msg.content).toBe('Transcrição');
  });

  it('tipo desconhecido (unsupported) → type text com label entre colchetes', () => {
    const msg = mapEvolutionLiteToChatMessage(
      lite({ message_type: 'reactionMessage', content: null, caption: null }),
      'c1'
    );
    expect(msg.type).toBe('text');
    expect(msg.content).toBe('[Reação]');
  });

  it('status mapeado: delivered→delivered, read→read, failed→failed, desconhecido→sent', () => {
    expect(mapEvolutionLiteToChatMessage(lite({ status: 'read' }), 'c1').status).toBe('read');
    expect(mapEvolutionLiteToChatMessage(lite({ status: 'failed' }), 'c1').status).toBe('failed');
    expect(mapEvolutionLiteToChatMessage(lite({ status: 'weird' }), 'c1').status).toBe('sent');
    expect(
      mapEvolutionLiteToChatMessage(lite({ status: null as unknown as string }), 'c1').status
    ).toBe('sent');
  });

  it('is_read derivado de status=read; is_deleted derivado de deleted_at', () => {
    const read = mapEvolutionLiteToChatMessage(lite({ status: 'read' }), 'c1');
    expect(read.is_read).toBe(true);
    const del = mapEvolutionLiteToChatMessage(
      lite({ deleted_at: '2026-08-18T11:00:00.000Z' }),
      'c1'
    );
    expect(del.is_deleted).toBe(true);
    expect(del.deleted_at).toBe('2026-08-18T11:00:00.000Z');
  });

  it('reactions mapeadas para MessageReaction (emoji/userId/timestamp)', () => {
    const msg = mapEvolutionLiteToChatMessage(
      lite({
        reactions: [
          { text: '❤️', key: { remoteJid: '5511888888888@s.whatsapp.net', fromMe: false, id: 'r1' } },
        ],
      }),
      'c1'
    );
    expect(msg.reactions).toHaveLength(1);
    expect(msg.reactions?.[0].emoji).toBe('❤️');
    expect(msg.reactions?.[0].userId).toBe('5511888888888@s.whatsapp.net');
    expect(msg.reactions?.[0].timestamp).toBeInstanceOf(Date);
  });

  it('media sem type (sticker) mantém type sticker', () => {
    const msg = mapEvolutionLiteToChatMessage(lite({ message_type: 'stickerMessage' }), 'c1');
    expect(msg.type).toBe('sticker');
  });
});
