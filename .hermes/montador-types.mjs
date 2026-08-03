#!/usr/bin/env node
/**
 * montador-types.mjs — temporary montador (schema-by-schema workaround for
 * postgres-meta OOM/502 on combined 3-schema request).
 * Combines .hermes/pg-{evo,public,zapp}.ts into a full types.ts, preserving
 * the Lovable tail from the current src/integrations/supabase/types.ts.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const SCHEMA_FILES = {
  evo: '.hermes/pg-evo.ts',
  public: '.hermes/pg-public.ts',
  zapp: '.hermes/pg-zapp.ts',
};
const CURRENT = 'src/integrations/supabase/types.ts';
const OUT = '.hermes/types.new.ts';

function splitFile(path) {
  const lines = readFileSync(path, 'utf8').split('\n');
  const d0 = lines.findIndex((l) => /^export type Database = \{$/.test(l));
  if (d0 < 0) throw new Error(`${path}: 'export type Database = {' not found`);
  let depth = 1;
  let close = -1;
  for (let i = d0 + 1; i < lines.length; i++) {
    for (const c of lines[i]) {
      if (c === '{') depth++;
      else if (c === '}') depth--;
    }
    if (depth === 0) { close = i; break; }
  }
  if (close < 0) throw new Error(`${path}: unbalanced braces`);
  // NOTE: this meta instance emits Lovable-style output — Database closes
  // with plain '}' (no 'as const'); the trailing 'export const Constants'
  // section is discarded (the preserved tail carries the full Constants).
  return {
    header: lines.slice(0, d0 + 1), // Json + 'export type Database = {'
    body: lines.slice(d0 + 1, close), // '  <schema>: { ... }'
  };
}

// Tail from current types.ts: everything after Database's closing '}'
const cur = readFileSync(CURRENT, 'utf8').split('\n');
let depth = 0, inDb = false, endLine = -1;
for (let i = 0; i < cur.length; i++) {
  if (/^export type Database = \{$/.test(cur[i])) { inDb = true; depth = 1; continue; }
  if (inDb) {
    for (const c of cur[i]) { if (c === '{') depth++; else if (c === '}') depth--; }
    if (depth === 0) { endLine = i; break; }
  }
}
if (endLine < 0) throw new Error('current types.ts: Database close not found');
const tail = cur.slice(endLine + 1).join('\n');
if (!tail.includes('DatabaseWithoutInternals')) throw new Error('tail missing DatabaseWithoutInternals');

// Assemble
const parts = [];
let header = null;
for (const s of ['evo', 'public', 'zapp']) {
  const f = splitFile(SCHEMA_FILES[s]);
  if (!header) header = f.header;
  parts.push(f.body.join('\n'));
}
const out = header.join('\n') + '\n' + parts.join('\n') + '\n}\n' + tail;

writeFileSync(OUT, out);
const lineCount = out.split('\n').length;
console.log(`✓ ${OUT} montado (${lineCount} linhas)`);
// Integrity checks
const open = (out.match(/{/g) || []).length;
const close = (out.match(/}/g) || []).length;
console.log(`  braces: {=${open} }=${close} ${open === close ? 'BALANCEADO' : 'DESBALANCEADO!'}`);
console.log(`  tail preservada: ${tail.split('\n').length} linhas`);
console.log(`  contact_intelligence: ${(out.match(/contact_intelligence/g) || []).length}x`);
console.log(`  evolution_messages: ${(out.match(/evolution_messages/g) || []).length}x`);
