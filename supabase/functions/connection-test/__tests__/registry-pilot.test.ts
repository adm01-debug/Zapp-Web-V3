/**
 * connection-test — piloto F5 (Plano V4-FINAL, etapas 53-62): getConnectionState
 * resolvido via registry (supabase/functions/_shared/providers/registry.ts)
 * atrás da flag de ambiente REGISTRY_PILOT_CONNECTION_STATE.
 *
 * Invariantes:
 *  - Flag ausente/≠'1' → evolutionClient direto, caminho antigo intacto.
 *  - Flag='1' fora de DENO_ENV=test → registry resolve o evolution real
 *    (guard absoluto do registry: PROVIDER_UNDER_TEST é ignorado fora de test).
 *  - Flag='1' + DENO_ENV=test + PROVIDER_UNDER_TEST=fake → resolve fakeProvider.
 *  - Se o registry lançar, cai no evolutionClient direto (defesa em
 *    profundidade, mesmo padrão de evolution-proxy/index.ts, piloto #34).
 *
 * Rodar: deno test --allow-net --allow-env --allow-read supabase/functions/connection-test/__tests__/registry-pilot.test.ts
 */

// ─── Stub de Deno.serve — ANTES do import do index.ts (mesmo padrão de
// evolution-proxy/__tests__/registry-pilot.test.ts): evita abrir listener
// real de rede durante o teste unitário (index.ts chama Deno.serve no load).
type Handler = (req: Request) => Promise<Response> | Response;
const originalServe = Deno.serve;
Object.defineProperty(Deno, "serve", {
  value: (_handler: Handler) =>
    ({ finished: Promise.resolve(), shutdown: () => {} } as unknown as ReturnType<typeof originalServe>),
  writable: true,
  configurable: true,
});

import { assertEquals } from "jsr:@std/assert";
import { evolutionClient } from "../../_shared/providers/evolution/client.ts";
import { fakeProvider } from "../../_shared/providers/fake/index.ts";

// Import DINÂMICO depois do stub (padrão da casa — index.ts registra
// Deno.serve no load; imports estáticos são hoisted e rodariam antes do stub).
const { resolveConnectionStateClient } = await import("../index.ts");

// Cast de adaptação (mesmo padrão de evolution-proxy/__tests__/registry-pilot.test.ts):
// o fakeProvider tem verbos com retorno inferido como Promise<{}> — o shape
// real satisfaz Pick<typeof evolutionClient, "getConnectionState"> em runtime.
// deno-lint-ignore no-explicit-any
const fakeAsClient = fakeProvider as any;

function setEnv(key: string, value: string | undefined) {
  if (value === undefined) Deno.env.delete(key);
  else Deno.env.set(key, value);
}

async function withEnv<T>(
  vars: Record<string, string | undefined>,
  fn: () => Promise<T> | T,
): Promise<T> {
  const prev = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(vars)) {
    prev.set(key, Deno.env.get(key));
    setEnv(key, value);
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of prev) setEnv(key, value);
  }
}

Deno.test("flag ausente → evolutionClient direto (caminho antigo intacto)", async () => {
  await withEnv({ REGISTRY_PILOT_CONNECTION_STATE: undefined }, () => {
    assertEquals(resolveConnectionStateClient(), evolutionClient);
  });
});

Deno.test("flag != '1' → evolutionClient direto", async () => {
  await withEnv({ REGISTRY_PILOT_CONNECTION_STATE: "0" }, () => {
    assertEquals(resolveConnectionStateClient(), evolutionClient);
  });
});

Deno.test("flag='1' fora de DENO_ENV=test → registry resolve evolution real (guard absoluto)", async () => {
  await withEnv({
    REGISTRY_PILOT_CONNECTION_STATE: "1",
    DENO_ENV: "production",
    PROVIDER_UNDER_TEST: "fake",
  }, () => {
    assertEquals(resolveConnectionStateClient(), evolutionClient);
  });
});

Deno.test("flag='1' + DENO_ENV=test sem PROVIDER_UNDER_TEST → default evolution", async () => {
  await withEnv({
    REGISTRY_PILOT_CONNECTION_STATE: "1",
    DENO_ENV: "test",
    PROVIDER_UNDER_TEST: undefined,
  }, () => {
    assertEquals(resolveConnectionStateClient(), evolutionClient);
  });
});

Deno.test("flag='1' + DENO_ENV=test + PROVIDER_UNDER_TEST=fake → resolve fakeProvider", async () => {
  await withEnv({
    REGISTRY_PILOT_CONNECTION_STATE: "1",
    DENO_ENV: "test",
    PROVIDER_UNDER_TEST: "fake",
  }, () => {
    assertEquals(resolveConnectionStateClient(), fakeAsClient);
  });
});
