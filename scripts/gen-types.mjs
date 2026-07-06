#!/usr/bin/env node
/**
 * gen-types.mjs — regenera src/integrations/supabase/types.ts do postgres-meta vivo.
 * Uso: META_URL=http://10.0.1.52:8080 node scripts/gen-types.mjs
 *
 * Pós-processos (evidence-based, 2026-07-06):
 * 1) INSTEAD OF: information_schema marca colunas de views como não-updatable mesmo
 *    quando triggers INSTEAD OF aceitam a escrita (updatability por coluna ignora
 *    triggers). Consultamos pg_trigger e trocamos `campo?: never` pelo tipo do Row.
 * 2) Relationships em views: PostgREST resolve embeds view→view via FKs das tabelas
 *    BASE (mapeamento view→base). O generator não emite isso; consultamos pg_depend/
 *    pg_constraint e injetamos Relationships equivalentes, para os embeds tiparem.
 */
import { writeFileSync } from 'fs';
const META = process.env.META_URL || 'http://10.0.1.52:8080';
const q = async sql => {
  const r = await fetch(`${META}/query`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: sql }) });
  if (!r.ok) throw new Error(`meta /query HTTP ${r.status}: ${await r.text()}`);
  return r.json();
};

// --- verdade do banco ---
const insteadOf = (await q(`
  SELECT c.relname AS v FROM pg_trigger t
  JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='v' AND t.tgtype::int & 64 > 0 AND NOT t.tgisinternal
  GROUP BY c.relname`)).map(r => r.v);

const relRows = await q(`
  WITH view_base AS (
    SELECT DISTINCT v.relname AS view_name, bt.oid AS base_oid
    FROM pg_depend d
    JOIN pg_rewrite r ON r.oid=d.objid
    JOIN pg_class v ON v.oid=r.ev_class AND v.relkind='v'
    JOIN pg_namespace vn ON vn.oid=v.relnamespace AND vn.nspname='public'
    JOIN pg_class bt ON bt.oid=d.refobjid AND bt.relkind='r'
    JOIN pg_namespace bn ON bn.oid=bt.relnamespace AND bn.nspname NOT IN ('pg_catalog','information_schema','auth','storage','realtime','vault','extensions')
    WHERE d.classid='pg_rewrite'::regclass AND d.deptype='n' AND v.oid<>d.refobjid),
  fks AS (
    SELECT con.conname, con.conrelid src_oid, con.confrelid tgt_oid,
      (SELECT to_jsonb(array_agg(a.attname ORDER BY x.ord)) FROM unnest(con.conkey) WITH ORDINALITY x(attnum,ord) JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=x.attnum) src_cols,
      (SELECT to_jsonb(array_agg(a.attname ORDER BY x.ord)) FROM unnest(con.confkey) WITH ORDINALITY x(attnum,ord) JOIN pg_attribute a ON a.attrelid=con.confrelid AND a.attnum=x.attnum) tgt_cols
    FROM pg_constraint con WHERE con.contype='f')
  SELECT sv.view_name AS v, f.conname AS fk, f.src_cols, f.tgt_cols, tv.view_name AS tgt
  FROM view_base sv JOIN fks f ON f.src_oid=sv.base_oid JOIN view_base tv ON tv.base_oid=f.tgt_oid`);
const relsByView = {};
for (const r of relRows) (relsByView[r.v] ||= []).push(r);

// --- gerar ---
const res = await fetch(`${META}/generators/typescript?included_schemas=public&detect_one_to_one_relationships=true`);
if (!res.ok) { console.error('meta HTTP', res.status); process.exit(1); }
let src = await res.text();
try { const j = JSON.parse(src); src = j.types || j.data || src; } catch { /* TS puro */ }
const L = src.split('\n');
const viewsIdx = L.findIndex(l => /^    Views: \{$/.test(l));

// pós-processo por view (never→Row nas INSTEAD OF; Relationships injetados)
let fixedNever = 0, injectedRels = 0;
for (let i = viewsIdx + 1; i < L.length; i++) {
  if (/^    \}$/.test(L[i])) break; // fim de Views
  const vm = L[i].match(/^      (\w+): \{$/);
  if (!vm) continue;
  const view = vm[1];
  // Row map
  const rowTypes = {};
  let j = i + 1;
  if (/^        Row: \{$/.test(L[j])) {
    for (j++; j < L.length && !/^        \}$/.test(L[j]); j++) {
      const m = L[j].match(/^          (\w+): (.+)$/); if (m) rowTypes[m[1]] = m[2];
    }
  }
  // fim do bloco da view
  let end = j;
  for (; end < L.length && !/^      \}$/.test(L[end]); end++) {
    if (insteadOf.includes(view)) {
      const m = L[end].match(/^          (\w+)\?: never$/);
      if (m && rowTypes[m[1]]) { L[end] = `          ${m[1]}?: ${rowTypes[m[1]]}`; fixedNever++; }
    }
  }
  // Relationships: [] → injeta
  const rels = relsByView[view];
  if (rels) {
    for (let k = i; k < end; k++) {
      if (/^        Relationships: \[\]$/.test(L[k])) {
        const body = rels.map(r => `          {\n            foreignKeyName: ${JSON.stringify(r.fk)}\n            columns: ${JSON.stringify(r.src_cols)}\n            isOneToOne: false\n            referencedRelation: ${JSON.stringify(r.tgt)}\n            referencedColumns: ${JSON.stringify(r.tgt_cols)}\n          },`).join('\n');
        L[k] = `        Relationships: [\n${body}\n        ]`;
        injectedRels += rels.length;
        break;
      }
    }
  }
  i = end;
}
// helpers: TablesInsert/TablesUpdate devem cobrir Views (escrevemos em views por design — ADR-001)
let out = L.join('\n');
out = out.replace(/keyof DefaultSchema\["Tables"\]\s*$/gm, 'keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])')
         .replace(/DefaultSchema\["Tables"\]\[(TableName|DefaultSchemaTableNameOrOptions)\] extends \{\s*\n(\s*)Insert: infer I/g, '(DefaultSchema["Tables"] & DefaultSchema["Views"])[$1] extends {\n$2Insert: infer I')
         .replace(/DefaultSchema\["Tables"\]\[(TableName|DefaultSchemaTableNameOrOptions)\] extends \{\s*\n(\s*)Update: infer U/g, '(DefaultSchema["Tables"] & DefaultSchema["Views"])[$1] extends {\n$2Update: infer U');
writeFileSync('src/integrations/supabase/types.ts', out);
// fecha o loop do sentinel: marca o schema atual como sincronizado com o types.ts recém-gerado
await q("INSERT INTO ops.types_sync_state (id, fingerprint, notes) VALUES (1, ops.fn_schema_fingerprint(), 'gen-types.mjs') ON CONFLICT (id) DO UPDATE SET fingerprint=EXCLUDED.fingerprint, captured_at=now(), notes=EXCLUDED.notes").catch(e=>console.warn('sentinel não atualizado:',e.message));
console.log(`✅ types.ts: ${L.length} linhas | never→Row: ${fixedNever} (views: ${insteadOf.join(',')}) | relationships injetados: ${injectedRels}`);
