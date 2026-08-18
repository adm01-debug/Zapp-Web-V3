/**
 * E36 — CONTRATO DE TELEMETRIA DE FALLBACK DE FONTE (source_fallback).
 *
 * RED: `recordSourceFallback`/`getSourceSwitchEvents` NÃO existem em
 * `src/features/inbox/hooks/realtime/reconciliationTelemetry.ts` nesta
 * revisão (import falha = RED legítimo).
 *
 * Contrato (docs/adr/dual-path-inbox.md):
 *   - `recordSourceFallback(reason)` incrementa o counter `source_fallback`
 *     em `getReconciliationStats()` e registra um evento de troca de fonte
 *     { from: 'evo', to: 'zapp', reason, at }.
 *   - `getSourceSwitchEvents(limit?)` devolve os eventos recentes (ring
 *     buffer, cap 100), mais recentes por último.
 *   - `resetReconciliationStats()` zera counter E eventos.
 *
 * Estado é singleton de módulo — reset entre testes via beforeEach.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordSourceFallback,
  getReconciliationStats,
  getSourceSwitchEvents,
  resetReconciliationStats,
} from '../realtime/reconciliationTelemetry';

beforeEach(() => {
  resetReconciliationStats();
});

describe('recordSourceFallback — counter source_fallback', () => {
  it('estado inicial: sourceFallback = 0 e nenhum evento', () => {
    expect(getReconciliationStats().sourceFallback).toBe(0);
    expect(getSourceSwitchEvents()).toEqual([]);
  });

  it('incrementa sourceFallback por chamada', () => {
    recordSourceFallback('evo error: RPC failed');
    expect(getReconciliationStats().sourceFallback).toBe(1);
    recordSourceFallback('evo error: timeout');
    expect(getReconciliationStats().sourceFallback).toBe(2);
  });

  it('registra evento { from: "evo", to: "zapp", reason, at: number }', () => {
    recordSourceFallback('evo error: RPC failed');
    const [ev] = getSourceSwitchEvents(1);
    expect(ev.from).toBe('evo');
    expect(ev.to).toBe('zapp');
    expect(ev.reason).toBe('evo error: RPC failed');
    expect(typeof ev.at).toBe('number');
  });

  it('não mexe nos counters de reconciliação (total/byStrategy)', () => {
    recordSourceFallback('x');
    const s = getReconciliationStats();
    expect(s.total).toBe(0);
    expect(s.byStrategy.external_id).toBe(0);
  });

  it('ring buffer respeita limite custom e cap de 100', () => {
    for (let i = 0; i < 105; i++) recordSourceFallback(`reason-${i}`);
    expect(getSourceSwitchEvents(200)).toHaveLength(100);
    expect(getSourceSwitchEvents(3)).toHaveLength(3);
    expect(getSourceSwitchEvents(3)[2].reason).toBe('reason-104');
  });

  it('resetReconciliationStats zera counter e eventos', () => {
    recordSourceFallback('x');
    recordSourceFallback('y');
    resetReconciliationStats();
    expect(getReconciliationStats().sourceFallback).toBe(0);
    expect(getSourceSwitchEvents()).toEqual([]);
  });
});
