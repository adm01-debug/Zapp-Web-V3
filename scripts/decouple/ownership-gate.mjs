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
  // Lote 2 — 2026-08-13 (10 tabelas de baixo risco + fn_calculate_daily_kpis corrigida)
  'evolution_chatbot_responses',   // 3 linhas — respostas de chatbot
  'evolution_group_messages',      // 0 linhas — mensagens de grupo
  'evolution_group_rules',         // 0 linhas — regras de grupo
  'evolution_ip_blocklist',        // 0 linhas — blocklist de IP
  'evolution_label_associations',  // 0 linhas — associações de labels
  'evolution_scheduled_messages',  // 0 linhas — mensagens agendadas
  'evolution_tag_assignments',     // 0 linhas — atribuições de tags
  'evolution_template_usage',      // 0 linhas — uso de templates
  'evolution_message_queue',       // 0 linhas — fila de mensagens (2 TS writes migrated)
  'evolution_automation_logs',     // 0 linhas — logs de automação
  // Lote 3 — 2026-08-13 (10 tabelas + 7 funções corrigidas + 2 RPCs SETOF fixadas)
  'evolution_retry_metrics',       // 3325 linhas — métricas de retry
  'evolution_sentiment_analysis',  // 0 linhas — análise de sentimento
  'evolution_daily_metrics',       // 1 linha — métricas diárias
  'evolution_send_idempotency',    // 0 linhas — idempotência de envio
  'evolution_reactions',           // 219 linhas — reações
  'evolution_bitrix_queue',        // 0 linhas — fila Bitrix (5 TS writes migrated)
  'evolution_notification_config', // 1 linha — config de notificação
  'evolution_notification_log',    // 81 linhas — log de notificação
  'evolution_calls',               // 70 linhas — chamadas
  'evolution_message_templates',   // 0 linhas — templates (1 TS write migrated)
  // Lote 4 — 2026-08-13 (5 tabelas + 18 fns + 1 cron corrigidos)
  'evolution_webhook_dlq',          // 0 linhas — DLQ de webhooks (1 TS write migrated)
  'evolution_notification_outbox',  // 2 linhas — outbox de notificações
  'evolution_notifications',        // 8666 linhas — notificações
  'evolution_followup_rules',       // 4 linhas — regras de followup (3 TS writes migrated)
  'evolution_followups',            // 0 linhas — followups (1 TS write migrated)
  // Lote 5 — 2026-08-13 (13 tabelas + 18 fns + [H1] anon search_path corrigidos)
  'evolution_realtime_events',      // 1569 linhas — eventos realtime (cron purge_realtime_events)
  'evolution_business_hours',       // 7 linhas — horário comercial
  'evolution_holidays',             // 11 linhas — feriados
  'evolution_stage_mapping',        // 14 linhas — mapa de estágios
  'evolution_tags',                 // 24 linhas — tags
  'evolution_quick_replies',        // 13 linhas — respostas rápidas
  'evolution_labels',               // 9 linhas — labels
  'evolution_groups',               // 221 linhas — grupos
  'evolution_group_participants',   // 10714 linhas — participantes de grupo
  'evolution_tasks',                // 6 linhas — tarefas
  'evolution_deals',                // 9 linhas — negócios/deals
  'evolution_whatsapp_status',      // 16101 linhas — status WhatsApp
  'evolution_performance_metrics',  // 11 linhas — métricas de performance (bônus)
  // Lote 6 — 2026-08-13 (4 tabelas médias + [A17] DDL-antes-de-EXECUTE + técnica EXECUTE+replace())
  'evolution_settings',              // 43 linhas — configurações
  'evolution_audit_log',             // 3.9k linhas — log de auditoria
  'evolution_media',                 // 17.6k linhas — mídias
  'evolution_instance_credentials',  // 1 linha — credenciais de instância
  // Lote 7 — 2026-08-13 (6 tabelas fáceis)
  'evolution_source_shadow_log',     // 2 linhas — shadow log de rota canônica
  'evolution_license_health_log',    // ~0 linhas — saúde de licença
  'evolution_burnin_tracker',        // 1 linha — burn-in tracker
  'evolution_incident_runbook',      // 10 linhas — runbook de incidentes
  'evolution_logpatch_audit',        // 379 linhas — auditoria de logpatch
  'evolution_api_consumers',         // 6 linhas — consumidores de API
  // ── GRUPO A SKIP — fica em evo; escrita legítima de edge fn de infra ────────
  // Tabela não migra para zapp. A edge fn de ingestão escreve aqui legitimamente.
  'ingest_ledger',  // evolution-webhook/index.ts:414,432 — ledger de ingestão (Grupo A)
  // Lote 8 — 2026-08-13 (evolution_alerts: 60 ocorr. fns + 9 crons + 3 trigs — EXECUTE+replace() em massa)
  'evolution_alerts',    // 1150 linhas — alertas de sistema (1 TS write: gmail-token-refresh:162)
  // Lote 8B — 2026-08-13 (7 tabelas baixa prioridade, 0 fns literais, 0 writes TS detectados)
  'evolution_sales_pipeline',       // 0 linhas — pipeline de vendas
  'evolution_keyword_automations',  // 0 linhas — automações por keyword
  'evolution_contact_rate_limits',  // 0 linhas — rate limits de contato
  'evolution_mirror_batches',       // 0 linhas — batches de espelho
  'evolution_mirror_checkpoints',   // 0 linhas — checkpoints de espelho
  'evolution_mirror_media_queue',   // 0 linhas — fila de mídia espelho
  'evolution_monthly_audit_log',    // 2 linhas — log de auditoria mensal (fn_monthly_evo_audit corrigida [A7])
]);

// ── BASELINE ────────────────────────────────────────────────────────────────
// Decrementar total conforme tabelas são migradas E seus writes são eliminados.
// Nota: SET SCHEMA reduz o SCHEMA de destino mas não elimina o write do código.
//       O write vira "legítimo" (conta como migrated), não "eliminado".
//       Para eliminar: refatorar o código para não escrever diretamente.
const BASELINE = {
  total:      16,   // 17 - 1 (evolution_alerts migrada: gmail-token-refresh:162 agora é write legítimo)
  migrated:   23,   // 22 + 1 (evolution_alerts: gmail-token-refresh:162)
  eliminated:  0,   // writes eliminados por refatoração de código
  updated_at: '2026-08-13-lote8',
};

// ── GRUPO A — Evolution-stack owns. Zero tolerância. ────────────────────────
const GRUPO_A = new Set([
  'evolution_rabbit_consumer_stats',
  'evolution_webhook_events_v2',
  'evolution_traefik_401_stats',
  'evolution_connection_history',
  'evolution_guardian_heartbeat',
  'evolution_bootstrap_log',
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
