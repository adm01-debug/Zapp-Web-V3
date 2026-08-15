#!/usr/bin/env node
/**
 * score-ratchet.mjs — E97/E98: Ratchet do placar de invariantes de desacoplamento
 *
 * REUSA scripts/decouple/boundary-audit.mjs (não reimplementa os 9 invariantes):
 *   - modo padrão: executa boundary-audit em modo OFFLINE (DB_OFFLINE=1) e lê o
 *     relatório gerado (mesmos 9 invariantes I1..I9);
 *   - modo --score-file: lê um decouple-score.json (artifact do
 *     measure-invariants.yml, que inclui medição real do banco quando
 *     SUPABASE_DB_URL está configurado).
 *
 * Compara o score atual contra o baseline commitado:
 *   1. docs/decouple/BOUNDARY_SCORE_T2.json  (preferido — estado atual documentado)
 *   2. docs/decouple/BOUNDARY_SCORE_T0.json  (fallback — medição inicial)
 *   3. nenhum → cria BOUNDARY_SCORE_T2.json a partir da medição atual e passa.
 *
 * Semântica do ratchet (threshold: NÃO regredir abaixo do baseline, não "== baseline"):
 *   - PASSA (exit 0) se score atual >= baseline;
 *   - FALHA (exit 1) se o score REGREDIU (abaixo do baseline).
 *
 * Invariantes DB (I1/I2/I4/I8/I9) NÃO são mensuráveis offline: nesse modo o
 * boundary-audit apenas replaya o baseline T0 (campos `t0`/`t0_fallback` no
 * relatório). O ratchet adota o valor do baseline COMMITADO para invariantes
 * não medidos ao vivo (sem informação nova → assume-se inalterado); regressões
 * de DB são capturadas pelo modo --score-file (medição com banco real).
 *
 * Uso:
 *   node scripts/decouple/score-ratchet.mjs                     # modo offline (CI/PR)
 *   node scripts/decouple/score-ratchet.mjs --score-file decouple-score.json
 *   node scripts/decouple/score-ratchet.mjs --baseline docs/decouple/BOUNDARY_SCORE_T0.json
 *   node scripts/decouple/score-ratchet.mjs --update            # aperta baseline (manual)
 *   node scripts/decouple/score-ratchet.mjs --allowlist auto    # alias de --update
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..', '..');

const AUDIT_SCRIPT = join(REPO_ROOT, 'scripts', 'decouple', 'boundary-audit.mjs');
const BASELINE_T2 = join(REPO_ROOT, 'docs', 'decouple', 'BOUNDARY_SCORE_T2.json');
const BASELINE_T0 = join(REPO_ROOT, 'docs', 'decouple', 'BOUNDARY_SCORE_T0.json');
const SCORE_FILE_DEFAULT = join(REPO_ROOT, 'decouple-score.json');

const INVARIANT_ORDER = ['I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7', 'I8', 'I9'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(msg) { process.stderr.write(`[score-ratchet] ${msg}\n`); }

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const upd = args.includes('--update') || args.includes('--allowlist');
  let scoreFile = null;
  const sfIdx = args.indexOf('--score-file');
  if (sfIdx !== -1 && args[sfIdx + 1]) scoreFile = args[sfIdx + 1];
  for (const a of args) {
    if (a.startsWith('--score-file=')) scoreFile = a.slice('--score-file='.length);
  }
  let baseline = null;
  const bIdx = args.indexOf('--baseline');
  if (bIdx !== -1 && args[bIdx + 1]) baseline = args[bIdx + 1];
  return { update: upd, scoreFile, baseline };
}

/** Normaliza invariants: aceita array (boundary-audit) ou objeto {I1: {...}} (measure-invariants). */
function normalizeInvariants(report) {
  const inv = report?.invariants;
  if (!inv) return [];
  if (Array.isArray(inv)) return inv;
  return Object.entries(inv).map(([id, v]) => ({ invariant: id, ...v }));
}

/** Extrai (pass, total, invariants) de um relatório de score (boundary-audit ou measure-invariants). */
function extractScore(report) {
  if (!report) return null;
  const invariants = normalizeInvariants(report);
  let pass = null;
  let total = 9;
  if (report.summary && typeof report.summary.passed === 'number') {
    pass = report.summary.passed;
    total = report.summary.total ?? total;
  } else if (report.score && typeof report.score.pass === 'number') {
    pass = report.score.pass;
    total = report.score.total ?? total;
  }
  if (pass === null && invariants.length > 0) {
    pass = invariants.filter(i => i.status === 'PASS' || i.score === 1).length;
    total = invariants.length;
  }
  if (pass === null) return null;
  return { pass, total, invariants };
}

/**
 * Medição atual via boundary-audit OFFLINE (DB_OFFLINE=1).
 * O exit code do boundary-audit é advisory (1 quando < 9/9) — o ratchet ignora
 * e aplica a própria comparação; só falha se o audit nem rodar (exit 2 / spawn).
 */
function runAuditOffline() {
  if (!existsSync(AUDIT_SCRIPT)) {
    throw new Error(`boundary-audit.mjs não encontrado: ${AUDIT_SCRIPT}`);
  }
  const out = join(tmpdir(), `boundary-ratchet-${process.pid}.json`);
  const proc = spawnSync(process.execPath, [AUDIT_SCRIPT, '--out', out], {
    cwd: REPO_ROOT,
    env: { ...process.env, DB_OFFLINE: '1' },
    encoding: 'utf8',
    timeout: 180000,
  });
  const report = existsSync(out) ? readJson(out) : null;
  try { unlinkSync(out); } catch { /* tmp */ }
  if (proc.error) {
    throw new Error(`falha ao executar boundary-audit: ${proc.error.message}`);
  }
  if (proc.status === 2) {
    throw new Error(`boundary-audit falhou (exit 2): ${(proc.stderr || '').slice(0, 500)}`);
  }
  if (!report) {
    throw new Error(`não foi possível ler o relatório do boundary-audit (exit ${proc.status ?? '?'})`);
  }
  return report;
}

/** Medição atual via decouple-score.json (artifact do measure-invariants.yml). */
function readScoreFile(path) {
  const report = readJson(path);
  if (!report) throw new Error(`decouple-score.json ilegível ou ausente: ${path}`);
  return report;
}

function resolveBaseline(explicit) {
  if (explicit) {
    const r = readJson(explicit);
    if (!r) throw new Error(`baseline ilegível: ${explicit}`);
    return { file: explicit, report: r };
  }
  if (existsSync(BASELINE_T2)) return { file: BASELINE_T2, report: readJson(BASELINE_T2) };
  if (existsSync(BASELINE_T0)) return { file: BASELINE_T0, report: readJson(BASELINE_T0) };
  return null;
}

/**
 * Score atual em modo offline: invariantes medidos AO VIVO pelo boundary-audit
 * (I3/I5/I6/I7 — filesystem) contam como medidos; invariantes DB (I1/I2/I4/I8/I9,
 * identificados pelos campos `t0`/`t0_fallback` = replay de baseline) adotam o
 * valor do baseline COMMITADO — sem medição nova, assume-se inalterado.
 */
function currentOffline(report, baselineReport) {
  const cur = new Map(normalizeInvariants(report).map(i => [i.invariant, i]));
  const base = new Map(normalizeInvariants(baselineReport ?? {}).map(i => [i.invariant, i]));

  const rows = [];
  let pass = 0;
  for (const id of INVARIANT_ORDER) {
    const c = cur.get(id);
    if (!c) continue;
    const carried = c.t0 !== undefined || c.t0_fallback !== undefined;
    const b = base.get(id);
    let score = c.score;
    let detail = c.detail || '';
    let note = 'medido ao vivo';
    if (carried && b) {
      score = b.score;
      detail = `${c.detail || ''} [DB não mensurável offline — assume baseline commitado]`;
      note = 'baseline-carried (DB)';
    }
    if (score === 1) pass += 1;
    rows.push({ id, name: c.name || id, baseline: b?.score, current: score, detail, note });
  }
  return { pass, total: rows.length, rows };
}

// ─── Report ───────────────────────────────────────────────────────────────────

function printTable(rows) {
  console.log('');
  console.log('| Invariante | Baseline | Atual | Status |');
  console.log('|------------|----------|-------|--------|');
  for (const r of rows) {
    const status = r.current === 1 ? '✅ PASS' : r.current === 0 ? '❌ FAIL' : '⚠️  N/A';
    console.log(`| ${r.id.padEnd(10)} | ${(r.baseline === 1 ? 'PASS' : r.baseline === 0 ? 'FAIL' : 'n/a').padEnd(8)} | ${(r.current === 1 ? 'PASS' : r.current === 0 ? 'FAIL' : 'n/a').padEnd(5)} | ${status} (${r.note}) |`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const { update, scoreFile, baseline: explicitBaseline } = parseArgs();

  // 1. Medição atual
  let currentReport;
  let mode;
  if (scoreFile) {
    currentReport = readScoreFile(scoreFile);
    mode = `score-file: ${scoreFile}`;
  } else if (existsSync(SCORE_FILE_DEFAULT)) {
    currentReport = readScoreFile(SCORE_FILE_DEFAULT);
    mode = `score-file: ${SCORE_FILE_DEFAULT} (detectado)`;
  } else {
    log('Executando boundary-audit em modo OFFLINE (DB_OFFLINE=1)...');
    currentReport = runAuditOffline();
    mode = 'boundary-audit offline';
  }

  const current = extractScore(currentReport);
  if (!current) {
    console.error('❌ Não foi possível extrair o score do relatório atual.');
    process.exit(2);
  }

  // 2. Baseline
  let baseline = resolveBaseline(explicitBaseline);

  if (update) {
    if (!baseline) {
      baseline = { file: BASELINE_T2, report: null };
    }
    const b = extractScore(baseline.report);
    const regressed = b && current.pass < b.pass;
    if (regressed) {
      console.error(`❌ --update recusado: score atual (${current.pass}/${current.total}) < baseline (${b.pass}/${b.total}). Nunca afrouxe o ratchet.`);
      process.exit(1);
    }
    const t2 = buildBaseline(currentReport, current, `Tightened via score-ratchet --update (${new Date().toISOString()})`);
    writeFileSync(baseline.file, JSON.stringify(t2, null, 2) + '\n');
    console.log(`✅ Baseline atualizado: ${baseline.file} (${current.pass}/${current.total})`);
    process.exit(0);
  }

  if (!baseline) {
    // Sem baseline commitado → cria T2 a partir da medição atual e passa (primeiro run).
    const t2 = buildBaseline(currentReport, current, 'Auto-criado pelo score-ratchet (primeiro run sem baseline)');
    writeFileSync(BASELINE_T2, JSON.stringify(t2, null, 2) + '\n');
    console.log(`ℹ️  Nenhum baseline commitado — BOUNDARY_SCORE_T2.json criado a partir do estado atual.`);
    console.log(`✅ Ratchet inicializado: ${current.pass}/${current.total} (exit 0)`);
    process.exit(0);
  }

  const baseScore = extractScore(baseline.report);
  if (!baseScore) {
    console.error(`❌ Baseline ilegível: ${baseline.file}`);
    process.exit(2);
  }

  // 3. Comparação — modo offline usa medição híbrida (live + baseline-carried)
  const offlineHybrid = mode.startsWith('boundary-audit');
  const currentPass = offlineHybrid ? currentOffline(currentReport, baseline.report) : null;
  const pass = offlineHybrid ? currentPass.pass : current.pass;
  const total = offlineHybrid ? currentPass.total : current.total;
  const baseInvMap = new Map(normalizeInvariants(baseline.report).map(i => [i.invariant, i]));
  const rows = offlineHybrid
    ? currentPass.rows
    : normalizeInvariants(currentReport).map(i => ({
        id: i.invariant,
        name: i.description || i.name || '',
        baseline: baseInvMap.get(i.invariant)?.score,
        current: i.status === 'PASS' || i.score === 1 ? 1 : 0,
        detail: i.detail || '',
        note: i.status ? `status=${i.status}` : `score=${i.score}`,
      }));

  console.log('═══════════════════════════════════════════════════════');
  console.log(`  SCORE RATCHET — invariantes de desacoplamento`);
  console.log(`  Modo: ${mode}`);
  console.log(`  Baseline: ${baseline.file}`);
  console.log('═══════════════════════════════════════════════════════');
  printTable(rows);
  console.log('───────────────────────────────────────────────────────');
  console.log(`  Score atual: ${pass}/${total} | Baseline: ${baseScore.pass}/${baseScore.total}`);

  if (pass < baseScore.pass) {
    console.error(`\n❌ REGRESSÃO: score ${pass}/${total} abaixo do baseline ${baseScore.pass}/${baseScore.total}.`);
    console.error(`   Threshold: não regredir abaixo de ${baseScore.pass}/${baseScore.total} (não "== ${baseScore.pass}").`);
    console.error(`   Corrija a regressão ou, após melhoria deliberada, aperte o baseline: node scripts/decouple/score-ratchet.mjs --update`);
    process.exit(1);
  }

  console.log(`\n✅ Ratchet OK — score ${pass}/${total} >= baseline ${baseScore.pass}/${baseScore.total} (exit 0)`);
  if (pass > baseScore.pass) {
    console.log(`💡 Score melhorou! Aperte o baseline com: node scripts/decouple/score-ratchet.mjs --update`);
  }
  process.exit(0);
}

/** Monta um baseline no shape do boundary-audit (meta/summary/invariants). */
function buildBaseline(currentReport, current, note) {
  const invariants = normalizeInvariants(currentReport);
  return {
    meta: {
      generated_at: new Date().toISOString(),
      mode: 'committed_baseline',
      description: 'Baseline T2 do ratchet de invariantes de desacoplamento (E97/E98)',
      note,
      repo: 'adm01-debug/zapp-web-v3',
    },
    summary: {
      passed: current.pass,
      partial: invariants.filter(i => i.score != null && i.score > 0 && i.score < 1).length,
      failed: invariants.filter(i => i.score === 0).length,
      errored: invariants.filter(i => i.score === null).length,
      total: current.total,
      percentage: Math.round((current.pass / current.total) * 100),
      grade: current.pass === current.total ? 'A' : current.pass >= 7 ? 'B' : current.pass >= 5 ? 'C' : current.pass >= 3 ? 'D' : 'F',
    },
    invariants: invariants.map(i => ({
      invariant: i.invariant,
      name: i.name,
      score: i.score,
      status: i.status ?? (i.score === 1 ? 'PASS' : i.score === 0 ? 'FAIL' : 'WARN'),
      detail: i.detail,
    })),
  };
}

try {
  main();
} catch (e) {
  console.error(`[score-ratchet] ERRO FATAL: ${e.message}`);
  process.exit(2);
}
