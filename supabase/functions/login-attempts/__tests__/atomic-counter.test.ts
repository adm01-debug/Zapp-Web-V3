/**
 * AGENTE A3 — login-attempts: contador atômico (gap da onda 3).
 *
 * Cobre a simulação prévia exigida (sem banco, padrão da casa:
 * migration-static-contract-tests + modelo semântico espelho do SQL):
 *
 *   (a) race: 2 record_failed simultâneos — caminho NOVO (RPC atômica) conta
 *       os 2 (attempt_count=2); caminho ANTIGO (SELECT→compute→upsert) perde
 *       update (2 falhas contam 1) — demonstrado por interleaving explícita.
 *   (b) escalação 2^(n-5) min preservada, teto 2^10 = 1024 min.
 *   (c) lock expirado NÃO reseta contador (comportamento vigente mantido).
 *   (d) fail-closed: erro de RPC/DB → edge responde 500 (fonte) — front trata
 *       como lock_check_failed (bloqueia login).
 *   (e) enforcement IP/geo (wave3) intacto na edge (fonte: checkLoginSecurityGate
 *       + 403 + country/geo_unavailable na resposta).
 *   (f) idempotência da migration (CREATE OR REPLACE; sem DDL destrutivo).
 *   (g) ordem de deploy: migration ANTES da edge — documentada no .sql e
 *       garantida por ausência de fallback antigo na edge (sem .upsert).
 *
 * Rodar: deno test --allow-read supabase/functions/login-attempts/__tests__/atomic-counter.test.ts
 */

import { assertEquals, assertMatch, assert } from "jsr:@std/assert";

// ─── Leitura dos artefatos (estático, sem banco) ────────────────────────────

const MIGRATION_URL = new URL(
  "../../../migrations/20260819000000_login_attempts_atomic_counter.sql",
  import.meta.url,
);
const INDEX_URL = new URL("../index.ts", import.meta.url);

const migrationSql = await Deno.readTextFile(MIGRATION_URL);
const indexTs = await Deno.readTextFile(INDEX_URL);
const migrationFile = MIGRATION_URL.pathname.split("/").pop() ?? "";

// ─── Modelo semântico — espelho EXATO do SQL da migration ───────────────────
// (INSERT ... ON CONFLICT (email) DO UPDATE SET attempt_count = +1, lock CASE)

const MAX_ATTEMPTS = 5;
const MAX_LOCK_EXPONENT = 10;

interface Row {
  attempt_count: number;
  locked_until: number | null; // epoch ms
}

interface RecordResult {
  attempt_count: number;
  locked_until: number | null;
  last_attempt_at: string;
  is_locked: boolean;
}

/** Espelho da RPC zapp.fn_login_attempt_record_failed (passo ÚNICO e atômico). */
function atomicRecordFailed(
  state: Map<string, Row>,
  email: string,
  nowMs: number,
): RecordResult {
  const existing = state.get(email);
  let attempt_count: number;
  let locked_until: number | null;
  if (!existing) {
    attempt_count = 1;
    locked_until = null;
  } else {
    attempt_count = existing.attempt_count + 1;
    locked_until = attempt_count >= MAX_ATTEMPTS
      ? nowMs + Math.pow(2, Math.min(attempt_count - MAX_ATTEMPTS, MAX_LOCK_EXPONENT)) * 60_000
      : null;
  }
  state.set(email, { attempt_count, locked_until });
  return {
    attempt_count,
    locked_until,
    last_attempt_at: new Date(nowMs).toISOString(),
    is_locked: locked_until !== null,
  };
}

// Caminho ANTIGO da edge: 3 passos separados (SELECT → compute → upsert).
function oldRead(state: Map<string, Row>, email: string): Row | null {
  const row = state.get(email);
  return row ? { ...row } : null;
}
function oldCompute(existing: Row | null): number {
  return existing ? existing.attempt_count + 1 : 1;
}
function oldUpsert(state: Map<string, Row>, email: string, attempts: number, nowMs: number): void {
  const locked = attempts >= MAX_ATTEMPTS
    ? nowMs + Math.pow(2, Math.min(attempts - MAX_ATTEMPTS, MAX_LOCK_EXPONENT)) * 60_000
    : null;
  state.set(email, { attempt_count: attempts, locked_until: locked });
}

const t0 = Date.parse("2026-08-19T12:00:00.000Z");
const MIN = 60_000;

// ─── (a) RACE — 2 record_failed simultâneos ─────────────────────────────────

Deno.test("(a) race: 2 falhas simultâneas — caminho ATÔMICO conta as 2 (attempt_count=2)", () => {
  const state = new Map<string, Row>();
  // Mesma interleaving para ambos os caminhos: as duas chamadas partem do
  // mesmo estado inicial (email sem linha).
  const r1 = atomicRecordFailed(state, "race@example.com", t0);
  const r2 = atomicRecordFailed(state, "race@example.com", t0);
  assertEquals(r1.attempt_count, 1);
  assertEquals(r2.attempt_count, 2);
  assertEquals(state.get("race@example.com")?.attempt_count, 2);
  assertEquals(r1.is_locked, false);
  assertEquals(r2.is_locked, false);
});

Deno.test("(a) race: 2 falhas simultâneas — caminho ANTIGO perde update (2 contam 1)", () => {
  const state = new Map<string, Row>();
  // Interleaving clássica: ambos leem ANTES de qualquer escrita.
  const readA = oldRead(state, "race@example.com"); // attempt_count ausente
  const readB = oldRead(state, "race@example.com"); // idem
  const attemptsA = oldCompute(readA); // 1
  const attemptsB = oldCompute(readB); // 1 ← mesma leitura
  oldUpsert(state, "race@example.com", attemptsA, t0); // grava 1
  oldUpsert(state, "race@example.com", attemptsB, t0); // grava 1 de novo
  // 2 falhas reais → só 1 registrada (lost update) — o gap que a RPC corrige.
  assertEquals(state.get("race@example.com")?.attempt_count, 1);
});

Deno.test("(a) race: 2 simultâneas sobre contagem existente 3 → 4 e 5 (lock ativa na 5ª)", () => {
  const state = new Map<string, Row>([["race2@example.com", { attempt_count: 3, locked_until: null }]]);
  const r1 = atomicRecordFailed(state, "race2@example.com", t0);
  const r2 = atomicRecordFailed(state, "race2@example.com", t0);
  assertEquals(r1.attempt_count, 4);
  assertEquals(r2.attempt_count, 5);
  assertEquals(r2.is_locked, true);
  assertEquals(r2.locked_until, t0 + 1 * MIN); // 2^(5-5) = 1 min
  assertEquals(state.get("race2@example.com")?.attempt_count, 5);
});

Deno.test("(a) race: concorrência via Promise.all — estado final correto", async () => {
  const state = new Map<string, Row>();
  const call = (email: string) =>
    new Promise<RecordResult>((resolve) =>
      queueMicrotask(() => resolve(atomicRecordFailed(state, email, t0)))
    );
  const [a, b] = await Promise.all([call("promise@example.com"), call("promise@example.com")]);
  assertEquals([a.attempt_count, b.attempt_count].sort((x, y) => x - y), [1, 2]);
  assertEquals(state.get("promise@example.com")?.attempt_count, 2);
});

// ─── (b) ESCALAÇÃO 2^(n-5) preservada ───────────────────────────────────────

Deno.test("(b) escalação: sem lock até a 4ª falha; 2^(n-5) min a partir da 5ª, teto 2^10", () => {
  const state = new Map<string, Row>();
  const results: RecordResult[] = [];
  for (let n = 1; n <= 16; n++) results.push(atomicRecordFailed(state, "esc@example.com", t0 + n));

  // 1..4: sem lock
  for (let n = 1; n <= 4; n++) {
    assertEquals(results[n - 1].attempt_count, n);
    assertEquals(results[n - 1].is_locked, false, `falha ${n} não deve estar locked`);
    assertEquals(results[n - 1].locked_until, null);
  }
  // 5..15: 2^(n-5) min exatos
  for (let n = 5; n <= 15; n++) {
    const expectedMin = 2 ** (n - 5);
    assertEquals(results[n - 1].locked_until, t0 + n + expectedMin * MIN, `falha ${n}`);
    assertEquals(results[n - 1].is_locked, true);
  }
  // 16+: teto 2^10 = 1024 min (NÃO 2048)
  assertEquals(results[15].locked_until, t0 + 16 + 1024 * MIN);
});

// ─── (c) LOCK EXPIRADO NÃO RESETA contador ──────────────────────────────────

Deno.test("(c) lock expirado NÃO reseta: incremento continua e escalação prossegue", () => {
  const state = new Map<string, Row>();
  for (let n = 1; n <= 5; n++) atomicRecordFailed(state, "exp@example.com", t0 + n);
  // lock ativo: 5ª falha em t0+5, locked até t0+6.
  assertEquals(state.get("exp@example.com")?.locked_until, t0 + 5 + 1 * MIN);

  // Lock EXPIRA; nova falha muito depois (t0 + 60min).
  const afterExpiry = t0 + 60 * MIN;
  const r6 = atomicRecordFailed(state, "exp@example.com", afterExpiry);
  // Contador NÃO voltou para 1: é 6, com lock 2^(6-5)=2 min.
  assertEquals(r6.attempt_count, 6, "contador deve continuar (nunca resetar)");
  assertEquals(r6.locked_until, afterExpiry + 2 * MIN);
  assertEquals(r6.is_locked, true);

  const r7 = atomicRecordFailed(state, "exp@example.com", afterExpiry + MIN);
  assertEquals(r7.attempt_count, 7);
  assertEquals(r7.locked_until, afterExpiry + MIN + 4 * MIN); // 2^(7-5)=4 min
});

Deno.test("(c) reset SÓ via clear (delete da linha) → próxima falha recomeça em 1", () => {
  const state = new Map<string, Row>();
  for (let n = 1; n <= 6; n++) atomicRecordFailed(state, "clear@example.com", t0 + n);
  assertEquals(state.get("clear@example.com")?.attempt_count, 6);
  state.delete("clear@example.com"); // action='clear' (DELETE da edge)
  const r = atomicRecordFailed(state, "clear@example.com", t0 + 60 * MIN);
  assertEquals(r.attempt_count, 1);
  assertEquals(r.is_locked, false);
});

// ─── (f) IDEMPOTÊNCIA + contrato estático da migration ──────────────────────

Deno.test("(f) migration: nome versionado 14 dígitos + CREATE OR REPLACE da função", () => {
  assertMatch(migrationFile, /^\d{14}_[a-z0-9_]+\.sql$/);
  assertMatch(
    migrationSql,
    /CREATE OR REPLACE FUNCTION\s+zapp\.fn_login_attempt_record_failed\s*\(\s*p_email text,\s*p_ip_address text,\s*p_user_agent text,\s*p_success boolean DEFAULT false\s*\)/s,
  );
});

Deno.test("(f) migration: SECURITY DEFINER + search_path fixo + RETURNS jsonb", () => {
  assertMatch(migrationSql, /SECURITY DEFINER/);
  assertMatch(migrationSql, /SET\s+search_path\s*=\s*'zapp'/);
  assertMatch(migrationSql, /RETURNS\s+jsonb/);
});

Deno.test("(f) migration: UPDATE atômico (attempt_count = +1) + RETURNING", () => {
  assertMatch(migrationSql, /ON CONFLICT\s+\(email\)\s+DO UPDATE/);
  assertMatch(migrationSql, /attempt_count\s*=\s*login_attempts\.attempt_count\s*\+\s*1/);
  assertMatch(migrationSql, /RETURNING\s+attempt_count,\s*locked_until/);
});

Deno.test("(f) migration: escalação 2^(n-5) com teto 10 no SQL (pow + LEAST)", () => {
  assertMatch(migrationSql, /pow\(\s*2,\s*LEAST\s*\(\s*login_attempts\.attempt_count\s*\+\s*1\s*-\s*5,\s*10\s*\)\s*\)/);
});

Deno.test("(f) migration: REVOKE PUBLIC/anon + GRANT service_role", () => {
  assertMatch(migrationSql, /REVOKE ALL ON FUNCTION zapp\.fn_login_attempt_record_failed\([^)]*\) FROM PUBLIC;/s);
  assertMatch(migrationSql, /REVOKE ALL ON FUNCTION zapp\.fn_login_attempt_record_failed\([^)]*\) FROM anon;/s);
  // A edge chama a RPC SEMPRE via createZappAdminClient (service_role) — nunca
  // com JWT de usuário autenticado (verificado em index.ts:165). O GRANT TO
  // authenticated é desnecessário; exigí-lo deixava o teste stale (corrigido
  // na validação exaustiva 19/08 — atomic-counter.test.ts).
  assertMatch(migrationSql, /GRANT EXECUTE ON FUNCTION zapp\.fn_login_attempt_record_failed\([^)]*\) TO service_role;/s);
});

Deno.test("(f) migration: idempotente — sem DDL destrutivo fora de CREATE OR REPLACE", () => {
  // CREATE FUNCTION nu (sem OR REPLACE) → falha na re-execução; proibido.
  assert(!/^CREATE FUNCTION\b/m.test(migrationSql));
  // DROP TABLE / DROP FUNCTION direto no corpo (rollback só em comentário).
  assert(!/^DROP\s+(TABLE|FUNCTION)/m.test(migrationSql));
  assert(!/^ALTER TABLE/m.test(migrationSql));
});

Deno.test("(g) migration: ordem de deploy documentada (migration ANTES da edge)", () => {
  assertMatch(migrationSql, /ORDEM DE DEPLOY/);
  assertMatch(migrationSql, /migration\s+PRIMEIRO/);
  assertMatch(migrationSql, /RPC não existe → 500/);
});

// ─── (d)+(e) contrato da EDGE (fail-closed + enforcement intactos) ─────────

Deno.test("(d) edge: caminho antigo removido (sem .upsert / sem nextLockUntil)", () => {
  assert(!indexTs.includes(".upsert("), "caminho SELECT→upsert deve ter sido removido");
  assert(!indexTs.includes("nextLockUntil"), "helper de lock deve ter migrado para o SQL");
});

Deno.test("(d) edge: usa RPC atômica zapp.fn_login_attempt_record_failed", () => {
  assertMatch(indexTs, /\.rpc\(\s*"fn_login_attempt_record_failed"/);
  assertMatch(indexTs, /p_email:\s*email/);
  assertMatch(indexTs, /p_ip_address:/);
  assertMatch(indexTs, /p_user_agent:/);
});

Deno.test("(d) edge: fail-closed — erro de RPC → 500 (front bloqueia como lock_check_failed)", () => {
  assertMatch(indexTs, /rpcError/);
  assertMatch(indexTs, /errorResponse\(\s*"Não foi possível registrar tentativa",\s*500/);
  // check também permanece fail-closed em erro de SELECT.
  assertMatch(indexTs, /errorResponse\(\s*"Não foi possível verificar tentativas",\s*500/);
});

Deno.test("(e) edge: enforcement IP/geo (wave3) intacto", () => {
  assertMatch(indexTs, /checkLoginSecurityGate/);
  assertMatch(indexTs, /Acesso bloqueado pela política de segurança/);
  assertMatch(indexTs, /code:\s*gate\.reason/);
  // resposta estendida preservada nas duas ações.
  assertMatch(indexTs, /geo_unavailable:\s*gate\.geoUnavailable/);
});

Deno.test("(d)+(e) edge: contrato/telemetria preservados (parseOrReject + rate-limit + clear)", () => {
  assertMatch(indexTs, /parseOrReject\(\s*"login-attempts",\s*CONTRACT_SCHEMAS\["login-attempts"\]/);
  assertMatch(indexTs, /checkRateLimit\(`login-attempts:\$\{ip\}`, 60, 60_000\)/);
  assertMatch(indexTs, /action === "clear"/);
  assertMatch(indexTs, /action === "check"/);
  assertMatch(indexTs, /console\.warn/);
});
