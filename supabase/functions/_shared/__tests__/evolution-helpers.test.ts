// Guarda 1 — normalizePhone rejeita LIDs e PNs falsos.
// Causa raiz dos 34.827 fake_jids: '123456789012345@lid' (ou 15 dígitos
// mascarados de @s.whatsapp.net) era aceito como telefone.
//
// Rodar: bunx vitest run supabase/functions/_shared/__tests__/evolution-helpers.test.ts

import { describe, expect, it } from 'vitest';
import { normalizePhone } from '../evolution-helpers.ts';

describe('normalizePhone — Guarda 1 (LID / fake_jids)', () => {
  it('mantém PN válido com @s.whatsapp.net', () => {
    expect(normalizePhone('5511998765432@s.whatsapp.net')).toBe('5511998765432');
  });

  it('rejeita @lid (LID puro)', () => {
    expect(normalizePhone('123456789012345@lid')).toBeNull();
  });

  it('mantém PN com sufixo de device (:N)', () => {
    expect(normalizePhone('19999999999:2@s.whatsapp.net')).toBe('19999999999');
  });

  it('rejeita @lid com sufixo de device (:N)', () => {
    expect(normalizePhone('123456789012345:3@lid')).toBeNull();
  });

  it('rejeita PN curto (menos de 10 dígitos)', () => {
    expect(normalizePhone('5511')).toBeNull();
  });

  it('rejeita 15 dígitos mascarados de @s.whatsapp.net (PN falso / comprimento de LID)', () => {
    expect(normalizePhone('123456789012345@s.whatsapp.net')).toBeNull();
  });

  it('mantém PN de 14 dígitos', () => {
    expect(normalizePhone('55119987654321@s.whatsapp.net')).toBe('55119987654321');
  });

  it('mantém compat: undefined/empty retornam null', () => {
    expect(normalizePhone(undefined)).toBeNull();
    expect(normalizePhone('')).toBeNull();
  });
});
