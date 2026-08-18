/**
 * E70 — Onboarding acessível: `filterAvailableSteps` valida seletores DOM.
 *
 * Contrato (subetapa 70.2): steps cujo seletor NÃO existe no DOM são PULADOS
 * com aviso (warn) — o tour não quebra e progride apenas pelos steps
 * disponíveis. Ordem preservada. SSR-safe (sem `document` → steps intactos).
 *
 * RED esperado ANTES da implementação: `filterAvailableSteps` não existe em
 * defaultTourSteps.ts → TypeError "not a function" em todos os testes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { filterAvailableSteps, DEFAULT_ONBOARDING_STEPS } from '../defaultTourSteps';

const warnMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ warn: warnMock, info: vi.fn(), debug: vi.fn(), error: vi.fn() }),
}));

function seedDom(ids: string[]) {
  document.body.innerHTML = ids.map((id) => `<div data-tour="${id}"></div>`).join('');
}

describe('filterAvailableSteps — validação de seletores (E70)', () => {
  beforeEach(() => {
    warnMock.mockReset();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('todos os seletores presentes: mantém todos os steps na ordem original', () => {
    seedDom(['inbox', 'contacts', 'dashboard', 'queues', 'notifications', 'theme']);
    const result = filterAvailableSteps(DEFAULT_ONBOARDING_STEPS);
    expect(result.map((s) => s.id)).toEqual([
      'inbox',
      'contacts',
      'dashboard',
      'queues',
      'notifications',
      'theme',
    ]);
    expect(warnMock).not.toHaveBeenCalled();
  });

  it('seletor ausente é PULADO com aviso — o tour não quebra', () => {
    seedDom(['inbox', 'dashboard']);
    const result = filterAvailableSteps(DEFAULT_ONBOARDING_STEPS);
    expect(result.map((s) => s.id)).toEqual(['inbox', 'dashboard']);
    expect(warnMock).toHaveBeenCalledTimes(1);
    const warned = String(warnMock.mock.calls[0][0]);
    expect(warned).toContain('4');
    expect(warned).toContain('contacts');
    expect(warned).toContain('theme');
  });

  it('nenhum seletor presente: retorna lista vazia (tour seguro, nada a mostrar)', () => {
    document.body.innerHTML = '<div>sem tour</div>';
    const result = filterAvailableSteps(DEFAULT_ONBOARDING_STEPS);
    expect(result).toEqual([]);
    expect(warnMock).toHaveBeenCalled();
  });

  it('ordem relativa preservada quando só alguns existem', () => {
    seedDom(['theme', 'inbox']);
    const result = filterAvailableSteps(DEFAULT_ONBOARDING_STEPS);
    // ordem do array original: inbox ... theme — theme vem antes de inbox no DOM, mas a ordem dos steps vale
    expect(result.map((s) => s.id)).toEqual(['inbox', 'theme']);
  });

  it('seletor inválido (sintaxe) é tratado como ausente, sem lançar', () => {
    const steps = [
      { id: 'ok', target: '[data-tour="ok"]', title: 'OK', description: 'd' },
      { id: 'bad', target: '!!!selector-invalido', title: 'Bad', description: 'd' },
    ];
    seedDom(['ok']);
    const result = filterAvailableSteps(steps);
    expect(result.map((s) => s.id)).toEqual(['ok']);
    expect(warnMock).toHaveBeenCalled();
  });

  it('steps customizados com alvo presente são mantidos', () => {
    document.body.innerHTML = '<div id="a"></div><div id="b"></div>';
    const steps = [
      { id: 'a', target: '#a', title: 'A', description: 'Desc A' },
      { id: 'b', target: '#b', title: 'B', description: 'Desc B' },
      { id: 'c', target: '#c', title: 'C', description: 'Desc C' },
    ];
    const result = filterAvailableSteps(steps);
    expect(result.map((s) => s.id)).toEqual(['a', 'b']);
  });
});
