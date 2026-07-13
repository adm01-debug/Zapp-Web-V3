import { describe, it, expect } from 'vitest';
import {
  statusConfig,
  sentimentConfig,
  urgencyConfig,
  departmentConfig,
  churnConfig,
  performanceLabels,
} from '../analysisConfigs';

// ── statusConfig ──────────────────────────────────────────────────────────────

describe('statusConfig', () => {
  const EXPECTED_KEYS = ['resolvido', 'pendente', 'aguardando_cliente', 'aguardando_atendente', 'escalado'];

  it('has exactly 5 keys', () => {
    expect(Object.keys(statusConfig)).toHaveLength(5);
  });

  it.each(EXPECTED_KEYS)('has key "%s"', (key) => {
    expect(statusConfig[key]).toBeDefined();
  });

  it.each(EXPECTED_KEYS)('"%s" has a non-empty label', (key) => {
    expect(statusConfig[key].label.length).toBeGreaterThan(0);
  });

  it.each(EXPECTED_KEYS)('"%s" has a truthy icon', (key) => {
    expect(statusConfig[key].icon).toBeTruthy();
  });

  it.each(EXPECTED_KEYS)('"%s" has a non-empty className', (key) => {
    expect(statusConfig[key].className.length).toBeGreaterThan(0);
  });

  it('"resolvido" label is "Resolvido"', () => {
    expect(statusConfig.resolvido.label).toBe('Resolvido');
  });

  it('"escalado" className contains destructive', () => {
    expect(statusConfig.escalado.className).toContain('destructive');
  });

  it('"resolvido" className contains success', () => {
    expect(statusConfig.resolvido.className).toContain('success');
  });
});

// ── sentimentConfig ───────────────────────────────────────────────────────────

describe('sentimentConfig', () => {
  const EXPECTED_KEYS = ['positivo', 'neutro', 'negativo', 'critico'];

  it('has exactly 4 keys', () => {
    expect(Object.keys(sentimentConfig)).toHaveLength(4);
  });

  it.each(EXPECTED_KEYS)('has key "%s"', (key) => {
    expect(sentimentConfig[key]).toBeDefined();
  });

  it.each(EXPECTED_KEYS)('"%s" has a non-empty label', (key) => {
    expect(sentimentConfig[key].label.length).toBeGreaterThan(0);
  });

  it.each(EXPECTED_KEYS)('"%s" has a truthy icon', (key) => {
    expect(sentimentConfig[key].icon).toBeTruthy();
  });

  it.each(EXPECTED_KEYS)('"%s" has a non-empty color string', (key) => {
    expect(sentimentConfig[key].color.length).toBeGreaterThan(0);
  });

  it.each(EXPECTED_KEYS)('"%s" has a non-empty bg string', (key) => {
    expect(sentimentConfig[key].bg.length).toBeGreaterThan(0);
  });

  it('"positivo" label is "Positivo"', () => {
    expect(sentimentConfig.positivo.label).toBe('Positivo');
  });

  it('"positivo" color contains success', () => {
    expect(sentimentConfig.positivo.color).toContain('success');
  });

  it('"negativo" color contains destructive', () => {
    expect(sentimentConfig.negativo.color).toContain('destructive');
  });

  it('"critico" color contains destructive', () => {
    expect(sentimentConfig.critico.color).toContain('destructive');
  });
});

// ── urgencyConfig ─────────────────────────────────────────────────────────────

describe('urgencyConfig', () => {
  const EXPECTED_KEYS = ['baixa', 'media', 'alta', 'critica'];

  it('has exactly 4 keys', () => {
    expect(Object.keys(urgencyConfig)).toHaveLength(4);
  });

  it.each(EXPECTED_KEYS)('has key "%s"', (key) => {
    expect(urgencyConfig[key]).toBeDefined();
  });

  it.each(EXPECTED_KEYS)('"%s" has a non-empty label', (key) => {
    expect(urgencyConfig[key].label.length).toBeGreaterThan(0);
  });

  it.each(EXPECTED_KEYS)('"%s" has a non-empty className', (key) => {
    expect(urgencyConfig[key].className.length).toBeGreaterThan(0);
  });

  it('"baixa" className contains success', () => {
    expect(urgencyConfig.baixa.className).toContain('success');
  });

  it('"alta" className contains destructive', () => {
    expect(urgencyConfig.alta.className).toContain('destructive');
  });

  it('"critica" className contains animate-pulse', () => {
    expect(urgencyConfig.critica.className).toContain('animate-pulse');
  });
});

// ── departmentConfig ──────────────────────────────────────────────────────────

describe('departmentConfig', () => {
  const EXPECTED_KEYS = ['vendas', 'compras', 'logistica', 'rh', 'financeiro', 'sac', 'outros'];

  it('has exactly 7 keys', () => {
    expect(Object.keys(departmentConfig)).toHaveLength(7);
  });

  it.each(EXPECTED_KEYS)('has key "%s"', (key) => {
    expect(departmentConfig[key]).toBeDefined();
  });

  it.each(EXPECTED_KEYS)('"%s" has a non-empty label', (key) => {
    expect(departmentConfig[key].label.length).toBeGreaterThan(0);
  });

  it.each(EXPECTED_KEYS)('"%s" has a non-empty emoji', (key) => {
    expect(departmentConfig[key].emoji.length).toBeGreaterThan(0);
  });

  it.each(EXPECTED_KEYS)('"%s" has a non-empty color', (key) => {
    expect(departmentConfig[key].color.length).toBeGreaterThan(0);
  });

  it('"vendas" label is "Vendas"', () => {
    expect(departmentConfig.vendas.label).toBe('Vendas');
  });

  it('"sac" emoji is 🎧', () => {
    expect(departmentConfig.sac.emoji).toBe('🎧');
  });
});

// ── churnConfig ───────────────────────────────────────────────────────────────

describe('churnConfig', () => {
  const EXPECTED_KEYS = ['low', 'medium', 'high'];

  it('has exactly 3 keys', () => {
    expect(Object.keys(churnConfig)).toHaveLength(3);
  });

  it.each(EXPECTED_KEYS)('has key "%s"', (key) => {
    expect(churnConfig[key]).toBeDefined();
  });

  it.each(EXPECTED_KEYS)('"%s" has a non-empty label', (key) => {
    expect(churnConfig[key].label.length).toBeGreaterThan(0);
  });

  it.each(EXPECTED_KEYS)('"%s" has a non-empty color', (key) => {
    expect(churnConfig[key].color.length).toBeGreaterThan(0);
  });

  it.each(EXPECTED_KEYS)('"%s" has a truthy icon', (key) => {
    expect(churnConfig[key].icon).toBeTruthy();
  });

  it('"low" color contains success', () => {
    expect(churnConfig.low.color).toContain('success');
  });

  it('"high" color contains destructive', () => {
    expect(churnConfig.high.color).toContain('destructive');
  });
});

// ── performanceLabels ─────────────────────────────────────────────────────────

describe('performanceLabels', () => {
  const EXPECTED_KEYS = ['empathy', 'clarity', 'efficiency', 'knowledge'];

  it('has exactly 4 keys', () => {
    expect(Object.keys(performanceLabels)).toHaveLength(4);
  });

  it.each(EXPECTED_KEYS)('has key "%s"', (key) => {
    expect(performanceLabels[key]).toBeDefined();
  });

  it.each(EXPECTED_KEYS)('"%s" has a non-empty label', (key) => {
    expect(performanceLabels[key].label.length).toBeGreaterThan(0);
  });

  it.each(EXPECTED_KEYS)('"%s" has a truthy icon', (key) => {
    expect(performanceLabels[key].icon).toBeTruthy();
  });

  it('"empathy" label is "Empatia"', () => {
    expect(performanceLabels.empathy.label).toBe('Empatia');
  });

  it('"efficiency" label is "Eficiência"', () => {
    expect(performanceLabels.efficiency.label).toBe('Eficiência');
  });
});
