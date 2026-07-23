#!/usr/bin/env node
/**
 * check-types-schemas.mjs
 * ------------------------------------------------------------------
 * Gate de build/CI que valida se `src/integrations/supabase/types.ts`
 * contém os schemas `zapp` e `evo` — pré-requisito para o `tsc` rodar
 * sem milhares de erros TS2339 em cascata.
 *
 * Modos:
 *   1. Local (sempre, bloqueante): inspeciona o types.ts commitado e
 *      valida se `export type Database = { ... }` tem chaves de
 *      primeiro nível `zapp:` e `evo:`.
 *   2. Remoto (quando ZAPP_META_URL/ZAPP_META_TOKEN presentes): consulta
 *      postgres-meta e verifica se o banco expõe os mesmos schemas.
 *      Sem os secrets, emite warning e não bloqueia (útil para PRs de
 *      forks); o modo local continua bloqueando.
 *
 * Flags:
 *   --local-only   Ignora completamente a checagem remota.
 *
 * Relatório de auditoria (para upload como artifact de CI):
 *   Escreve `reports/schema-status/report.json` e `report.md` tanto em
 *   sucesso quanto em falha (via process.on('exit')). Diretório é
 *   configurável via env `SCHEMA_REPORT_DIR`.
 *
 * Exit codes: 0 ok · 1 falha (schema ausente no arquivo ou no banco).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const TYPES_FILE = 'src/integrations/supabase/types.ts';
const REQUIRED = ['zapp', 'evo'];
const LOCAL_ONLY = process.argv.includes('--local-only');

const META = process.env.META_URL || process.env.ZAPP_META_URL;
const TOKEN = process.env.META_TOKEN || process.env.ZAPP_META_TOKEN;
const SCHEMAS = (process.env.SCHEMAS || 'public,zapp,evo').trim();
const REPO = process.env.GITHUB_REPOSITORY || 'atomicabr/zapp-web';
const WORKFLOW_URL = `https://github.com/${REPO}/actions/workflows/gen-types-zapp.yml`;
const REPORT_DIR = process.env.SCHEMA_REPORT_DIR || 'reports/schema-status';

// ---------- Acumulador de relatório (persistido em process 'exit') ----------
const report = {
  generated_at: new Date().toISOString(),
  ci: {
    run_id: process.env.GITHUB_RUN_ID || null,
    run_attempt: process.env.GITHUB_RUN_ATTEMPT || null,
    workflow: process.env.GITHUB_WORKFLOW || null,
    ref: process.env.GITHUB_REF || null,
    sha: process.env.GITHUB_SHA || null,
    repository: process.env.GITHUB_REPOSITORY || null,
    actor: process.env.GITHUB_ACTOR || null,
  },
  config: {
    types_file: TYPES_FILE,
    required_schemas: REQUIRED,
    requested_schemas: SCHEMAS.split(',').map((s) => s.trim()),
    local_only: LOCAL_ONLY,
    meta_url_present: Boolean(META),
    meta_token_present: Boolean(TOKEN),
  },
  local: {
    status: 'pending', // pending | ok | fail
    types_file_exists: null,
    present_schemas: [],
    missing_schemas: [],
    error: null,
  },
  remote: {
    status: 'skipped', // skipped | ok | fail | warning
    reason: null,
    http_status: null,
    present_schemas: [],
    missing_schemas: [],
    error: null,
  },
  overall: {
    status: 'pending', // ok | fail
    exit_code: 0,
    remediation_url: WORKFLOW_URL,
  },
};

function writeReport() {
  try {
    mkdirSync(REPORT_DIR, { recursive: true });
    writeFileSync(join(REPORT_DIR, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    writeFileSync(join(REPORT_DIR, 'report.md'), renderMarkdown(report));
  } catch (e) {
    // Não devemos derrubar o gate por causa do relatório.
    console.warn(`⚠ Falha ao escrever relatório em ${REPORT_DIR}: ${e?.message || e}`);
  }
}

function renderMarkdown(r) {
  const icon = (s) => (s === 'ok' ? '✅' : s === 'fail' ? '❌' : s === 'warning' ? '⚠️' : s === 'skipped' ? '⏭️' : '⏳');
  const lines = [];
  lines.push(`# Schema Status Report — ${icon(r.overall.status)} ${r.overall.status.toUpperCase()}`);
  lines.push('');
  lines.push(`- **Gerado em:** ${r.generated_at}`);
  if (r.ci.run_id) {
    lines.push(`- **CI run:** [\`${r.ci.workflow}#${r.ci.run_id}\`](https://github.com/${r.ci.repository}/actions/runs/${r.ci.run_id})`);
    lines.push(`- **Commit:** \`${(r.ci.sha || '').slice(0, 12)}\` (${r.ci.ref})`);
  }
  lines.push(`- **Requeridos:** \`${r.config.required_schemas.join(', ')}\``);
  lines.push('');
  lines.push('## Local (arquivo `types.ts`)');
  lines.push('');
  lines.push(`| Campo | Valor |`);
  lines.push(`|-------|-------|`);
  lines.push(`| Status | ${icon(r.local.status)} ${r.local.status} |`);
  lines.push(`| Arquivo existe | ${r.local.types_file_exists ? '✅' : '❌'} \`${r.config.types_file}\` |`);
  lines.push(`| Schemas presentes | ${r.local.present_schemas.map((s) => `\`${s}\``).join(', ') || '_(nenhum)_'} |`);
  lines.push(`| Schemas ausentes | ${r.local.missing_schemas.map((s) => `\`${s}\``).join(', ') || '_(nenhum)_'} |`);
  if (r.local.error) lines.push(`| Erro | \`${r.local.error}\` |`);
  lines.push('');
  lines.push('## Remoto (`postgres-meta`)');
  lines.push('');
  lines.push(`| Campo | Valor |`);
  lines.push(`|-------|-------|`);
  lines.push(`| Status | ${icon(r.remote.status)} ${r.remote.status} |`);
  if (r.remote.reason) lines.push(`| Motivo | ${r.remote.reason} |`);
  if (r.remote.http_status !== null) lines.push(`| HTTP | \`${r.remote.http_status}\` |`);
  lines.push(`| Schemas presentes | ${r.remote.present_schemas.map((s) => `\`${s}\``).join(', ') || '_(nenhum)_'} |`);
  lines.push(`| Schemas ausentes | ${r.remote.missing_schemas.map((s) => `\`${s}\``).join(', ') || '_(nenhum)_'} |`);
  if (r.remote.error) lines.push(`| Erro | \`${r.remote.error}\` |`);
  lines.push('');
  if (r.overall.status !== 'ok') {
    lines.push('## Como resolver');
    lines.push('');
    lines.push(`1. Rode o workflow de regeneração: [gen-types-zapp.yml](${r.overall.remediation_url}) → **Run workflow** (schemas: \`public,zapp,evo\`).`);
    lines.push('2. Faça merge do PR `chore/regen-zapp-types` gerado automaticamente.');
    lines.push('3. Reexecute este job.');
    lines.push('');
    lines.push('Alternativa local (requer VPN/token da VPS):');
    lines.push('');
    lines.push('```bash');
    lines.push('META_URL=https://supabase.atomicabr.com.br \\');
    lines.push('  META_TOKEN=<service_role> \\');
    lines.push(`  SCHEMAS=${['public', ...REQUIRED].join(',')} \\`);
    lines.push('  node scripts/gen-types-zapp.mjs');
    lines.push('```');
    lines.push('');
  }
  return lines.join('\n');
}

process.on('exit', (code) => {
  report.overall.exit_code = code;
  if (report.overall.status === 'pending') {
    report.overall.status = code === 0 ? 'ok' : 'fail';
  }
  writeReport();
});

// ------------------------------ Parser ------------------------------
/**
 * Extrai as chaves de primeiro nível dentro de `export type Database = { ... }`.
 * Usa contagem de chaves para respeitar aninhamento.
 */
function extractTopLevelKeys(src) {
  const lines = src.split('\n');
  let depth = 0;
  let inDb = false;
  const keys = new Set();
  const keyRe = /^\s{2}([A-Za-z_][A-Za-z0-9_]*)\s*:\s*\{/;
  for (const line of lines) {
    if (!inDb) {
      if (/^export type Database = \{$/.test(line)) {
        inDb = true;
        depth = 1;
      }
      continue;
    }
    if (depth === 1) {
      const m = line.match(keyRe);
      if (m) keys.add(m[1]);
    }
    for (const c of line) {
      if (c === '{') depth++;
      else if (c === '}') depth--;
    }
    if (depth === 0) break;
  }
  return keys;
}

/**
 * Renderiza um bloco de erro rico com chaves ausentes/presentes,
 * link direto para o workflow de regeneração e comando local exato.
 */
function fail(msg, { missing = [], present = [], scope = 'local' } = {}) {
  const W = 74;
  const border = '═'.repeat(W);
  const pad = (s) => '║  ' + String(s).padEnd(W - 2) + '║';
  const suggested =
    missing.length > 0
      ? `SCHEMAS=${['public', ...REQUIRED].join(',')}`
      : `SCHEMAS=${SCHEMAS}`;

  console.error('');
  console.error(`╔${border}╗`);
  console.error(pad(`COBERTURA DE SCHEMAS SUPABASE INCOMPLETA — BUILD BLOQUEADO [${scope}]`));
  console.error(`╠${border}╣`);
  for (const line of msg.split('\n')) console.error(pad(line));

  if (missing.length || present.length) {
    console.error(`╠${border}╣`);
    if (missing.length) console.error(pad(`✗ Ausentes:  ${missing.join(', ')}`));
    console.error(pad(`✓ Presentes: ${present.join(', ') || '(nenhum)'}`));
    console.error(pad(`• Requeridos: ${REQUIRED.join(', ')}`));
  }

  console.error(`╠${border}╣`);
  console.error(pad('Como resolver (recomendado — via GitHub Actions):'));
  console.error(pad('  1. Abra o workflow "Regenerate Supabase types (zapp + evo)":'));
  console.error(pad(`     ${WORKFLOW_URL}`));
  console.error(pad('  2. Clique em "Run workflow" (schemas: public,zapp,evo)'));
  console.error(pad('  3. Faça merge do PR "chore/regen-zapp-types" gerado automaticamente'));
  console.error(pad(''));
  console.error(pad('Alternativa local (requer VPN/token da VPS):'));
  console.error(pad('  $ META_URL=https://supabase.atomicabr.com.br \\'));
  console.error(pad('    META_TOKEN=<service_role> \\'));
  console.error(pad(`    ${suggested} \\`));
  console.error(pad('    node scripts/gen-types-zapp.mjs'));
  console.error(`╚${border}╝`);

  report.overall.status = 'fail';
  process.exit(1);
}

// -------- Modo local (sempre) --------
report.local.types_file_exists = existsSync(TYPES_FILE);
if (!report.local.types_file_exists) {
  report.local.status = 'fail';
  report.local.missing_schemas = [...REQUIRED];
  report.local.error = `Arquivo ${TYPES_FILE} não encontrado.`;
  fail(report.local.error, { missing: REQUIRED, present: [] });
}
const localSrc = readFileSync(TYPES_FILE, 'utf8');
const localKeys = extractTopLevelKeys(localSrc);
const missingLocal = REQUIRED.filter((s) => !localKeys.has(s));
report.local.present_schemas = [...localKeys];
report.local.missing_schemas = missingLocal;

if (missingLocal.length) {
  report.local.status = 'fail';
  report.local.error = `types.ts sem: ${missingLocal.join(', ')}`;
  console.error(
    `::error title=MISSING_ZAPP_EVO_SCHEMAS::LOVABLE_AUTOREGEN_TRIGGER missing=${missingLocal.join(',')}`,
  );
  fail(
    `types.ts está sem os schemas: ${missingLocal.join(', ')}.\n` +
    `Regenere os tipos para incluir os schemas faltantes.`,
    { missing: missingLocal, present: [...localKeys], scope: 'local' },
  );
}
report.local.status = 'ok';
console.log(`✓ [local] types.ts contém schemas: ${[...localKeys].join(', ')}`);

// -------- Modo remoto (opcional) --------
if (LOCAL_ONLY) {
  report.remote.status = 'skipped';
  report.remote.reason = 'flag --local-only';
  process.exit(0);
}

if (!META || !TOKEN) {
  report.remote.status = 'skipped';
  report.remote.reason = 'ZAPP_META_URL/ZAPP_META_TOKEN ausentes';
  console.warn('⚠ [remoto] ZAPP_META_URL/ZAPP_META_TOKEN ausentes — checagem remota pulada (não-bloqueante).');
  process.exit(0);
}

try {
  const url = new URL('/generators/typescript', META);
  url.searchParams.set('included_schemas', SCHEMAS);
  url.searchParams.set('detect_one_to_one_relationships', 'true');
  const res = await fetch(url, {
    headers: {
      apikey: TOKEN,
      authorization: `Bearer ${TOKEN}`,
      'content-type': 'application/json',
    },
  });
  report.remote.http_status = res.status;
  if (!res.ok) {
    report.remote.status = 'warning';
    report.remote.reason = `postgres-meta HTTP ${res.status} — pulada`;
    console.warn(`⚠ [remoto] postgres-meta HTTP ${res.status} — checagem remota pulada (não-bloqueante).`);
    process.exit(0);
  }
  let remote = await res.text();
  try {
    const j = JSON.parse(remote);
    remote = j.types || j.data || remote;
  } catch { /* raw TS */ }
  const remoteKeys = extractTopLevelKeys(remote);
  const missingRemote = REQUIRED.filter((s) => !remoteKeys.has(s));
  report.remote.present_schemas = [...remoteKeys];
  report.remote.missing_schemas = missingRemote;
  if (missingRemote.length) {
    report.remote.status = 'fail';
    report.remote.error = `postgres-meta sem: ${missingRemote.join(', ')}`;
    fail(
      `postgres-meta NÃO expõe os schemas: ${missingRemote.join(', ')}.\n` +
      `Verifique inclusão dos schemas e permissões do service_role.`,
      { missing: missingRemote, present: [...remoteKeys], scope: 'remoto' },
    );
  }
  report.remote.status = 'ok';
  console.log(`✓ [remoto] postgres-meta expõe schemas: ${[...remoteKeys].join(', ')}`);
} catch (err) {
  report.remote.status = 'warning';
  report.remote.error = err?.message || String(err);
  report.remote.reason = 'falha de rede/parsing — não-bloqueante';
  console.warn(`⚠ [remoto] Falha ao consultar postgres-meta (${err?.message || err}) — não-bloqueante.`);
  process.exit(0);
}
