/**
 * TDD E35 — externalSenderTypes (makeOptimisticBubble / SendError).
 *
 * Contrato testado (spec Etapa 35, PLANO-100-ETAPAS-ZAPP-20260816.md):
 *  - 35.7 makeOptimisticBubble PURA: mesmo input → mesmo output, e
 *    `OptimisticMessage` compatível com o tipo renderizado pelo MessageBubble.
 *  - 35.8 a função não acessa store global (é construída só de argumentos).
 *  - SendError: tipo estável com name/detail/status (base do 35.3).
 *
 * Estado RED (antes do GREEN): makeOptimisticBubble usava Date.now()/
 * Math.random() internos → duas chamadas com o mesmo input produzem outputs
 * DIFERENTES (id diverge), e o tipo `opts` não aceitava `now`/`randomSuffix`
 * (erros TS2353/TS2345 nos testes — sinais de tipo válidos do contrato
 * futuro). GREEN: injetar `now` (ISO) e `randomSuffix` opcionais, derivando
 * o timestamp do id a partir do `now` injetado.
 */
import { describe, it, expect } from 'vitest';
import {
  makeOptimisticBubble,
  SendError,
  DEFAULT_INSTANCE,
  type OptimisticMessage,
} from '../externalSenderTypes';

const JID = '5511999999999@s.whatsapp.net';
const NOW = '2026-08-18T12:00:00.000Z';

describe('makeOptimisticBubble — pureza (35.7)', () => {
  it('mesmo input (now/randomSuffix injetados) → mesmo output (deep equal)', () => {
    const opts = { now: NOW, randomSuffix: 'abc123' };
    const a = makeOptimisticBubble(JID, 'Olá', opts);
    const b = makeOptimisticBubble(JID, 'Olá', opts);
    expect(a).toEqual(b);
    expect(a.id).toBe(b.id);
  });

  it('id determinístico derivado de now/randomSuffix injetados', () => {
    const bubble = makeOptimisticBubble(JID, 'Olá', { now: NOW, randomSuffix: 'abc123' });
    expect(bubble.id).toBe(`optimistic:${Date.parse(NOW)}:abc123`);
    expect(bubble.created_at).toBe(NOW);
    expect(bubble.status_updated_at).toBe(NOW);
    expect(bubble.updated_at).toBe(NOW);
  });

  it('inputs diferentes → outputs diferentes (id não colide)', () => {
    const a = makeOptimisticBubble(JID, 'Olá', { now: NOW, randomSuffix: 'abc123' });
    const b = makeOptimisticBubble(JID, 'Olá', { now: NOW, randomSuffix: 'xyz789' });
    expect(a.id).not.toBe(b.id);
  });
});

describe('makeOptimisticBubble — shape padrão (35.7)', () => {
  it('mensagem de texto com defaults estáveis (status sending, sender agent, sem store)', () => {
    const bubble = makeOptimisticBubble(JID, 'Olá', { now: NOW, randomSuffix: 'abc123' });

    expect(bubble.id.startsWith('optimistic:')).toBe(true);
    expect(bubble.contact_id).toBe(JID);
    expect(bubble.agent_id).toBe('system');
    expect(bubble.content).toBe('Olá');
    expect(bubble.sender).toBe('agent');
    expect(bubble.message_type).toBe('text');
    expect(bubble.media_url).toBeNull();
    expect(bubble.is_read).toBe(true);
    expect(bubble.status).toBe('sending');
    expect(bubble.external_id).toBeNull();
    expect(bubble.whatsapp_connection_id).toBeNull();
    expect(bubble.transcription).toBeNull();
    expect(bubble.transcription_status).toBeNull();
    expect(bubble.is_deleted).toBe(false);
    expect(bubble.contactAvatar).toBeNull();
    expect(bubble.media_meta).toBeNull();
  });

  it('honra messageType/mediaUrl/contactAvatar/media_meta', () => {
    const bubble = makeOptimisticBubble(JID, 'foto.jpg', {
      messageType: 'image',
      mediaUrl: 'https://cdn.example/x.jpg',
      contactAvatar: 'https://cdn.example/avatar.png',
      media_meta: { width: 640 },
      now: NOW,
      randomSuffix: 'abc123',
    });
    expect(bubble.message_type).toBe('image');
    expect(bubble.media_url).toBe('https://cdn.example/x.jpg');
    expect(bubble.contactAvatar).toBe('https://cdn.example/avatar.png');
    expect(bubble.media_meta).toEqual({ width: 640 });
  });

  it('compatível com OptimisticMessage (type-level) e renderizável pelo MessageBubble', () => {
    const msg: OptimisticMessage = makeOptimisticBubble(JID, 'Olá', {
      now: NOW,
      randomSuffix: 'abc123',
    });
    // Campos exigidos pelo render (MessageBubble) presentes e tipados.
    expect(msg.id.length).toBeGreaterThan(0);
    expect(typeof msg.status).toBe('string');
    expect(typeof msg.created_at).toBe('string');
    expect(typeof msg.message_type).toBe('string');
  });
});

describe('SendError — tipo estável (base 35.3)', () => {
  it('carrega name/detail/status', () => {
    const err = new SendError('Sessão inválida', 'Session not found', 404);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('SendError');
    expect(err.message).toBe('Sessão inválida');
    expect(err.detail).toBe('Session not found');
    expect(err.status).toBe(404);
  });

  it('aceita status indefinido (erros de rede)', () => {
    const err = new SendError('Falha de rede', 'fetch failed');
    expect(err.status).toBeUndefined();
    expect(err.detail).toBe('fetch failed');
  });
});

describe('DEFAULT_INSTANCE (35.1)', () => {
  it('é a instância ativa do workspace', () => {
    expect(DEFAULT_INSTANCE).toBe('wpp2');
  });
});
