#!/usr/bin/env node
/**
 * query-fingerprint.mjs — Wave 3 (2026-07-06)
 * Extrai assinaturas estruturais das cadeias supabase de arquivos TS/TSX.
 * Invariante de extração UI→hook: o multiset de fingerprints do componente ANTES
 * deve ser IGUAL ao multiset da união (componente DEPOIS ∪ hook novo).
 * Uso:
 *   node scripts/query-fingerprint.mjs <arquivo...>            # imprime fingerprints
 *   node scripts/query-fingerprint.mjs --parity <before.json> <arquivo...>  # valida paridade
 *   node scripts/query-fingerprint.mjs --save <out.json> <arquivo...>       # salva p/ comparação
 */
import { readFileSync, writeFileSync } from 'fs';

export function fingerprints(code) {
  const out = [];
  const re = /supabase\s*\.\s*(?:from|rpc|channel|storage)\s*\(/g;
  let m;
  while ((m = re.exec(code))) {
    // captura a cadeia: do início do match até fechar a expressão (heurística por parênteses balanceados no encadeamento)
    let i = m.index, depth = 0, end = i, started = false;
    for (; end < code.length; end++) {
      const ch = code[end];
      if (ch === '(') { depth++; started = true; }
      else if (ch === ')') { depth--; if (started && depth === 0) {
        // continua se houver .metodo( em seguida (encadeamento)
        const rest = code.slice(end + 1);
        const chain = rest.match(/^\s*\.\s*\w+\s*\(/);
        if (!chain) { end++; break; }
      } }
      if (end - i > 4000) break; // guarda-chuva
    }
    const raw = code.slice(i, end);
    // normaliza: métodos + literais de string (tabelas/colunas); descarta expressões dinâmicas
    const methods = [...raw.matchAll(/\.(\w+)\s*\(([^()]*)\)/g)].map(mm => {
      const lits = [...mm[2].matchAll(/['"`]([\w.,*=() >!-]+)['"`]/g)].map(x => x[1]).join(',');
      return mm[1] + (lits ? `[${lits}]` : '');
    });
    const head = raw.match(/(from|rpc|channel|storage)\s*\(\s*['"`]?([\w.-]*)/);
    out.push((head ? head[1] + ':' + head[2] : '?') + '|' + methods.join('.'));
  }
  return out.sort();
}

const args = process.argv.slice(2);
if (import.meta.url === `file://${process.argv[1]}`) {
  let mode = 'print', ref = null, files = args;
  if (args[0] === '--parity') { mode = 'parity'; ref = args[1]; files = args.slice(2); }
  if (args[0] === '--save') { mode = 'save'; ref = args[1]; files = args.slice(2); }
  const all = files.flatMap(f => fingerprints(readFileSync(f, 'utf8')));
  all.sort();
  if (mode === 'print') console.log(JSON.stringify(all, null, 1));
  if (mode === 'save') { writeFileSync(ref, JSON.stringify(all, null, 1)); console.log(`💾 ${all.length} fingerprints → ${ref}`); }
  if (mode === 'parity') {
    const before = JSON.parse(readFileSync(ref, 'utf8'));
    const a = JSON.stringify(before), b = JSON.stringify(all);
    if (a === b) { console.log(`✅ paridade de queries: ${all.length} fingerprints idênticos`); }
    else {
      const miss = before.filter(x => !all.includes(x)); const extra = all.filter(x => !before.includes(x));
      console.error(`❌ paridade violada. faltando: ${JSON.stringify(miss)} | extra: ${JSON.stringify(extra)}`);
      process.exit(1);
    }
  }
}
