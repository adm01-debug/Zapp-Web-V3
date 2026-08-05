import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { RPC } from '@/integrations/datasource/rpcCatalog';

/**
 * Contract snapshot — catálogo de RPCs (etapas 87/88 do plano).
 *
 * Garante que o contrato front ↔ banco permaneça íntegro SEM precisar do banco:
 *   - Todo RPC chamado via `supabase.rpc('fn')` no src/ DEVE estar declarado em
 *     src/integrations/datasource/rpcCatalog.ts (fonte única tipada) OU listado
 *     como divergência conhecida em scripts/audit-allowlist.json (kind: "rpc").
 *
 * Espelha o scan do scripts/audit-contract.mjs (mesmos regex e exclusões) para
 * que a checagem offline e a auditoria online contra o PostgREST nunca divirjam.
 *
 * Falha quando:
 *   1. Um `.rpc('fn')` novo aparece no src/ sem entrada no catálogo nem na allowlist
 *      (novo RPC não tipado / gap não documentado).
 *   2. O catálogo declara o mesmo nome de RPC duas vezes (ambiguidade de tipagem).
 *
 * Correção ao falhar:
 *   - RPC novo legítimo → adicione a definição tipada em rpcCatalog.ts.
 *   - Gap conhecido/intencional → adicione entrada {kind:"rpc", name, reason, status}
 *     em scripts/audit-allowlist.json (mesmo formato das entradas existentes).
 */

const REPO_ROOT = resolve(__dirname, '../..');
const SRC_DIR = join(REPO_ROOT, 'src');
const ALLOWLIST_PATH = join(REPO_ROOT, 'scripts', 'audit-allowlist.json');

/** Mesmo regex do scripts/audit-contract.mjs. */
const RPC_RE = /\.rpc\(\s*['"]([a-z_0-9]+)['"]/g;

/** Exclusões idênticas às do audit-contract.mjs (testes/mocks não fazem parte do contrato). */
const TEST_RE =
  /(^|[\\/])(__tests__|__mocks__|test|tests)([\\/]|$)|\.(test|spec)\.(ts|tsx|js|jsx)$|\.mock\.(ts|tsx|js|jsx)$|test-utils/;
const IGNORE_FILE_RE =
  /integrations[\\/]supabase[\\/]types\.ts$|integrations[\\/]supabase[\\/]types-manual\.ts$/;

interface RpcUsage {
  name: string;
  files: string[];
}

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === 'node_modules' || name === 'dist' || name === '.turbo' || name === 'coverage')
      continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

/** Varre src/ extraindo todo `.rpc('fn')` declarado fora de testes/mocks. */
function scanUsedRpcs(): Map<string, RpcUsage> {
  const rpcs = new Map<string, RpcUsage>();
  for (const file of walk(SRC_DIR)) {
    if (TEST_RE.test(file) || IGNORE_FILE_RE.test(file)) continue;
    const src = readFileSync(file, 'utf8');
    RPC_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = RPC_RE.exec(src)) !== null) {
      const rel = relative(REPO_ROOT, file).replace(/\\/g, '/');
      const entry = rpcs.get(m[1]) ?? { name: m[1], files: [] };
      entry.files.push(rel);
      rpcs.set(m[1], entry);
    }
  }
  return rpcs;
}

/** Nomes declarados no catálogo tipado (fonte única). */
function catalogRpcNames(): Set<string> {
  return new Set(Object.values(RPC).map((def) => def.name));
}

/** Nomes kind:"rpc" da allowlist de divergências conhecidas. */
function allowlistRpcNames(): Set<string> {
  const raw = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8')) as {
    allowlist?: Array<{ kind?: string; name?: string }>;
  };
  return new Set(
    (raw.allowlist ?? []).filter((e) => e.kind === 'rpc' && e.name).map((e) => e.name as string)
  );
}

const hasAllowlist = existsSync(ALLOWLIST_PATH);
const hasSrc = existsSync(SRC_DIR);

describe('contract snapshot — catálogo de RPCs (etapas 87/88)', () => {
  it('todo RPC usado no src/ está no rpcCatalog.ts ou na allowlist', () => {
    expect(hasSrc, `src/ ausente em ${SRC_DIR} — scan impossível`).toBe(true);

    const used = scanUsedRpcs();
    const catalog = catalogRpcNames();
    const allowlist = allowlistRpcNames();

    const missing = [...used.values()]
      .filter((u) => !catalog.has(u.name) && !allowlist.has(u.name))
      .sort((a, b) => a.name.localeCompare(b.name));

    expect(missing, buildGapMessage(missing)).toEqual([]);
  });

  it('catálogo não declara nomes de RPC duplicados', () => {
    const names = Object.values(RPC).map((def) => def.name);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    expect([...new Set(dupes)]).toEqual([]);
  });

  it('allowlist rpc não contém entradas duplicadas', () => {
    expect(hasAllowlist, `scripts/audit-allowlist.json ausente`).toBe(true);
    const names = [...allowlistRpcNames()];
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    expect([...new Set(dupes)]).toEqual([]);
  });
});

function buildGapMessage(missing: RpcUsage[]): string {
  if (missing.length === 0) return '';
  const lines = missing.map((u) => `  - ${u.name}  (usada em: ${u.files.join(', ')})`);
  return (
    `RPC(s) usada(s) no src/ sem declaração no contrato:\n` +
    `${lines.join('\n')}\n\n` +
    `Correção:\n` +
    `  1. RPC legítima → adicione a definição tipada em src/integrations/datasource/rpcCatalog.ts\n` +
    `  2. Gap conhecido → adicione {kind:"rpc", name, reason, status} em scripts/audit-allowlist.json`
  );
}
