/**
 * Static import validator — varre todos os edge functions e valida que
 * cada specifier de import é resolvível pelo bundler do Deno (mesmo
 * pipeline do deploy do Supabase).
 *
 * Captura erros como:
 *   "Relative import path \"@supabase/supabase-js/cors\" not prefixed
 *    with / or ./ or ../"
 * ANTES do deploy, sem precisar de --allow-run nem subir o módulo.
 *
 * Regra: um specifier é válido se começa com:
 *   - ./  ../  /        (relativo/absoluto)
 *   - npm:  jsr:  node: (specifier de package)
 *   - http://  https://  file://
 *   - chave de import map declarada em deno.json (ex.: "std/")
 */
import { assert } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { walk } from 'https://deno.land/std@0.208.0/fs/walk.ts';

const VALID_PREFIXES = [
  './', '../', '/',
  'npm:', 'jsr:', 'node:',
  'http://', 'https://', 'file://',
];

const IMPORT_RE = /(?:^|\n)\s*import\s+(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const EXPORT_FROM_RE = /(?:^|\n)\s*export\s+(?:\*|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/g;

function isValidSpecifier(spec: string): boolean {
  return VALID_PREFIXES.some((p) => spec.startsWith(p));
}

function extractSpecifiers(source: string): string[] {
  const specs: string[] = [];
  for (const re of [IMPORT_RE, DYNAMIC_IMPORT_RE, EXPORT_FROM_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) specs.push(m[1]);
  }
  return specs;
}

// Auditoria de re-verificação (segunda rodada, 5 especialistas) — CONFIRMED:
// o skip não excluía node_modules/ (causa erro de I/O ao ler pacotes
// vendored no Windows durante o walk) nem *.spec.ts (arquivos de teste
// estilo vitest, que importam de "vitest" — um specifier legitimamente
// inválido para ESTE validador, que só entende o resolvedor do Deno). Sem
// esses 2 excludes, o teste falhava por razões alheias ao que ele se propõe
// a checar (imports quebrados nas EDGE FUNCTIONS de verdade).
async function collectFunctionFiles(): Promise<string[]> {
  const files: string[] = [];
  for await (const entry of walk('./supabase/functions', {
    exts: ['ts'],
    includeDirs: false,
    skip: [/_test\.ts$/, /\.test\.ts$/, /\.spec\.ts$/, /[/\\]node_modules[/\\]/],
  })) {
    files.push(entry.path);
  }
  return files;
}

Deno.test('edge functions: todos os imports usam specifiers válidos', async () => {
  const files = await collectFunctionFiles();
  assert(files.length > 0, 'nenhum arquivo de edge function encontrado');

  const errors: string[] = [];
  for (const file of files) {
    const source = await Deno.readTextFile(file);
    for (const spec of extractSpecifiers(source)) {
      if (!isValidSpecifier(spec)) {
        errors.push(`${file}: import inválido "${spec}" — use prefixo npm:/jsr:/./ etc.`);
      }
    }
  }

  assert(
    errors.length === 0,
    `Imports inválidos detectados (causariam falha no deploy):\n  - ${errors.join('\n  - ')}`,
  );
});
