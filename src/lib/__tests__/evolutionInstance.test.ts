import { describe, expect, it } from 'vitest';
import { evolutionInstanceName, isUuidLike } from '../evolutionInstance';

// Contexto: incidente 2026-07-04 — passar o UUID interno (instance_id) como
// instanceName criou uma instância fantasma e sequestrou o pareamento da linha
// principal. Estes testes garantem que o resolver nunca devolve um UUID.

const WPP2_UUID = 'd8e07e44-1aac-45a2-a1d9-bebe1deeb355';

describe('isUuidLike', () => {
  it('reconhece UUID v4 minúsculo', () => {
    expect(isUuidLike(WPP2_UUID)).toBe(true);
  });

  it('reconhece UUID maiúsculo e com espaços nas pontas', () => {
    expect(isUuidLike(`  ${WPP2_UUID.toUpperCase()}  `)).toBe(true);
  });

  it('rejeita nomes de instância reais', () => {
    for (const name of ['wpp2', 'wpp_pink_test', 'comercial_01', 'financeiro']) {
      expect(isUuidLike(name)).toBe(false);
    }
  });

  it('rejeita null/undefined/vazio', () => {
    expect(isUuidLike(null)).toBe(false);
    expect(isUuidLike(undefined)).toBe(false);
    expect(isUuidLike('')).toBe(false);
  });

  it('rejeita quase-UUIDs (tamanho errado)', () => {
    expect(isUuidLike(WPP2_UUID.slice(0, -1))).toBe(false);
    expect(isUuidLike(`${WPP2_UUID}0`)).toBe(false);
  });
});

describe('evolutionInstanceName', () => {
  it('prefere instance_name quando presente', () => {
    expect(evolutionInstanceName({ instance_name: 'wpp2', instance_id: WPP2_UUID })).toBe('wpp2');
  });

  it('usa instance_id legado quando ele guarda o nome (linhas antigas)', () => {
    expect(evolutionInstanceName({ instance_name: null, instance_id: 'wpp2' })).toBe('wpp2');
  });

  it('NUNCA devolve UUID — cenário exato do incidente wpp2', () => {
    expect(evolutionInstanceName({ instance_name: null, instance_id: WPP2_UUID })).toBeNull();
    expect(evolutionInstanceName({ instance_id: WPP2_UUID })).toBeNull();
  });

  it('ignora instance_name que por engano contenha um UUID e cai no fallback', () => {
    expect(evolutionInstanceName({ instance_name: WPP2_UUID, instance_id: 'wpp2' })).toBe('wpp2');
  });

  it('devolve null quando não há nada utilizável', () => {
    expect(evolutionInstanceName({})).toBeNull();
    expect(evolutionInstanceName({ instance_name: '  ', instance_id: null })).toBeNull();
  });

  it('normaliza espaços ao redor do nome', () => {
    expect(evolutionInstanceName({ instance_name: '  wpp2  ' })).toBe('wpp2');
  });
});
