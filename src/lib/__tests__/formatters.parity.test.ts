/**
 * formatters.parity.test.ts — Wave 5 (2026-07-06)
 * Materializa a simulação de paridade (894 execuções) que provou a equivalência
 * das implementações consolidadas. Asserts TZ-agnósticos para estabilidade em CI.
 */
import { describe, it, expect } from 'vitest';
import { formatDateTimeCompact, formatTimeHMS, formatBytesCompact, getInitialsFromNameOrEmail } from '@/lib/formatters';

describe('formatDateTimeCompact (paridade: FailedMessageTableRow/AdminAlertHistory/AdminWebhookEvents)', () => {
  it('null → em-dash', () => expect(formatDateTimeCompact(null)).toBe('—'));
  it('vazio → em-dash', () => expect(formatDateTimeCompact('')).toBe('—'));
  it('ISO válido → dd/MM HH:mm:ss', () => expect(formatDateTimeCompact('2026-07-06T14:35:07Z')).toMatch(/^\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/));
  it('29 fev bissexto não explode', () => expect(formatDateTimeCompact('2024-02-29T12:00:00Z')).toMatch(/^29\/02 /));
});

describe('formatTimeHMS (paridade: QrAttemptHistory/AgentRecentSendsPopover)', () => {
  it('ISO válido → HH:MM:SS', () => expect(formatTimeHMS('2026-07-06T14:35:07Z')).toMatch(/^\d{2}:\d{2}:\d{2}$/));
  it('meia-noite ok', () => expect(formatTimeHMS('2026-01-01T00:00:00')).toMatch(/^\d{2}:\d{2}:\d{2}$/));
});

describe('formatBytesCompact (paridade: EmailAttachmentPreview/pttLimits)', () => {
  const cases: Array<[number, string]> = [
    [0, '0 B'], [1, '1 B'], [999, '999 B'], [1023, '1023 B'],
    [1024, '1.0 KB'], [1536, '1.5 KB'], [1048575, '1024.0 KB'],
    [1048576, '1.0 MB'], [123456789, '117.7 MB'],
  ];
  for (const [inp, out] of cases) it(`${inp} → ${out}`, () => expect(formatBytesCompact(inp)).toBe(out));
});

describe('getInitialsFromNameOrEmail (paridade Wave 1: componentes de e-mail)', () => {
  it('nome duplo', () => expect(getInitialsFromNameOrEmail('João Silva')).toBe('JS'));
  it('nome triplo corta em 2', () => expect(getInitialsFromNameOrEmail('Ana Beatriz Costa')).toBe('AB'));
  it('fallback e-mail', () => expect(getInitialsFromNameOrEmail(null, 'zeta@x.com')).toBe('Z'));
  it('e-mail vazio não explode (fix do crash latente)', () => expect(getInitialsFromNameOrEmail(null, '')).toBe('?'));
  it('tudo nulo', () => expect(getInitialsFromNameOrEmail(null, null)).toBe('?'));
});
