#!/usr/bin/env node
/**
 * evo-ddl-gate.test.mjs — teste de regressão do gate E42 (evo-ddl-gate.mjs)
 *
 * Cobre:
 *  1. Estado atual (scan completo, sem candidatos) → exit 0 (allowlist auto)
 *  2. Migration NOVA com DDL em evo via CHANGED_FILES → exit 1 + lista
 *  3. Migration NOVA sem DDL em evo → exit 0
 *  4. Referência a evo só em comentário → NÃO é violação (strip de comentários)
 *  5. Flag --files com arquivo novo DDL evo → exit 1
 *  6. Migration existente com DDL evo alterada (candidata) → exit 1 (conservador)
 *
 * Run: node --test scripts/decouple/__tests__/evo-ddl-gate.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const GATE = fileURLToPath(new URL('../evo-ddl-gate.mjs', import.meta.url));

const EXISTING_EVO = '20260101000000_existing_evo.sql';
const EXISTING_NO_EVO = '20260102000000_no_evo.sql';

function makeMigrationsDir(extraFiles = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'evoddl-'));
  const files = {
    [EXISTING_EVO]: 'ALTER TABLE evo.evolution_messages SET (fillfactor = 90);\n',
    [EXISTING_NO_EVO]: 'CREATE TABLE zapp.ok (id bigint);\n',
    ...extraFiles,
  };
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content);
  }
  return dir;
}

function runGate(args = [], env = {}) {
  try {
    const out = execFileSync(
      process.execPath,
      [GATE, '--allowlist', 'auto', '--migrations-dir', ...args],
      { encoding: 'utf8', env: { ...process.env, ...env } }
    );
    return { exit: 0, out };
  } catch (err) {
    return { exit: err.status ?? 1, out: String(err.stdout ?? '') + String(err.stderr ?? '') };
  }
}

test('estado atual (scan completo) → exit 0 com allowlist auto', () => {
  const dir = makeMigrationsDir();
  const { exit, out } = runGate([dir]);
  assert.equal(exit, 0, `esperava exit 0, saída: ${out}`);
  assert.match(out, /allowlist auto \(estado atual, DDL em evo\): 1 arquivo\(s\)/);
  assert.match(out, /EVO DDL GATE OK: 0 violações novas/);
});

test('migration NOVA com DDL em evo (CHANGED_FILES) → exit 1 + lista', () => {
  const newFile = '20270101000000_new_evo.sql';
  const dir = makeMigrationsDir({
    [newFile]: 'CREATE TABLE evo.new_illegal (id bigint);\nALTER TABLE evo.evolution_messages ADD COLUMN x int;\n',
  });
  const { exit, out } = runGate([dir], { CHANGED_FILES: join(dir, newFile) });
  assert.equal(exit, 1, `esperava exit 1, saída: ${out}`);
  assert.match(out, /1 violação\(ões\) NOVA\(s\)/);
  assert.match(out, new RegExp(newFile));
  assert.match(out, /CREATE TABLE evo\.new_illegal/);
});

test('migration NOVA sem DDL em evo → exit 0', () => {
  const newFile = '20270102000000_no_evo.sql';
  const dir = makeMigrationsDir({ [newFile]: 'CREATE TABLE zapp.fine (id bigint);\n' });
  const { exit, out } = runGate([dir], { CHANGED_FILES: join(dir, newFile) });
  assert.equal(exit, 0, `esperava exit 0, saída: ${out}`);
});

test('referência a evo apenas em comentário → NÃO é violação', () => {
  const newFile = '20270103000000_comment_evo.sql';
  const dir = makeMigrationsDir({
    [newFile]: '-- CREATE TABLE evo.fake (id bigint); exemplo em comentário\nCREATE TABLE zapp.ok2 (id bigint);\n',
  });
  const { exit, out } = runGate([dir], { CHANGED_FILES: join(dir, newFile) });
  assert.equal(exit, 0, `esperava exit 0, saída: ${out}`);
});

test('flag --files com arquivo novo DDL evo → exit 1', () => {
  const newFile = '20270104000000_files_flag.sql';
  const dir = makeMigrationsDir({
    [newFile]: 'GRANT SELECT ON evo.evolution_messages TO anon;\n',
  });
  const { exit, out } = runGate([dir, '--files', join(dir, newFile)]);
  assert.equal(exit, 1, `esperava exit 1, saída: ${out}`);
  assert.match(out, /GRANT SELECT ON evo\.evolution_messages/);
});

test('migration existente com DDL evo alterada (candidata) → exit 1 conservador', () => {
  const dir = makeMigrationsDir();
  const { exit } = runGate([dir], { CHANGED_FILES: join(dir, EXISTING_EVO) });
  assert.equal(exit, 1, 'candidato com DDL evo fora do allowlist (baseline sem o PR) deve falhar');
});

test('candidato inexistente no disco (deletado) → ignorado, exit 0', () => {
  const dir = makeMigrationsDir();
  const { exit, out } = runGate([dir], { CHANGED_FILES: join(dir, '20279999999999_deleted.sql') });
  assert.equal(exit, 0, `esperava exit 0, saída: ${out}`);
});
