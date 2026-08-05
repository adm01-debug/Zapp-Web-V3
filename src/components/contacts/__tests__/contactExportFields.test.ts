/**
 * contactExportFields.test.ts — CONTATOS-12: geração de CSV (campos, escaping,
 * BOM, nome de arquivo). Funções puras — sem mock de Supabase.
 */
import { describe, it, expect } from 'vitest';
import {
  buildContactsCsv,
  buildExportFileName,
  EXPORT_FIELDS,
  EXPORT_DEFAULT_KEYS,
} from '../contactExportFields';

describe('buildContactsCsv (CONTATOS-12)', () => {
  const contacts = [
    {
      name: 'João Silva',
      surname: 'Silva',
      nickname: null,
      phone: '5511999998888',
      email: 'joao@example.com',
      company: 'ACME Ltda',
      job_title: 'Gerente',
      contact_type: 'cliente',
      tags: ['vip', 'sp'],
      created_at: '2026-07-01T10:00:00.000Z',
    },
    {
      name: 'Maria, "A" & Cia',
      surname: null,
      nickname: 'Mari',
      phone: '5511988887777',
      email: 'maria@example.com',
      company: null,
      job_title: null,
      contact_type: 'lead',
      tags: [],
      created_at: null,
    },
  ];

  it('usa todos os campos por padrão (ordem de EXPORT_FIELDS)', () => {
    const csv = buildContactsCsv({ fields: EXPORT_DEFAULT_KEYS, contacts });
    const lines = csv.replace(/^\uFEFF/, '').split('\n');
    expect(lines[0]).toBe(
      'Nome,Sobrenome,Apelido,Telefone,E-mail,Empresa,Cargo,Tipo,Tags,Criado em'
    );
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('João Silva');
    expect(lines[1]).toContain('01/07/2026');
  });

  it('escapa vírgulas, aspas e quebras de linha', () => {
    const csv = buildContactsCsv({ fields: ['name'], contacts });
    expect(csv).toContain('"Maria, ""A"" & Cia"');
  });

  it('respeita a seleção parcial de campos', () => {
    const csv = buildContactsCsv({ fields: ['name', 'phone'], contacts });
    const lines = csv.replace(/^\uFEFF/, '').split('\n');
    expect(lines[0]).toBe('Nome,Telefone');
    expect(lines[1]).toBe('João Silva,5511999998888');
    expect(lines[1]).not.toContain('ACME');
  });

  it('inclui BOM UTF-8 para Excel', () => {
    const csv = buildContactsCsv({ fields: ['name'], contacts });
    expect(csv.startsWith('\uFEFF')).toBe(true);
  });

  it('ignora chaves desconhecidas sem quebrar', () => {
    const csv = buildContactsCsv({ fields: ['name', 'campo_inexistente'], contacts });
    const lines = csv.replace(/^\uFEFF/, '').split('\n');
    expect(lines[0]).toBe('Nome');
    expect(lines[1]).toBe('João Silva');
  });
});

describe('buildExportFileName (CONTATOS-12)', () => {
  it('formata data+hora+contagem', () => {
    const name = buildExportFileName(42, new Date('2026-08-04T15:30:00'));
    expect(name).toBe('contatos_2026-08-04_1530_42.csv');
  });
});

describe('EXPORT_FIELDS (CONTATOS-12)', () => {
  it('expõe os 10 campos documentados', () => {
    expect(EXPORT_FIELDS.map((f) => f.key)).toEqual([
      'name', 'surname', 'nickname', 'phone', 'email', 'company',
      'job_title', 'contact_type', 'tags', 'created_at',
    ]);
  });
});
