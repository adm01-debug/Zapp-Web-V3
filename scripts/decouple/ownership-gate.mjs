#!/usr/bin/env node
/**
 * ownership-gate.mjs — Gate de propriedade de schema
 *
 * Regra: zapp-web-v3 pode LER evo.*, NUNCA gravar diretamente em Grupo A.
 * Grupo B = Zapp pode gravar enquanto migração não termina (meta: mover para zapp).
 *
 * Uso: node scripts/decouple/ownership-gate.mjs [--ci]
 * Baseline: 2026-08-13, commit 891b1ad73
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dir, '..', '..');
const CI    = process.argv.includes('--ci');

// Atualizar total conforme cada escrita é eliminada. Meta: 0.
const BASELINE = { total: 39, updated_at: '2026-08-13' };

// Grupo A — Evolution-stack é dono. Zapp JAMAIS deve gravar. Exit 1.
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
          v.push({file:file.replace(ROOT+'/',''),line:i+1,table:m[1],op:op.replace('(',''),critical:GRUPO_A.has(m[1])});
          break;
        }
      }
    }
  }
  return v;
}

const ev=scan('supabase/functions'), fv=scan('src');
const all=[...ev,...fv], total=all.length, crits=all.filter(x=>x.critical);

const hr='═'.repeat(56);
console.log(`\n${hr}`);
console.log('  OWNERSHIP GATE — zapp-web-v3 write→evo audit');
console.log(hr);
console.log(`  Baseline: ${BASELINE.total} (${BASELINE.updated_at}) | Atual: ${total} | Meta: 0`);
console.log(`  Edge: ${ev.length} | Front: ${fv.length} | Críticos Grupo A: ${crits.length}\n`);

for (const v of crits) console.log(`  🔴 CRÍTICO  ${v.file}:${v.line}  evo.${v.table}.${v.op}()`);
for (const v of all.filter(x=>!x.critical)) console.log(`  🟡 PENDENTE ${v.file}:${v.line}  evo.${v.table}.${v.op}()`);
if (all.length) console.log('');

let ex=0;
if (crits.length>0) { console.error(`❌ FALHOU: ${crits.length} escrita(s) em Grupo A`); ex=1; }
if (CI && total>BASELINE.total) { console.error(`❌ FALHOU: regressão +${total-BASELINE.total}`); ex=1; }
if (ex===0) {
  total<BASELINE.total
    ? console.log(`✅ PROGRESSO: ${BASELINE.total-total} eliminadas. Restam ${total}. Atualizar BASELINE.total.`)
    : console.log(`✅ OK: ${total} escritas (sem regressão)`);
}
console.log(`${hr}\n`);
if (CI) process.exit(ex);
