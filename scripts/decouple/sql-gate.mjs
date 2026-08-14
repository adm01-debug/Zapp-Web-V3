#!/usr/bin/env node
/**
 * sql-gate.mjs — Gate do egresso SQL da Evolution API
 *
 * Destino no repo: zapp-web-v3 (adm01-debug) → scripts/decouple/sql-gate.mjs
 * Node ESM, zero dependências.
 *
 * Propósito:
 *   Impedir regressão da centralização do egresso HTTP da Evolution API.
 *   Toda função PL/pgSQL que chama a Evolution DEVE montar URL/chave via
 *   ops.fn_evo_url() e ops.fn_evo_key() (que leem vault.decrypted_secrets).
 *
 * Uso:
 *   node sql-gate.mjs <report.json>     # valida o report (exit 0 = ok, 1 = violações)
 *   node sql-gate.mjs --sample          # imprime a query SQL geradora do report
 *
 * report.json = [{"fn":"schema.fn","prosrc":"..."}, ...]
 *   (gerado pela query impressa em --sample, rodada no Supabase self-hosted)
 *
 * Regras (qualquer violação → exit 1):
 *   1. fn em escopo (schemas evo, zapp, ops, public) cujo prosrc contém
 *      net.http_get( ou net.http_post( E contém 'evolution' (case-insensitive)
 *      E a fn NÃO é ops.fn_evo_url nem ops.fn_evo_key → violação.
 *   2. prosrc casa com vault\.decrypted_secrets E contém 'evolution_api_url'
 *      fora do whitelist → leitura direta do segredo de URL da Evolution.
 */

import { readFileSync } from 'node:fs';

const WHITELIST = new Set(['ops.fn_evo_url', 'ops.fn_evo_key']);
// Report sem prefixo de schema (query sem JOIN) também é aceito no whitelist.
const WHITELIST_SHORT = new Set(['fn_evo_url', 'fn_evo_key']);
const SCOPE_SCHEMAS = new Set(['evo', 'zapp', 'ops', 'public']);

const SAMPLE_QUERY = `-- =====================================================================
-- sql-gate.mjs — query geradora do report.json (Supabase self-hosted)
--
-- Exemplo de execução na VPS (substitua <pg_container> e <db>):
--
--   docker exec -i <pg_container> psql -U postgres -d <db> -At \\
--     -c "SELECT COALESCE(json_agg(t), '[]'::json)::text FROM (SELECT n.nspname || '.' || p.proname AS fn, p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE (p.prosrc ~ 'net\\\\.http_' OR p.prosrc ~ 'vault\\\\.decrypted_secrets') AND n.nspname IN ('evo','zapp','ops','public') ORDER BY 1) t;" \\
--     > report.json
--
-- Depois rode o gate:
--   node scripts/decouple/sql-gate.mjs report.json
-- =====================================================================
SELECT COALESCE(json_agg(t), '[]'::json)::text
FROM (
  SELECT n.nspname || '.' || p.proname AS fn,
         p.prosrc
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE (p.prosrc ~ 'net\\.http_' OR p.prosrc ~ 'vault\\.decrypted_secrets')
    AND n.nspname IN ('evo', 'zapp', 'ops', 'public')
  ORDER BY 1
) t;`;

function usage() {
  console.error(
    'Uso: node sql-gate.mjs <report.json>\n' +
    '     node sql-gate.mjs --sample\n' +
    'report.json = [{"fn":"schema.fn","prosrc":"..."}, ...] (ver --sample)'
  );
}

function schemaOf(fn) {
  const dot = fn.indexOf('.');
  return dot === -1 ? null : fn.slice(0, dot);
}

function inScope(fn) {
  const s = schemaOf(fn);
  // Sem prefixo de schema: assume escopo (provavelmente public) e valida.
  return s === null || SCOPE_SCHEMAS.has(s);
}

function isWhitelisted(fn) {
  if (WHITELIST.has(fn)) return true;
  if (!fn.includes('.') && WHITELIST_SHORT.has(fn)) return true;
  return false;
}

/**
 * Retorna lista de razões de violação para uma entrada do report.
 * @param {{fn?: unknown, prosrc?: unknown}} entry
 * @returns {string[]}
 */
function checkEntry(entry) {
  const prosrc = typeof entry.prosrc === 'string' ? entry.prosrc : '';
  const reasons = [];

  const hasHttpCall = /net\.http_(get|post)\s*\(/i.test(prosrc);
  const mentionsEvolution = /evolution/i.test(prosrc);
  if (hasHttpCall && mentionsEvolution) {
    reasons.push(
      'chama net.http_get/net.http_post referenciando evolution no corpo; ' +
      'use ops.fn_evo_url()/ops.fn_evo_key() para montar o egresso'
    );
  }

  const readsVault = /vault\.decrypted_secrets/i.test(prosrc);
  const readsEvoUrlSecret = /evolution_api_url/i.test(prosrc);
  if (readsVault && readsEvoUrlSecret) {
    reasons.push(
      'lê vault.decrypted_secrets (evolution_api_url) diretamente; ' +
      'use ops.fn_evo_url()'
    );
  }

  return reasons;
}

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--sample')) {
    console.log(SAMPLE_QUERY);
    process.exit(0);
  }

  const reportPath = args.find((a) => !a.startsWith('-'));
  if (!reportPath) {
    usage();
    process.exit(2);
  }

  let raw;
  try {
    raw = readFileSync(reportPath, 'utf8');
  } catch (err) {
    console.error(`sql-gate: não foi possível ler "${reportPath}": ${err.message}`);
    process.exit(2);
  }

  let report;
  try {
    report = JSON.parse(raw);
  } catch (err) {
    console.error(`sql-gate: JSON inválido em "${reportPath}": ${err.message}`);
    process.exit(2);
  }

  if (!Array.isArray(report)) {
    console.error('sql-gate: report deve ser um array JSON [{"fn":..., "prosrc":...}, ...]');
    process.exit(2);
  }

  const violations = [];
  let analyzed = 0;
  let whitelisted = 0;

  for (const entry of report) {
    const fn = entry && typeof entry.fn === 'string'
      ? entry.fn
      : String((entry && entry.fn) ?? '?');

    if (!inScope(fn)) continue; // fora dos schemas monitorados (evo,zapp,ops,public)
    if (isWhitelisted(fn)) {
      whitelisted++;
      continue;
    }
    analyzed++;

    for (const reason of checkEntry(entry)) {
      violations.push({ fn, reason });
    }
  }

  if (violations.length > 0) {
    console.error(`SQL GATE: ${violations.length} violação(ões) de egresso Evolution`);
    for (const v of violations) {
      console.error(`  - ${v.fn}: ${v.reason}`);
    }
    process.exit(1);
  }

  console.log(
    `SQL gate OK: 0 violações (${analyzed} função(ões) analisada(s), ${whitelisted} no whitelist)`
  );
  process.exit(0);
}

main();
