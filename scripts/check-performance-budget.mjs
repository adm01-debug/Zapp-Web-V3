#!/usr/bin/env node
/**
 * check-performance-budget.mjs
 * ──────────────────────────────
 * Gate de performance REAL para CI (fix E02-N02 / F10-06).
 *
 * Antes (no-op): comparava valores LITERAIS fixos (LCP: 1200, bundleSize: 450 KB)
 * contra o budget — passava sempre, não media nada.
 *
 * Agora (funcional):
 *   1. Lê `dist/*.html` pós-build e identifica o entry module + chunks vendor
 *      pré-carregados (modulepreload) — a carga inicial real da SPA.
 *   2. Mede o tamanho REAL de `dist/assets/*.js` (gz via artefato `.js.gz` do
 *      vite-plugin-compression2; fallback: gzipSync em memória) + raw via statSync.
 *   3. Compara entry inicial, total inicial e chunks individuais contra o budget.
 *   4. Falha (exit 1) se qualquer budget for excedido, listando os chunks.
 *   5. Lê `performance-baseline.json` (se existir) para overrides de budget e
 *      alerta de regressão >10% vs. baseline gravado.
 *   6. Web Vitals (LCP/INP/CLS/TTFB) só são verificados se um relatório
 *      Lighthouse for fornecido via `--lighthouse <arquivo.json>` — nunca
 *      inventa medição.
 *
 * Uso:
 *   node scripts/check-performance-budget.mjs                 # gate (CI)
 *   node scripts/check-performance-budget.mjs --write-baseline
 *   node scripts/check-performance-budget.mjs --budget entryInitialGzip=700000
 *   node scripts/check-performance-budget.mjs --lighthouse lighthouse.json
 *   node scripts/check-performance-budget.mjs --json          # saída JSON pura
 */

import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'fs';
import { join, resolve, dirname, basename } from 'path';
import { gzipSync } from 'zlib';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST_DIR = join(ROOT, 'dist');
const ASSETS_DIR = join(DIST_DIR, 'assets');
const BASELINE_FILE = join(ROOT, 'performance-baseline.json');

const KB = 1024;

/** Budgets padrão (bytes p/ bundle; ms/score p/ vitals). Realistas p/ o estado
 *  atual do build (entry 449 KB gz, total inicial 1,66 MB gz em 2026-08-04):
 *  margem ~30% acima do atual para absorver crescimento sem regressão
 *  silenciosa. Ajuste sem código via performance-baseline.json -> budget. */
const DEFAULT_BUDGET = {
  entryInitialGzip: 600 * KB,        // 600 KB gz — JS do entry module
  totalInitialGzip: 2 * 1024 * KB,   // 2 MB gz — entry + todos os vendor preloads
  perChunkGzip: 600 * KB,            // 600 KB gz — teto por chunk da carga inicial
  LCP: 2500,                         // ms (só se houver relatório Lighthouse)
  INP: 200,                          // ms (FID legado → INP)
  CLS: 0.1,                          // score
  TTFB: 800,                         // ms
};

const REGRESSION_WARN_PCT = 0.10; // aviso se atual > baseline * 1.10

// ── helpers ────────────────────────────────────────────────────────────────

function fmtBytes(n) {
  if (n >= 1024 * KB) return `${(n / (1024 * KB)).toFixed(2)} MB`;
  return `${Math.round(n / KB)} KB`;
}

function fmtNum(n) {
  return Number.isInteger(n) ? String(n) : String(n.toFixed(2));
}

function ghAnnotation(level, title, msg) {
  // GitHub Actions: deixa o fail/warn visível no resumo do check.
  console.log(`::${level} title=${title}::${msg.replace(/\n/g, ' ')}`);
}

/** Tamanho gzip real de um .js: usa o artefato .gz do build (transferido pela
 *  rede) ou recalcula em memória se o artefato não existir. */
function gzipSizeOf(jsFile) {
  const gzFile = `${jsFile}.gz`;
  if (existsSync(gzFile)) return statSync(gzFile).size;
  return gzipSync(readFileSync(jsFile)).length;
}

/** Extrai os chunks da carga inicial de um dist/*.html: entry module + preloads. */
function parseInitialChunks(htmlFile) {
  const html = readFileSync(htmlFile, 'utf8');
  const entry = [...html.matchAll(/<script[^>]*\bsrc="([^"]+\.js)"/g)].map(m => m[1]);
  const preloads = [...html.matchAll(/<link[^>]*\brel="modulepreload"[^>]*\bhref="([^"]+\.js)"/g)].map(m => m[1]);
  return [...new Set([...entry, ...preloads])].map(p => join(DIST_DIR, p.replace(/^\//, '')));
}

/** Lê o relatório Lighthouse e extrai os vitals reais (numericValue em ms). */
function readLighthouseMetrics(reportFile) {
  const report = JSON.parse(readFileSync(reportFile, 'utf8'));
  const audits = report.audits || {};
  const num = id => audits[id] && typeof audits[id].numericValue === 'number' ? audits[id].numericValue : null;
  const metrics = {
    LCP: num('largest-contentful-paint'),
    INP: num('interaction-to-next-paint') ?? num('first-input-delay'),
    CLS: num('cumulative-layout-shift'),
    TTFB: num('server-response-time'),
  };
  const found = Object.values(metrics).filter(v => v !== null).length;
  if (found === 0) {
    throw new Error(`Nenhuma métrica de web vital encontrada em ${reportFile} (audits ausentes?).`);
  }
  return metrics;
}

// ── main ───────────────────────────────────────────────────────────────────

function run() {
  const args = process.argv.slice(2);
  const isWriteBaseline = args.includes('--write-baseline');
  const isJson = args.includes('--json');
  const lighthouseFile = (() => {
    const i = args.indexOf('--lighthouse');
    return i >= 0 && args[i + 1] ? args[i + 1] : null;
  })();

  // Overrides CLI: --budget entryInitialGzip=700000 (útil p/ tunar/rodar teste de falha)
  const cliBudget = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--budget' && args[i + 1]) {
      const m = args[i + 1].match(/^([A-Za-z]+)=(\d+(?:\.\d+)?)$/);
      if (m) cliBudget[m[1]] = parseFloat(m[2]);
      i++;
    }
  }

  const out = { ok: true, failures: [], warnings: [], chunks: [], budgets: {}, measurements: {} };

  // 0. Pré-condição: build existe. Um gate que não consegue medir FALHA alto —
  //    nunca passa no silêncio (era exatamente o bug E02-N02).
  if (!existsSync(DIST_DIR) || !existsSync(join(DIST_DIR, 'index.html'))) {
    const msg = 'dist/ não encontrado. Rode `npm run build` (ou `bun run build`) antes do gate — no CI, o passo de build deve anteceder o Performance Budget Gate.';
    ghAnnotation('error', 'Performance Budget Gate — dist ausente', msg);
    console.error(`❌ ${msg}`);
    process.exit(1);
  }

  // 1. Baseline (performance-baseline.json): overrides de budget + referência de regressão.
  const baseline = existsSync(BASELINE_FILE) ? JSON.parse(readFileSync(BASELINE_FILE, 'utf8')) : null;
  const budget = {
    ...DEFAULT_BUDGET,
    ...(baseline?.budget || {}),
    ...cliBudget,
  };
  if (baseline) out.warnings.push(`baseline carregado: ${basename(BASELINE_FILE)} (${baseline.generatedAt || 'data desconhecida'})`);

  // 2. Medição real dos chunks da carga inicial (entry + vendor preloads).
  const htmlFiles = [join(DIST_DIR, 'index.html')];
  const initialChunks = [...new Set(htmlFiles.flatMap(f => parseInitialChunks(f)))];
  if (initialChunks.length === 0) {
    const msg = 'Nenhum chunk JS encontrado em dist/index.html (build vazio ou HTML sem script module?).';
    ghAnnotation('error', 'Performance Budget Gate — sem chunks', msg);
    console.error(`❌ ${msg}`);
    process.exit(1);
  }

  const lazyChunks = existsSync(ASSETS_DIR)
    ? readdirSync(ASSETS_DIR).filter(f => f.endsWith('.js')).map(f => join(ASSETS_DIR, f)).filter(f => !initialChunks.includes(f))
    : [];

  for (const chunk of [...initialChunks, ...lazyChunks]) {
    if (!existsSync(chunk)) {
      out.failures.push(`chunk referenciado no HTML não existe no disco: ${chunk}`);
      continue;
    }
    out.chunks.push({
      file: basename(chunk),
      initial: initialChunks.includes(chunk),
      gzip: gzipSizeOf(chunk),
      raw: statSync(chunk).size,
    });
  }

  const initial = out.chunks.filter(c => c.initial);
  const entry = initial.find(c => /^index-.*\.js$/.test(c.file)) || initial[0];
  const measurements = {
    entryInitialGzip: entry?.gzip ?? 0,
    totalInitialGzip: initial.reduce((s, c) => s + c.gzip, 0),
    perChunkGzipMax: Math.max(0, ...initial.map(c => c.gzip)),
  };

  // 3. Comparação contra o budget.
  const checks = [
    { key: 'entryInitialGzip', label: 'Entry inicial (gz)', value: measurements.entryInitialGzip, limit: budget.entryInitialGzip },
    { key: 'totalInitialGzip', label: 'Total carga inicial (gz)', value: measurements.totalInitialGzip, limit: budget.totalInitialGzip },
  ];
  for (const c of initial) {
    if (c.gzip > budget.perChunkGzip) {
      out.failures.push(`chunk ${c.file}: ${fmtBytes(c.gzip)} gz > teto ${fmtBytes(budget.perChunkGzip)}`);
    }
  }
  for (const c of checks) {
    const pass = c.value <= c.limit;
    out.budgets[c.key] = c.limit;
    out.measurements[c.key] = c.value;
    if (!pass) out.failures.push(`${c.label}: ${fmtBytes(c.value)} > budget ${fmtBytes(c.limit)}`);
  }

  // 4. Regressão vs. baseline gravado (aviso, não falha — o budget é a lei).
  if (baseline?.measurements) {
    for (const key of ['entryInitialGzip', 'totalInitialGzip']) {
      const prev = baseline.measurements[key];
      const curr = measurements[key];
      if (typeof prev === 'number' && curr > prev * (1 + REGRESSION_WARN_PCT)) {
        const pct = ((curr / prev - 1) * 100).toFixed(1);
        out.warnings.push(`REGRESSÃO ${pct}% em ${key} vs. baseline (${fmtBytes(prev)} → ${fmtBytes(curr)}). Se intencional, rode --write-baseline.`);
      }
    }
  }

  // 5. Web Vitals — só com medição real (relatório Lighthouse). Nunca literal.
  if (lighthouseFile) {
    if (!existsSync(lighthouseFile)) {
      out.failures.push(`relatório Lighthouse não encontrado: ${lighthouseFile}`);
    } else {
      try {
        const vitals = readLighthouseMetrics(lighthouseFile);
        const vitalChecks = [
          { key: 'LCP', label: 'LCP', value: vitals.LCP, limit: budget.LCP, unit: 'ms' },
          { key: 'INP', label: 'INP/FID', value: vitals.INP, limit: budget.INP, unit: 'ms' },
          { key: 'CLS', label: 'CLS', value: vitals.CLS, limit: budget.CLS, unit: '' },
          { key: 'TTFB', label: 'TTFB', value: vitals.TTFB, limit: budget.TTFB, unit: 'ms' },
        ];
        for (const v of vitalChecks) {
          if (v.value === null) continue;
          const pass = v.value <= v.limit;
          out.budgets[v.key] = v.limit;
          out.measurements[v.key] = v.value;
          if (!pass) out.failures.push(`${v.label}: ${fmtNum(v.value)}${v.unit} > budget ${fmtNum(v.limit)}${v.unit}`);
        }
      } catch (e) {
        out.failures.push(`falha ao ler relatório Lighthouse: ${e.message}`);
      }
    }
  } else {
    out.warnings.push('Web Vitals não verificados: nenhum relatório Lighthouse fornecido (--lighthouse <arquivo.json>).');
  }

  // 6. Saída.
  const pass = out.failures.length === 0;
  if (isJson) {
    console.log(JSON.stringify({ pass, ...out }, null, 2));
  } else {
    console.log('🚀 Performance Budget Gate — medições reais de dist/');
    console.log('────────────────────────────────────────────────────────');
    for (const c of initial.sort((a, b) => b.gzip - a.gzip)) {
      const tag = c.gzip > budget.perChunkGzip ? '❌' : '✅';
      console.log(`  ${tag} ${c.file.padEnd(46)} gz ${fmtBytes(c.gzip).padStart(9)}  raw ${fmtBytes(c.raw).padStart(9)}`);
    }
    const lazyChunkList = out.chunks.filter(c => !c.initial);
    for (const c of lazyChunkList.filter(c => c.gzip > budget.perChunkGzip)) {
      console.log(`  ⚠️ ${c.file.padEnd(46)} gz ${fmtBytes(c.gzip).padStart(9)}  (lazy acima do teto ${fmtBytes(budget.perChunkGzip)})`);
      out.warnings.push(`chunk lazy ${c.file} tem ${fmtBytes(c.gzip)} gz — considere dividir ou carregar sob demanda.`);
    }
    console.log('────────────────────────────────────────────────────────');
    for (const c of checks) {
      const ok = c.value <= c.limit;
      console.log(`  ${ok ? '✅' : '❌'} ${c.label.padEnd(26)} ${fmtBytes(c.value).padStart(9)} / ${fmtBytes(c.limit)} gz`);
    }
    if (lighthouseFile && existsSync(lighthouseFile) && Object.keys(out.measurements).some(k => ['LCP', 'INP', 'CLS', 'TTFB'].includes(k))) {
      for (const [k, label] of [['LCP', 'LCP (Lighthouse)'], ['INP', 'INP/FID (Lighthouse)'], ['CLS', 'CLS (Lighthouse)'], ['TTFB', 'TTFB (Lighthouse)']]) {
        if (!(k in out.measurements)) continue;
        const value = out.measurements[k];
        const limit = out.budgets[k];
        const unit = k === 'CLS' ? '' : 'ms';
        const ok = value <= limit;
        console.log(`  ${ok ? '✅' : '❌'} ${label.padEnd(26)} ${fmtNum(value).padStart(9)}${unit} / ${fmtNum(limit)}${unit}`);
      }
    }
    if (out.chunks.filter(c => c.initial).length > 0) {
      const max = Math.max(...initial.map(c => c.gzip));
      console.log(`  ${max <= budget.perChunkGzip ? '✅' : '❌'} Maior chunk inicial (gz)        ${fmtBytes(max).padStart(9)} / ${fmtBytes(budget.perChunkGzip)} gz`);
    }
    console.log(`  ℹ️ Chunks lazy: ${lazyChunkList.length} (${fmtBytes(lazyChunkList.reduce((s, c) => s + c.gzip, 0))} gz total — fora do budget inicial)`);

    for (const w of out.warnings) console.log(`⚠️  ${w}`);
    if (pass) {
      console.log('\n🌟 Todos os budgets de performance passaram!');
    } else {
      console.error('\n🚨 Performance budget VIOLADO:');
      for (const f of out.failures) console.error(`   ❌ ${f}`);
      ghAnnotation('error', 'Performance Budget Gate — budget excedido', out.failures.join('; '));
    }
  }

  // 7. Baseline write.
  if (isWriteBaseline) {
    const payload = {
      generatedAt: new Date().toISOString(),
      budget,
      measurements,
      chunks: initial.map(c => ({ file: c.file, gzip: c.gzip, raw: c.raw })),
    };
    writeFileSync(BASELINE_FILE, JSON.stringify(payload, null, 2));
    console.log(`\n💾 Baseline gravado em ${BASELINE_FILE} (medições reais do build atual).`);
  }

  process.exit(pass ? 0 : 1);
}

try {
  run();
} catch (err) {
  console.error(`❌ check-performance-budget.mjs falhou: ${err.stack || err.message}`);
  process.exit(1);
}
