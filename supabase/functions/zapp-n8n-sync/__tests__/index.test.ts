/**
 * zapp-n8n-sync — testes do núcleo: normalizeBaseUrl, deriveStatus e
 * fetchN8nConfig com RPC fake. Sem rede/DB reais (o import do index.ts dispara
 * Deno.serve no top-level → rodar com --allow-net, padrão do CI
 * deno-contract-tests.yml).
 *
 * Rodar: deno test --allow-net --allow-env --allow-read zapp-n8n-sync/__tests__/index.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  deriveStatus,
  fetchN8nConfig,
  normalizeBaseUrl,
  type N8nConfigRow,
} from "../index.ts";

// ─── normalizeBaseUrl ───────────────────────────────────────────────────────

Deno.test("normalizeBaseUrl: trim + remove barras finais", () => {
  assertEquals(normalizeBaseUrl("  https://n8n.example.com/  "), "https://n8n.example.com");
  assertEquals(normalizeBaseUrl("https://n8n.example.com///"), "https://n8n.example.com");
});

Deno.test("normalizeBaseUrl: prefixa https:// quando sem protocolo", () => {
  assertEquals(normalizeBaseUrl("n8n.example.com"), "https://n8n.example.com");
  assertEquals(normalizeBaseUrl("http://n8n.local:5678"), "http://n8n.local:5678");
});

Deno.test("normalizeBaseUrl: preserva path/base de instância", () => {
  assertEquals(normalizeBaseUrl("https://n8n.example.com/flow/"), "https://n8n.example.com/flow");
});

// ─── deriveStatus (estado honesto) ──────────────────────────────────────────

Deno.test("deriveStatus: sem linha → not_configured (honesto)", () => {
  assertEquals(deriveStatus(null), {
    ok: true,
    configured: false,
    status: "not_configured",
    baseUrl: null,
    updatedAt: null,
  });
});

Deno.test("deriveStatus: linha com enabled=false → disabled (contrato desligado)", () => {
  const row: N8nConfigRow = {
    id: 1,
    base_url: "https://n8n.example.com",
    enabled: false,
    updated_at: "2026-08-17T12:00:00Z",
  };
  assertEquals(deriveStatus(row), {
    ok: true,
    configured: true,
    status: "disabled",
    baseUrl: "https://n8n.example.com",
    updatedAt: "2026-08-17T12:00:00Z",
  });
});

Deno.test("deriveStatus: linha com enabled=true → configured", () => {
  const row: N8nConfigRow = {
    id: 1,
    base_url: "https://n8n.example.com",
    enabled: true,
    updated_at: null,
  };
  const status = deriveStatus(row);
  assertEquals(status.status, "configured");
  assertEquals(status.configured, true);
});

Deno.test("deriveStatus: base_url NULL → baseUrl null (nunca string vazia)", () => {
  const status = deriveStatus({ id: 1, base_url: null, enabled: false });
  assertEquals(status.baseUrl, null);
});

// ─── fetchN8nConfig com RPC fake ────────────────────────────────────────────

Deno.test("fetchN8nConfig: devolve a linha quando a RPC responde", async () => {
  const fakeAdmin = {
    rpc: async (fn: string) => {
      assertEquals(fn, "fn_edge_get_n8n_config");
      return { data: { id: 1, base_url: "https://n8n.example.com", enabled: false }, error: null };
    },
  };
  const row = await fetchN8nConfig(fakeAdmin as never);
  assertEquals(row?.base_url, "https://n8n.example.com");
  assertEquals(row?.enabled, false);
});

Deno.test("fetchN8nConfig: erro da RPC → null (fallback silencioso, nunca lança)", async () => {
  const fakeAdmin = {
    rpc: async () => ({ data: null, error: { message: "permission denied" } }),
  };
  const row = await fetchN8nConfig(fakeAdmin as never);
  assertEquals(row, null);
});

Deno.test("fetchN8nConfig: exception → null (nunca lança)", async () => {
  const fakeAdmin = {
    rpc: async () => { throw new Error("boom"); },
  };
  const row = await fetchN8nConfig(fakeAdmin as never);
  assertEquals(row, null);
});
