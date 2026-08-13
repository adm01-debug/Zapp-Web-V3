#!/usr/bin/env node
/**
 * ownership-gate.mjs — Gate de propriedade de schema
 *
 * Regra: zapp-web-v3 pode LER evo.*, NUNCA gravar em Grupo A (evolution-stack owns).
 * Grupo B = Zapp grava; tabelas devem migrar para zapp via SET SCHEMA.
 * MIGRATED_TO_ZAPP = já foram movidas; writes são legítimos (contar como OK).
 *
 * Uso: node scripts/decouple/ownership-gate.mjs [--ci]
 *
 * Para decrementar o baseline:
 *   1. Mover tabela via SET SCHEMA evo→zapp (ver docs/decouple/PREFLIGHT_CHECKLIST.md)
 *   2. Adicionar tabela em MIGRATED_TO_ZAPP
 *   3. Decrementar BASELINE.total
 *   4. Commit
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dir, '..', '..');
const CI    = process.argv.includes('--ci');

// ── HISTÓRICO DE MIGRAÇÕES ──────────────────────────────────────────────────
// Tabelas já migradas para zapp via SET SCHEMA. Writes a elas são legítimos.
// Atualizar conforme cada migração é executada.
const MIGRATED_TO_ZAPP = new Set([
  // Lote 1 — 2026-08-13 (5 tabelas de baixo risco)
  'evolution_spam_keywords',     // 5 linhas — automação de spam
  'evolution_source_schema_map', // 0 linhas — mapa de schema fonte
  'evolution_mirror_runs',       // 0 linhas — runs de mirror
  'evolution_status_reactions',  // 0 linhas — reações de status
  'evolution_fallback_events',   // 0 linhas — eventos de fallback
]);

// ── BASELINE ────────────────────────────────────────────────────────────────
// Decrementar total conforme tabelas são migradas E seus writes são eliminados.
// Nota: SET SCHEMA reduz o SCHEMA de destino mas não elimina o write do código.
//       O write vira "legítimo" (conta como migrated), não "eliminado".
//       Para eliminar: refatorar o código para não escrever diretamente.
const BASELINE = {
  total:      38,   // 39 original - 1 (evolution_fallback_events now migrated)
  migrated:    1,   // writes que viraram legítimos por migração
  eliminated:  0,   // writes eliminados por refatoração de código
  updated_at: '2026-08-13',
};

// ── GRUPO A — Evolution-stack owns. Zero tolerância. ────────────────────────
const GRUPO_A = new Set([
  'evolution_rabbit_consumer_stats',
  'evolution_webhook_events_v2',
  'evolution_traefik_401_stats',
  'evolution_connection_history',
  'evolution_guardian_heartbeat',
  'evolution_bootstrap_log',
  'evolution_burnin_tracker',
  'evolution_license_health_log',
  'evolution_pipeline_health_log',
  'evolution_pipeline_history',
  'evolution_reconcile_jobs',
  'evolution_reconcile_health_log',
  'e2e_probe_results',
  'migration_watermark',
  'lid_phone_map',
  'contact_identity',
  'lid_convergence_history',
  'vps_scenario_status','vps_comments','vps_diagnostic_runs','vps_etapas','ops_runbooks',
  'idx_usage_audit',
  'media_loss_registry','media_orphan_triage','media_scan_log',
  'media_dedupe_log','media_cleanup_log',
]);

const WRITE_OPS = ['insert(','update(','upsert(','delete('];
const FROM_RE = /from\s*\(\s*['"`](evolution_[a-z_0-9]+|media_[a-z_]+|contact_identity|lid_phone_map|ingest_ledger|lid_convergence_history)['"`]\s*\)/;

function walk(dir, exts=['.ts','.tsx'], acc=[]) {
  let e; try { e=readdirSync(dir); } catch { return acc; }
  for (const f of e) {
    if (['node_modules','graphify-out','.git','dist'].includes(f)) continue;
    const full=join(dir,f); let s; try { s=statSync(full); } catch { continue; }
    if (s.isDirectory()) walk(full,exts,acc);
    else if (exts.includes(extname(f))) acc.push(full);
  }
  return acc;
}

function scan(subdir) {
  const v=[];
  for (const file of walk(join(ROOT,subdir))) {
    if (file.includes('__tests__')||file.match(/\.(test|spec)\./)) continue;
    const lines=readFileSync(file,'utf8').split('\n');
    for (let i=0;i<lines.length;i++) {
      const m=lines[i].match(FROM_RE);
      if (!m) continue;
      const ctx=lines.slice(i,i+7).join('\n');
      for (const op of WRITE_OPS) {
        if (ctx.includes(op)) {
          const table=m[1];
          v.push({
            file:      file.replace(ROOT+'/',''),
            line:      i+1,
            table,
            op:        op.replace('(',''),
            critical:  GRUPO_A.has(table),
            migrated:  MIGRATED_TO_ZAPP.has(table),
          });
          break;
        }
      }
    }
  }
  return v;
}

const ev    = scan('supabase/functions');
const fv    = scan('src');
const all   = [...ev,...fv];
const crits = all.filter(x=>x.critical);
const migs  = all.filter(x=>x.migrated && !x.critical);
const pends = all.filter(x=>!x.critical && !x.migrated);
const total_pendente = pends.length; // criticals excluídos, migrated excluídos

const hr='═'.repeat(60);
console.log(`\n${hr}`);
console.log('  OWNERSHIP GATE — zapp-web-v3 write→evo audit');
console.log(hr);
console.log(`  Baseline total: ${BASELINE.total} (${BASELINE.updated_at})`);
console.log(`  Encontrado:     ${pends.length} pendente(s) + ${migs.length} migrado(s) + ${crits.length} crítico(s)`);
console.log(`  Meta pendentes: 0  |  Críticos: 0\n`);

if (crits.length) {
  console.log('  🔴 CRÍTICOS (Grupo A — Evolution-stack owns):');
  for (const v of crits)
    console.log(`     ${v.file}:${v.line}  evo.${v.table}.${v.op}()`);
  console.log('');
}
if (migs.length) {
  console.log('  ✅ MIGRADOS (escrevem para zapp agora, não mais evo):');
  for (const v of migs)
    console.log(`     ${v.file}:${v.line}  zapp.${v.table}.${v.op}()  (movida ${BASELINE.updated_at})`);
  console.log('');
}
if (pends.length) {
  console.log('  🟡 PENDENTES (Grupo B — migrar para zapp ou usar RPC):');
  const byTable={};
  for (const v of pends) { byTable[v.table]=byTable[v.table]||[]; byTable[v.table].push(v); }
  for (const [tbl, vs] of Object.entries(byTable).sort()) {
    console.log(`     evo.${tbl}: ${vs.length} escrita(s)`);
    for (const v of vs.slice(0,3)) console.log(`       → ${v.file}:${v.line} .${v.op}()`);
    if (vs.length>3) console.log(`       → ...+${vs.length-3} mais`);
  }
  console.log('');
}

let ex=0;
if (crits.length>0) { console.error(`❌ FALHOU: ${crits.length} escrita(s) em Grupo A`); ex=1; }
if (CI && pends.length > BASELINE.total) { console.error(`❌ FALHOU: regressão +${pends.length-BASELINE.total}`); ex=1; }
if (ex===0) {
  if (pends.length < BASELINE.total)
    console.log(`✅ PROGRESSO: ${BASELINE.total-pends.length} escrita(s) menos que baseline. Restam ${pends.length}. Atualizar BASELINE.total.`);
  else if (pends.length === BASELINE.total)
    console.log(`✅ OK: ${pends.length} pendentes (igual ao baseline ${BASELINE.total}, sem regressão)`);
}
console.log(`${hr}\n`);
if (CI) process.exit(ex);
