/**
 * Testes para a camada de identidade canônica ContactRef.
 *
 * Cobre os casos documentados no plano de correção:
 * - UUID padrão e edge cases
 * - JID com e sem sufixo
 * - Número de telefone puro
 * - Grupo (@g.us)
 * - Valores nulos/vazios
 * - Degradação segura para valores não reconhecidos
 * - Type guards (isUuidRef, isJidRef)
 */

import { describe, it, expect } from 'vitest';
import { resolveContactRef, isUuidRef, isJidRef, contactRefToString } from '../contactRef';
import type { ContactRef } from '../contactRef';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Helper: assert que o ContactRef é do tipo uuid com os campos esperados. */
function assertUuid(ref: ContactRef | null, expectedUuid: string, raw?: string) {
  expect(ref).not.toBeNull();
  expect(ref!.kind).toBe('uuid');
  if (ref!.kind === 'uuid') {
    expect(ref!.uuid).toBe(expectedUuid.toLowerCase());
    expect(ref!.raw).toBe(raw ?? expectedUuid);
  }
}

/** Helper: assert que o ContactRef é do tipo jid com os campos esperados. */
function assertJid(
  ref: ContactRef | null,
  expectedRemoteJid: string,
  expectedPhone: string | null,
  expectedIsGroup: boolean,
  raw?: string
) {
  expect(ref).not.toBeNull();
  expect(ref!.kind).toBe('jid');
  if (ref!.kind === 'jid') {
    expect(ref!.remoteJid).toBe(expectedRemoteJid);
    expect(ref!.phone).toBe(expectedPhone);
    expect(ref!.isGroup).toBe(expectedIsGroup);
    expect(ref!.raw).toBe(raw ?? expectedRemoteJid);
  }
}

// ── UUID ──────────────────────────────────────────────────────────────────────

describe('resolveContactRef — UUID', () => {
  it('detecta UUID v4 padrão', () => {
    assertUuid(
      resolveContactRef('550e8400-e29b-41d4-a716-446655440000'),
      '550e8400-e29b-41d4-a716-446655440000'
    );
  });

  it('detecta UUID maiúsculo', () => {
    assertUuid(
      resolveContactRef('550E8400-E29B-41D4-A716-446655440000'),
      '550e8400-e29b-41d4-a716-446655440000',
      '550E8400-E29B-41D4-A716-446655440000' // raw preserva case original
    );
  });

  it('detecta UUID v1 (timestamp-based)', () => {
    assertUuid(
      resolveContactRef('6ba7b810-9dad-11d1-80b4-00c04fd430c8'),
      '6ba7b810-9dad-11d1-80b4-00c04fd430c8'
    );
  });

  it('aceita nil UUID (todos zeros)', () => {
    assertUuid(
      resolveContactRef('00000000-0000-0000-0000-000000000000'),
      '00000000-0000-0000-0000-000000000000'
    );
  });

  it('aceita UUID com whitespace ao redor', () => {
    assertUuid(
      resolveContactRef('  550e8400-e29b-41d4-a716-446655440000  '),
      '550e8400-e29b-41d4-a716-446655440000'
    );
  });

  it('rejeita UUID com tamanho errado (falta 1 char)', () => {
    const ref = resolveContactRef('550e8400-e29b-41d4-a716-44665544000');
    expect(ref?.kind).not.toBe('uuid');
  });

  it('rejeita UUID sem hífens', () => {
    const ref = resolveContactRef('550e8400e29b41d4a716446655440000');
    expect(ref?.kind).not.toBe('uuid');
  });
});

// ── JID com sufixo ────────────────────────────────────────────────────────────

describe('resolveContactRef — JID com sufixo', () => {
  it('JID padrão @s.whatsapp.net', () => {
    assertJid(
      resolveContactRef('551146375517@s.whatsapp.net'),
      '551146375517@s.whatsapp.net',
      '551146375517',
      false
    );
  });

  it('JID de grupo @g.us', () => {
    assertJid(resolveContactRef('120363123456789@g.us'), '120363123456789@g.us', null, true);
  });

  it('JID @lid (device privacy ID — numeric portion is NOT an E.164 phone)', () => {
    assertJid(resolveContactRef('5511999999999@lid'), '5511999999999@lid', null, false);
  });

  it('JID @broadcast', () => {
    assertJid(
      resolveContactRef('status@broadcast'),
      'status@broadcast',
      null, // "status" não tem dígitos → phone = null
      false
    );
  });

  it('JID com caracteres especiais no prefixo', () => {
    const ref = resolveContactRef('abc.def_ghi-jkl@s.whatsapp.net');
    expect(ref?.kind).toBe('jid');
    if (ref?.kind === 'jid') {
      expect(ref.remoteJid).toBe('abc.def_ghi-jkl@s.whatsapp.net');
      // Sem dígitos no prefixo → phone = null
      expect(ref.phone).toBeNull();
    }
  });
});

// ── Número de telefone puro ───────────────────────────────────────────────────

describe('resolveContactRef — telefone puro', () => {
  it('número de 13 dígitos → normaliza com sufixo', () => {
    assertJid(
      resolveContactRef('5511463755170'),
      '5511463755170@s.whatsapp.net',
      '5511463755170',
      false,
      '5511463755170'
    );
  });

  it('número de 8 dígitos (mínimo)', () => {
    assertJid(
      resolveContactRef('12345678'),
      '12345678@s.whatsapp.net',
      '12345678',
      false,
      '12345678' // raw = valor original, sem sufixo
    );
  });

  it('número de 15 dígitos (máximo)', () => {
    assertJid(
      resolveContactRef('123456789012345'),
      '123456789012345@s.whatsapp.net',
      '123456789012345',
      false,
      '123456789012345' // raw = valor original
    );
  });

  it('número com 7 dígitos → NÃO normaliza (muito curto)', () => {
    const ref = resolveContactRef('1234567');
    expect(ref?.kind).toBe('jid');
    if (ref?.kind === 'jid') {
      // Não adiciona sufixo, pois é curto demais para ser telefone
      expect(ref.remoteJid).toBe('1234567');
    }
  });

  it('número com 16 dígitos → NÃO normaliza (muito longo)', () => {
    const ref = resolveContactRef('1234567890123456');
    expect(ref?.kind).toBe('jid');
    if (ref?.kind === 'jid') {
      expect(ref.remoteJid).toBe('1234567890123456');
    }
  });
});

// ── Null / vazio ──────────────────────────────────────────────────────────────

describe('resolveContactRef — null / vazio', () => {
  it('null → null', () => {
    expect(resolveContactRef(null)).toBeNull();
  });

  it('undefined → null', () => {
    expect(resolveContactRef(undefined)).toBeNull();
  });

  it('string vazia → null', () => {
    expect(resolveContactRef('')).toBeNull();
  });

  it('apenas espaços → null', () => {
    expect(resolveContactRef('   ')).toBeNull();
  });
});

// ── Degradação segura ─────────────────────────────────────────────────────────

describe('resolveContactRef — degradação segura', () => {
  it('string arbitrária → jid (não lança exceção)', () => {
    const ref = resolveContactRef('not-a-thing');
    expect(ref?.kind).toBe('jid');
    if (ref?.kind === 'jid') {
      expect(ref.remoteJid).toBe('not-a-thing');
      expect(ref.phone).toBeNull(); // sem dígitos → null
      expect(ref.isGroup).toBe(false);
    }
  });

  it('SQL injection → jid (inerte)', () => {
    const ref = resolveContactRef("'; DROP TABLE contacts; --");
    expect(ref?.kind).toBe('jid');
    // Não quebra, apenas classifica como JID inválido
  });

  it('URL → jid (não confunde com UUID)', () => {
    const ref = resolveContactRef('https://example.com');
    expect(ref?.kind).toBe('jid');
  });
});

// ── Type guards ───────────────────────────────────────────────────────────────

describe('Type guards', () => {
  it('isUuidRef retorna true para kind=uuid', () => {
    const ref = resolveContactRef('550e8400-e29b-41d4-a716-446655440000');
    expect(isUuidRef(ref)).toBe(true);
    expect(isJidRef(ref)).toBe(false);
  });

  it('isJidRef retorna true para kind=jid', () => {
    const ref = resolveContactRef('551146375517@s.whatsapp.net');
    expect(isJidRef(ref)).toBe(true);
    expect(isUuidRef(ref)).toBe(false);
  });

  it('ambos retornam false para null', () => {
    expect(isUuidRef(null)).toBe(false);
    expect(isJidRef(null)).toBe(false);
  });
});

// ── contactRefToString ────────────────────────────────────────────────────────

describe('contactRefToString', () => {
  it('retorna raw para uuid', () => {
    expect(contactRefToString(resolveContactRef('550e8400-e29b-41d4-a716-446655440000'))).toBe(
      '550e8400-e29b-41d4-a716-446655440000'
    );
  });

  it('retorna raw para jid', () => {
    expect(contactRefToString(resolveContactRef('551146375517@s.whatsapp.net'))).toBe(
      '551146375517@s.whatsapp.net'
    );
  });

  it('retorna (null) para null', () => {
    expect(contactRefToString(null)).toBe('(null)');
  });
});

// ── Propriedade: idempotência ─────────────────────────────────────────────────

describe('resolveContactRef — idempotência', () => {
  const inputs = [
    '550e8400-e29b-41d4-a716-446655440000',
    '551146375517@s.whatsapp.net',
    '120363123456789@g.us',
    '551146375517',
    'not-a-thing',
    '',
  ];

  it.each(inputs)(
    'resolveContactRef(resolveContactRef(%s).raw) === resolveContactRef(%s)',
    (input) => {
      const first = resolveContactRef(input);
      if (!first) {
        expect(resolveContactRef(input)).toBeNull();
        return;
      }
      const second = resolveContactRef(first.raw);
      expect(second?.kind).toBe(first.kind);
      if (second && first) {
        expect(contactRefToString(second)).toBe(contactRefToString(first));
      }
    }
  );
});
