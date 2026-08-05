/**
 * Testes do gate de segurança de login (SEGURANCA-04 + SEGURANCA-05):
 * blocked_ips, ip_whitelist e geo-blocking (whitelist/blacklist de países).
 *
 * Usa um fake do client admin (service role) — nenhuma chamada real ao banco.
 *
 * Rodar: deno test supabase/functions/_shared/__tests__/security-gate.test.ts
 */

import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  checkLoginSecurityGate,
  getClientCountry,
  type ZappAdminClient,
} from "../security-gate.ts";

// ─── Fake do client admin (service role, schema zapp) ────────────────────────

interface FakeTables {
  [table: string]: unknown[];
}

interface FakeErrors {
  [table: string]: string;
}

function fakeAdmin(tables: FakeTables = {}, errors: FakeErrors = {}): ZappAdminClient {
  return {
    from: (table: string) => {
      const rows = tables[table] ?? [];
      const error = errors[table];
      const result = error ? { data: null, error: { message: error } } : { data: rows, error: null };
      const obj = {
        select: () => obj,
        eq: (col: string, value: unknown) => {
          const filtered = (rows as Array<Record<string, unknown>>).filter(
            (row) => String(row[col] ?? "").toLowerCase() === String(value ?? "").toLowerCase(),
          );
          const eqResult = error
            ? { data: null, error: { message: error } }
            : { data: filtered, error: null };
          return { ...obj, limit: () => eqResult, then: (resolve: (v: unknown) => void) => resolve(eqResult) };
        },
        limit: () => result,
        then: (resolve: (v: unknown) => void) => resolve(result),
      };
      return obj;
    },
  } as unknown as ZappAdminClient;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const req = (headers: Record<string, string> = {}) =>
  new Request("https://zapp.example/functions/v1/login-attempts", { headers });

const DEFAULT_HEADERS = { "x-real-ip": "1.2.3.4", "cf-ipcountry": "BR" };

// ─── getClientCountry ────────────────────────────────────────────────────────

Deno.test("getClientCountry: lê CF-IPCountry e normaliza", () => {
  assertEquals(getClientCountry(req({ "cf-ipcountry": "br" })), "BR");
  assertEquals(getClientCountry(req({ "x-vercel-ip-country": "US" })), "US");
  assertEquals(getClientCountry(req({ "x-country-code": "ar" })), "AR");
});

Deno.test("getClientCountry: sem header → null", () => {
  assertEquals(getClientCountry(req({})), null);
  assertEquals(getClientCountry(req({ "cf-ipcountry": "BRZ" })), null);
});

// ─── SEGURANCA-04: blocked_ips ───────────────────────────────────────────────

Deno.test("blocked_ips: IP permanente bloqueado → ip_blocked", async () => {
  const admin = fakeAdmin({
    blocked_ips: [{ ip_address: "1.2.3.4", is_permanent: true, expires_at: null }],
    ip_whitelist: [],
    geo_blocking_settings: [],
  });
  const gate = await checkLoginSecurityGate(req(DEFAULT_HEADERS), admin);
  assertEquals(gate.allowed, false);
  assertEquals(gate.reason, "ip_blocked");
});

Deno.test("blocked_ips: IP com bloqueio expirado → permitido", async () => {
  const admin = fakeAdmin({
    blocked_ips: [
      { ip_address: "1.2.3.4", is_permanent: false, expires_at: new Date(Date.now() - 1000).toISOString() },
    ],
    ip_whitelist: [],
    geo_blocking_settings: [],
  });
  const gate = await checkLoginSecurityGate(req(DEFAULT_HEADERS), admin);
  assertEquals(gate.allowed, true);
});

Deno.test("blocked_ips: bloqueio não expirado → ip_blocked", async () => {
  const admin = fakeAdmin({
    blocked_ips: [
      { ip_address: "1.2.3.4", is_permanent: false, expires_at: new Date(Date.now() + 60_000).toISOString() },
    ],
    ip_whitelist: [],
    geo_blocking_settings: [],
  });
  const gate = await checkLoginSecurityGate(req(DEFAULT_HEADERS), admin);
  assertEquals(gate.allowed, false);
  assertEquals(gate.reason, "ip_blocked");
});

Deno.test("blocked_ips: IP não listado → permitido", async () => {
  const admin = fakeAdmin({
    blocked_ips: [{ ip_address: "9.9.9.9", is_permanent: true, expires_at: null }],
    ip_whitelist: [],
    geo_blocking_settings: [],
  });
  const gate = await checkLoginSecurityGate(req(DEFAULT_HEADERS), admin);
  assertEquals(gate.allowed, true);
});

// ─── SEGURANCA-04: ip_whitelist ──────────────────────────────────────────────

Deno.test("ip_whitelist: não vazia e IP fora → ip_not_whitelisted", async () => {
  const admin = fakeAdmin({
    blocked_ips: [],
    ip_whitelist: [{ ip_address: "10.0.0.1" }, { ip_address: "10.0.0.2" }],
    geo_blocking_settings: [],
  });
  const gate = await checkLoginSecurityGate(req(DEFAULT_HEADERS), admin);
  assertEquals(gate.allowed, false);
  assertEquals(gate.reason, "ip_not_whitelisted");
});

Deno.test("ip_whitelist: IP listado → permitido (case-insensitive IPv6)", async () => {
  const admin = fakeAdmin({
    blocked_ips: [],
    ip_whitelist: [{ ip_address: "2001:DB8::1" }],
    geo_blocking_settings: [],
  });
  const gate = await checkLoginSecurityGate(
    req({ "x-real-ip": "2001:db8::1", "cf-ipcountry": "BR" }),
    admin,
  );
  assertEquals(gate.allowed, true);
});

Deno.test("ip_whitelist: vazia → sem restrição", async () => {
  const admin = fakeAdmin({ blocked_ips: [], ip_whitelist: [], geo_blocking_settings: [] });
  const gate = await checkLoginSecurityGate(req(DEFAULT_HEADERS), admin);
  assertEquals(gate.allowed, true);
});

Deno.test("ip_whitelist: IP desconhecido com whitelist ativa → bloqueado (fail-closed)", async () => {
  const admin = fakeAdmin({
    blocked_ips: [],
    ip_whitelist: [{ ip_address: "10.0.0.1" }],
    geo_blocking_settings: [],
  });
  const gate = await checkLoginSecurityGate(req({ "cf-ipcountry": "BR" }), admin);
  assertEquals(gate.allowed, false);
  assertEquals(gate.reason, "ip_not_whitelisted");
});

// ─── SEGURANCA-05: geo-blocking ──────────────────────────────────────────────

Deno.test("geo whitelist: país fora da lista → country_not_allowed", async () => {
  const admin = fakeAdmin({
    blocked_ips: [],
    ip_whitelist: [],
    geo_blocking_settings: [{ mode: "whitelist" }],
    allowed_countries: [{ country_code: "BR" }, { country_code: "US" }],
  });
  const gate = await checkLoginSecurityGate(req({ ...DEFAULT_HEADERS, "cf-ipcountry": "AR" }), admin);
  assertEquals(gate.allowed, false);
  assertEquals(gate.reason, "country_not_allowed");
});

Deno.test("geo whitelist: país permitido → liberado", async () => {
  const admin = fakeAdmin({
    blocked_ips: [],
    ip_whitelist: [],
    geo_blocking_settings: [{ mode: "whitelist" }],
    allowed_countries: [{ country_code: "BR" }],
  });
  const gate = await checkLoginSecurityGate(req(DEFAULT_HEADERS), admin);
  assertEquals(gate.allowed, true);
});

Deno.test("geo blacklist: país bloqueado → country_blocked", async () => {
  const admin = fakeAdmin({
    blocked_ips: [],
    ip_whitelist: [],
    geo_blocking_settings: [{ mode: "blacklist" }],
    blocked_countries: [{ country_code: "RU" }],
  });
  const gate = await checkLoginSecurityGate(req({ ...DEFAULT_HEADERS, "cf-ipcountry": "RU" }), admin);
  assertEquals(gate.allowed, false);
  assertEquals(gate.reason, "country_blocked");
});

Deno.test("geo blacklist: país não bloqueado → liberado", async () => {
  const admin = fakeAdmin({
    blocked_ips: [],
    ip_whitelist: [],
    geo_blocking_settings: [{ mode: "blacklist" }],
    blocked_countries: [{ country_code: "RU" }],
  });
  const gate = await checkLoginSecurityGate(req(DEFAULT_HEADERS), admin);
  assertEquals(gate.allowed, true);
});

Deno.test("geo disabled (ou sem settings) → liberado", async () => {
  const adminDisabled = fakeAdmin({
    blocked_ips: [],
    ip_whitelist: [],
    geo_blocking_settings: [{ mode: "disabled" }],
  });
  assertEquals((await checkLoginSecurityGate(req(DEFAULT_HEADERS), adminDisabled)).allowed, true);

  const adminEmpty = fakeAdmin({ blocked_ips: [], ip_whitelist: [], geo_blocking_settings: [] });
  assertEquals((await checkLoginSecurityGate(req(DEFAULT_HEADERS), adminEmpty)).allowed, true);
});

Deno.test("geo whitelist: sem header de país → NÃO bloqueia mas sinaliza geoUnavailable", async () => {
  const admin = fakeAdmin({
    blocked_ips: [],
    ip_whitelist: [],
    geo_blocking_settings: [{ mode: "whitelist" }],
    allowed_countries: [{ country_code: "BR" }],
  });
  const gate = await checkLoginSecurityGate(req({ "x-real-ip": "1.2.3.4" }), admin);
  assertEquals(gate.allowed, true);
  assertEquals(gate.geoUnavailable, true);
  assertEquals(gate.country, null);
});

Deno.test("geo blacklist: sem header de país → NÃO bloqueia mas sinaliza geoUnavailable", async () => {
  const admin = fakeAdmin({
    blocked_ips: [],
    ip_whitelist: [],
    geo_blocking_settings: [{ mode: "blacklist" }],
    blocked_countries: [{ country_code: "RU" }],
  });
  const gate = await checkLoginSecurityGate(req({ "x-real-ip": "1.2.3.4" }), admin);
  assertEquals(gate.allowed, true);
  assertEquals(gate.geoUnavailable, true);
});

// ─── Falhas de DB → fail-open (disponibilidade > bloqueio indevido) ──────────

Deno.test("erro de query em blocked_ips → fail-open (não derruba login)", async () => {
  const admin = fakeAdmin({}, { blocked_ips: "relation does not exist" });
  const gate = await checkLoginSecurityGate(req(DEFAULT_HEADERS), admin);
  assertEquals(gate.allowed, true);
});

Deno.test("erro de query no geo settings → fail-open", async () => {
  const admin = fakeAdmin({}, { geo_blocking_settings: "boom" });
  const gate = await checkLoginSecurityGate(req(DEFAULT_HEADERS), admin);
  assertEquals(gate.allowed, true);
});
