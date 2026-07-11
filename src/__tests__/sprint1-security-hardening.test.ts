/**
 * Sprint 1 Security Hardening — Regressão (Auditoria 2026-07-11)
 *
 * Estes testes são "grep-based": validam que a migration foi realmente
 * aplicada, checando a definição corrente das funções via consulta em
 * `pg_proc` seria o ideal, mas em ambiente unit não temos DB. Então
 * fazemos a validação estática lendo o arquivo de migration mais recente
 * que contém os guards de HIGH-1..HIGH-3. Isso pega qualquer regressão
 * onde alguém reescreve uma das funções sem o guard.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

/** Retorna o conteúdo concatenado de todas as migrations (histórico completo). */
function allMigrationsSql(): string {
  try {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
    return files
      .map((f) => readFileSync(join(MIGRATIONS_DIR, f), 'utf-8'))
      .join('\n');
  } catch {
    return '';
  }
}

/**
 * Retorna apenas a definição mais recente de uma função (última ocorrência
 * de CREATE OR REPLACE FUNCTION <name>...$fn$/$function$;).
 */
function latestDefinition(sql: string, fnName: string): string {
  const re = new RegExp(
    `CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${fnName}\\b[\\s\\S]*?\\$(?:fn|function|\\w*)\\$\\s*;`,
    'gi',
  );
  const matches = sql.match(re) ?? [];
  return matches[matches.length - 1] ?? '';
}

describe('Sprint 1 · HIGH-1 · RPC SECURITY DEFINER guards', () => {
  const sql = allMigrationsSql();

  it.each([
    ['pause_instance', /has_role\(auth\.uid\(\)\s*,\s*'admin'\)/],
    ['unpause_instance', /has_role\(auth\.uid\(\)\s*,\s*'admin'\)/],
    ['manage_department_member', /is_admin_or_supervisor\(auth\.uid\(\)\)/],
    ['rpc_migrate_whatsapp_integration', /has_role\(auth\.uid\(\)\s*,\s*'admin'\)/],
    ['fn_accept_transfer', /auth\.uid\(\)\s+IS\s+NULL/i],
    ['fn_complete_transfer', /auth\.uid\(\)\s+IS\s+NULL/i],
  ])('a definição mais recente de %s contém o guard esperado', (fn, pattern) => {
    const def = latestDefinition(sql, fn);
    expect(def, `função ${fn} não encontrada em migrations`).not.toBe('');
    expect(def).toMatch(pattern);
    expect(def).toMatch(/RAISE\s+EXCEPTION/i);
  });
});

describe('Sprint 1 · HIGH-2 · prevent_role_escalation', () => {
  const sql = allMigrationsSql();
  const def = latestDefinition(sql, 'prevent_role_escalation');

  it('rejeita a escalada com RAISE EXCEPTION (não faz revert silencioso)', () => {
    expect(def).not.toBe('');
    expect(def).toMatch(/RAISE\s+EXCEPTION/i);
    expect(def).toMatch(/log_security_event/);
    expect(def).toMatch(/privilege_escalation_attempt/);
  });

  it('não retorna à estratégia de revert (NEW.role := OLD.role)', () => {
    expect(def).not.toMatch(/NEW\.role\s*:=\s*OLD\.role/);
    expect(def).not.toMatch(/NEW\.access_level\s*:=\s*OLD\.access_level/);
    expect(def).not.toMatch(/NEW\.permissions\s*:=\s*OLD\.permissions/);
  });
});

describe('Sprint 1 · HIGH-3 · notify_sicoob_on_reply sem service_role_key na GUC', () => {
  const sql = allMigrationsSql();
  const def = latestDefinition(sql, 'notify_sicoob_on_reply');

  it('não lê mais a chave de serviço via current_setting', () => {
    expect(def).not.toBe('');
    expect(def).not.toMatch(/current_setting\(\s*'app\.settings\.service_role_key'/);
  });

  it('usa pg_notify em vez de extensions.http_post inline', () => {
    expect(def).toMatch(/pg_notify\(\s*'sicoob_bridge_reply'/);
    expect(def).not.toMatch(/extensions\.http_post/);
  });
});
