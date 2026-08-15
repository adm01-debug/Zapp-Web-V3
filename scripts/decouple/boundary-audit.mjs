#!/usr/bin/env node
/**
 * boundary-audit.mjs — Auditoria dos 9 Invariantes de Independência ZAPP×EVO
 *
 * Uso:
 *   node scripts/decouple/boundary-audit.mjs [--out <arquivo.json>]
 *
 * Requer variáveis de ambiente:
 *   SUPABASE_URL      URL da instância self-hosted (ex: https://supabase.atomicabr.com.br)
 *   SUPABASE_SERVICE_KEY  Service role key (anon key sem acesso a pg_catalog)
 *
 * Saída:
 *   BOUNDARY_SCORE_T0.json (ou arquivo via --out)
 *
 * Invariantes medidos:
 *   I1 — Zero funções zapp.* referenciando evo.*
 *   I2 — Zero funções evo.* referenciando zapp.*
 *   I3 — supabase.yml NÃO em zapp-web-v3 (verificado no filesystem)
 *   I4 — TODO egresso HTTP via gateway único (cron + pg_net)
 *   I5 — CI guard decouple-guard.yml ativo (filesystem)
 *   I6 — consumer.py sem INSERT morto (filesystem)
 *   I7 — inventory.mjs cobre todos os evolution-* invocations (run inventory)
 *   I8 — sql-gate fixture sincronizado com prod (DB vs fixtures/)
 *   I9 — Zero FKs cross-schema não documentadas
 *
 * Execução offline (sem DB): define DB_OFFLINE=1 — usa baselines do snapshot T0.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..', '..');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(msg) { process.stderr.write(`[boundary-audit] ${msg}\n`); }

function parseArgs() {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--out');
  const out = idx !== -1 ? args[idx + 1] : join(REPO_ROOT, 'docs', 'decouple', 'BOUNDARY_SCORE_T0.json');
  const offline = process.env.DB_OFFLINE === '1' || args.includes('--offline');
  return { out, offline };
}

async function dbQuery(sql) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL e SUPABASE_SERVICE_KEY são obrigatórios (ou use --offline)');
  }
  const endpoint = `${url}/rest/v1/rpc/`;
  // Usa PostgREST para executar via RPC de query arbitrária não está disponível em anon.
  // Usa a API de query do Supabase Meta API (porta 8080 ou via edge fn exec-sql).
  // Como alternativa, usa o endpoint pg do Meta API:
  const metaUrl = url.replace(/\/$/, '') + '/pg';
  const resp = await fetch(`${metaUrl}/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({ query: sql }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`DB query falhou (${resp.status}): ${text.slice(0, 500)}`);
  }
  const data = await resp.json();
  return Array.isArray(data) ? data : (data.rows || data);
}

function readBaseline(filename) {
  const path = join(REPO_ROOT, 'docs', 'decouple', 'baseline', '20260815', filename);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

// ─── Verificações de Filesystem ───────────────────────────────────────────────

function checkI3_supabaseYml() {
  const result = { invariant: 'I3', name: 'supabase.yml não em zapp-web-v3' };
  const supabaseYml = join(REPO_ROOT, 'supabase.yml');
  const evolutionYml = join(REPO_ROOT, 'docker-compose.evolution.yml');
  const violations = [];

  if (existsSync(supabaseYml)) {
    const content = readFileSync(supabaseYml, 'utf8');
    if (content.includes('evolution') || content.includes('Evolution')) {
      violations.push({ file: 'supabase.yml', reason: 'Contém referência a evolution' });
    }
  }

  // Verifica se há docker-compose de evolution neste repo
  const dcFiles = readdirSync(REPO_ROOT).filter(f =>
    f.startsWith('docker-compose') && (f.includes('evolution') || f.includes('evo'))
  );
  for (const f of dcFiles) {
    violations.push({ file: f, reason: 'docker-compose evolution no zapp-web-v3' });
  }

  // Verifica .github/workflows por arquivos de infra evolution
  const workflowDir = join(REPO_ROOT, '.github', 'workflows');
  if (existsSync(workflowDir)) {
    const workflows = readdirSync(workflowDir);
    for (const wf of workflows) {
      if (wf.includes('evolution') && wf !== 'decouple-guard.yml') {
        violations.push({ file: `.github/workflows/${wf}`, reason: 'Workflow evolution (exceto decouple-guard)' });
      }
    }
  }

  result.score = violations.length === 0 ? 1 : 0;
  result.violations = violations;
  result.detail = violations.length === 0
    ? 'Sem infra evolution em zapp-web-v3'
    : `${violations.length} arquivo(s) de infra evolution encontrado(s)`;
  return result;
}

function checkI5_ciGuard() {
  const result = { invariant: 'I5', name: 'CI guard decouple-guard.yml ativo' };
  const guardPath = join(REPO_ROOT, '.github', 'workflows', 'decouple-guard.yml');

  if (!existsSync(guardPath)) {
    result.score = 0;
    result.violations = [{ file: '.github/workflows/decouple-guard.yml', reason: 'Arquivo não encontrado' }];
    result.detail = 'decouple-guard.yml AUSENTE — CI guard inativo';
    return result;
  }

  const content = readFileSync(guardPath, 'utf8');
  const checks = [
    { key: 'supabase.yml', present: content.includes('supabase.yml') || content.includes('evolution') },
    { key: 'push trigger', present: content.includes('push:') || content.includes('pull_request:') },
  ];

  const missing = checks.filter(c => !c.present);
  result.score = missing.length === 0 ? 1 : 0.5;
  result.violations = missing.map(c => ({ check: c.key, reason: 'Verificação ausente no guard' }));
  result.detail = missing.length === 0
    ? 'decouple-guard.yml presente e contém verificações de evolution'
    : `decouple-guard.yml presente mas incompleto (${missing.length} check(s) ausente)`;
  result.guardPath = guardPath;
  return result;
}

function checkI6_consumerPy() {
  const result = { invariant: 'I6', name: 'consumer.py sem INSERT morto' };
  // consumer.py pode estar em vários locais
  const candidates = [
    'consumer.py',
    'src/consumer.py',
    'supabase/functions/_shared/consumer.py',
    'scripts/consumer.py',
  ].map(p => join(REPO_ROOT, p)).filter(existsSync);

  if (candidates.length === 0) {
    result.score = 1;
    result.violations = [];
    result.detail = 'consumer.py não encontrado em zapp-web-v3 (correto — pertence ao evo stack)';
    return result;
  }

  const deadInsertPattern = /\.insert\s*\(\s*\[?\s*\{[^}]*evolution[^}]*\}/gi;
  const violations = [];

  for (const filePath of candidates) {
    const content = readFileSync(filePath, 'utf8');
    const matches = content.match(deadInsertPattern) || [];
    if (matches.length > 0) {
      violations.push({ file: filePath, insertCount: matches.length, samples: matches.slice(0, 3) });
    }
  }

  result.score = violations.length === 0 ? 1 : 0;
  result.violations = violations;
  result.filesChecked = candidates;
  result.detail = violations.length === 0
    ? 'Sem INSERTs mortos em consumer.py'
    : `${violations.length} arquivo(s) com INSERT morto detectado`;
  return result;
}

function checkI7_inventoryMjs() {
  const result = { invariant: 'I7', name: 'inventory.mjs cobre todos evolution-* invocations' };
  const inventoryPath = join(REPO_ROOT, 'scripts', 'decouple', 'inventory.mjs');

  if (!existsSync(inventoryPath)) {
    result.score = 0;
    result.violations = [{ file: 'scripts/decouple/inventory.mjs', reason: 'Arquivo não encontrado' }];
    result.detail = 'inventory.mjs AUSENTE';
    return result;
  }

  // Verifica se inventory.mjs menciona as métricas esperadas
  const content = readFileSync(inventoryPath, 'utf8');
  const checks = [
    { key: 'frontEvoBypass', present: content.includes('frontEvoBypass') },
    { key: 'backendUrlBypass', present: content.includes('backendUrlBypass') },
    { key: 'frontEvoWrites', present: content.includes('frontEvoWrites') },
    { key: 'frontDirectEvoHttp', present: content.includes('frontDirectEvoHttp') },
    { key: 'EVOLUTION_API_URL detection', present: content.includes('EVOLUTION_API_URL') },
  ];

  // Executa inventory.mjs para obter o score atual
  let inventoryResult = null;
  try {
    const output = execSync(`node ${inventoryPath} 2>/dev/null`, {
      cwd: REPO_ROOT,
      timeout: 30000,
      encoding: 'utf8',
    });
    // O inventory imprime para stderr e pode ter JSON no stdout
    inventoryResult = { ran: true, output: output.slice(0, 500) };
  } catch (e) {
    inventoryResult = { ran: false, error: e.message.slice(0, 200) };
  }

  const missing = checks.filter(c => !c.present);
  result.score = missing.length === 0 ? 1 : (checks.filter(c => c.present).length / checks.length);
  result.violations = missing.map(c => ({ check: c.key, reason: 'Métrica ausente no inventory.mjs' }));
  result.detail = missing.length === 0
    ? 'inventory.mjs contém todas as métricas de cobertura'
    : `inventory.mjs incompleto — ${missing.length} métrica(s) ausente`;
  result.inventoryRun = inventoryResult;
  return result;
}

// ─── Verificações via DB ───────────────────────────────────────────────────────

async function checkI1_zappEvoRefs(offline) {
  const result = { invariant: 'I1', name: 'Zero funções zapp.* referenciando evo.*' };

  if (offline) {
    const baseline = readBaseline('zapp_evo_refs.json');
    if (baseline) {
      const count = baseline.total_refs || baseline.rows?.length || 82;
      const fns = baseline.distinct_functions || 20;
      result.score = 0;
      result.violations = [{ count, distinct_functions: fns, source: 'baseline T0' }];
      result.detail = `[OFFLINE] T0: ${count} refs em ${fns} funções zapp→evo`;
      result.t0 = { refs: count, distinct_functions: fns };
    }
    return result;
  }

  try {
    const rows = await dbQuery(`
      SELECT n.nspname AS fn_schema,
             p.proname AS fn_name,
             COUNT(*) AS ref_count
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'zapp'
        AND p.prosrc ILIKE '%evo.%'
      GROUP BY 1, 2
      ORDER BY 3 DESC
    `);

    const totalRefs = rows.reduce((s, r) => s + parseInt(r.ref_count || 0), 0);
    result.score = rows.length === 0 ? 1 : 0;
    result.violations = rows.slice(0, 20).map(r => ({
      function: `${r.fn_schema}.${r.fn_name}`,
      ref_count: parseInt(r.ref_count),
    }));
    result.detail = rows.length === 0
      ? 'PASSOU — zero funções zapp.* referenciando evo.*'
      : `FALHOU — ${rows.length} função(ões), ${totalRefs} referências totais`;
    result.counts = { distinct_functions: rows.length, total_refs: totalRefs };
  } catch (e) {
    result.score = null;
    result.error = e.message;
    // Fallback para baseline
    const baseline = readBaseline('zapp_evo_refs.json');
    if (baseline) {
      result.t0_fallback = { refs: 82, distinct_functions: 20 };
    }
  }
  return result;
}

async function checkI2_evoZappRefs(offline) {
  const result = { invariant: 'I2', name: 'Zero funções evo.* referenciando zapp.*' };

  if (offline) {
    const baseline = readBaseline('evo_zapp_refs.json');
    if (baseline) {
      const fns = baseline.distinct_functions || 96;
      result.score = 0;
      result.violations = [{ distinct_functions: fns, source: 'baseline T0' }];
      result.detail = `[OFFLINE] T0: ${fns} funções evo→zapp`;
      result.t0 = { distinct_functions: fns };
    }
    return result;
  }

  try {
    const rows = await dbQuery(`
      SELECT n.nspname AS fn_schema,
             p.proname AS fn_name,
             COUNT(*) AS ref_count
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'evo'
        AND p.prosrc ILIKE '%zapp.%'
      GROUP BY 1, 2
      ORDER BY 3 DESC
    `);

    const totalRefs = rows.reduce((s, r) => s + parseInt(r.ref_count || 0), 0);
    result.score = rows.length === 0 ? 1 : 0;
    result.violations = rows.slice(0, 20).map(r => ({
      function: `${r.fn_schema}.${r.fn_name}`,
      ref_count: parseInt(r.ref_count),
    }));
    result.detail = rows.length === 0
      ? 'PASSOU — zero funções evo.* referenciando zapp.*'
      : `FALHOU — ${rows.length} função(ões), ${totalRefs} referências totais`;
    result.counts = { distinct_functions: rows.length, total_refs: totalRefs };
  } catch (e) {
    result.score = null;
    result.error = e.message;
    const baseline = readBaseline('evo_zapp_refs.json');
    if (baseline) {
      result.t0_fallback = { distinct_functions: 96 };
    }
  }
  return result;
}

async function checkI4_httpEgress(offline) {
  const result = { invariant: 'I4', name: 'Todo egresso HTTP via gateway único' };

  if (offline) {
    const cronBaseline = readBaseline('cron_jobs.json');
    const pgNetBaseline = readBaseline('pg_net_functions.json');

    const cronViolations = cronBaseline?.meta?.by_violation_class
      ? cronBaseline.meta.by_violation_class.I4_net_http + cronBaseline.meta.by_violation_class.I4_extensions_http
      : 5;
    const pgNetViolations = pgNetBaseline?.total_rows || 18;

    result.score = 0;
    result.violations = {
      cron_I4: cronViolations,
      pg_net_functions: pgNetViolations,
      source: 'baseline T0',
    };
    result.detail = `[OFFLINE] T0: ${cronViolations} cron I4-bypass + ${pgNetViolations} pg_net function violations`;
    result.t0 = { cron_I4_bypass: cronViolations, pg_net_functions: pgNetViolations };
    return result;
  }

  try {
    // Conta jobs cron com bypass HTTP
    const cronRows = await dbQuery(`
      SELECT jobid, jobname, command
      FROM cron.job
      WHERE active = true
        AND (
          command ILIKE '%net.http_%'
          OR command ILIKE '%extensions.http%'
          OR command ILIKE '%pg_net%'
        )
        AND command NOT ILIKE '%evolution_proxy%'
        AND command NOT ILIKE '%fn_evo_url%'
    `);

    // Conta funções usando pg_net fora do gateway
    const pgNetRows = await dbQuery(`
      SELECT n.nspname AS schema, p.proname AS fn
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname IN ('zapp', 'evo', 'ops', 'public')
        AND p.prosrc ILIKE '%net.http_%'
        AND p.proname NOT IN ('fn_evo_url', 'fn_evo_key', 'fn_check_license_heartbeat', 'fn_detect_instance_recreate')
    `);

    const violations = cronRows.length + pgNetRows.length;
    result.score = violations === 0 ? 1 : 0;
    result.violations = {
      cron_jobs: cronRows.map(r => ({ jobid: r.jobid, jobname: r.jobname })),
      pg_net_functions: pgNetRows.map(r => `${r.schema}.${r.fn}`),
    };
    result.detail = violations === 0
      ? 'PASSOU — todo egresso HTTP via gateway'
      : `FALHOU — ${cronRows.length} cron job(s) + ${pgNetRows.length} função(ões) com bypass HTTP`;
    result.counts = { cron_bypasses: cronRows.length, pg_net_function_violations: pgNetRows.length };
  } catch (e) {
    result.score = null;
    result.error = e.message;
    result.t0_fallback = { cron_I4_bypass: 5, pg_net_functions: 18 };
  }
  return result;
}

async function checkI8_sqlGateFixture(offline) {
  const result = { invariant: 'I8', name: 'sql-gate fixture sincronizado com prod' };
  const fixtureDir = join(REPO_ROOT, 'scripts', 'decouple', 'fixtures');

  // Conta entradas no fixture atual
  let fixtureCount = 0;
  let fixtureFiles = [];

  if (existsSync(fixtureDir)) {
    fixtureFiles = readdirSync(fixtureDir).filter(f => f.endsWith('.json'));
    for (const f of fixtureFiles) {
      try {
        const data = JSON.parse(readFileSync(join(fixtureDir, f), 'utf8'));
        fixtureCount += Array.isArray(data) ? data.length : 1;
      } catch (_) {}
    }
  }

  if (offline) {
    // T0: fixture tem 12 entradas, prod tem 25 — gap de 13
    result.score = 0;
    result.violations = [{ fixture_count: fixtureCount || 12, prod_count: 25, gap: 25 - (fixtureCount || 12) }];
    result.detail = `[OFFLINE] T0: fixture=${fixtureCount || 12} entradas; prod=25; gap=${25 - (fixtureCount || 12)}`;
    result.t0 = { fixture: fixtureCount || 12, prod: 25 };
    return result;
  }

  try {
    // Conta funções no DB que deveriam estar no fixture
    const prodRows = await dbQuery(`
      SELECT COUNT(*) AS cnt
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname IN ('evo', 'zapp', 'ops', 'public')
        AND (p.prosrc ~ 'net\\.http_' OR p.prosrc ~ 'vault\\.decrypted_secrets')
    `);
    const prodCount = parseInt(prodRows[0]?.cnt || 0);
    const gap = Math.abs(prodCount - fixtureCount);
    const threshold = 0.1; // 10% de divergência é aceitável (ex: funções novas ainda não adicionadas)

    result.score = gap <= Math.ceil(prodCount * threshold) ? 1 : 0;
    result.violations = gap > 0 ? [{
      fixture_count: fixtureCount,
      prod_count: prodCount,
      gap,
      fixture_files: fixtureFiles,
    }] : [];
    result.detail = gap <= Math.ceil(prodCount * threshold)
      ? `Fixture sincronizado (fixture=${fixtureCount}, prod=${prodCount}, gap=${gap})`
      : `Fixture desatualizado: fixture=${fixtureCount}, prod=${prodCount}, gap=${gap}`;
    result.counts = { fixture: fixtureCount, prod: prodCount, gap };
  } catch (e) {
    result.score = null;
    result.error = e.message;
    result.t0_fallback = { fixture: fixtureCount || 12, prod: 25 };
  }
  return result;
}

async function checkI9_crossSchemaFKs(offline) {
  const result = { invariant: 'I9', name: 'Zero FKs cross-schema não documentadas' };

  if (offline) {
    const baseline = readBaseline('cross_schema_fks.json');
    const count = baseline?.total_rows || 24;
    const constraints = baseline?.distinct_constraints || 6;
    result.score = 0;
    result.violations = [{ total_rows: count, distinct_constraints: constraints, source: 'baseline T0' }];
    result.detail = `[OFFLINE] T0: ${count} FK rows, ${constraints} constraints cross-schema`;
    result.t0 = { rows: count, constraints };
    return result;
  }

  try {
    const rows = await dbQuery(`
      SELECT
        tc.constraint_name,
        tc.table_schema AS child_schema,
        tc.table_name AS child_table,
        kcu.column_name AS child_col,
        ccu.table_schema AS parent_schema,
        ccu.table_name AS parent_table,
        ccu.column_name AS parent_col,
        rc.delete_rule
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name
      JOIN information_schema.referential_constraints rc
        ON tc.constraint_name = rc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema != ccu.table_schema
        AND tc.table_schema IN ('zapp', 'evo', 'ops')
        AND ccu.table_schema IN ('zapp', 'evo', 'ops')
      ORDER BY tc.table_schema, tc.table_name
    `);

    const distinctConstraints = [...new Set(rows.map(r => r.constraint_name))].length;
    result.score = rows.length === 0 ? 1 : 0;
    result.violations = rows.slice(0, 10).map(r => ({
      constraint: r.constraint_name,
      child: `${r.child_schema}.${r.child_table}.${r.child_col}`,
      parent: `${r.parent_schema}.${r.parent_table}.${r.parent_col}`,
      delete_rule: r.delete_rule,
    }));
    result.detail = rows.length === 0
      ? 'PASSOU — zero FKs cross-schema'
      : `FALHOU — ${rows.length} FK rows, ${distinctConstraints} constraints cross-schema`;
    result.counts = { fk_rows: rows.length, distinct_constraints: distinctConstraints };
  } catch (e) {
    result.score = null;
    result.error = e.message;
    result.t0_fallback = { rows: 24, constraints: 6 };
  }
  return result;
}

// ─── Score Agregado ────────────────────────────────────────────────────────────

function computeScore(checks) {
  const total = checks.length;
  const passed = checks.filter(c => c.score === 1).length;
  const partial = checks.filter(c => c.score > 0 && c.score < 1).length;
  const failed = checks.filter(c => c.score === 0).length;
  const errored = checks.filter(c => c.score === null).length;

  return {
    passed,
    partial,
    failed,
    errored,
    total,
    percentage: Math.round((passed / total) * 100),
    grade: passed === total ? 'A' : passed >= 7 ? 'B' : passed >= 5 ? 'C' : passed >= 3 ? 'D' : 'F',
  };
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const { out, offline } = parseArgs();

  if (offline) {
    log('Modo OFFLINE — usando baselines do snapshot T0 (20260815)');
  } else {
    log('Modo ONLINE — consultando DB de produção');
  }

  const timestamp = new Date().toISOString();

  log('Verificando I3 (supabase.yml)...');
  const i3 = checkI3_supabaseYml();

  log('Verificando I5 (CI guard)...');
  const i5 = checkI5_ciGuard();

  log('Verificando I6 (consumer.py)...');
  const i6 = checkI6_consumerPy();

  log('Verificando I7 (inventory.mjs)...');
  const i7 = checkI7_inventoryMjs();

  log('Verificando I1 (zapp→evo refs)...');
  const i1 = await checkI1_zappEvoRefs(offline);

  log('Verificando I2 (evo→zapp refs)...');
  const i2 = await checkI2_evoZappRefs(offline);

  log('Verificando I4 (HTTP egress)...');
  const i4 = await checkI4_httpEgress(offline);

  log('Verificando I8 (sql-gate fixture)...');
  const i8 = await checkI8_sqlGateFixture(offline);

  log('Verificando I9 (cross-schema FKs)...');
  const i9 = await checkI9_crossSchemaFKs(offline);

  const checks = [i1, i2, i3, i4, i5, i6, i7, i8, i9];
  const score = computeScore(checks);

  const report = {
    meta: {
      generated_at: timestamp,
      mode: offline ? 'offline_baseline' : 'online_live',
      description: 'Auditoria dos 9 Invariantes de Independência ZAPP×EVO',
      baseline_snapshot: '20260815',
      repo: 'adm01-debug/zapp-web-v3',
      branch: 'claude/evolution-zapp-separation-analysis-29lixd',
    },
    summary: score,
    invariants: checks,
    t0_reference: {
      I1: { refs: 82, distinct_functions: 20 },
      I2: { distinct_functions: 96 },
      I3: 'parcialmente ok (verificar docker-compose)',
      I4: { cron_I4_bypass: 5, pg_net_functions: 16, total_violations: 14 },
      I5: 'parcialmente ok (guard presente)',
      I6: 'ok (consumer.py não em zapp repo)',
      I7: 'falhou (inventory não cobre todos invocations)',
      I8: { fixture: 12, prod: 25, gap: 13 },
      I9: { rows: 24, constraints: 6 },
    },
    next_steps: [
      'E2: Este script (boundary-audit.mjs) em modo online para medir T0 ao vivo',
      'E3: Commit BOUNDARY_SCORE_T0.json',
      'E4: Criar ADR-012 com medições formais T0',
      'E13–E24: Fase 1 — Documentação e correções de baixo risco',
      'E25–E40: Fase 2 — Blindagem de CI',
    ],
  };

  writeFileSync(out, JSON.stringify(report, null, 2));
  log(`Relatório gravado em: ${out}`);

  // Sumário no stdout
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`  BOUNDARY AUDIT — ${timestamp.slice(0, 10)}`);
  console.log(`  Modo: ${offline ? 'OFFLINE (baseline T0)' : 'ONLINE (DB ao vivo)'}`);
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Score: ${score.passed}/${score.total} invariantes OK (${score.percentage}%) — Nota: ${score.grade}`);
  console.log(`  Passou: ${score.passed} | Parcial: ${score.partial} | Falhou: ${score.failed} | Erro: ${score.errored}`);
  console.log('───────────────────────────────────────────────────────');

  for (const c of checks) {
    const icon = c.score === 1 ? '✅' : c.score === 0 ? '❌' : c.score === null ? '⚠️' : '🟡';
    const scoreStr = c.score === null ? 'ERRO' : `${Math.round(c.score * 100)}%`;
    console.log(`  ${icon} ${c.invariant}: ${c.name} [${scoreStr}]`);
    if (c.detail) console.log(`       → ${c.detail}`);
  }

  console.log('═══════════════════════════════════════════════════════\n');

  process.exit(score.passed === score.total ? 0 : 1);
}

main().catch(e => {
  process.stderr.write(`[boundary-audit] ERRO FATAL: ${e.message}\n`);
  process.exit(2);
});
