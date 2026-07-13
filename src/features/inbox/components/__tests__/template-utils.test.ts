import { describe, it, expect } from 'vitest';
import {
  extractVariables,
  replaceVariables,
  AVAILABLE_VARIABLES,
} from '../template-utils';

// ── AVAILABLE_VARIABLES ───────────────────────────────────────────────────────

describe('AVAILABLE_VARIABLES', () => {
  it('contains at least one entry', () => {
    expect(AVAILABLE_VARIABLES.length).toBeGreaterThan(0);
  });

  it('every variable has a non-empty key', () => {
    AVAILABLE_VARIABLES.forEach((v) => {
      expect(v.key.length).toBeGreaterThan(0);
    });
  });

  it('every variable has a non-empty label', () => {
    AVAILABLE_VARIABLES.forEach((v) => {
      expect(v.label.length).toBeGreaterThan(0);
    });
  });

  it('every variable has a non-empty example', () => {
    AVAILABLE_VARIABLES.forEach((v) => {
      expect(v.example.length).toBeGreaterThan(0);
    });
  });

  it('includes "nome" variable', () => {
    expect(AVAILABLE_VARIABLES.some((v) => v.key === 'nome')).toBe(true);
  });

  it('includes "saudacao" variable', () => {
    expect(AVAILABLE_VARIABLES.some((v) => v.key === 'saudacao')).toBe(true);
  });

  it('includes "protocolo" variable', () => {
    expect(AVAILABLE_VARIABLES.some((v) => v.key === 'protocolo')).toBe(true);
  });
});

// ── extractVariables ──────────────────────────────────────────────────────────

describe('extractVariables — empty and no-variable content', () => {
  it('returns empty array for empty string', () => {
    expect(extractVariables('')).toEqual([]);
  });

  it('returns empty array for text without {{...}} patterns', () => {
    expect(extractVariables('Hello world!')).toEqual([]);
  });

  it('returns empty array for incomplete placeholder "{name}"', () => {
    expect(extractVariables('{name}')).toEqual([]);
  });
});

describe('extractVariables — single variable', () => {
  it('extracts a single variable', () => {
    expect(extractVariables('Olá {{nome}}')).toEqual(['nome']);
  });

  it('normalizes key to lowercase', () => {
    expect(extractVariables('{{NOME}}')).toEqual(['nome']);
  });

  it('normalizes mixed-case key to lowercase', () => {
    expect(extractVariables('{{Primeiro_Nome}}')).toEqual(['primeiro_nome']);
  });

  it('strips {{ and }} delimiters from result', () => {
    const result = extractVariables('{{empresa}}');
    expect(result[0]).not.toContain('{');
    expect(result[0]).not.toContain('}');
  });
});

describe('extractVariables — multiple variables', () => {
  it('extracts multiple distinct variables in order', () => {
    const result = extractVariables('{{nome}} é de {{empresa}}');
    expect(result).toContain('nome');
    expect(result).toContain('empresa');
  });

  it('deduplicates repeated variables', () => {
    const result = extractVariables('{{nome}} {{nome}} {{nome}}');
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('nome');
  });

  it('deduplicates across case variants', () => {
    const result = extractVariables('{{nome}} {{NOME}}');
    expect(result).toHaveLength(1);
  });

  it('handles all AVAILABLE_VARIABLES keys inline', () => {
    const template = AVAILABLE_VARIABLES.map((v) => `{{${v.key}}}`).join(' ');
    const result = extractVariables(template);
    expect(result).toHaveLength(AVAILABLE_VARIABLES.length);
    AVAILABLE_VARIABLES.forEach((v) => {
      expect(result).toContain(v.key);
    });
  });
});

// ── replaceVariables ──────────────────────────────────────────────────────────

describe('replaceVariables — pass-through', () => {
  it('returns content unchanged when no placeholders present', () => {
    expect(replaceVariables('Hello world')).toBe('Hello world');
  });

  it('returns empty string when content is empty', () => {
    expect(replaceVariables('')).toBe('');
  });
});

describe('replaceVariables — contactData substitution', () => {
  it('replaces {{nome}} with contact name', () => {
    const result = replaceVariables('Olá {{nome}}', { name: 'Maria' });
    expect(result).toBe('Olá Maria');
  });

  it('replaces {{primeiro_nome}} with first word of name', () => {
    const result = replaceVariables('Oi {{primeiro_nome}}!', { name: 'João Silva' });
    expect(result).toBe('Oi João!');
  });

  it('replaces {{empresa}} with company', () => {
    const result = replaceVariables('Empresa: {{empresa}}', { company: 'ACME' });
    expect(result).toBe('Empresa: ACME');
  });

  it('replaces {{cargo}} with job_title', () => {
    const result = replaceVariables('Cargo: {{cargo}}', { job_title: 'Diretor' });
    expect(result).toBe('Cargo: Diretor');
  });

  it('leaves placeholder empty when name is not provided', () => {
    const result = replaceVariables('{{nome}}', {});
    expect(result).toBe('');
  });
});

describe('replaceVariables — customValues override', () => {
  it('customValues overrides default contactData mapping', () => {
    const result = replaceVariables('{{nome}}', { name: 'João' }, { nome: 'Override' });
    expect(result).toBe('Override');
  });

  it('customValues can substitute unknown keys', () => {
    const result = replaceVariables('{{custom_key}}', {}, { custom_key: 'hello' });
    expect(result).toBe('hello');
  });

  it('replaces multiple distinct customValues in one pass', () => {
    const result = replaceVariables('{{a}} e {{b}}', {}, { a: 'foo', b: 'bar' });
    expect(result).toBe('foo e bar');
  });
});

describe('replaceVariables — saudacao default', () => {
  it('replaces {{saudacao}} with a non-empty greeting string', () => {
    const result = replaceVariables('{{saudacao}}!');
    expect(result).toMatch(/^(Bom dia|Boa tarde|Boa noite)!$/);
  });
});

describe('replaceVariables — protocolo default', () => {
  it('replaces {{protocolo}} with a string starting with #', () => {
    const result = replaceVariables('{{protocolo}}');
    expect(result.startsWith('#')).toBe(true);
  });

  it('protocolo has numeric content after #', () => {
    const result = replaceVariables('{{protocolo}}');
    expect(/^#\d+$/.test(result)).toBe(true);
  });
});

describe('replaceVariables — data_atual default', () => {
  it('replaces {{data_atual}} with a date string in pt-BR format', () => {
    const result = replaceVariables('{{data_atual}}');
    // pt-BR format: dd/mm/yyyy
    expect(result).toMatch(/^\d{1,2}\/\d{1,2}\/\d{4}$/);
  });
});

describe('replaceVariables — atendente default', () => {
  it('replaces {{atendente}} with "Atendente" by default', () => {
    const result = replaceVariables('{{atendente}}');
    expect(result).toBe('Atendente');
  });

  it('customValues can override atendente', () => {
    const result = replaceVariables('{{atendente}}', {}, { atendente: 'Carlos' });
    expect(result).toBe('Carlos');
  });
});

describe('replaceVariables — case-insensitive replacement', () => {
  it('replaces {{NOME}} (upper-case) the same as {{nome}}', () => {
    const r1 = replaceVariables('{{nome}}', { name: 'Ana' });
    const r2 = replaceVariables('{{NOME}}', { name: 'Ana' });
    expect(r1).toBe(r2);
  });
});
