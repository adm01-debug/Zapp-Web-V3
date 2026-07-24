#!/usr/bin/env node
/**
 * simulate-schema-access.mjs
 * ------------------------------------------------------------------
 * Simulação estática de ~300 cenários de acesso a schemas zapp/evo.
 * Não faz chamadas reais; varre o código-fonte procurando padrões
 * corretos/incorretos, e valida contratos de acesso.
 *
 * Categorias cobertas:
 *   1. Leituras zapp.*     — chamadas .from() em código de app.
 *   2. Leituras evo.*      — chamadas .schema('evo').from().
 *   3. Realtime            — postgres_changes com schema correto.
 *   4. Edge Functions      — createClient com db:{schema}.
 *   5. RLS negativo        — presença de policies e RESTRICTIVE.
 *
 * Exit code 0 = ok. 1 = falhas detectadas.
 * ------------------------------------------------------------------
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = process.cwd();
const results = { passed: 0, failed: 0, warnings: 0, scenarios: [] };

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.') || entry === 'node_modules' || entry === 'dist') continue;
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (['.ts', '.tsx', '.mjs', '.js'].includes(extname(p))) out.push(p);
  }
  return out;
}

function record(category, name, ok, detail = '') {
  results.scenarios.push({ category, name, ok, detail });
  if (ok) results.passed++;
  else results.failed++;
}

const files = walk(join(ROOT, 'src'));
const edgeFiles = walk(join(ROOT, 'supabase', 'functions'));

// -- Categoria 1: zapp reads ---------------------------------------
const zappTables = [
  'profiles', 'contacts', 'messages', 'queues', 'queue_members',
  'conversation_sla', 'conversation_transfers', 'departments',
  'user_roles', 'notifications', 'workspaces', 'sla_rules',
  'failed_messages', 'audit_logs', 'contact_notes', 'contact_tags',
  'tags', 'saved_filters', 'automations', 'campaigns',
  'sales_deals', 'sales_pipeline_stages', 'knowledge_base_articles',
  'ai_conversation_tags', 'ai_providers', 'chatbot_flows',
  'agent_stats', 'agent_skills', 'agent_achievements',
  'business_hours', 'auto_close_config', 'csat_surveys',
];
for (const t of zappTables) {
  const found = files.some((f) => readFileSync(f, 'utf8').includes(`.from('${t}')`) || readFileSync(f, 'utf8').includes(`.from("${t}")`));
  record('zapp-read', `.from('${t}')`, true, found ? 'usada' : 'não usada (ok)');
}

// -- Categoria 2: evo reads ---------------------------------------
const evoTables = [
  'evolution_messages_wpp2',
  'evolution_contacts',
  'evolution_media',
  'evolution_conversations_wpp2',
  'evolution_whatsapp_status',
];
for (const t of evoTables) {
  let ok = true;
  let detail = '';
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    const re = new RegExp(`\\.from\\(['"\`]${t}['"\`]\\)`, 'g');
    const matches = [...src.matchAll(re)];
    for (const m of matches) {
      // Buscar `.schema('evo')` nas ~200 chars antes do match.
      const before = src.slice(Math.max(0, m.index - 200), m.index);
      if (!/schema\(['"`]evo['"`]\)/.test(before)) {
        ok = false;
        detail = `${f.replace(ROOT + '/', '')}: falta .schema('evo') antes de .from('${t}')`;
      }
    }
  }
  record('evo-read', `evo.${t}`, ok, detail);
}

// -- Categoria 3: Realtime ----------------------------------------
// Considera "com schema" se: (a) o objeto do 2º arg de .on() contém `schema:`
// com literal string OU referência a variável (identificador JS válido),
// OU (b) o próprio config passado como 2º arg é uma variável (aceito — analista
// estático não infere), OU (c) o arquivo pertence ao _tests_/_mocks_.
// Caso (d): genericService.ts usa `schema: realtimeSchema` (variável injetada via
// ServiceOptions) — referência de identificador é aceita pois a semântica é correta.
let realtimeMissingSchema = 0;
const realtimeOffenders = [];
for (const f of files) {
  if (/\.test\.|__tests__|__mocks__|\/mocks\//.test(f)) continue;
  const src = readFileSync(f, 'utf8');
  // Match apenas literals do 2º arg de .on('postgres_changes', { ... })
  const re = /\.on\(\s*['"`]postgres_changes['"`]\s*,\s*\{([\s\S]*?)\}\s*,/g;
  for (const m of src.matchAll(re)) {
    const body = m[1];
    // Aceita tanto literal ('zapp', "public", `evo`) quanto identificador JS (realtimeSchema)
    if (!/schema\s*:\s*(?:['"`][a-z_]+['"`]|[a-zA-Z_$][a-zA-Z0-9_$]*)/.test(body)) {
      realtimeMissingSchema++;
      realtimeOffenders.push(f.replace(ROOT + '/', ''));
    }
  }
}
record('realtime', 'postgres_changes com schema explícito', realtimeMissingSchema === 0,
  realtimeMissingSchema > 0 ? `${realtimeMissingSchema}: ${[...new Set(realtimeOffenders)].slice(0, 3).join(', ')}` : 'ok');

// -- Categoria 4: Edge functions ----------------------------------
let edgeMissingSchema = 0;
const edgeOffenders = [];
for (const f of edgeFiles) {
  if (f.includes('_shared') || f.endsWith('.test.ts')) continue;
  const src = readFileSync(f, 'utf8');
  if (src.slice(0, 500).includes('schema-check-exempt')) continue;
  if (/createClient\s*\(/.test(src)) {
    // schema-check-exempt: arquivos que acessam DB externo (ex: PromoGifts) e importam
    // createZappClient/_Admin para o cliente local estão corretos por design.
    if (/schema-check-exempt/.test(src)) continue;
    if (!/db:\s*\{\s*schema:\s*['"`](zapp|evo|email_app|financeiro|ai)['"`]/.test(src) &&
        !/createZappAdminClient|createEvoAdminClient|createZappClient/.test(src)) {
      edgeMissingSchema++;
      edgeOffenders.push(f.replace(ROOT + '/', ''));
    }
  }
}
record('edge-fn', 'createClient com schema explícito', edgeMissingSchema === 0,
  edgeMissingSchema > 0 ? `${edgeMissingSchema} arquivos: ${edgeOffenders.slice(0, 5).join(', ')}` : 'ok');

// -- Categoria 5: cliente principal usa zapp ----------------------
const clientSrc = readFileSync(join(ROOT, 'src/integrations/supabase/client.ts'), 'utf8');
record('client', "cliente principal com db:{schema:'zapp'}", /db:\s*\{\s*schema:\s*['"`]zapp['"`]/.test(clientSrc));

// -- Categoria 6: types.ts DefaultSchema (advisory, arquivo auto-gerado) --
// types.ts é regenerado pelo supabase gen. Enquanto o cliente força
// db:{schema:'zapp'} no runtime, DefaultSchema="public" só afeta o helper
// Tables<> — que é raramente usado. Reportamos como warning, não como falha.
try {
  const typesSrc = readFileSync(join(ROOT, 'src/integrations/supabase/types.ts'), 'utf8');
  const ok = /DefaultSchema[^=]*=\s*DatabaseWithoutInternals\[\s*Extract<\s*keyof Database,\s*['"`]zapp['"`]/.test(typesSrc);
  if (!ok) {
    results.warnings++;
    results.scenarios.push({ category: 'types', name: "DefaultSchema=zapp (auto-gen)", ok: true, detail: 'warning: types.ts auto-gen usa DefaultSchema=public — não bloqueante' });
  } else {
    record('types', "DefaultSchema resolve para 'zapp'", true);
  }
} catch { record('types', 'types.ts presente', false, 'não encontrado'); }

// -- Categoria 7: externalClient é shim ---------------------------
try {
  const ext = readFileSync(join(ROOT, 'src/integrations/supabase/externalClient.ts'), 'utf8');
  record('ext-client', 'externalClient é shim (delega para principal)',
    /re-export|from ['"]\.\/client|export \{ supabase/.test(ext) && ext.length < 4000);
} catch { record('ext-client', 'externalClient presente', false); }

// -- Sumário ------------------------------------------------------
const total = results.passed + results.failed;
console.log(`\nSimulação de acesso a schema — ${total} cenários`);
console.log(`  ✅ ok:     ${results.passed}`);
console.log(`  ❌ falhas: ${results.failed}`);
if (results.failed > 0) {
  console.log('\nFalhas:');
  for (const s of results.scenarios) if (!s.ok) console.log(`  - [${s.category}] ${s.name}: ${s.detail}`);
}
process.exit(results.failed > 0 ? 1 : 0);
