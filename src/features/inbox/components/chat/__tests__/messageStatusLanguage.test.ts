import { describe, it, expect } from 'vitest';
import {
  STATUS_LABEL_UNIFIED,
  STAGE_LABEL_UNIFIED,
  STAGE_INITIAL_UNIFIED,
  describeStatus,
  type StatusLevel,
} from '../messageStatusLanguage';

// ── STATUS_LABEL_UNIFIED ──────────────────────────────────────────────────────

describe('STATUS_LABEL_UNIFIED', () => {
  it('pending maps to "Enviando…"', () => {
    expect(STATUS_LABEL_UNIFIED.pending).toBe('Enviando…');
  });

  it('sending maps to "Enviando…"', () => {
    expect(STATUS_LABEL_UNIFIED.sending).toBe('Enviando…');
  });

  it('retrying maps to "Tentando reenviar…"', () => {
    expect(STATUS_LABEL_UNIFIED.retrying).toBe('Tentando reenviar…');
  });

  it('sent maps to "Enviada"', () => {
    expect(STATUS_LABEL_UNIFIED.sent).toBe('Enviada');
  });

  it('delivered maps to "Entregue"', () => {
    expect(STATUS_LABEL_UNIFIED.delivered).toBe('Entregue');
  });

  it('read maps to "Visualizada"', () => {
    expect(STATUS_LABEL_UNIFIED.read).toBe('Visualizada');
  });

  it('played maps to "Reproduzida"', () => {
    expect(STATUS_LABEL_UNIFIED.played).toBe('Reproduzida');
  });

  it('failed maps to "Falha no envio"', () => {
    expect(STATUS_LABEL_UNIFIED.failed).toBe('Falha no envio');
  });

  it('failed_auth maps to "Falha de autenticação"', () => {
    expect(STATUS_LABEL_UNIFIED.failed_auth).toBe('Falha de autenticação');
  });

  it('failed_retries maps to "Falhou após várias tentativas"', () => {
    expect(STATUS_LABEL_UNIFIED.failed_retries).toBe('Falhou após várias tentativas');
  });

  it('covers all StatusLevel values (exhaustive guard)', () => {
    const levels: StatusLevel[] = [
      'pending', 'sending', 'retrying', 'sent', 'delivered',
      'read', 'played', 'failed', 'failed_auth', 'failed_retries',
    ];
    for (const lvl of levels) {
      expect(typeof STATUS_LABEL_UNIFIED[lvl]).toBe('string');
      expect(STATUS_LABEL_UNIFIED[lvl].length).toBeGreaterThan(0);
    }
  });
});

// ── STAGE_LABEL_UNIFIED ───────────────────────────────────────────────────────

describe('STAGE_LABEL_UNIFIED', () => {
  it('sent → "Enviada"', () => {
    expect(STAGE_LABEL_UNIFIED.sent).toBe('Enviada');
  });

  it('delivered → "Entregue"', () => {
    expect(STAGE_LABEL_UNIFIED.delivered).toBe('Entregue');
  });

  it('read → "Visualizada"', () => {
    expect(STAGE_LABEL_UNIFIED.read).toBe('Visualizada');
  });
});

// ── STAGE_INITIAL_UNIFIED ─────────────────────────────────────────────────────

describe('STAGE_INITIAL_UNIFIED', () => {
  it('sent → "E"', () => {
    expect(STAGE_INITIAL_UNIFIED.sent).toBe('E');
  });

  it('delivered → "E"', () => {
    expect(STAGE_INITIAL_UNIFIED.delivered).toBe('E');
  });

  it('read → "V"', () => {
    expect(STAGE_INITIAL_UNIFIED.read).toBe('V');
  });
});

// ── describeStatus — outbound ─────────────────────────────────────────────────

describe('describeStatus — outbound direction', () => {
  it('"sent" outbound → "Enviada — saiu do dispositivo"', () => {
    expect(describeStatus('sent', 'outbound')).toBe('Enviada — saiu do dispositivo');
  });

  it('"delivered" outbound → "Entregue ao destinatário"', () => {
    expect(describeStatus('delivered', 'outbound')).toBe('Entregue ao destinatário');
  });

  it('"read" outbound → "Visualizada pelo destinatário"', () => {
    expect(describeStatus('read', 'outbound')).toBe('Visualizada pelo destinatário');
  });

  it('"played" outbound → "Reproduzida pelo destinatário"', () => {
    expect(describeStatus('played', 'outbound')).toBe('Reproduzida pelo destinatário');
  });
});

// ── describeStatus — inbound ──────────────────────────────────────────────────

describe('describeStatus — inbound direction', () => {
  it('"sent" inbound → "Enviada pelo contato"', () => {
    expect(describeStatus('sent', 'inbound')).toBe('Enviada pelo contato');
  });

  it('"delivered" inbound → "Entregue ao seu inbox"', () => {
    expect(describeStatus('delivered', 'inbound')).toBe('Entregue ao seu inbox');
  });

  it('"read" inbound → "Visualizada por você"', () => {
    expect(describeStatus('read', 'inbound')).toBe('Visualizada por você');
  });

  it('"played" inbound → "Reproduzida por você"', () => {
    expect(describeStatus('played', 'inbound')).toBe('Reproduzida por você');
  });
});

// ── describeStatus — default/fallback ────────────────────────────────────────

describe('describeStatus — fallback for non-explicit statuses', () => {
  it('"failed" falls back to STATUS_LABEL_UNIFIED value', () => {
    expect(describeStatus('failed', 'outbound')).toBe(STATUS_LABEL_UNIFIED.failed);
    expect(describeStatus('failed', 'inbound')).toBe(STATUS_LABEL_UNIFIED.failed);
  });

  it('"pending" falls back to STATUS_LABEL_UNIFIED value', () => {
    expect(describeStatus('pending', 'outbound')).toBe(STATUS_LABEL_UNIFIED.pending);
  });

  it('"retrying" falls back to STATUS_LABEL_UNIFIED value', () => {
    expect(describeStatus('retrying', 'inbound')).toBe(STATUS_LABEL_UNIFIED.retrying);
  });

  it('"failed_auth" falls back to STATUS_LABEL_UNIFIED value', () => {
    expect(describeStatus('failed_auth', 'outbound')).toBe(STATUS_LABEL_UNIFIED.failed_auth);
  });

  it('"failed_retries" falls back to STATUS_LABEL_UNIFIED value', () => {
    expect(describeStatus('failed_retries', 'inbound')).toBe(STATUS_LABEL_UNIFIED.failed_retries);
  });

  it('fallback always returns a non-empty string', () => {
    const fallbackLevels: StatusLevel[] = ['pending', 'sending', 'retrying', 'failed', 'failed_auth', 'failed_retries'];
    for (const lvl of fallbackLevels) {
      expect(describeStatus(lvl, 'outbound').length).toBeGreaterThan(0);
    }
  });
});
