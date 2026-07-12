import { describe, it, expect } from 'vitest';
import {
  columnMap,
  resolvePhysicalColumn,
  whatsappConnectionsMap,
  messagesMap,
} from '../columnMap';
import { normalizeConnection, normalizeContact, evolutionInstanceName } from '../rowNormalizers';

describe('columnMap.select()', () => {
  it('gera select canônico com todas as colunas físicas', () => {
    const sel = whatsappConnectionsMap.select();
    expect(sel).toContain('id');
    expect(sel).toContain('name');
    expect(sel).not.toContain('instance_name'); // alias legado nunca vai pro select
  });

  it('inclui embeds sob demanda', () => {
    const sel = messagesMap.select({ include: ['contact'] });
    expect(sel).toContain('contact:contact_id');
  });

  it('restringe a subset via `only`', () => {
    const sel = whatsappConnectionsMap.select({ only: ['id', 'name'] });
    expect(sel).toBe('id, name');
  });
});

describe('resolvePhysicalColumn', () => {
  it('resolve canônico', () => {
    expect(resolvePhysicalColumn('whatsapp_connections', 'name')).toBe('name');
  });
  it('resolve alias legado para canônico', () => {
    expect(resolvePhysicalColumn('whatsapp_connections', 'instance_name')).toBe('name');
    expect(resolvePhysicalColumn('contacts', 'push_name')).toBe('name');
  });
  it('devolve undefined para coluna inexistente', () => {
    expect(resolvePhysicalColumn('whatsapp_connections', 'nope')).toBeUndefined();
  });
});

describe('normalizeConnection', () => {
  it('aceita shape canônico', () => {
    const out = normalizeConnection({ id: 'c1', name: 'atendimento' });
    expect(out?.name).toBe('atendimento');
  });
  it('aceita alias legado instance_name', () => {
    const out = normalizeConnection({ id: 'c1', instance_name: 'legacy-name' });
    expect(out?.name).toBe('legacy-name');
  });
  it('aplica default quando ambos ausentes', () => {
    const out = normalizeConnection({ id: 'c1' });
    expect(out?.name).toBe(columnMap.whatsapp_connections.columns.name.default);
  });
  it('rejeita linha sem id', () => {
    expect(normalizeConnection({ name: 'x' })).toBeNull();
  });
});

describe('normalizeContact', () => {
  it('aceita push_name como alias de name', () => {
    const out = normalizeContact({ id: 'x', push_name: 'João' });
    expect(out?.name).toBe('João');
  });
});

describe('evolutionInstanceName', () => {
  it('prefere name canônico', () => {
    expect(evolutionInstanceName({ name: 'atendimento', instance_id: 'uuid-x' })).toBe('atendimento');
  });
  it('cai em instance_name (alias legado)', () => {
    expect(evolutionInstanceName({ instance_name: 'legacy' })).toBe('legacy');
  });
  it('recusa UUID em qualquer campo', () => {
    expect(
      evolutionInstanceName({
        name: 'd8e07e44-1234-4567-8901-234567890abc',
        instance_id: 'd8e07e44-1234-4567-8901-234567890abc',
      }),
    ).toBeNull();
  });
  it('null quando entrada vazia', () => {
    expect(evolutionInstanceName(null)).toBeNull();
  });
});
