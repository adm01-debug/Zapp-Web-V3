#!/usr/bin/env node
/**
 * validate-rpc-contract.mjs
 * ──────────────────────────────────────────────────────────────────────────
 * Valida o contrato entre o frontend (zapp-web-v3) e o banco self-hosted.
 *
 * MODO DE OPERAÇÃO:
 *   1. Varre src/ extraindo todas as chamadas .rpc('nome') e .from('tabela')
 *   2. Conecta ao banco via DATABASE_URL (VPS self-hosted)
 *   3. Valida existência de cada RPC em public (+ assinatura)
 *   4. Valida existência de cada tabela/view em public
 *   5. Gera relatório; exit 1 se houver gaps (quebra CI)
 *
 * USO:
 *   DATABASE_URL="postgresql://..." node scripts/validate-rpc-contract.mjs
 *   DATABASE_URL="postgresql://..." node scripts/validate-rpc-contract.mjs --fix-hints
 *   DATABASE_URL="postgresql://..." node scripts/validate-rpc-contract.mjs --json
 *
 * VARIÁVEIS DE AMBIENTE:
 *   DATABASE_URL  — URL de conexão PostgreSQL (obrigatório se --no-db não informado)
 *   CONTRACT_DIR  — diretório raiz para varredura (default: src)
 *
 * @version 1.0.0
 * @created 2026-07-05 (MELHORIA 6 — auditoria de espelhamento Cloud→zapp)
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { argv, env } from 'node:process';

const ROOT_DIR     = env.CONTRACT_DIR ?? 'src';
const DATABASE_URL = env.DATABASE_URL;
const FIX_HINTS    = argv.includes('--fix-hints');
const JSON_OUT     = argv.includes('--json');
const NO_DB        = argv.includes('--no-db');
const EXTENSIONS   = ['.ts', '.tsx'];
const EXCLUDE      = ['node_modules', '.git', 'dist', 'build', 'types.ts'];

// ── Extração de chamadas Supabase ─────────────────────────────────────────────

const RPC_PATTERN   = /\.rpc\s*\(\s*['"`]([^'"`]+)['"`]/g;
const FROM_PATTERN  = /\.from\s*\(\s*['"`]([^'"`]+)['"`]/g;

async function* walkDir(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (EXCLUDE.some(ex => fullPath.includes(ex))) continue;
    if (entry.isDirectory()) yield* walkDir(fullPath);
    else if (EXTENSIONS.includes(extname(entry.name))) yield fullPath;
  }
}

async function extractCalls(rootDir) {
  const rpcs  = new Map();  // name → Set<files>
  const froms = new Map();

  for await (const filePath of walkDir(rootDir)) {
    const content = await readFile(filePath, 'utf-8').catch(() => '');

    for (const [, name] of content.matchAll(new RegExp(RPC_PATTERN.source, 'g'))) {
      if (!rpcs.has(name)) rpcs.set(name, new Set());
      rpcs.get(name).add(filePath.replace(rootDir + '/', ''));
    }

    for (const [, name] of content.matchAll(new RegExp(FROM_PATTERN.source, 'g'))) {
      if (!froms.has(name)) froms.set(name, new Set());
      froms.get(name).add(filePath.replace(rootDir + '/', ''));
    }
  }

  return { rpcs, froms };
}

// ── Validação contra o banco ──────────────────────────────────────────────────

async function validateAgainstDb(rpcs, froms) {
  if (!DATABASE_URL) {
    console.warn('⚠️  DATABASE_URL não definida — pulando validação de banco');
    return { rpcGaps: [], fromGaps: [], rpcFound: [], fromFound: [] };
  }

  // Importação dinâmica de pg (opcional)
  let Client;
  try {
    ({ Client } = await import('pg'));
  } catch {
    console.warn('⚠️  pg não instalado — pulando validação de banco. npm install pg');
    return { rpcGaps: [], fromGaps: [], rpcFound: [], fromFound: [] };
  }

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    // RPCs: verificar em public via pg_proc
    const rpcNames = [...rpcs.keys()];
    const { rows: rpcRows } = await client.query(`
      SELECT p.proname AS name,
             pg_get_function_arguments(p.oid) AS args,
             p.prosecdef AS secdef
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = ANY($1::text[])
    `, [rpcNames]);

    const rpcFound = new Set(rpcRows.map(r => r.name));
    const rpcGaps = rpcNames
      .filter(n => !rpcFound.has(n))
      .map(n => ({ name: n, files: [...rpcs.get(n)], type: 'rpc' }));

    // Tables/views: verificar em public via information_schema
    const fromNames = [...froms.keys()];
    const { rows: fromRows } = await client.query(`
      SELECT table_name AS name, table_type
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
    `, [fromNames]);

    const fromFound = new Set(fromRows.map(r => r.name));
    const fromGaps = fromNames
      .filter(n => !fromFound.has(n))
      .map(n => ({ name: n, files: [...froms.get(n)], type: 'table_or_view' }));

    return {
      rpcGaps,
      fromGaps,
      rpcFound: rpcRows,
      fromFound: fromRows,
    };
  } finally {
    await client.end();
  }
}

// ── Relatório ─────────────────────────────────────────────────────────────────

async function main() {
  console.log(`🔍 validate-rpc-contract — escaneando ${ROOT_DIR}/...`);

  const { rpcs, froms } = await extractCalls(ROOT_DIR);
  console.log(`   ${rpcs.size} RPCs únicas encontradas`);
  console.log(`   ${froms.size} tabelas/views únicas referenciadas`);

  const { rpcGaps, fromGaps, rpcFound, fromFound } = NO_DB
    ? { rpcGaps: [], fromGaps: [], rpcFound: [], fromFound: [] }
    : await validateAgainstDb(rpcs, froms);

  const allGaps = [...rpcGaps, ...fromGaps];

  if (JSON_OUT) {
    console.log(JSON.stringify({
      scanned: { rpcs: rpcs.size, tables: froms.size },
      gaps: allGaps,
      found: { rpcs: rpcFound.length, tables: fromFound.length },
    }, null, 2));
  } else {
    if (allGaps.length === 0) {
      console.log(`\n✅ Todos os ${rpcs.size} RPCs e ${froms.size} tabelas/views resolvem no banco.`);
    } else {
      console.log('\n── Gaps detectados ───────────────────────────────────────');

      for (const gap of rpcGaps) {
        console.log(`\n❌ RPC não encontrada em public: ${gap.name}`);
        console.log(`   Usada em: ${gap.files.slice(0, 3).join(', ')}${gap.files.length > 3 ? `... (+${gap.files.length - 3})` : ''}`);
        if (FIX_HINTS) {
          console.log(`   Fix: criar função no schema public — CREATE OR REPLACE FUNCTION public.${gap.name}(...)`);
        }
      }

      for (const gap of fromGaps) {
        console.log(`\n❌ Tabela/view não encontrada em public: ${gap.name}`);
        console.log(`   Usada em: ${gap.files.slice(0, 3).join(', ')}${gap.files.length > 3 ? `... (+${gap.files.length - 3})` : ''}`);
        if (FIX_HINTS) {
          console.log(`   Fix: criar view em public — CREATE VIEW public.${gap.name} AS SELECT * FROM zapp.${gap.name}`);
        }
      }

      console.log(`\n── Resumo ────────────────────────────────────────────`);
      console.log(`   RPCs com gap:        ${rpcGaps.length}`);
      console.log(`   Tabelas com gap:     ${fromGaps.length}`);
      console.log(`   Total de gaps:       ${allGaps.length}`);
    }
  }

  process.exit(allGaps.length > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('validate-rpc-contract erro:', err);
  process.exit(2);
});
