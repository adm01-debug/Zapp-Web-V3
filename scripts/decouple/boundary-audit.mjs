#!/usr/bin/env node
/**
 * boundary-audit.mjs — Auditoria dos 9 Invariantes de Independência ZAPP×EVO
 * (PLANO_INDEPENDENCIA_100_ETAPAS_20260815 — E2/E20)
 *
 * Uso:
 *   node scripts/decouple/boundary-audit.mjs [--out <arquivo.json>] [--offline]
 *
 * Modo ONLINE (padrão): mede os invariantes CONTRA O BANCO REAL via a RPC
 * fechada ops.fn_boundary_audit() (migration 20260815250000), chamada por
 * PostgREST. Requer:
 *   SUPABASE_URL          ex: https://supabase.atomicabr.com.br
 *   SUPABASE_SERVICE_KEY  service_role key (a RPC só concede EXECUTE a service_role)
 *
 * Modo OFFLINE (--offline ou DB_OFFLINE=1): replay do último score commitado,
 * SEMPRE marcado como stale e SEMPRE exit code 3. Offline não é evidência —
 * ver cenário C9 do plano. O ratchet NÃO deve aceitar score offline como base.
 *
 * Nota histórica: a versão anterior deste script tentava POST {SUPABASE_URL}/pg/query
 * (Supabase Meta API), endpoint que NÃO é exposto pelo Kong no self-hosted — o modo
 * online nunca funcionou e o CI validava silenciosamente o baseline commitado.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const SCORE_DIR = join(REPO_ROOT, 'docs', 'decouple');

function log(msg) { process.stderr.write(`[boundary-audit] ${msg}\n`); }

function parseArgs() {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--out');
  const out = idx !== -1 ? args[idx + 1] : join(SCORE_DIR, 'BOUNDARY_SCORE_LIVE.json');
  const offline = process.env.DB_OFFLINE === '1' || args.includes('--offline');
  return { out, offline };
}

async function fetchAudit() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL e SUPABASE_SERVICE_KEY são obrigatórios no modo online');
  const resp = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/fn_boundary_audit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Profile': 'ops',
      'Accept-Profile': 'ops',
    },
    body: '{}',
  });
  if (!resp.ok) throw new Error(`RPC fn_boundary_audit falhou (${resp.status}): ${(await resp.text()).slice(0, 300)}`);
  return resp.json();
}

// ─── Checks de filesystem (medem o repo, não o banco) ─────────────────────────

function checkI6_platformSovereignty() {
  const violations = [];
  const localInfra = readdirSync(REPO_ROOT).filter(f => f.startsWith('docker-compose') && /evo/i.test(f));
  for (const f of localInfra) violations.push({ file: f, reason: 'infra evolution dentro do zapp-web-v3' });
  const proofPath = join(SCORE_DIR, 'PROOF_I6_PLATFORM_SOVEREIGNTY.md');
  if (!existsSync(proofPath)) {
    violations.push({ check: 'E27/E37', reason: 'stacks/supabase.yml segue no evolution-stack; prova de soberania ausente (PROOF_I6_PLATFORM_SOVEREIGNTY.md)' });
  }
  return {
    invariant: 'I6',
    name: 'Cada repo deploya só a sua infra (soberania de plataforma)',
    score: violations.length === 0 ? 1 : 0,
    violations,
    detail: violations.length === 0 ? 'Soberania provada (E37)' : 'Plataforma do ZAPP ainda deployada pelo repo do provider',
  };
}

function checkI7_migrationOwnership() {
  const dir = join(REPO_ROOT, 'supabase', 'migrations');
  const violations = [];
  if (existsSync(dir)) {
    const ddlRx = /\b(CREATE|ALTER|DROP)\s+(OR\s+REPLACE\s+)?(TABLE|FUNCTION|PROCEDURE|VIEW|MATERIALIZED\s+VIEW|INDEX|TRIGGER|POLICY|SEQUENCE|TYPE|SCHEMA)\b[^;]{0,500}?\bevo\./is;
    for (const f of readdirSync(dir).filter(f => f.endsWith('.sql'))) {
      if (ddlRx.test(readFileSync(join(dir, f), 'utf8'))) {
        violations.push({ file: 'supabase/migrations/' + f, reason: 'DDL em evo.* — dono é o evolution-stack (E39/E42)' });
      }
    }
  }
  return {
    invariant: 'I7',
    name: 'Dono único de migrations em evo (zero DDL evo.* neste repo)',
    score: violations.length === 0 ? 1 : 0,
    violations: violations.slice(0, 50),
    violationCount: violations.length,
    detail: violations.length === 0 ? 'Nenhuma migration deste repo faz DDL em evo' : `${violations.length} migration(s) fazem DDL em evo.*`,
  };
}

function checkI9_substitutability() {
  const ensaio = join(SCORE_DIR, 'ENSAIO_TROCA_PROVIDER_MEDIDO.md');
  const ok = existsSync(ensaio);
  return {
    invariant: 'I9',
    name: 'Troca de provider sem tocar UI nem PL/pgSQL (ensaio E91–E95 medido)',
    score: ok ? 1 : 0,
    violations: ok ? [] : [{ check: 'E91-E95', reason: 'nenhum ensaio cronometrado registrado (ENSAIO_TROCA_PROVIDER_MEDIDO.md ausente)' }],
    detail: ok ? 'Ensaio de substituibilidade registrado' : 'Independência não exercitada',
  };
}

// ─── Mapeamento do JSON da RPC → invariantes do plano ─────────────────────────

function buildDbChecks(a) {
  const zero = (v) => Number(v) === 0;
  return [
    { invariant: 'I1', name: 'Zero funções do schema evo escrevendo/citando zapp.*',
      score: zero(a.I1_fns_evo_citando_zapp) ? 1 : 0,
      violations: zero(a.I1_fns_evo_citando_zapp) ? [] : [{ fns: a.I1_fns_evo_citando_zapp, triggers_zapp_com_fn_evo: a.aux_triggers_zapp_com_fn_evo }],
      detail: `${a.I1_fns_evo_citando_zapp} fns evo citam zapp.* (+${a.aux_triggers_zapp_com_fn_evo} triggers em zapp com fn evo)` },
    { invariant: 'I2', name: 'Zero funções do schema zapp escrevendo/citando evo.*',
      score: zero(a.I2_fns_zapp_citando_evo) ? 1 : 0,
      violations: zero(a.I2_fns_zapp_citando_evo) ? [] : [{ fns: a.I2_fns_zapp_citando_evo }],
      detail: `${a.I2_fns_zapp_citando_evo} fns zapp citam evo.*` },
    { invariant: 'I3', name: 'Zero FKs cruzando a fronteira evo↔zapp',
      score: zero(a.I3_fks_cruzadas) ? 1 : 0,
      violations: zero(a.I3_fks_cruzadas) ? [] : [{ constraints: a.I3_fks_cruzadas }],
      detail: `${a.I3_fks_cruzadas} constraints FK cruzadas` },
    { invariant: 'I4', name: 'Dado da Evolution reside no schema evo',
      score: zero(a.I4_tabelas_evolution_fora_de_evo) ? 1 : 0,
      violations: zero(a.I4_tabelas_evolution_fora_de_evo) ? [] : [{ tabelas_fora_de_evo: a.I4_tabelas_evolution_fora_de_evo, phys_refs_pendentes_E67: a.aux_phys_refs_fns_zapp_evolution }],
      detail: `${a.I4_tabelas_evolution_fora_de_evo}/3 tabelas fora de evo; ${a.aux_phys_refs_fns_zapp_evolution} fns citam o nome físico (E67–E69)` },
    { invariant: 'I5', name: 'Leitura do outro lado só por view de contrato',
      score: zero(a.I5_grants_authenticated_select_evo) ? 1 : 0,
      violations: zero(a.I5_grants_authenticated_select_evo) ? [] : [{ grants_authenticated_select_evo: a.I5_grants_authenticated_select_evo }],
      detail: `${a.I5_grants_authenticated_select_evo} grants SELECT de authenticated direto em evo.* (E80)` },
    { invariant: 'I8', name: 'Todo egresso HTTP ao provider via gateway declarado',
      score: zero(a.I8_fns_pgnet_provider_fora_gateway) ? 1 : 0,
      violations: zero(a.I8_fns_pgnet_provider_fora_gateway) ? [] : [{ fns_pgnet_provider: a.I8_fns_pgnet_provider_fora_gateway, cron_citando_evo: a.aux_cron_citando_evo }],
      detail: `${a.I8_fns_pgnet_provider_fora_gateway} fns falam com o provider por pg_net fora do gateway (P4, E84–E85)` },
  ];
}

function computeScore(checks) {
  const passed = checks.filter(c => c.score === 1).length;
  const failed = checks.filter(c => c.score === 0).length;
  const errored = checks.filter(c => c.score === null).length;
  const total = checks.length;
  return { passed, partial: 0, failed, errored, total,
    percentage: Math.round((passed / total) * 100),
    grade: passed === total ? 'A' : passed >= 7 ? 'B' : passed >= 5 ? 'C' : passed >= 3 ? 'D' : 'F' };
}

async function main() {
  const { out, offline } = parseArgs();
  const timestamp = new Date().toISOString();

  if (offline) {
    log('Modo OFFLINE — replay do último score commitado. ISTO NÃO É EVIDÊNCIA (C9).');
    for (const f of ['BOUNDARY_SCORE_T3.json', 'BOUNDARY_SCORE_T2.json', 'BOUNDARY_SCORE_T0.json']) {
      const p = join(SCORE_DIR, f);
      if (existsSync(p)) {
        const j = JSON.parse(readFileSync(p, 'utf8'));
        console.log(`[STALE] replay de ${f} — gerado em ${j.meta?.generated_at} — score ${j.summary?.passed}/${j.summary?.total}`);
        break;
      }
    }
    process.exit(3); // offline nunca passa: força o CI a rodar online ou falhar explicitamente
  }

  log('Modo ONLINE — RPC ops.fn_boundary_audit() contra o banco de produção');
  const audit = await fetchAudit();
  const checks = [...buildDbChecks(audit), checkI6_platformSovereignty(), checkI7_migrationOwnership(), checkI9_substitutability()];
  const score = computeScore(checks);

  const report = {
    meta: {
      generated_at: timestamp,
      measured_at_db: audit.measured_at,
      mode: 'online_live',
      description: 'Auditoria dos 9 invariantes do PLANO_INDEPENDENCIA_100_ETAPAS_20260815, medidos contra o banco real via ops.fn_boundary_audit()',
      repo: 'adm01-debug/zapp-web-v3',
    },
    summary: score,
    invariants: checks,
    raw_db_measurement: audit,
  };

  writeFileSync(out, JSON.stringify(report, null, 2));
  log(`Relatório gravado em: ${out}`);

  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`  BOUNDARY AUDIT — ${timestamp.slice(0, 10)} — ONLINE (banco real)`);
  console.log(`  Score: ${score.passed}/${score.total} (${score.percentage}%) — Nota: ${score.grade}`);
  console.log('───────────────────────────────────────────────────────');
  for (const c of checks) {
    console.log(`  ${c.score === 1 ? '✅' : '❌'} ${c.invariant}: ${c.name}`);
    if (c.detail) console.log(`       → ${c.detail}`);
  }
  console.log('═══════════════════════════════════════════════════════\n');
  process.exit(score.passed === score.total ? 0 : 1);
}

main().catch(e => { process.stderr.write(`[boundary-audit] ERRO FATAL: ${e.message}\n`); process.exit(2); });
