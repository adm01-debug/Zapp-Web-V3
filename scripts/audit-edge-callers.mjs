import { readdirSync, statSync, readFileSync, writeFileSync } from 'fs';
import { join, relative } from 'path';

const ROOT = '/workspace/repos/zapp-web-v3';
const FN_DIR = join(ROOT, 'supabase/functions');

const fns = readdirSync(FN_DIR).filter(d => {
  if (d.startsWith('_') || d.startsWith('.')) return false;
  try { return statSync(join(FN_DIR, d)).isDirectory(); } catch { return false; }
}).sort();

const SKIP_DIRS = new Set(['node_modules','.git','dist','build','coverage','.next']);
function walk(dir, out = []) {
  let ents; try { ents = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|jsx|mjs|cjs|sql|toml|json|yml|yaml|sh)$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = walk(ROOT).map(p => ({ p, rel: relative(ROOT, p), body: (() => { try { return readFileSync(p, 'utf8'); } catch { return ''; } })() }));
console.error('arquivos escaneados: ' + files.length);

function bucket(rel) {
  if (/(^|\/)__tests__\//.test(rel) || /\.(test|spec)\.[tj]sx?$/.test(rel)) return 'test';
  if (rel.startsWith('e2e/')) return 'test';
  if (rel.startsWith('docs/') || rel.startsWith('.hermes/') || rel.startsWith('ops/')) return 'doc';
  if (rel.startsWith('src/')) return 'front';
  if (rel.startsWith('supabase/migrations/')) return 'db';
  if (rel.startsWith('supabase/functions/')) return 'edge';
  if (rel.startsWith('scripts/') || rel.startsWith('.github/')) return 'ci';
  if (rel.startsWith('infra/')) return 'infra';
  return 'other';
}

const rows = [];
for (const fn of fns) {
  const esc = fn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const reInvoke = new RegExp('invoke\\s*\\(\\s*[\'"`]' + esc + '[\'"`]');
  const reUrl = new RegExp('functions/v1/' + esc + '(?![A-Za-z0-9_-])');
  const hits = { front: [], edge: [], db: [], ci: [], test: [], doc: [], infra: [], other: [] };
  for (const f of files) {
    if (f.rel.startsWith('supabase/functions/' + fn + '/')) continue;
    if (!f.body.includes(fn)) continue;
    if (reInvoke.test(f.body) || reUrl.test(f.body)) hits[bucket(f.rel)].push(f.rel);
  }
  const real = hits.front.length + hits.edge.length + hits.db.length + hits.ci.length;
  let verdict;
  if (hits.front.length) verdict = 'A_FRONT';
  else if (hits.edge.length) verdict = 'B_EDGE';
  else if (hits.db.length) verdict = 'C_DB_CRON';
  else if (hits.ci.length) verdict = 'D_CI_ONLY';
  else if (hits.test.length || hits.doc.length) verdict = 'E_SEM_CHAMADOR';
  else verdict = 'F_ZERO_REF';
  rows.push({ fn, verdict, real, front: hits.front.length, edge: hits.edge.length, db: hits.db.length, ci: hits.ci.length, test: hits.test.length, doc: hits.doc.length, sample: [...hits.front, ...hits.edge, ...hits.db, ...hits.ci].slice(0,3) });
}

writeFileSync('/workspace/scripts/edge-callers.json', JSON.stringify(rows, null, 2));
const tally = {};
for (const r of rows) tally[r.verdict] = (tally[r.verdict] || 0) + 1;
console.log('TOTAL: ' + rows.length);
console.log(JSON.stringify(tally, null, 2));
