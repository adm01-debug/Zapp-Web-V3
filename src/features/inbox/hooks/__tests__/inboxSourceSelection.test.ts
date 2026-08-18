/**
 * E36 — CONTRATO DE SELEÇÃO DE FONTE (dual-path zapp×evo) — NÚCLEO PURO.
 *
 * RED contra `src/features/inbox/hooks/inboxSourceConfig.ts` — módulo ainda
 * NÃO EXISTE nesta revisão (import falha = sinal RED legítimo).
 *
 * Contrato futuro (ver docs/adr/dual-path-inbox.md):
 *   - `resolveInboxSourceMode(envValue)` — resolve o modo de fonte a partir da
 *     configuração (VITE_INBOX_SOURCE_MODE). Valores válidos: 'evo' | 'zapp' |
 *     'auto' (default). Qualquer outro valor/ausência → 'auto'.
 *   - `selectInboxSourcePaths(mode, evoAvailable)` — tabela de decisão pura:
 *       mode='evo'  → evo ativo, legado desligado, sem fallback.
 *       mode='zapp' → legado ativo, evo desligado, sem fallback.
 *       mode='auto' + evoAvailable=true  → evo ativo, sem fallback.
 *       mode='auto' + evoAvailable=false → legado ativo, fallbackEngaged=true.
 *   - Constantes do contrato: INBOX_SOURCE_PAGE_SIZE=50 (rpc_list_messages_lite
 *     p_limit), SOURCE_FALLBACK_COUNTER='source_fallback' (counter de telemetria
 *     em reconciliationTelemetry), SOURCE_SWITCH_EVENT='source_switch',
 *     INBOX_SOURCE_MODE_ENV='VITE_INBOX_SOURCE_MODE'.
 *
 * Migração gradual: 'auto' é o default — quem não configurar nada continua
 * usando evo quando disponível e cai para o legado zapp.messages apenas quando
 * o path evo falha (com telemetria). Sem migração de dados nesta fase.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveInboxSourceMode,
  selectInboxSourcePaths,
  INBOX_SOURCE_PAGE_SIZE,
  SOURCE_FALLBACK_COUNTER,
  SOURCE_SWITCH_EVENT,
  INBOX_SOURCE_MODE_ENV,
  type InboxSourceMode,
} from '../inboxSourceConfig';

describe('resolveInboxSourceMode — seleção por configuração', () => {
  it('sem configuração (undefined) → auto (default)', () => {
    expect(resolveInboxSourceMode(undefined)).toBe('auto');
  });

  it('string vazia → auto', () => {
    expect(resolveInboxSourceMode('')).toBe('auto');
  });

  it('"auto" explícito → auto', () => {
    expect(resolveInboxSourceMode('auto')).toBe('auto');
  });

  it('"evo" → evo', () => {
    expect(resolveInboxSourceMode('evo')).toBe('evo');
  });

  it('"zapp" → zapp', () => {
    expect(resolveInboxSourceMode('zapp')).toBe('zapp');
  });

  it('valor inválido (ex.: "EVO", "banana") → auto (degradação segura)', () => {
    expect(resolveInboxSourceMode('EVO')).toBe('auto');
    expect(resolveInboxSourceMode('banana')).toBe('auto');
    expect(resolveInboxSourceMode('  ')).toBe('auto');
  });
});

describe('selectInboxSourcePaths — tabela de decisão (zapp vs evo)', () => {
  it('mode=evo + evo disponível → evo ativo, legado desligado, sem fallback', () => {
    expect(selectInboxSourcePaths('evo', true)).toEqual({
      useEvo: true,
      useLegacy: false,
      fallbackEngaged: false,
    });
  });

  it('mode=evo + evo INDISPONÍVEL → evo forçado permanece (sem fallback automático em modo forçado)', () => {
    expect(selectInboxSourcePaths('evo', false)).toEqual({
      useEvo: true,
      useLegacy: false,
      fallbackEngaged: false,
    });
  });

  it('mode=zapp → legado ativo, evo desligado, sem fallback (independe da disponibilidade)', () => {
    expect(selectInboxSourcePaths('zapp', true)).toEqual({
      useEvo: false,
      useLegacy: true,
      fallbackEngaged: false,
    });
    expect(selectInboxSourcePaths('zapp', false)).toEqual({
      useEvo: false,
      useLegacy: true,
      fallbackEngaged: false,
    });
  });

  it('mode=auto + evo disponível → evo ativo, sem fallback', () => {
    expect(selectInboxSourcePaths('auto', true)).toEqual({
      useEvo: true,
      useLegacy: false,
      fallbackEngaged: false,
    });
  });

  it('mode=auto + evo INDISPONÍVEL → fallback para legado (fallbackEngaged=true)', () => {
    expect(selectInboxSourcePaths('auto', false)).toEqual({
      useEvo: false,
      useLegacy: true,
      fallbackEngaged: true,
    });
  });
});

describe('constantes do contrato E36', () => {
  it('PAGE_SIZE = 50 (rpc_list_messages_lite p_limit)', () => {
    expect(INBOX_SOURCE_PAGE_SIZE).toBe(50);
  });

  it('counter de telemetria = "source_fallback"', () => {
    expect(SOURCE_FALLBACK_COUNTER).toBe('source_fallback');
  });

  it('evento de telemetria = "source_switch"', () => {
    expect(SOURCE_SWITCH_EVENT).toBe('source_switch');
  });

  it('variável de ambiente = "VITE_INBOX_SOURCE_MODE"', () => {
    expect(INBOX_SOURCE_MODE_ENV).toBe('VITE_INBOX_SOURCE_MODE');
  });

  it('InboxSourceMode admite exatamente evo | zapp | auto', () => {
    // Compile-time: atribuições inválidas falham no tsc; esta linha só roda.
    const modes: InboxSourceMode[] = ['evo', 'zapp', 'auto'];
    expect(modes).toHaveLength(3);
  });
});
