#!/usr/bin/env node
/**
 * repair-types-schemas.mjs
 * ------------------------------------------------------------------
 * Tenta consertar `src/integrations/supabase/types.ts` regenerando os
 * tipos contra a VPS e reexecutando o gate `check:types-schemas` até
 * passar (ou esgotar as tentativas).
 *
 * Requer as variáveis de ambiente (aliases `ZAPP_*` ou `META_*`):
 *   - META_URL  / ZAPP_META_URL
 *   - META_TOKEN / ZAPP_META_TOKEN
 *
 * Uso:
 *   npm run types:repair
 *   MAX_ATTEMPTS=5 RETRY_DELAY_MS=3000 npm run types:repair
 *
 * Sem os secrets, sai com código 0 e emite um aviso — permite invocar
 * o script em CIs/máquinas sem credenciais sem quebrar a pipeline.
 *
 * Exit codes:
 *   0  gate passa (ou secrets ausentes → no-op documentado)
 *   1  gate continua falhando após MAX_ATTEMPTS
 *   2  erro fatal fora do loop (ex.: gen-types-zapp não encontrado)
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const GEN_SCRIPT = 'scripts/gen-types-zapp.mjs';
const CHECK_SCRIPT = 'scripts/check-types-schemas.mjs';

const META = process.env.META_URL || process.env.ZAPP_META_URL;
const TOKEN = process.env.META_TOKEN || process.env.ZAPP_META_TOKEN;
const MAX_ATTEMPTS = Number(process.env.MAX_ATTEMPTS || 3);
const RETRY_DELAY_MS = Number(process.env.RETRY_DELAY_MS || 2000);
const DRY_RUN =
  process.argv.includes('--dry-run') ||
  /^(1|true|yes)$/i.test(process.env.DRY_RUN || '');

function log(msg) {
  console.log(`[types:repair] ${msg}`);
}
function warn(msg) {
  console.warn(`[types:repair] ⚠ ${msg}`);
}
function err(msg) {
  console.error(`[types:repair] ✗ ${msg}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Retorna true se o gate passou (exit 0). */
function runCheck() {
  const r = spawnSync(process.execPath, [CHECK_SCRIPT, '--local-only'], {
    stdio: 'inherit',
  });
  return r.status === 0;
}

/** Retorna true se a regeneração terminou com sucesso. */
function runGen() {
  const r = spawnSync(process.execPath, [GEN_SCRIPT], {
    stdio: 'inherit',
    env: {
      ...process.env,
      // Normaliza para o nome esperado por gen-types-zapp.mjs.
      META_URL: META,
      META_TOKEN: TOKEN,
      SCHEMAS: process.env.SCHEMAS || 'public,zapp,evo',
    },
  });
  return r.status === 0;
}

// -------------------- Guard rails --------------------
if (!existsSync(CHECK_SCRIPT)) {
  err(`${CHECK_SCRIPT} não encontrado.`);
  process.exit(2);
}
if (!existsSync(GEN_SCRIPT)) {
  err(`${GEN_SCRIPT} não encontrado.`);
  process.exit(2);
}

// Fast-path: já está OK, nada a consertar.
log('Executando gate inicial…');
if (runCheck()) {
  log('✓ Gate já passa — nada a consertar.');
  process.exit(0);
}

if (!META || !TOKEN) {
  warn('META_URL/META_TOKEN (ou ZAPP_META_URL/ZAPP_META_TOKEN) ausentes — não há como regenerar.');
  warn('Rode o workflow "Regenerate Supabase types (zapp + evo)" no GitHub Actions,');
  warn('ou exporte os secrets localmente e re-execute `npm run types:repair`.');
  // Sai 0 para não bloquear pipelines em forks/PRs externos onde o script
  // seja chamado por conveniência. O gate `check:types-schemas` continua
  // sendo a fonte da verdade bloqueante no build.
  process.exit(0);
}

// -------------------- Loop de reparo --------------------
let attempt = 0;
let ok = false;
while (attempt < MAX_ATTEMPTS) {
  attempt++;
  log(`Tentativa ${attempt}/${MAX_ATTEMPTS} — regenerando types.ts…`);
  const genOk = runGen();
  if (!genOk) {
    warn(`Falha ao regenerar (tentativa ${attempt}).`);
  } else {
    log('Regeneração concluída. Reexecutando gate…');
    if (runCheck()) {
      ok = true;
      break;
    }
    warn(`Gate ainda falha após regeneração (tentativa ${attempt}).`);
  }
  if (attempt < MAX_ATTEMPTS) {
    const delay = RETRY_DELAY_MS * attempt; // backoff linear
    log(`Aguardando ${delay}ms antes de nova tentativa…`);
    await sleep(delay);
  }
}

if (ok) {
  log('✓ Tipos reparados — gate passou.');
  process.exit(0);
} else {
  err(`Gate continuou falhando após ${MAX_ATTEMPTS} tentativas.`);
  err('Inspecione reports/schema-status/report.md para o diagnóstico completo.');
  process.exit(1);
}
