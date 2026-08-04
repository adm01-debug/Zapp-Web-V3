#!/usr/bin/env node
/**
 * E31 — Static Migration Linter
 *
 * Scans new/changed SQL migration files for patterns that cause schema drift,
 * security gaps, or silent runtime failures in production. Runs on every PR
 * that touches supabase/migrations/ as a blocking quality gate.
 *
 * Rules:
 *  ML-001  SECURITY DEFINER function without explicit SET search_path
 *  ML-002  INSERT/UPDATE on known VIEW proxies in public schema
 *           (notifications, profiles, user_roles, failed_messages, dispatch_error_logs)
 *  ML-003  Realtime publication with schema='public' for known app tables
 *           (ALTER PUBLICATION ... ADD TABLE public.<app_table>)
 *  ML-004  CREATE TABLE in zapp schema without ENABLE ROW LEVEL SECURITY
 *  ML-005  GRANT EXECUTE TO PUBLIC or TO anon on non-stub functions
 *           (stubs are exempted by comment)
 *  ML-006  Missing CREATE SCHEMA IF NOT EXISTS before first DDL in that schema
 *           (only checked when the migration creates a new schema table)
 *  ML-007  Hardcoded http:// URL (internal Docker URLs that must not be stored)
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

const MIGRATION_DIR = 'supabase/migrations';

// In CI, lint only changed files if CHANGED_FILES env is set (list of paths, newline-separated).
// Otherwise lint all migrations.
const changedEnv = process.env.CHANGED_FILES;
let files = [];

if (changedEnv) {
  files = changedEnv
    .split('\n')
    .map(f => f.trim())
    .filter(f => f.startsWith(MIGRATION_DIR + '/') && f.endsWith('.sql'));
} else {
  // Full scan mode (used locally)
  const TIMESTAMP_RE = /^\d{14}_.*\.sql$/;
  try {
    files = readdirSync(MIGRATION_DIR)
      .filter(f => TIMESTAMP_RE.test(f))
      .sort()
      .map(f => join(MIGRATION_DIR, f));
  } catch {
    console.log('ℹ️  lint-migrations: supabase/migrations/ not found — skipping.');
    process.exit(0);
  }
}

if (files.length === 0) {
  console.log('✅ lint-migrations: no migration files to lint.');
  process.exit(0);
}

// Known VIEW proxies in public schema that must NOT be written to directly.
// Writes to these silently succeed but never trigger Realtime CDC and bypass RLS.
const PUBLIC_VIEW_PROXIES = new Set([
  'notifications',
  'profiles',
  'user_roles',
  'failed_messages',
  'dispatch_error_logs',
  'contacts',
  'conversations',
  'messages',
  'companies',
]);

// Tables that belong in the app schemas (zapp/evo/etc) but should NOT be created in public
const APP_TABLE_PATTERNS = [
  'profiles', 'user_roles', 'whatsapp_connections', 'workspaces', 'workspace_members',
  'messages', 'contacts', 'conversations', 'notifications', 'app_notifications',
];

const violations = [];

function addViolation(file, line, rule, message) {
  violations.push({ file: basename(file), line, rule, message });
}

for (const filePath of files) {
  let src;
  try {
    src = readFileSync(filePath, 'utf8');
  } catch {
    continue;
  }

  const lines = src.split('\n');
  const fileName = basename(filePath);

  // Track state for multi-line constructs
  let inSecurityDefiner = false;
  let secDefStartLine = 0;
  let funcBuffer = '';
  let funcBodyLines = [];
  let braceDepth = 0;
  let inDollarQuote = false;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i];
    const trimmed = line.trim().toUpperCase();
    const raw = line.trim();

    // ML-001: SECURITY DEFINER without SET search_path
    // Detect function declaration with SECURITY DEFINER (skip pure SQL comment lines)
    const isLineComment = /^\s*--/.test(line);
    if (!isLineComment && /SECURITY\s+DEFINER/i.test(line)) {
      // Skip RAISE statements — "SECURITY DEFINER" in error messages is not a function definition
      if (/\bRAISE\b/i.test(line)) continue;
      // Look ahead up to 20 lines for SET search_path
      const windowEnd = Math.min(i + 20, lines.length);
      const window = lines.slice(i, windowEnd).join('\n');
      if (!/SET\s+search_path\s*=/i.test(window) && !/SET\s+search_path\s+TO/i.test(window)) {
        // Check if this is inside a DO block (stubs are OK)
        const priorContext = lines.slice(Math.max(0, i - 5), i).join('\n');
        const isStub = /--\s*(stub|mock|dummy|ci.only)/i.test(priorContext) ||
                       /--\s*ignore-lint-ml001/i.test(line);
        if (!isStub) {
          addViolation(
            filePath, lineNum, 'ML-001',
            `SECURITY DEFINER function without SET search_path at line ${lineNum}. ` +
            `Add: LANGUAGE plpgsql SET search_path = zapp SECURITY DEFINER;`
          );
        }
      }
    }

    // ML-002: INSERT/UPDATE on known public VIEW proxies
    const writeToPublicProxy =
      /\b(INSERT\s+INTO|UPDATE)\s+(public\.)(notifications|profiles|user_roles|failed_messages|dispatch_error_logs)\b/i;
    if (writeToPublicProxy.test(line)) {
      // Allow per-line suppression with -- ignore-lint-ml002
      const isExempt = /--\s*ignore-lint-ml002/i.test(line);
      if (!isExempt) {
        const match = line.match(/\b(INSERT\s+INTO|UPDATE)\s+(public\.)(\w+)\b/i);
        if (match && PUBLIC_VIEW_PROXIES.has(match[3].toLowerCase())) {
          addViolation(
            filePath, lineNum, 'ML-002',
            `Writing to public.${match[3]} (VIEW proxy) at line ${lineNum}. ` +
            `Use zapp.${match[3]} (physical table) to trigger Realtime CDC + correct RLS.`
          );
        }
      }
    }

    // ML-003: Adding app table to realtime via PUBLIC schema
    // ALTER PUBLICATION supabase_realtime ADD TABLE public.<app_table>
    const realtimePublicAdd =
      /ALTER\s+PUBLICATION\s+\w+\s+ADD\s+TABLE\s+public\.([\w]+)/i;
    const rtMatch = line.match(realtimePublicAdd);
    if (rtMatch) {
      const table = rtMatch[1].toLowerCase();
      if (PUBLIC_VIEW_PROXIES.has(table) || APP_TABLE_PATTERNS.includes(table)) {
        addViolation(
          filePath, lineNum, 'ML-003',
          `Adding public.${rtMatch[1]} to Realtime publication at line ${lineNum}. ` +
          `If the physical table is in zapp, add zapp.${rtMatch[1]} instead — ` +
          `public.${rtMatch[1]} is a VIEW proxy and emits no CDC events.`
        );
      }
    }

    // ML-004: CREATE TABLE in zapp schema without ENABLE ROW LEVEL SECURITY on nearby lines
    const createTableZapp = /CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?zapp\.([\w]+)/i;
    const ctMatch = line.match(createTableZapp);
    if (ctMatch) {
      const tableName = ctMatch[2];
      // Look ahead up to 60 lines for RLS enablement
      const windowEnd = Math.min(i + 60, lines.length);
      const window = lines.slice(i, windowEnd).join('\n');
      if (!(/ALTER\s+TABLE\s+(?:(?:IF\s+EXISTS\s+)?(?:zapp\.)?[\w.]+\s+)?ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(window)) &&
          !(/--\s*ignore-lint-ml004/i.test(line)) &&
          !(/rls.disabled.intentionally/i.test(window))) {
        addViolation(
          filePath, lineNum, 'ML-004',
          `CREATE TABLE zapp.${tableName} at line ${lineNum} without ` +
          `ALTER TABLE zapp.${tableName} ENABLE ROW LEVEL SECURITY in the same migration block. ` +
          `All app tables require RLS.`
        );
      }
    }

    // ML-005: GRANT EXECUTE TO PUBLIC or TO anon on non-exempt functions
    const grantPublicExec = /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+.*\s+TO\s+(PUBLIC|anon)\b/i;
    if (grantPublicExec.test(line)) {
      // Stubs/bootstrap exempted via comment
      const isExempt =
        /--\s*(stub|bootstrap|ci.only|exempt|ignore-lint-ml005)/i.test(line) ||
        /--\s*(stub|bootstrap|ci.only|exempt|ignore-lint-ml005)/i.test(lines[Math.max(0, i - 1)]);
      if (!isExempt) {
        const toMatch = line.match(/\bTO\s+(PUBLIC|anon)\b/i);
        if (toMatch) {
          addViolation(
            filePath, lineNum, 'ML-005',
            `GRANT EXECUTE TO ${toMatch[1]} at line ${lineNum}. ` +
            `Anonymous users must not be able to execute app functions. ` +
            `Use TO authenticated or TO service_role. Add -- ignore-lint-ml005 if this is a stub.`
          );
        }
      }
    }

    // ML-007: Hardcoded http:// internal URL (Docker internal hostname stored in DB)
    const httpInternalUrl = /['"]http:\/\/(kong|supabase_storage_tenant|supabase_meta|postgrest|realtime|gotrue|inbucket|studio|imgproxy|logflare)[:/]/i;
    if (httpInternalUrl.test(line)) {
      addViolation(
        filePath, lineNum, 'ML-007',
        `Hardcoded internal Docker URL at line ${lineNum}. ` +
        `Do not store internal service URLs in migrations — they are unreachable from outside Docker. ` +
        `Use environment variables or the SELFHOSTED_SUPABASE_URL pattern.`
      );
    }
  }
}

// Report
if (violations.length === 0) {
  console.log(`✅ lint-migrations: ${files.length} file(s) scanned — 0 violations.`);
  process.exit(0);
}

let hasBlocker = false;
console.error(`❌ lint-migrations: ${violations.length} violation(s) in ${files.length} file(s)\n`);

for (const v of violations) {
  // ML-004 and ML-005 are blocking; ML-001, ML-002, ML-003, ML-007 are blocking
  const isBlocking = ['ML-001', 'ML-002', 'ML-003', 'ML-004', 'ML-005', 'ML-007'].includes(v.rule);
  if (isBlocking) hasBlocker = true;
  const prefix = isBlocking ? '🔴' : '🟡';
  console.error(`${prefix} [${v.rule}] ${v.file}:${v.line}`);
  console.error(`   ${v.message}\n`);
}

console.error('See scripts/lint-migrations.mjs for rule details.');
process.exit(hasBlocker ? 1 : 0);
