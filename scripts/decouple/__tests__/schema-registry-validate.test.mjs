#!/usr/bin/env node
/**
 * schema-registry-validate.test.mjs — teste de regressão do validador de schema registry (E45)
 *
 * Cobre:
 *  1. Registry válido (evo.json real do repo) → exit 0
 *  2. Nome de tabela duplicado → exit 1
 *  3. owner vazio quando informado → exit 1
 *  4. Coluna duplicada / coluna sem type → exit 1
 *
 * Run: node --test scripts/decouple/__tests__/schema-registry-validate.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const GATE = fileURLToPath(new URL('../schema-registry-validate.mjs', import.meta.url));
const REGISTRY = fileURLToPath(new URL('../../../docs/decouple/schema-registry/evo.json', import.meta.url));

function runGate(file) {
  try {
    const out = execFileSync(process.execPath, [GATE, file], { encoding: 'utf8' });
    return { exit: 0, out };
  } catch (err) {
    return { exit: err.status ?? 1, out: String(err.stdout ?? '') + String(err.stderr ?? '') };
  }
}

function writeFixture(doc) {
  const dir = mkdtempSync(join(tmpdir(), 'schemareg-'));
  const file = join(dir, 'fixture.json');
  writeFileSync(file, JSON.stringify(doc));
  return file;
}

const base = { schema: 'evo', generated_from: 'repo-migrations', date: '2026-08-15' };

test('registry real do repo (evo.json) é válido → exit 0', () => {
  const { exit, out } = runGate(REGISTRY);
  assert.equal(exit, 0, `esperava exit 0, saída: ${out}`);
  assert.match(out, /tables=\d+/);
});

test('nome de tabela duplicado → exit 1', () => {
  const { exit, out } = runGate(writeFixture({
    ...base,
    tables: [{ name: 'a' }, { name: 'a' }],
  }));
  assert.equal(exit, 1, `esperava exit 1, saída: ${out}`);
  assert.match(out, /nome duplicado/);
});

test('owner vazio quando informado → exit 1', () => {
  const { exit, out } = runGate(writeFixture({
    ...base,
    tables: [{ name: 'a', owner: '  ' }],
  }));
  assert.equal(exit, 1, `esperava exit 1, saída: ${out}`);
  assert.match(out, /owner.*string não vazia/);
});

test('coluna duplicada e coluna sem type → exit 1', () => {
  const { exit, out } = runGate(writeFixture({
    ...base,
    tables: [
      { name: 'c', columns: [{ name: 'x', type: 'text' }, { name: 'x', type: 'int' }] },
      { name: 'd', columns: [{ name: 'y' }] },
    ],
  }));
  assert.equal(exit, 1, `esperava exit 1, saída: ${out}`);
  assert.match(out, /coluna duplicada/);
  assert.match(out, /exige \{name, type\}/);
});

test('tables ausente → exit 1', () => {
  const { exit, out } = runGate(writeFixture({ ...base }));
  assert.equal(exit, 1, `esperava exit 1, saída: ${out}`);
  assert.match(out, /"tables" deve ser um array não vazio/);
});
