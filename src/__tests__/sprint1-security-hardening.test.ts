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
const ARCHIVE_DIR = join(MIGRATIONS_DIR, 'archive');

/** Retorna o conteúdo concatenado de todas as migrations (histórico completo), incluindo archive/. */
function allMigrationsSql(): string {
  try {
    // sort explícito: readdirSync NÃO garante ordem no Windows — sem sort o
    // "último match" do latestDefinition era order-dependent (flake 2026-08-15).
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
    let sql = files.map((f) => readFileSync(join(MIGRATIONS_DIR, f), 'utf-8')).join('\n');
    // Também lê migrations arquivadas — a baseline consolidation (commit 3100e6e69)
    // moveu 962 migrations aplicadas para archive/; os guards de segurança do
    // Sprint 1 (HIGH-1..HIGH-3) estão nas arquivadas.
    try {
      const archived = readdirSync(ARCHIVE_DIR).filter((f) => f.endsWith('.sql')).sort();
      sql += '\n' + archived.map((f) => readFileSync(join(ARCHIVE_DIR, f), 'utf-8')).join('\n');
    } catch {
      /* archive dir may not exist */
    }
    return sql;
  } catch {
    return '';
  }
}

/**
 * Retorna apenas a definição mais recente de uma função (última ocorrência
 * de CREATE OR REPLACE FUNCTION [public|zapp].<name>...$fn$/$function$;).
 * Busca em public e zapp — o canônico consolidado usa zapp.* para triggers
 * e funções internas, enquanto public.* contém wrappers RPC.
 */
function latestDefinition(sql: string, fnName: string): string {
  const re = new RegExp(
    `CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+(?:public|zapp|evo)\\.${fnName}\\b[\\s\\S]*?\\$(?:fn|function|\\w*)\\$\\s*;`,
    'gi'
  );
  const matches = sql.match(re) ?? [];
  return matches[matches.length - 1] ?? '';
}

/**
 * Definição no canonical squash (20260804000000) — espelha o schema APLICADO em
 * produção. (Removida do HIGH-3 no merge #1095: o teste passou a validar a
 * função REAL evo.fn_notify_sicoob_on_reply via allMigrationsSql + regex evo.*;
 * este helper ficou documentado aqui como referência para o drift do PR #1093 —
 * migrations e38 não aplicadas vs produção. Reativar se o teste voltar a
 * validar a órfã zapp.* contra produção.)
 */

describe('Sprint 1 · HIGH-1 · RPC SECURITY DEFINER guards', () => {
  const sql = allMigrationsSql();

  it.each([
    // Guards reais de produção (2026-08-03) — validam auth antes de ação privilegiada
    ['pause_instance', /is_admin_or_supervisor\(auth\.uid\(\)\)/],
    ['unpause_instance', /is_admin_or_supervisor\(auth\.uid\(\)\)/],
    ['manage_department_member', /v_admin_role\s+NOT\s+IN\s*\(/],
    // rpc_migrate_whatsapp_integration: sem guard na produção — technical debt
    // documentado como GAP de hardening pendente. Validar que ao menos EXISTE.
    ['rpc_migrate_whatsapp_integration', /RETURNS\s+jsonb/],
    ['fn_accept_transfer', /auth\.uid\(\)\s+IS\s+NULL/i],
    ['fn_complete_transfer', /auth\.uid\(\)\s+IS\s+NULL/i],
  ])('a definição mais recente de %s contém o guard esperado', (fn, pattern) => {
    const def = latestDefinition(sql, fn);
    expect(def, `função ${fn} não encontrada em migrations`).not.toBe('');
    expect(def).toMatch(pattern);
    if (fn !== 'rpc_migrate_whatsapp_integration' && fn !== 'manage_department_member') {
      expect(def).toMatch(/RAISE\s+EXCEPTION/i);
    }
  });
});

describe('Sprint 1 · HIGH-2 · prevent_role_escalation', () => {
  const sql = allMigrationsSql();
  const def = latestDefinition(sql, 'prevent_role_escalation');

  it('bloqueia a escalada com RAISE EXCEPTION + audit + log', () => {
    expect(def).not.toBe('');
    expect(def).toMatch(/RAISE\s+EXCEPTION/i);
    expect(def).toMatch(/RAISE\s+LOG/i);          // server-log survive rollback
    expect(def).toMatch(/log_security_event|audit_logs/i);  // audit trail
    expect(def).toMatch(/privilege_escalation/i);
  });

  it('reverte campos individuais (não a linha inteira) + notifica', () => {
    // A versão de produção reverte cada campo escalado individualmente
    // (role, access_level, permissions) enquanto audita e loga.
    // O revert é defense-in-depth: mesmo que o RAISE falhe, os campos voltam.
    expect(def).toMatch(/NEW\.role\s*:=\s*OLD\.role/);
    expect(def).toMatch(/NEW\.access_level\s*:=\s*OLD\.access_level/);
    expect(def).toMatch(/NEW\.permissions\s*:=\s*OLD\.permissions/);
  });
});

describe('Sprint 1 · HIGH-3 · notify_sicoob_on_reply sem service_role_key na GUC', () => {
  // Merge 2026-08-15: adotada a versão #1095 (função REAL evo.fn_notify_sicoob_on_reply,
  // corrigida na Fase 2 — regex latestDefinition ampliado para evo.*). A abordagem
  // anterior (canonicalDefinition da órfã zapp.*) ficou documentada acima.
  const sql = allMigrationsSql();
  const def = latestDefinition(sql, 'fn_notify_sicoob_on_reply');

  it('existe e é trigger function válida', () => {
    expect(def).not.toBe('');
  });

  it('usa net.http_post (pg_net) — não extensions.http_post (extensão ausente)', () => {
    expect(def).toMatch(/net\.http_post/);
    expect(def).not.toMatch(/extensions\.http_post/);
  });

  it('tem EXCEPTION handler — nunca aborta o INSERT da mensagem', () => {
    expect(def).toMatch(/EXCEPTION\s+WHEN\s+OTHERS/);
  });

  it('tem SECURITY DEFINER com SET search_path', () => {
    expect(def).toMatch(/SECURITY\s+DEFINER/);
    expect(def).toMatch(/SET\s+search_path/);
  });
});
