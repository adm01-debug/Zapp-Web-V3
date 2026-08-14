#!/usr/bin/env node
// scripts/decouple/verb-contract-gate.mjs — Gate do contrato de verbos do client Evolution
//
// Lê supabase/functions/_shared/providers/evolution/client.ts e verifica que o objeto
// `evolutionClient` exporta EXATAMENTE o conjunto esperado de verbos de alto nível.
// O gateway legítimo é a ÚNICA fonte desses verbos; qualquer divergência aqui
// indica refactor/remoção acidental ou verbo novo não documentado no contrato.
//
// Uso: node scripts/decouple/verb-contract-gate.mjs
// Exit: 0 = contrato íntegro | 1 = divergência (imprime o diff)
//
// Zero dependências (Node ESM, stdlib apenas).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CLIENT_PATH = fileURLToPath(
  new URL('../../supabase/functions/_shared/providers/evolution/client.ts', import.meta.url)
);

// Contrato esperado (12 verbos) — fonte: PLANO_DESACOPLAMENTO_V4_FINAL_100_ETAPAS
const EXPECTED_VERBS = [
  'sendText',
  'sendMedia',
  'sendSticker',
  'getConnectionState',
  'getQrCode',
  'restartInstance',
  'listInstances',
  'listGroups',
  'checkWhatsApp',
  'getProfilePicture',
  'get',
  'post',
];

/**
 * Extrai os nomes das propriedades do objeto `export const evolutionClient = { ... }`.
 * AST simples por regex: coleta o bloco do objeto e casa apenas chaves de nível
 * superior (indentação de 1-2 espaços, convenção do arquivo) — chaves aninhadas
 * (method/body/instance dentro dos corpos das arrows, indent ≥4) ficam de fora.
 * @param {string} src
 * @returns {string[] | null} null se o objeto não for encontrado
 */
function extractVerbs(src) {
  const m = src.match(/export\s+const\s+evolutionClient\s*=\s*\{([\s\S]*?)\n\};/);
  if (!m) return null;
  const verbs = [];
  for (const line of m[1].split('\n')) {
    const pm = line.match(/^ {1,2}([A-Za-z_$][\w$]*)\s*:/);
    if (pm) verbs.push(pm[1]);
  }
  return [...new Set(verbs)]; // dedupe
}

function main() {
  let src;
  try {
    src = readFileSync(CLIENT_PATH, 'utf8');
  } catch (err) {
    console.error(`❌ verb-contract-gate: não foi possível ler "${CLIENT_PATH}": ${err.message}`);
    process.exit(1);
  }

  const found = extractVerbs(src);
  if (!found) {
    console.error('❌ verb-contract-gate: "export const evolutionClient = { ... }" não encontrado em client.ts');
    process.exit(1);
  }

  const missing = EXPECTED_VERBS.filter(v => !found.includes(v));
  const extra = found.filter(v => !EXPECTED_VERBS.includes(v));

  if (missing.length > 0 || extra.length > 0) {
    console.error('❌ CONTRATO DE VERBOS DIVERGENTE — client.ts');
    if (missing.length > 0) {
      console.error(`  faltando (${missing.length}/${EXPECTED_VERBS.length}): ${missing.join(', ')}`);
    }
    if (extra.length > 0) {
      console.error(`  extras (${extra.length}): ${extra.join(', ')}`);
    }
    console.error(`  esperados: ${EXPECTED_VERBS.join(', ')}`);
    console.error(`  encontrados: ${found.join(', ')}`);
    process.exit(1);
  }

  console.log(`✅ verb-contract OK: ${found.length} verbos — contrato de ${EXPECTED_VERBS.length} íntegro (${CLIENT_PATH})`);
  process.exit(0);
}

main();
