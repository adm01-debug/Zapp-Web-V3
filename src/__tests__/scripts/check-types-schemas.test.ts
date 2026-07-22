/**
 * Testes para scripts/check-types-schemas.mjs
 *
 * Cobre:
 *  - types.ts sem zapp/evo → exit 1 + sentinela LOVABLE_AUTOREGEN_TRIGGER
 *  - types.ts com ambos schemas + --local-only → exit 0
 *  - modo remoto sem secrets → exit 0 com warning (não bloqueante)
 *  - modo remoto com secrets e schemas presentes no banco (fetch mockado) → exit 0
 *  - modo remoto com secrets e schemas ausentes no banco → exit 1
 *  - types.ts ausente → exit 1
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SCRIPT_SRC = resolve(process.cwd(), 'scripts/check-types-schemas.mjs');

const TYPES_WITH_BOTH = `export type Database = {
  public: {
    Tables: {}
  }
  zapp: {
    Tables: {}
  }
  evo: {
    Tables: {}
  }
}
`;

const TYPES_MISSING = `export type Database = {
  public: {
    Tables: {}
  }
}
`;

interface RunOptions {
  env?: Record<string, string>;
  args?: string[];
  writeTypes?: string | null; // null => don't create file
  mockFetch?: {
    ok: boolean;
    status?: number;
    body: string;
  };
}

let workdir: string;

function setupWorkdir(opts: RunOptions) {
  workdir = mkdtempSync(join(tmpdir(), 'check-types-'));
  mkdirSync(join(workdir, 'src/integrations/supabase'), { recursive: true });
  mkdirSync(join(workdir, 'scripts'), { recursive: true });

  if (opts.writeTypes !== null) {
    writeFileSync(
      join(workdir, 'src/integrations/supabase/types.ts'),
      opts.writeTypes ?? TYPES_WITH_BOTH,
    );
  }

  // Copia script original; se houver mockFetch, injeta um shim que substitui globalThis.fetch.
  let scriptContent = require('node:fs').readFileSync(SCRIPT_SRC, 'utf8');
  if (opts.mockFetch) {
    const { ok, status = 200, body } = opts.mockFetch;
    const shim = `
globalThis.fetch = async () => ({
  ok: ${ok},
  status: ${status},
  text: async () => ${JSON.stringify(body)},
});
`;
    // Injeta o shim logo após os imports.
    scriptContent = scriptContent.replace(
      "import { readFileSync, existsSync } from 'node:fs';",
      "import { readFileSync, existsSync } from 'node:fs';\n" + shim,
    );
  }
  writeFileSync(join(workdir, 'scripts/check-types-schemas.mjs'), scriptContent);
}

function run(opts: RunOptions = {}) {
  setupWorkdir(opts);
  const result = spawnSync(
    process.execPath,
    ['scripts/check-types-schemas.mjs', ...(opts.args ?? [])],
    {
      cwd: workdir,
      env: { ...process.env, ...(opts.env ?? {}) },
      encoding: 'utf8',
    },
  );
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

afterEach(() => {
  if (workdir && existsSync(workdir)) {
    rmSync(workdir, { recursive: true, force: true });
  }
});

describe('check-types-schemas.mjs', () => {
  beforeEach(() => {
    // Limpa envs que poderiam vazar do host.
    delete process.env.META_URL;
    delete process.env.META_TOKEN;
    delete process.env.ZAPP_META_URL;
    delete process.env.ZAPP_META_TOKEN;
  });

  it('falha quando types.ts está sem zapp/evo e emite sentinela de auto-regen', () => {
    const { status, stderr } = run({
      writeTypes: TYPES_MISSING,
      args: ['--local-only'],
    });
    expect(status).toBe(1);
    expect(stderr).toContain('LOVABLE_AUTOREGEN_TRIGGER');
    expect(stderr).toMatch(/missing=zapp,evo/);
  });

  it('passa quando types.ts contém zapp e evo (--local-only)', () => {
    const { status, stdout } = run({
      writeTypes: TYPES_WITH_BOTH,
      args: ['--local-only'],
    });
    expect(status).toBe(0);
    expect(stdout).toContain('[local] types.ts contém schemas');
    expect(stdout).toMatch(/zapp/);
    expect(stdout).toMatch(/evo/);
  });

  it('em modo remoto sem secrets emite warning não-bloqueante', () => {
    const { status, stderr } = run({
      writeTypes: TYPES_WITH_BOTH,
      // sem --local-only, sem META_URL/TOKEN
    });
    expect(status).toBe(0);
    expect(stderr).toContain('[remoto]');
    expect(stderr).toMatch(/ausentes|pulada/);
  });

  it('modo remoto com secrets e schemas presentes no banco → sucesso', () => {
    const { status, stdout } = run({
      writeTypes: TYPES_WITH_BOTH,
      env: { META_URL: 'http://fake.local', META_TOKEN: 'tkn' },
      mockFetch: { ok: true, body: TYPES_WITH_BOTH },
    });
    expect(status).toBe(0);
    expect(stdout).toContain('[remoto] postgres-meta expõe schemas');
  });

  it('modo remoto com secrets mas schemas ausentes no banco → falha bloqueante', () => {
    const { status, stderr } = run({
      writeTypes: TYPES_WITH_BOTH,
      env: { META_URL: 'http://fake.local', META_TOKEN: 'tkn' },
      mockFetch: { ok: true, body: TYPES_MISSING },
    });
    expect(status).toBe(1);
    expect(stderr).toMatch(/NÃO expõe os schemas/);
  });

  it('modo remoto com HTTP não-ok → warning não-bloqueante', () => {
    const { status, stderr } = run({
      writeTypes: TYPES_WITH_BOTH,
      env: { META_URL: 'http://fake.local', META_TOKEN: 'tkn' },
      mockFetch: { ok: false, status: 500, body: '' },
    });
    expect(status).toBe(0);
    expect(stderr).toMatch(/HTTP 500/);
  });

  it('falha quando types.ts não existe', () => {
    const { status, stderr } = run({
      writeTypes: null,
      args: ['--local-only'],
    });
    expect(status).toBe(1);
    expect(stderr).toMatch(/não encontrado/);
  });
});
