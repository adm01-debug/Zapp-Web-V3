#!/usr/bin/env node
/**
 * audit-contract.mjs — Contrato front ↔ banco (RPC / .from / functions.invoke)
 *
 * Varre src/ e extrai o "contrato" que o frontend declara contra o Supabase:
 *   1. supabase.rpc('fn')              → deve existir em pg_proc (schema zapp; fallback public)
 *   2. supabase.from('table|view')     → deve existir em pg_class (schema zapp; fallback public/evo/email_app)
 *   3. supabase.functions.invoke('fn') → deve ter pasta correspondente em supabase/functions/
 *
 * Conexão (em ordem de preferência):
 *   - pg driver  (dynamic import; usa DB_URL ou SUPABASE_DB_URL) — permite checar
 *     has_function_privilege('authenticated', ...) para RPCs do schema zapp.
 *   - fetch + PostgREST (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) — checagem de
 *     existência por HTTP (404 PGRST202/PGRST205 = ausente). Modo CI padrão.
 *
 * Uso:
 *   node scripts/audit-contract.mjs            # texto; exit 0 ok, 1 divergência, 2 config
 *   node scripts/audit-contract.mjs --json     # JSON estruturado em stdout
 *   node scripts/audit-contract.mjs --scan-only# só extrai o contrato do src/ (sem DB)
 *
 * Exit codes:
 *   0 = contrato íntegro
 *   1 = divergências encontradas (RPC/tabela/edge function ausente, ou EXECUTE negado)
 *   2 = ambiente não configurado (faltam env vars) ou erro de conexão
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SRC_DIR = join(ROOT, 'src');
const FUNCTIONS_DIR = join(ROOT, 'supabase', 'functions');

const args = process.argv.slice(2);
const JSON_MODE = args.includes('--json');
const SCAN_ONLY = args.includes('--scan-only');

const SCHEMAS = ['zapp', 'public', 'evo', 'email_app'];
const RPC_SCHEMAS = ['zapp', 'public'];
const PGREST_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// 1. Extração do contrato declarado no frontend
// ---------------------------------------------------------------------------
const RPC_RE = /\.rpc\(\s*['"]([a-z_0-9]+)['"]/g;
const FROM_RE = /\.from\(\s*['"]([a-z_0-9_]+)['"]/g;
const INVOKE_RE = /functions\.invoke\(\s*['"]([a-z_0-9/-]+)['"]/g;

const TEST_RE =
  /(^|[\\/])(__tests__|__mocks__|test|tests)([\\/]|$)|\.(test|spec)\.(ts|tsx|js|jsx)$|\.mock\.(ts|tsx|js|jsx)$|test-utils/;
const IGNORE_FILE_RE = /integrations[\\/]supabase[\\/]types\.ts$|integrations[\\/]supabase[\\/]types-manual\.ts$/;
const EXT_RE = /\.(ts|tsx)$/;

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === 'node_modules' || name === 'dist' || name === '.turbo' || name === 'coverage') continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (EXT_RE.test(name)) out.push(full);
  }
  return out;
}

function lineAt(src, index) {
  return src.slice(0, index).split('\n').length;
}

function extractContract() {
  const rpcs = new Map(); // name -> [{file, line}]
  const froms = new Map();
  const invokes = new Map();

  for (const file of walk(SRC_DIR)) {
    if (TEST_RE.test(file) || IGNORE_FILE_RE.test(file)) continue;
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    const src = readFileSync(file, 'utf8');

    for (const re of [RPC_RE, FROM_RE, INVOKE_RE]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(src)) !== null) {
        const name = m[1];
        const target = re === RPC_RE ? rpcs : re === FROM_RE ? froms : invokes;
        if (!target.has(name)) target.set(name, []);
        target.get(name).push({ file: rel, line: lineAt(src, m.index) });
      }
    }
  }

  // information_schema_* é consultado via RPC dedicado — não é tabela exposta.
  for (const key of [...froms.keys()]) {
    if (key.startsWith('information_schema_')) froms.delete(key);
  }

  return { rpcs, froms, invokes };
}

function listEdgeFunctionDirs() {
  if (!existsSync(FUNCTIONS_DIR)) return [];
  return readdirSync(FUNCTIONS_DIR).filter((n) => {
    if (n.startsWith('.')) return false;
    const full = join(FUNCTIONS_DIR, n);
    try {
      return statSync(full).isDirectory();
    } catch {
      return false;
    }
  });
}

// ---------------------------------------------------------------------------
// 2. Verificação no banco (pg ou PostgREST)
// ---------------------------------------------------------------------------
async function loadPg() {
  try {
    const mod = await import('pg');
    return mod.default ?? mod;
  } catch {
    return null;
  }
}

function hasPgEnv() {
  return Boolean(process.env.DB_URL || process.env.SUPABASE_DB_URL);
}

function hasPGRestEnv() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Checagem via PostgREST HTTP: retorna schema onde o objeto existe (ou null). */
// NOTA (fix 2026-08-05): GET /rpc/{name} sem args retorna PGRST202 falso-negativo
// para funções com args obrigatórios; OpenAPI também omite algumas funções.
// Estratégia em camadas:
//   1. OpenAPI do schema (Accept: application/openapi+json) — lista a maioria;
//   2. Fallback: RPC de inventário zapp.rpc_contract_inventory (SECURITY DEFINER,
//      criada na migration 20260805170000) — ground truth pg_proc via HTTP,
//      chamável com service_role/authenticated (o anon não tem EXECUTE).
async function pgRestExists(baseUrl, serviceKey, kind, name, schemas) {
  // Fallback via RPC de inventário (1 chamada, cacheada por schema na 1ª vez)
  const inventoryKey = `${baseUrl}|${schemas.join(',')}`;
  if (!pgRestExists._invCache) pgRestExists._invCache = new Map();
  if (!pgRestExists._invCache.has(inventoryKey)) {
    try {
      const url = `${baseUrl}/rest/v1/rpc/rpc_contract_inventory`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Content-Profile': 'zapp',
          'Accept-Profile': 'zapp',
        },
        body: '{}',
      });
      if (res.status === 200) {
        const data = await res.json().catch(() => null);
        if (data) {
          const fns = new Set((data.functions ?? []).map((f) => f.name));
          const tbls = new Set((data.tables ?? []).map((t) => t.name));
          pgRestExists._invCache.set(inventoryKey, { fns, tbls });
        }
      }
    } catch {
      // falha do inventário → continua para OpenAPI
    }
  }
  const inv = pgRestExists._invCache.get(inventoryKey);
  if (inv) {
    const set = kind === 'rpc' ? inv.fns : inv.tbls;
    if (set.has(name)) return 'zapp';
  }

  for (const schema of schemas) {
    const url = `${baseUrl}/rest/v1/`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PGREST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          Accept: 'application/openapi+json',
          'Accept-Profile': schema,
        },
        signal: ctrl.signal,
      });
      if (res.status !== 200) continue;
      const spec = await res.json().catch(() => null);
      if (!spec?.paths) continue;
      // OpenAPI: RPCs viram paths `/rpc/{name}`; tabelas/views viram `/{name}`.
      const needle = kind === 'rpc' ? `/rpc/${encodeURIComponent(name)}` : `/${encodeURIComponent(name)}`;
      const found = Object.keys(spec.paths).some((p) =>
        p === needle ||
        p.startsWith(`${needle}/`) ||
        p === `/rpc/${name}` ||
        p.startsWith(`/rpc/${name}/`) ||
        p === `/${name}` ||
        p.startsWith(`/${name}/`));
      if (found) return schema;
    } catch (err) {
      if (err?.name === 'AbortError') {
        throw new Error(`timeout ao consultar OpenAPI de ${schema} via PostgREST`);
      }
      throw new Error(`falha HTTP ao consultar OpenAPI de ${schema}: ${err.message}`);
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

/** Verificação via SQL (driver pg). */
async function verifyWithPg(contract) {
  const Pg = await loadPg();
  if (!Pg) return { mode: null, reason: 'driver pg não instalado (node_modules/pg ausente)' };
  const conn = new Pg.Client({
    connectionString: process.env.DB_URL || process.env.SUPABASE_DB_URL,
    connectionTimeoutMillis: 15_000,
  });
  await conn.connect();

  const divergences = [];

  // -- RPCs -------------------------------------------------------------
  const rpcNames = [...contract.rpcs.keys()];
  if (rpcNames.length > 0) {
    const rpcRes = await conn.query(
      `SELECT p.proname, n.nspname
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = ANY($1) AND p.proname = ANY($2)`,
      [RPC_SCHEMAS, rpcNames]
    );
    const found = new Map();
    for (const row of rpcRes.rows) {
      if (!found.has(row.proname)) found.set(row.proname, row.nspname);
    }
    for (const name of rpcNames) {
      if (!found.has(name)) {
        divergences.push({ kind: 'rpc', name, schema: null, reason: 'função ausente em zapp/public (pg_proc)' });
      }
    }

    // EXECUTE para authenticated (apenas funções zapp — as chamadas do front usam anon/authenticated)
    const zappRpcRes = await conn.query(
      `SELECT p.proname, has_function_privilege('authenticated', p.oid, 'EXECUTE') AS can_exec
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'zapp' AND p.proname = ANY($1)`,
      [rpcNames]
    );
    for (const row of zappRpcRes.rows) {
      if (!row.can_exec) {
        divergences.push({
          kind: 'rpc',
          name: row.proname,
          schema: 'zapp',
          reason: "EXECUTE negado para role 'authenticated' (has_function_privilege=false)",
        });
      }
    }
  }

  // -- .from --------------------------------------------------------------
  const fromNames = [...contract.froms.keys()];
  if (fromNames.length > 0) {
    const fromRes = await conn.query(
      `SELECT c.relname, n.nspname
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = ANY($1) AND c.relkind IN ('r','v','p','m') AND c.relname = ANY($2)`,
      [SCHEMAS, fromNames]
    );
    const found = new Map();
    for (const row of fromRes.rows) {
      if (!found.has(row.relname)) found.set(row.relname, row.nspname);
    }
    for (const name of fromNames) {
      if (!found.has(name)) {
        divergences.push({ kind: 'from', name, schema: null, reason: 'tabela/view ausente (pg_class, relkind r/v/p/m)' });
      }
    }
  }

  await conn.end();
  return { mode: 'pg', divergences };
}

/** Verificação via PostgREST (fetch). */
async function verifyWithPGRest(contract) {
  const baseUrl = process.env.SUPABASE_URL.replace(/\/+$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const divergences = [];

  const concurrency = 8;
  async function mapLimit(items, limit, fn) {
    const results = new Array(items.length);
    let i = 0;
    async function worker() {
      while (i < items.length) {
        const idx = i++;
        results[idx] = await fn(items[idx], idx);
      }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
  }

  const rpcNames = [...contract.rpcs.keys()];
  const rpcSchemas = await mapLimit(rpcNames, concurrency, (name) =>
    pgRestExists(baseUrl, serviceKey, 'rpc', name, RPC_SCHEMAS).catch((err) => {
      throw err;
    })
  );
  rpcNames.forEach((name, i) => {
    if (!rpcSchemas[i]) {
      divergences.push({ kind: 'rpc', name, schema: null, reason: 'função ausente em zapp/public (PostgREST 404)' });
    }
  });

  const fromNames = [...contract.froms.keys()];
  const fromSchemas = await mapLimit(fromNames, concurrency, (name) =>
    pgRestExists(baseUrl, serviceKey, 'from', name, SCHEMAS).catch((err) => {
      throw err;
    })
  );
  fromNames.forEach((name, i) => {
    if (!fromSchemas[i]) {
      divergences.push({ kind: 'from', name, schema: null, reason: 'tabela/view ausente (PostgREST 404)' });
    }
  });

  return { mode: 'pgrest', divergences };
}

// ---------------------------------------------------------------------------
// 3. Edge functions (local: supabase/functions/<name>)
// ---------------------------------------------------------------------------
function verifyEdgeFunctions(contract) {
  const dirs = new Set(listEdgeFunctionDirs());
  const divergences = [];
  for (const name of contract.invokes.keys()) {
    const slug = name.split('/')[0]; // invokes com rota tipo 'v1/foo' → pasta 'v1'? não: usa o slug real
    if (!dirs.has(name) && !dirs.has(slug)) {
      divergences.push({
        kind: 'invoke',
        name,
        schema: null,
        reason: `edge function sem pasta em supabase/functions/ (existem: ${dirs.size} funções)`,
      });
    }
  }
  return divergences;
}

// ---------------------------------------------------------------------------
// 4. Relatório
// ---------------------------------------------------------------------------
function buildReport(contract, edgeDivergences, dbResult) {
  const divergences = [...edgeDivergences, ...(dbResult?.divergences ?? [])];
  const summary = {
    rpcs: contract.rpcs.size,
    froms: contract.froms.size,
    invokes: contract.invokes.size,
    edgeFunctionsOnDisk: listEdgeFunctionDirs().length,
    dbMode: dbResult?.mode ?? 'none',
    divergences: divergences.length,
    ok: divergences.length === 0,
  };
  return { summary, divergences };
}

function printText(report, contract) {
  const { summary, divergences } = report;
  console.log('audit-contract — contrato front ↔ banco');
  console.log('========================================');
  console.log(`RPCs invocados no front:   ${summary.rpcs}`);
  console.log(`.from() no front:          ${summary.froms}`);
  console.log(`functions.invoke() no front: ${summary.invokes}`);
  console.log(`Edge functions em disco:   ${summary.edgeFunctionsOnDisk}`);
  console.log(`Modo de verificação DB:    ${summary.dbMode === 'pg' ? 'pg (SQL direto)' : summary.dbMode === 'pgrest' ? 'PostgREST (fetch)' : 'nenhum (--scan-only)'}`);

  const show = (title, kind) => {
    const items = divergences.filter((d) => d.kind === kind);
    if (items.length === 0) return;
    console.log(`\n❌ ${title} (${items.length}):`);
    for (const d of items) {
      console.log(`   - ${d.name}  [${d.reason}]`);
      const refs = (contract[kind === 'invoke' ? 'invokes' : kind === 'from' ? 'froms' : 'rpcs'].get(d.name) ?? []);
      for (const r of refs.slice(0, 3)) console.log(`       usado em: ${r.file}:${r.line}`);
    }
  };
  show('RPCs ausentes/sem EXECUTE', 'rpc');
  show('.from() ausentes', 'from');
  show('Edge functions ausentes', 'invoke');

  if (summary.ok) {
    console.log(`\n✅ Contrato íntegro (0 divergências em ${summary.rpcs + summary.froms + summary.invokes} referências).`);
  } else {
    console.log(`\n❌ ${summary.divergences} divergência(s) de contrato.`);
  }
}

function printJson(report) {
  console.log(JSON.stringify(report, null, 2));
}

// ---------------------------------------------------------------------------
// 5. Main
// ---------------------------------------------------------------------------
async function main() {
  const contract = extractContract();
  const edgeDivergences = verifyEdgeFunctions(contract);

  if (SCAN_ONLY) {
    const report = buildReport(contract, edgeDivergences, null);
    if (JSON_MODE) printJson(report);
    else printText(report, contract);
    process.exit(report.summary.divergences > 0 ? 1 : 0);
  }

  let dbResult = null;
  if (hasPgEnv()) {
    dbResult = await verifyWithPg(contract);
    if (dbResult.mode === null) {
      // pg env setado mas driver ausente → tenta PostgREST como fallback
      if (hasPGRestEnv()) dbResult = await verifyWithPGRest(contract);
      else {
        if (JSON_MODE) printJson({ summary: { ok: false, divergences: 0, error: `DB_URL definido mas driver pg ausente e SUPABASE_URL/SERVICE_KEY não configurados` } });
        else console.error('DB_URL definido mas driver pg não instalado e sem SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY para fallback.');
        process.exit(2);
      }
    }
  } else if (hasPGRestEnv()) {
    dbResult = await verifyWithPGRest(contract);
  } else {
    if (JSON_MODE) {
      printJson({ summary: { ok: false, divergences: 0, error: 'Configure DB_URL/SUPABASE_DB_URL (pg) ou SUPABASE_URL+SUPABASE_SERVICE_ROLE_KEY (PostgREST)' } });
    } else {
      console.error('audit-contract: nenhuma credencial de banco configurada.');
      console.error('  Opção 1 (pg):    export DB_URL=postgres://...  (ou SUPABASE_DB_URL)');
      console.error('  Opção 2 (HTTP):  export SUPABASE_URL=https://... SUPABASE_SERVICE_ROLE_KEY=...');
      console.error('  Opção 3 (local): node scripts/audit-contract.mjs --scan-only');
    }
    process.exit(2);
  }

  const report = buildReport(contract, edgeDivergences, dbResult);
  if (JSON_MODE) printJson(report);
  else printText(report, contract);
  process.exit(report.summary.ok ? 0 : 1);
}

main().catch((err) => {
  if (JSON_MODE) {
    console.log(JSON.stringify({ summary: { ok: false, divergences: 0, error: err.message } }));
  } else {
    console.error(`audit-contract: erro fatal — ${err.message}`);
  }
  process.exit(2);
});
