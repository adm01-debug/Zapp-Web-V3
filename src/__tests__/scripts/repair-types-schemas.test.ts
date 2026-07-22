/**
 * Testes do orquestrador `scripts/repair-types-schemas.mjs`.
 *
 * Isolamos o script criando um sandbox em `tmpdir` com stubs de
 * `scripts/gen-types-zapp.mjs` e `scripts/check-types-schemas.mjs`.
 * O real de repair é copiado sem alteração — assim testamos exatamente
 * o binário que roda em produção.
 *
 * Stubs se comunicam via arquivos de estado no sandbox:
 *  - `state/check-count`, `state/gen-count`  → contadores de invocação
 *  - `state/fixed`                           → se existir, o check passa
 *  - `state/gen-fix-after`                   → nº de execuções de gen
 *                                              antes de "consertar"
 *  - `state/gen-fail`                        → se existir, gen sai 1
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  copyFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPAIR = 'scripts/repair-types-schemas.mjs';

const CHECK_STUB = `#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
mkdirSync('state', { recursive: true });
const n = existsSync('state/check-count') ? Number(readFileSync('state/check-count','utf8')) : 0;
writeFileSync('state/check-count', String(n + 1));
process.exit(existsSync('state/fixed') ? 0 : 1);
`;

const GEN_STUB = `#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
mkdirSync('state', { recursive: true });
const n = existsSync('state/gen-count') ? Number(readFileSync('state/gen-count','utf8')) : 0;
const next = n + 1;
writeFileSync('state/gen-count', String(next));
if (existsSync('state/gen-fail')) process.exit(1);
const fixAfter = existsSync('state/gen-fix-after')
  ? Number(readFileSync('state/gen-fix-after','utf8'))
  : 1;
if (next >= fixAfter) writeFileSync('state/fixed', '1');
process.exit(0);
`;

function makeSandbox() {
  const dir = mkdtempSync(join(tmpdir(), 'repair-types-'));
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  copyFileSync(REPAIR, join(dir, 'scripts/repair-types-schemas.mjs'));
  writeFileSync(join(dir, 'scripts/check-types-schemas.mjs'), CHECK_STUB);
  writeFileSync(join(dir, 'scripts/gen-types-zapp.mjs'), GEN_STUB);
  return dir;
}

function runRepair(
  cwd: string,
  env: Record<string, string | undefined> = {},
) {
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && !/^(ZAPP_)?META_(URL|TOKEN)$/.test(k)) clean[k] = v;
  }
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete clean[k];
    else clean[k] = v;
  }
  const r = spawnSync(
    process.execPath,
    ['scripts/repair-types-schemas.mjs'],
    { cwd, env: clean, encoding: 'utf8' },
  );
  const count = (name: string) => {
    const p = join(cwd, 'state', name);
    return existsSync(p) ? Number(readFileSync(p, 'utf8')) : 0;
  };
  return {
    status: r.status,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
    checkCount: count('check-count'),
    genCount: count('gen-count'),
  };
}

describe('scripts/repair-types-schemas.mjs', () => {
  let sandbox: string;
  beforeEach(() => {
    sandbox = makeSandbox();
  });

  it('fast-path: sai 0 sem chamar gen quando o gate já passa', () => {
    writeFileSync(join(sandbox, 'state/fixed'), '1');
    const r = runRepair(sandbox);
    expect(r.status).toBe(0);
    expect(r.checkCount).toBe(1);
    expect(r.genCount).toBe(0);
    expect(r.stdout).toMatch(/Gate já passa/);
  });

  it('sem secrets: sai 0 com aviso e não tenta regenerar', () => {
    const r = runRepair(sandbox); // sem META_*/ZAPP_META_*
    expect(r.status).toBe(0);
    expect(r.checkCount).toBe(1);
    expect(r.genCount).toBe(0);
    expect(`${r.stdout}${r.stderr}`).toMatch(/ausentes/);
  });

  it('com ZAPP_META_URL/TOKEN: conserta na primeira tentativa', () => {
    const r = runRepair(sandbox, {
      ZAPP_META_URL: 'https://example.test',
      ZAPP_META_TOKEN: 'tok',
      MAX_ATTEMPTS: '3',
      RETRY_DELAY_MS: '1',
    });
    expect(r.status).toBe(0);
    expect(r.genCount).toBe(1);
    // gate inicial (falha) + gate após regeneração (passa) = 2
    expect(r.checkCount).toBe(2);
    expect(r.stdout).toMatch(/Tipos reparados/);
  });

  it('retries: precisa de várias execuções de gen antes de passar', () => {
    writeFileSync(join(sandbox, 'state/gen-fix-after'), '3');
    const r = runRepair(sandbox, {
      META_URL: 'https://example.test',
      META_TOKEN: 'tok',
      MAX_ATTEMPTS: '5',
      RETRY_DELAY_MS: '1',
    });
    expect(r.status).toBe(0);
    expect(r.genCount).toBe(3);
    // 1 inicial + 3 rechecks (a 3ª passa)
    expect(r.checkCount).toBe(4);
  });

  it('falha final: sai 1 após MAX_ATTEMPTS quando gen nunca conserta', () => {
    writeFileSync(join(sandbox, 'state/gen-fix-after'), '999');
    const r = runRepair(sandbox, {
      META_URL: 'https://example.test',
      META_TOKEN: 'tok',
      MAX_ATTEMPTS: '2',
      RETRY_DELAY_MS: '1',
    });
    expect(r.status).toBe(1);
    expect(r.genCount).toBe(2);
    // 1 inicial + 2 rechecks pós-gen
    expect(r.checkCount).toBe(3);
    expect(r.stderr).toMatch(/continuou falhando/);
  });

  it('gen quebrando: continua tentando e sai 1 ao esgotar tentativas', () => {
    writeFileSync(join(sandbox, 'state/gen-fail'), '1');
    const r = runRepair(sandbox, {
      META_URL: 'https://example.test',
      META_TOKEN: 'tok',
      MAX_ATTEMPTS: '2',
      RETRY_DELAY_MS: '1',
    });
    expect(r.status).toBe(1);
    expect(r.genCount).toBe(2);
    // Falha do gen → não roda recheck; apenas o gate inicial
    expect(r.checkCount).toBe(1);
    expect(`${r.stdout}${r.stderr}`).toMatch(/Falha ao regenerar/);
  });

  afterEach(() => {
    if (sandbox) rmSync(sandbox, { recursive: true, force: true });
  });
});

// afterEach declaration hoist for TS — importa após o describe para clareza.
import { afterEach } from 'vitest';
