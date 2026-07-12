#!/usr/bin/env node
/**
 * lint-supabase-casts.mjs
 * ──────────────────────────────────────────────────────────────────────────
 * Detecta padrões TypeScript perigosos que mascaram drift de schema entre
 * o frontend (zapp-web-v3) e o banco self-hosted (zapp.supabase.atomicabr.com.br).
 *
 * RISCO (FMEA #5, RPN 270):
 *   (supabase as any).from(...) → PostgREST silencia erros de RPC 404
 *   .rpc('nome' as never) → TypeScript não valida a assinatura da função
 *   supabase.from('tabela' as any) → nenhuma verificação de existência de coluna
 *
 * USO:
 *   node scripts/lint-supabase-casts.mjs [--dir src] [--fail-fast] [--json]
 *
 * SAÍDA:
 *   exit 0 → nenhum padrão proibido encontrado
 *   exit 1 → padrões encontrados (quebra o CI)
 *
 * REFERÊNCIA:
 *   docs/DECISION.md → ADR-001, regra 6
 *   docs/API_CONTRACT.md → Seção 4.1
 *
 * @version 1.0.0
 * @created 2026-07-05 (auditoria de espelhamento Cloud→zapp)
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { argv } from 'node:process';

// ── Configuração ──────────────────────────────────────────────────────────────
const CONFIG = {
  rootDir: parseArg('--dir') ?? 'src',
  failFast: argv.includes('--fail-fast'),
  jsonOutput: argv.includes('--json'),
  extensions: ['.ts', '.tsx'],
  excludePaths: [
    'node_modules', '.git', 'dist', 'build',
    '.next', 'coverage', '__tests__', 'scripts',
  ],
};

/**
 * Padrões proibidos com descrição e sugestão de correção.
 * Cada padrão gera um match com contexto de linha.
 */
const FORBIDDEN_PATTERNS = [
  {
    id: 'SUP-001',
    severity: 'error',
    regex: /\(\s*supabase\s+as\s+any\s*\)\s*\.\s*(from|rpc|storage|auth)/g,
    description: '(supabase as any).method() mascara incompatibilidade de schema',
    fix: 'Usar supabase.from(...) com tipos gerados do VPS self-hosted',
    docRef: 'docs/API_CONTRACT.md#4.1',
  },
  {
    id: 'SUP-002',
    severity: 'error',
    regex: /\.rpc\s*\(\s*['"`][^'"`]+['"`]\s+as\s+never/g,
    description: '.rpc(\'nome\' as never) desabilita validação TypeScript da assinatura',
    fix: 'Usar .rpc(\'nome\', params) com a assinatura correta gerada pelo supabase gen types',
    docRef: 'docs/API_CONTRACT.md#4.1',
  },
  {
    id: 'SUP-003',
    severity: 'error',
    regex: /\.from\s*\(\s*['"`][^'"`]+['"`]\s+as\s+any/g,
    description: '.from(\'tabela\' as any) ignora verificação de schema',
    fix: 'Usar o nome da tabela como string literal sem cast',
    docRef: 'docs/API_CONTRACT.md#4.1',
  },
  {
    id: 'SUP-004',
    severity: 'warn',
    regex: /as\s+any\s*\)/g,
    description: 'Cast `as any` em contexto de retorno Supabase pode mascarar drift',
    fix: 'Usar tipagem explícita ou o tipo gerado correspondente',
    docRef: 'docs/DECISION.md#ADR-001',
  },
  {
    id: 'SUP-005',
    severity: 'error',
    regex: /supabase\s*\.\s*(from|rpc)\s*\(\s*`[^`]*\$\{/g,
    description: 'Nome de tabela/RPC interpolado dinamicamente — não auditável',
    fix: 'Usar string literal; se dinâmico, validar contra allowlist em runtime',
    docRef: 'docs/API_CONTRACT.md#4.1',
  },
];

// ── Utilitários ───────────────────────────────────────────────────────────────

function parseArg(flag) {
  const idx = argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= argv.length) return undefined;
  return argv[idx + 1];
}

async function* walkDir(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (CONFIG.excludePaths.some(ex => fullPath.includes(ex))) continue;
    if (entry.isDirectory()) yield* walkDir(fullPath);
    else if (CONFIG.extensions.includes(extname(entry.name))) yield fullPath;
  }
}

function getLineContext(content, index, linesContext = 1) {
  const before = content.lastIndexOf('\n', index);
  const after = content.indexOf('\n', index);
  const lineStart = before === -1 ? 0 : before + 1;
  const lineEnd = after === -1 ? content.length : after;
  const lineNum = (content.slice(0, lineStart).match(/\n/g) ?? []).length + 1;
  return {
    line: lineNum,
    col: index - lineStart + 1,
    text: content.slice(lineStart, lineEnd).trim(),
  };
}

// ── Core ──────────────────────────────────────────────────────────────────────

async function lintFile(filePath) {
  const content = await readFile(filePath, 'utf-8');
  const findings = [];

  for (const pattern of FORBIDDEN_PATTERNS) {
    const regex = new RegExp(pattern.regex.source, 'g');
    let match;
    while ((match = regex.exec(content)) !== null) {
      const ctx = getLineContext(content, match.index);
      findings.push({
        file: filePath,
        patternId: pattern.id,
        severity: pattern.severity,
        line: ctx.line,
        col: ctx.col,
        code: ctx.text,
        description: pattern.description,
        fix: pattern.fix,
        docRef: pattern.docRef,
      });
      if (CONFIG.failFast && pattern.severity === 'error') break;
    }
    if (CONFIG.failFast && findings.some(f => f.severity === 'error')) break;
  }

  return findings;
}

async function main() {
  const allFindings = [];
  let filesScanned = 0;

  console.log(`🔍 lint-supabase-casts — escaneando ${CONFIG.rootDir}/...`);

  for await (const filePath of walkDir(CONFIG.rootDir)) {
    const findings = await lintFile(filePath);
    allFindings.push(...findings);
    filesScanned++;
    if (CONFIG.failFast && allFindings.some(f => f.severity === 'error')) break;
  }

  const errors = allFindings.filter(f => f.severity === 'error');
  const warnings = allFindings.filter(f => f.severity === 'warn');

  if (CONFIG.jsonOutput) {
    console.log(JSON.stringify({ filesScanned, errors: errors.length, warnings: warnings.length, findings: allFindings }, null, 2));
  } else {
    if (allFindings.length === 0) {
      console.log(`✅ Nenhum padrão proibido encontrado em ${filesScanned} arquivo(s).`);
    } else {
      for (const f of allFindings) {
        const icon = f.severity === 'error' ? '❌' : '⚠️';
        console.log(`\n${icon} [${f.patternId}] ${f.file}:${f.line}:${f.col}`);
        console.log(`   Código: ${f.code}`);
        console.log(`   Problema: ${f.description}`);
        console.log(`   Fix: ${f.fix}`);
        console.log(`   Ref: ${f.docRef}`);
      }
      console.log(`\n── Resumo ────────────────────────────────────────────`);
      console.log(`   Arquivos escaneados: ${filesScanned}`);
      console.log(`   Erros:   ${errors.length}`);
      console.log(`   Avisos:  ${warnings.length}`);
    }
  }

  // Exit code 1 se houver erros (quebra CI)
  process.exit(errors.length > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('lint-supabase-casts erro:', err);
  process.exit(2);
});
