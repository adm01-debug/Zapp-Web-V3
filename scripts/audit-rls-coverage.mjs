#!/usr/bin/env node
/**
 * E34 — RLS Coverage Audit (static, migration-derived)
 *
 * Parses supabase/migrations/*.sql to build a table × role × operation
 * coverage matrix. Outputs a machine-readable summary and blocks CI
 * when critical app tables are missing RLS enablement in migrations.
 *
 * NOTE: This is a static approximation. The authoritative check is the
 * rls-role-matrix.test.ts suite that runs against a live DB. This script
 * is the fast shift-left gate — catches missing ENABLE ROW LEVEL SECURITY
 * and GRANT statements before any DB connection is required.
 *
 * Output modes:
 *   --report   Print full coverage table (default in local mode)
 *   --check    Exit 1 if critical tables are uncovered (default in CI)
 *   --json     Emit JSON for downstream consumption
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';

const MIGRATION_DIR = 'supabase/migrations';
const TIMESTAMP_RE = /^\d{14}_.*\.sql$/;

const args = process.argv.slice(2);
const JSON_MODE = args.includes('--json');
const REPORT_MODE = args.includes('--report') || (!args.includes('--check') && !JSON_MODE);
const CHECK_MODE = args.includes('--check') || process.env.CI === 'true';

// Critical app tables that MUST have RLS enabled.
// Tables confirmed physical (relkind='r') in zapp schema per production audit 2026-07-16.
const CRITICAL_TABLES = new Set([
  'profiles',
  'workspaces',
  'workspace_members',
  'whatsapp_connections',
  'instance_registry',
  'user_roles',
  'contacts',
  'conversations',
  'messages',
  'departments',
  'queues',
  'queue_members',
  'audit_logs',
  'app_notifications',
  'webhook_audit_log',
  'failed_messages',
  'dispatch_error_logs',
  'sentiment_alerts',
  'evolution_sentiment_analysis',
  'voice_conversion_queue',
  'sts_telemetry',
  'agent_stats',
  'warroom_alerts',
  'sales_deals',
  'talkx_campaigns',
  'talkx_recipients',
  'team_messages',
  'calls',
  'payment_links',
  'email_accounts',
  'email_threads',
]);

// Roles recognized in policy definitions
const KNOWN_ROLES = ['anon', 'authenticated', 'service_role', 'supabase_admin'];

// Accumulate state across all migrations
const state = {
  // table -> { rlsEnabled, policies: [{ name, role, operations }], grants: [] }
  tables: new Map(),
  // Track which migration enabled RLS per table
  rlsSource: new Map(),
};

function ensureTable(name) {
  if (!state.tables.has(name)) {
    state.tables.set(name, { rlsEnabled: false, policies: [], grants: [] });
  }
  return state.tables.get(name);
}

function canonicalTable(raw) {
  // Strip schema prefix for tracking
  return raw.replace(/^(zapp|public|evo|email_app|financeiro|vendas|ops|ai|bpm|archive)\./i, '')
            .toLowerCase()
            .trim();
}

let files;
try {
  // R25 fix: varre também supabase/migrations/archive/ — o #628 (baseline)
  // arquivou 966 migrations que contêm o ENABLE ROW LEVEL SECURITY das
  // tabelas ativas (o banco real está correto; o gate sem archive dava
  // falso-positivo em 10 tabelas críticas).
  // archive/ é opcional: se não existir, skip silencioso.
  files = readdirSync(MIGRATION_DIR)
    .filter(f => TIMESTAMP_RE.test(f))
    .sort()
    .map(f => join(MIGRATION_DIR, f));

  const archiveDir = join(MIGRATION_DIR, 'archive');
  try {
    const archiveFiles = readdirSync(archiveDir)
      .filter(f => TIMESTAMP_RE.test(f))
      .sort()
      .map(f => join(archiveDir, f));
    files = files.concat(archiveFiles);
  } catch {
    // archive/ não existe neste repo — ignorar silenciosamente
  }
} catch {
  console.error(`Cannot read ${MIGRATION_DIR}`);
  process.exit(1);
}

for (const filePath of files) {
  const src = readFileSync(filePath, 'utf8');
  const lines = src.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect: ALTER TABLE [IF EXISTS] [schema.]table ENABLE ROW LEVEL SECURITY
    const rlsMatch = line.match(
      /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?([`"'\w.]+)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i
    );
    if (rlsMatch) {
      const tbl = canonicalTable(rlsMatch[1].replace(/[`"']/g, ''));
      ensureTable(tbl).rlsEnabled = true;
      state.rlsSource.set(tbl, basename(filePath));
    }

    // Detect: CREATE POLICY ... ON [schema.]table [AS ...] FOR ... TO ...
    const policyMatch = line.match(
      /CREATE\s+POLICY\s+["']?(\w+)["']?\s+ON\s+(?:ONLY\s+)?([`"'\w.]+)/i
    );
    if (policyMatch) {
      const policyName = policyMatch[1];
      const tbl = canonicalTable(policyMatch[2].replace(/[`"']/g, ''));
      const rec = ensureTable(tbl);

      // Look ahead for TO role and FOR operation
      const windowEnd = Math.min(i + 10, lines.length);
      const block = lines.slice(i, windowEnd).join(' ');

      const forMatch = block.match(/\bFOR\s+(ALL|SELECT|INSERT|UPDATE|DELETE)/i);
      const toMatch = block.match(/\bTO\s+([\w,\s]+?)(?:\s+USING|\s+WITH\s+CHECK|;|$)/i);

      const operation = forMatch ? forMatch[1].toUpperCase() : 'ALL';
      const roles = toMatch
        ? toMatch[1].split(',').map(r => r.trim().toLowerCase()).filter(Boolean)
        : ['authenticated'];

      rec.policies.push({ name: policyName, operation, roles });
    }

    // Detect: GRANT SELECT|INSERT|UPDATE|DELETE|ALL ON TABLE [schema.]table TO role
    const grantMatch = line.match(
      /GRANT\s+([\w,\s]+?)\s+ON\s+(?:TABLE\s+)?([`"'\w.]+)\s+TO\s+([\w,\s]+)/i
    );
    if (grantMatch) {
      const ops = grantMatch[1].trim().toUpperCase();
      const tbl = canonicalTable(grantMatch[2].replace(/[`"']/g, ''));
      const roles = grantMatch[3].split(',').map(r => r.trim().toLowerCase());
      ensureTable(tbl).grants.push({ ops, roles });
    }
  }
}

// Build coverage report
const report = [];
for (const [table, info] of [...state.tables.entries()].sort()) {
  const isCritical = CRITICAL_TABLES.has(table);
  const hasAnyPolicy = info.policies.length > 0;
  const coveredOps = new Set(info.policies.map(p => p.operation));
  const coveredRoles = new Set(info.policies.flatMap(p => p.roles));

  const status = info.rlsEnabled
    ? (hasAnyPolicy ? '✅ RLS+policy' : '⚠️  RLS enabled, no policy')
    : (isCritical ? '🔴 MISSING RLS' : '⬜ no RLS');

  report.push({
    table,
    critical: isCritical,
    rlsEnabled: info.rlsEnabled,
    policies: info.policies.length,
    coveredOps: [...coveredOps].join(', ') || '—',
    coveredRoles: [...coveredRoles].join(', ') || '—',
    status,
    rlsSource: state.rlsSource.get(table) || '—',
  });
}

if (JSON_MODE) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

if (REPORT_MODE) {
  console.log('\n## RLS Coverage Matrix (migration-derived)\n');
  console.log('| Table | Critical | RLS | Policies | Ops | Roles | Status |');
  console.log('|-------|----------|-----|----------|-----|-------|--------|');
  for (const r of report) {
    console.log(
      `| ${r.table} | ${r.critical ? '⭐' : ''} | ${r.rlsEnabled ? '✓' : '✗'} | ${r.policies} | ${r.coveredOps} | ${r.coveredRoles} | ${r.status} |`
    );
  }
  console.log('');
}

// Check mode: block on critical tables without RLS
const missing = report.filter(r => r.critical && !r.rlsEnabled);
const rlsNoPolicy = report.filter(r => r.critical && r.rlsEnabled && r.policies === 0);

if (CHECK_MODE) {
  if (missing.length > 0) {
    console.error(`\n❌ RLS audit: ${missing.length} critical table(s) without ENABLE ROW LEVEL SECURITY:\n`);
    for (const r of missing) {
      console.error(`   🔴 zapp.${r.table} — add ALTER TABLE zapp.${r.table} ENABLE ROW LEVEL SECURITY`);
    }
  }
  if (rlsNoPolicy.length > 0) {
    console.error(`\n⚠️  RLS audit: ${rlsNoPolicy.length} critical table(s) have RLS enabled but no policies:\n`);
    for (const r of rlsNoPolicy) {
      console.error(`   ⚠️  zapp.${r.table} (from ${r.rlsSource}) — add at least one CREATE POLICY`);
    }
  }
  if (missing.length > 0) {
    console.error('\nAll app tables in the zapp schema require RLS. See docs/SCHEMA_REFERENCE.md.');
    process.exit(1);
  }
  if (rlsNoPolicy.length === 0 && missing.length === 0) {
    const covered = report.filter(r => r.critical && r.rlsEnabled && r.policies > 0).length;
    console.log(`✅ RLS audit: ${covered}/${CRITICAL_TABLES.size} critical tables have RLS + policies. ${rlsNoPolicy.length} advisory gaps.`);
  }
}
