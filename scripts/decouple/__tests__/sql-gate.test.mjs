#!/usr/bin/env node
/**
 * sql-gate.test.mjs — teste de regressão do gate de egresso SQL (E46/decoupling V3)
 *
 * Cobre os fixes da onda de validação (2026-08-14):
 *  1. Egresso hardcoded REAL à Evolution API → violação (exit 1)
 *  2. Fn compliant (usa ops.fn_evo_url/fn_evo_key) → sem violação
 *  3. Falsos positivos legítimos (license_heartbeat, detect_instance_recreate) → sem violação
 *  4. entry null no report → não crasha (bug V7)
 *
 * Run: node --test scripts/decouple/__tests__/sql-gate.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const GATE = fileURLToPath(new URL('../sql-gate.mjs', import.meta.url));

function runGate(fns) {
  const dir = mkdtempSync(join(tmpdir(), 'sqlgate-'));
  const report = join(dir, 'report.json');
  writeFileSync(report, JSON.stringify(fns));
  try {
    const out = execFileSync(process.execPath, [GATE, report], { encoding: 'utf8' });
    return { exit: 0, out };
  } catch (err) {
    return { exit: err.status ?? 1, out: String(err.stdout ?? '') + String(err.stderr ?? '') };
  }
}

test('egresso hardcoded real à Evolution API é violação', () => {
  const { exit, out } = runGate([
    { fn: 'zapp.fn_legacy_hardcoded', prosrc: "BEGIN PERFORM net.http_post(url:='https://evolution.atomicabr.com.br/message/sendText/wpp2'); END;" },
  ]);
  assert.equal(exit, 1, `esperava exit 1, saída: ${out}`);
  assert.match(out, /fn_legacy_hardcoded/);
});

test('fn compliant (usa ops.fn_evo_url/fn_evo_key) NÃO viola', () => {
  const { exit, out } = runGate([
    { fn: 'zapp.fn_outbound_dispatch', prosrc: "DECLARE v_api_url text; BEGIN v_api_url := ops.fn_evo_url(); PERFORM net.http_post(url:=v_api_url||'/message/sendText/wpp2'); END;" },
    { fn: 'ops.fn_evo_url', prosrc: "BEGIN RETURN (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='evolution_api_url'); END;" },
  ]);
  assert.equal(exit, 0, `esperava exit 0, saída: ${out}`);
});

test('falsos positivos legítimos (license/webhook n8n) NÃO violam', () => {
  const { exit, out } = runGate([
    { fn: 'zapp.fn_check_license_heartbeat', prosrc: "BEGIN PERFORM net.http_get('https://evolution.atomicabr.com.br/license/status'); END;" },
    { fn: 'evo.fn_detect_instance_recreate', prosrc: "BEGIN PERFORM net.http_post(url:='https://webhook.atomicabr.com.br/webhook/evolution-bootstrap-alert'); END;" },
  ]);
  assert.equal(exit, 0, `esperava exit 0, saída: ${out}`);
});

test('entry null no report não crasha (fix V7)', () => {
  const { exit, out } = runGate([
    null,
    { fn: 'evo.fn_ok', prosrc: 'BEGIN SELECT 1; END;' },
  ]);
  assert.equal(exit, 0, `esperava exit 0, saída: ${out}`);
});

test('report malformado → exit 2 com mensagem', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sqlgate-'));
  const report = join(dir, 'bad.json');
  writeFileSync(report, 'not-json{');
  try {
    execFileSync(process.execPath, [GATE, report], { encoding: 'utf8' });
    assert.fail('esperava falha');
  } catch (err) {
    assert.equal(err.status, 2);
    assert.match(String(err.stderr), /JSON inválido|não foi possível/i);
  }
});
