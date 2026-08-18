#!/usr/bin/env node
/**
 * check-migration-gates.mjs
 *
 * Gates de qualidade para supabase/migrations/*.sql — rodar em CI (PR + push)
 * e localmente antes de abrir PR com migration nova.
 *
 * Política (AG-EX-13, fechada em 2026-08-05):
 *   (a) FAIL (exit 1) em ANTIPADRÃO — bloco `EXCEPTION WHEN OTHERS THEN ... RAISE
 *       NOTICE` que ENGOLHE a falha (o DO block termina "OK" mesmo com erro;
 *       causa do REC-ARTDB-03 — job NPS nunca criado). Achado A do Claude na
 *       auditoria 2026-08-05 (campanhas_nps_cron.sql). Correto: RAISE EXCEPTION ou
 *       log + RE-RAISE (`RAISE NOTICE ...; RAISE;`) — a exceção log+re-raise é
 *       reconhecida automaticamente e NÃO é sinalizada.
 *       Arquivos com antipadrão histórico (dívida documentada) passam por
 *       `--allowlist=` e viram WARN (não-fail). Allowlist NÃO é hardcoded aqui —
 *       é passada por args (o workflow ci.yml declara a dívida atual).
 *   (b) WARN (não-fail) em FUTURO — timestamp no nome do arquivo (YYYYMMDDHHMMSS)
 *       maior que o relógio atual (UTC). Padrão da casa: migrations com versão
 *       futura para ordenar a fila de apply (documentado no AGENTS.md — AG-EX-14).
 *   (c) FAIL (exit 1) em SET-EXPRESSAO — `SET [LOCAL|SESSION] <guc.com.ponto> =
 *       <chamada de função>` (ex.: SET LOCAL request.jwt.claims = json_build_object(...)).
 *       SET não aceita expressão — só literal — e o erro só estoura em RUNTIME,
 *       pulando canários inteiros (classe que invalidou 7 migrations em
 *       2026-08-17/18). Correto: PERFORM set_config('<guc>', <expr>::text, true).
 *       Linhas de comentário (--) são ignoradas; allowlist vale como em (a).
 *   (d) FAIL (exit 1) em COLISAO-VERSAO — dois ou mais arquivos com o mesmo
 *       prefixo de versão (14 dígitos). Ferramentas por-versão (aplicador
 *       db-migrate, schema_migrations com PK em version) enxergam só UMA e
 *       pulam as demais em silêncio. Classe recorrente: 8 duplicatas
 *       eliminadas em 2026-08-18 e uma nova (PR #1231) nasceu 30 min depois.
 *       Allowlist (por arquivo) rebaixa para WARN, como em (a)/(c).
 *
 * Uso:
 *   node scripts/check-migration-gates.mjs                          # varre supabase/migrations
 *   node scripts/check-migration-gates.mjs <dir>                    # diretório custom
 *   node scripts/check-migration-gates.mjs --allowlist=a.sql,b.sql  # dívida histórica → WARN
 *   node scripts/check-migration-gates.mjs --quiet                  # só exit code
 *
 * Exit codes: 0 = sem violação FAIL (warnings permitidos) · 1 = antipadrão fora da allowlist.
 *
 * Integração CI (implementada — job migration-gates no ci.yml):
 *   - name: Run migration gates (allowlist de dívida histórica)
 *     run: node scripts/check-migration-gates.mjs \
 *            --allowlist=20260804000000_canonical_schema_squash_133_migrations.sql,20260804150000_fix_secdef_revoke_extended_schemas.sql,20260804170000_fix_rls_systematic_coverage.sql
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// ── Parsing de args ─────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const quiet = args.includes('--quiet');
const dir = args.find((a) => !a.startsWith('--')) ?? 'supabase/migrations';

// Allowlist: --allowlist=f1,f2 (vírgula) e/ou repetido. NÃO hardcoded.
const allowlist = new Set();
for (const a of args) {
  if (a.startsWith('--allowlist=')) {
    for (const f of a.slice('--allowlist='.length).split(',')) {
      const t = f.trim();
      if (t) allowlist.add(t);
    }
  }
}

// ── Regras ──────────────────────────────────────────────────────────────────
// (a) ANTIPADRÃO: handler `EXCEPTION WHEN OTHERS THEN` que engole erro via
//     RAISE NOTICE (definição do gate — achado A; ver .hermes/reconciliation/
//     ANALISE_CLAUDE_EXAUSTIVA.md §1.11-A). Regex tolerante a quebras de
//     linha/indentação; janela de 120 chars para o RAISE NOTICE.
const SWALLOW_RE = /EXCEPTION\s+WHEN\s+OTHERS\s+THEN[\s\S]{0,120}?RAISE\s+NOTICE\b/i;
// Exceção reconhecida como CORRETA: logo após a declaração que engole (fim do
// statement = próximo ';') vem um re-raise (`RAISE;` ou `RAISE EXCEPTION ...`).
const RE_RAISE_RE = /RAISE\s*;|RAISE\s+EXCEPTION\b/i;

// (c) SET-EXPRESSAO: SET [LOCAL|SESSION] <guc com ponto> = <chamada de função>.
//     LHS com ponto discrimina GUC custom (request.jwt.claims) de UPDATE ... SET
//     coluna = f(...) e de SET search_path/statement_timeout. Avaliado POR LINHA
//     com comentário -- removido (menções em comentário não sinalizam).
const SET_EXPR_RE = /\bSET\s+(?:LOCAL\s+|SESSION\s+)?"?[a-z_][\w$]*"?\.[\w$.]+"?\s*=\s*[a-z_][\w$.]*\s*\(/i;

function findSetExprLine(content) {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const code = lines[i].replace(/--.*$/, '');
    if (SET_EXPR_RE.test(code)) return { line: i + 1, text: lines[i].trim() };
  }
  return null;
}

function hasImmediateReRaise(content, fromIdx) {
  const semi = content.indexOf(';', fromIdx);
  if (semi === -1) return false;
  return RE_RAISE_RE.test(content.slice(semi, semi + 160));
}

// (b) Prefixo de timestamp YYYYMMDDHHMMSS no nome do arquivo.
const TS_RE = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/;

const fails = [];
const warns = [];
let total = 0;
const byVersion = new Map(); // (d) versao (14 digitos) -> [arquivos]

if (!quiet) console.log(`check-migration-gates: varrendo ${dir} (allowlist: ${allowlist.size} arquivo(s))\n`);

for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
  total += 1;
  const full = join(dir, file);
  const content = readFileSync(full, 'utf8');

  // (a) antipadrão (engolir falha) — fora da allowlist = FAIL; na allowlist = WARN
  const mAnti = content.match(SWALLOW_RE);
  if (mAnti) {
    const snippet = mAnti[0].replace(/\s+/g, ' ').slice(0, 140);
    const msg = `EXCEPTION WHEN OTHERS THEN + RAISE engole falha (achado A) — trecho: ${snippet}…`;
    if (hasImmediateReRaise(content, mAnti.index + mAnti[0].length)) {
      if (!quiet) console.log(`ℹ️  [OK] ${file} — log + re-raise (padrão correto), não sinalizado.`);
      continue;
    }
    if (allowlist.has(file)) {
      warns.push({ file, kind: 'ANTIPADRAO-ALLOWLIST', msg });
    } else {
      fails.push({ file, kind: 'ANTIPADRAO', msg });
    }
  }

  // (c) SET com expressão em GUC — fora da allowlist = FAIL; na allowlist = WARN
  const mSet = findSetExprLine(content);
  if (mSet) {
    const msg = `SET com expressão em GUC (linha ${mSet.line}): ${mSet.text.slice(0, 120)} — SET só aceita literal; use PERFORM set_config('<guc>', <expr>::text, true)`;
    if (allowlist.has(file)) {
      warns.push({ file, kind: 'SET-EXPRESSAO-ALLOWLIST', msg });
    } else {
      fails.push({ file, kind: 'SET-EXPRESSAO', msg });
    }
  }

  // (b) timestamp futuro — WARN (não-fail): padrão da casa usa versão futura
  //     para ordenar migrations (AG-EX-14). Comparação em UTC (sem fuso local).
  const mTs = file.match(TS_RE);
  if (mTs) {
    // (d) coleta p/ detecção de colisão de versão (avaliada após o loop)
    const ver = mTs.slice(1).join('');
    if (!byVersion.has(ver)) byVersion.set(ver, []);
    byVersion.get(ver).push(file);
    const [, y, mo, d, h, mi, s] = mTs;
    const tsDate = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)));
    if (!Number.isNaN(tsDate.getTime()) && tsDate.getTime() > Date.now()) {
      warns.push({
        file,
        kind: 'FUTURO',
        msg: `timestamp ${y}${mo}${d}${h}${mi}${s} > agora (${new Date().toISOString()}) — migration com versão futura (ordenamento); confirmar intenção`,
      });
    }
  }
}

// (d) colisão de versão — todos os arquivos da versão duplicada são listados;
//     FAIL se QUALQUER um estiver fora da allowlist (colisão é defeito do par).
for (const [ver, files] of byVersion) {
  if (files.length < 2) continue;
  const msg = `versão ${ver} usada por ${files.length} arquivos: ${files.join(', ')} — ferramentas por-versão pulam as demais em silêncio; renomeie para versões únicas`;
  if (files.every((fl) => allowlist.has(fl))) {
    warns.push({ file: files.join(' + '), kind: 'COLISAO-VERSAO-ALLOWLIST', msg });
  } else {
    fails.push({ file: files.join(' + '), kind: 'COLISAO-VERSAO', msg });
  }
}

// ── Saída ────────────────────────────────────────────────────────────────────
if (!quiet) {
  for (const w of warns) {
    console.log(`⚠️  [WARN][${w.kind}] ${w.file}`);
    console.log(`   ${w.msg}`);
  }
  for (const f of fails) {
    console.log(`❌ [FAIL][${f.kind}] ${f.file}`);
    console.log(`   ${f.msg}`);
    console.log(`   → fora da allowlist (dívida documentada). Corrija o handler (RAISE EXCEPTION / log+re-raise) ou adicione à allowlist com justificativa.`);
  }
}

if (fails.length > 0) {
  if (!quiet) console.log(`\ncheck-migration-gates: FALHOU — ${fails.length} FAIL(s) + ${warns.length} WARN(s) em ${total} migration(s).`);
  process.exit(1);
}
if (!quiet) console.log(`\n✅ check-migration-gates: OK — ${total} migration(s), ${warns.length} WARN(s) (${warns.filter((w) => w.kind === 'FUTURO').length} timestamp futuro, ${warns.filter((w) => w.kind === 'ANTIPADRAO-ALLOWLIST').length} antipadrão na allowlist).`);
