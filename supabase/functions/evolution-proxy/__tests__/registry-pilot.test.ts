/**
 * evolution-proxy — piloto V4 #34: primeira function a consumir o registry
 * (supabase/functions/_shared/providers/registry.ts).
 *
 * Invariantes:
 *  - Cabeçalho documenta o piloto ('piloto V4 #34').
 *  - A resolução do client passa pelo registry.getProviderClient(); fora de
 *    DENO_ENV=test o resultado SEMPRE é o evolution real (guard absoluto do
 *    registry: PROVIDER_UNDER_TEST é ignorado fora de test).
 *  - Se o registry lançar, há fallback explícito para evolutionClient
 *    (defesa em profundidade).
 *  - Em DENO_ENV=test + PROVIDER_UNDER_TEST=fake, o proxy usa o fakeProvider
 *    (mock/stub) — provado E2E pelo handler real (capturado via Deno.serve
 *    stub, padrão gmail-tests.test.ts): sem I/O real de Evolution.
 *
 * Rodar: deno test --allow-net --allow-env --allow-read supabase/functions/evolution-proxy/__tests__/registry-pilot.test.ts
 * CI: deno-contract-tests.yml (deno test --allow-net --allow-env --allow-read, 1 processo por arquivo).
 */

// ─── Stubs de ambiente — obrigatório ANTES do import dos módulos ────────────
Deno.env.set("SELFHOSTED_SUPABASE_URL", "https://stub.supabase.co");
Deno.env.set("SELFHOSTED_SUPABASE_ANON_KEY", "stub-anon-key-123456");
Deno.env.set("SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY", "stub-service-role-key-123");

import { assertEquals, assertMatch } from "jsr:@std/assert";
import { readSourceFrom } from "../../_shared/test-helpers.ts";
import { getProviderClient } from "../../_shared/providers/registry.ts";
import { fakeProvider } from "../../_shared/providers/fake/index.ts";
import { evolutionClient } from "../../_shared/providers/evolution/client.ts";

// ─── Capture do handler em vez de subir servidor real (padrão da casa) ──────
type Handler = (req: Request) => Promise<Response> | Response;
const capturedHandlers: Handler[] = [];
const originalServe = Deno.serve;
// deno-lint-ignore no-explicit-any
(Deno as any).serve = (handler: Handler) => {
  capturedHandlers.push(handler);
  return { finished: Promise.resolve(), shutdown: () => {} } as unknown as ReturnType<typeof originalServe>;
};

// ─── Stub global de fetch: auth (gotrue + RPC) + evolution stubada ──────────
interface CapturedCall {
  url: string;
  method: string;
  headers: Headers;
  body: string | null;
}
const capturedCalls: CapturedCall[] = [];

globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = new URL(String(input));
  capturedCalls.push({
    url: url.toString(),
    method: init?.method ?? "GET",
    headers: new Headers(init?.headers),
    body: init?.body !== undefined ? String(init.body) : null,
  });

  // gotrue: validação do JWT (requireUser)
  if (url.pathname === "/auth/v1/user") {
    return Promise.resolve(new Response(JSON.stringify({ id: "user-1", email: "admin@example.com" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
  }
  // PostgREST: is_admin_or_supervisor (requireAdminOrSupervisor)
  if (url.pathname === "/rest/v1/rpc/is_admin_or_supervisor") {
    return Promise.resolve(new Response("true", { status: 200, headers: { "Content-Type": "application/json" } }));
  }
  // Evolution API (usada apenas nos testes e2e com EVOLUTION_API_URL setado)
  return Promise.resolve(new Response(JSON.stringify({ key: { id: "real-msg-id" } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  }));
};

// Import DINÂMICO depois dos stubs (index.ts registra Deno.serve no load).
const { resolveProviderClient, callProvider } = await import("../index.ts");

const SOURCE = await readSourceFrom(import.meta.url, "../index.ts");

// Cast de adaptação: verbos do fake têm retorno inferido como Promise<{}> —
// o shape real satisfaz ProviderClientLike (ok/status/data/error).
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

const b64url = (s: string) =>
  btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
// JWT fake: payload com sub + role autenticado (passa no requireUser stubado)
const FAKE_JWT = `header.${b64url(JSON.stringify({ sub: "user-1", role: "authenticated" }))}.sig`;

function proxyRequest(envelope: unknown): Request {
  return new Request("https://edge.local/evolution-proxy", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${FAKE_JWT}`,
    },
    body: JSON.stringify(envelope),
  });
}

function callsTo(host: string): CapturedCall[] {
  return capturedCalls.filter((c) => new URL(c.url).host === host);
}

// ─── Piloto documentado no cabeçalho ───────────────────────────────────────

Deno.test("Source: cabeçalho documenta o piloto V4 #34 (primeira function a consumir o registry)", () => {
  assertMatch(SOURCE, /piloto V4 #34/);
  assertMatch(SOURCE, /primeira function a consumir o registry/);
});

Deno.test("Source: import + uso do registry com fallback explícito (defesa em profundidade)", () => {
  // Importa o registry
  assertMatch(SOURCE, /getProviderClient.*_shared\/providers\/registry\.ts/);
  // Resolução via registry dentro do handler
  assertMatch(SOURCE, /resolveProviderClient\(\)/);
  // Fallback explícito para o caminho legado se o registry lançar
  assertMatch(SOURCE, /registry\.getProviderClient\(\) falhou/);
  assertMatch(SOURCE, /return evolutionClient/);
});

Deno.test("Source: dispatch GET/POST passa pelo client resolvido; PUT segue no transport legado", () => {
  assertMatch(SOURCE, /provider\.get\?\.\(normalizedPath/);
  assertMatch(SOURCE, /provider\.post\?\.\(normalizedPath/);
  assertMatch(SOURCE, /evolutionFetch<unknown>\(normalizedPath/);
  assertMatch(SOURCE, /method: 'PUT'/);
});

// ─── Resolução via registry: guard absoluto (fora de test = evolution real) ─

Deno.test("Registry: DENO_ENV=test + PROVIDER_UNDER_TEST=fake → proxy resolve o fakeProvider", async () => {
  await withEnv({ DENO_ENV: "test", PROVIDER_UNDER_TEST: "fake" }, () => {
    assertEquals(resolveProviderClient(), fakeAsClient);
    assertEquals(getProviderClient(), fakeProvider);
  });
});

Deno.test("Registry: DENO_ENV=production + PROVIDER_UNDER_TEST=fake → proxy resolve evolution (guard absoluto)", async () => {
  await withEnv({ DENO_ENV: "production", PROVIDER_UNDER_TEST: "fake" }, () => {
    assertEquals(resolveProviderClient(), evolutionClient);
    assertEquals(getProviderClient(), evolutionClient);
  });
});

Deno.test("Registry: DENO_ENV=test sem PROVIDER_UNDER_TEST → default evolution (comportamento idêntico)", async () => {
  await withEnv({ DENO_ENV: "test", PROVIDER_UNDER_TEST: undefined }, () => {
    assertEquals(resolveProviderClient(), evolutionClient);
  });
});

Deno.test("Registry: registry lançando → fallback explícito para evolutionClient (defesa em profundidade)", async () => {
  await withEnv({ DENO_ENV: "test" }, () => {
    const provider = resolveProviderClient(() => {
      throw new Error("registry quebrado (simulado)");
    });
    assertEquals(provider, evolutionClient, "fallback deve manter o caminho legado");
  });
});

// ─── Proxy usa o fake (mock/stub) em DENO_ENV=test + PROVIDER_UNDER_TEST=fake ─

Deno.test("Fake: callProvider(GET fetchInstances) devolve a resposta do mock do fake", async () => {
  await withEnv({ DENO_ENV: "test", PROVIDER_UNDER_TEST: "fake" }, async () => {
    fakeProvider.reset();
    fakeProvider.mock("get", { ok: true, data: { instances: [{ instanceName: "wpp2" }] } });

    const provider = resolveProviderClient();
    assertEquals(provider, fakeAsClient);

    const res = await callProvider(provider, "GET", "/instance/fetchInstances");
    assertEquals(res.ok, true);
    assertEquals(res.data, { instances: [{ instanceName: "wpp2" }] });

    fakeProvider.reset();
  });
});

Deno.test("Fake: callProvider(POST sendText) devolve a resposta do mock do fake", async () => {
  await withEnv({ DENO_ENV: "test", PROVIDER_UNDER_TEST: "fake" }, async () => {
    fakeProvider.reset();
    fakeProvider.mock("post", { ok: true, data: { key: { id: "fake-msg-id" } } });

    const provider = resolveProviderClient();
    const res = await callProvider(provider, "POST", "/message/sendText/wpp2", {
      number: "5511999999999",
      textMessage: { text: "oi" },
    });
    assertEquals(res.ok, true);
    assertEquals(res.data, { key: { id: "fake-msg-id" } });

    fakeProvider.reset();
  });
});

// ─── E2E pelo handler real (capturado via Deno.serve stub) ─────────────────

Deno.test("E2E: DENO_ENV=test + PROVIDER_UNDER_TEST=fake → handler responde com o mock do fake, sem I/O real", async () => {
  await withEnv({ DENO_ENV: "test", PROVIDER_UNDER_TEST: "fake" }, async () => {
    capturedCalls.length = 0;
    fakeProvider.reset();
    fakeProvider.mock("post", { ok: true, data: { key: { id: "fake-msg-id" } } });

    const res = await capturedHandlers[0](proxyRequest({
      method: "POST",
      path: "/message/sendText/wpp2",
      body: { number: "5511999999999", textMessage: { text: "oi" } },
    }));

    assertEquals(res.status, 200);
    const body = await res.json() as { key: { id: string } };
    assertEquals(body.key.id, "fake-msg-id");

    // Nenhuma chamada real para a Evolution (nem com host stubado nem real)
    const evoCalls = capturedCalls.filter((c) => c.url.includes("evolution") || c.url.includes("evo."));
    assertEquals(evoCalls.length, 0, "fake NÃO pode gerar I/O de Evolution");

    fakeProvider.reset();
  });
});

Deno.test("E2E: fora de test + PROVIDER_UNDER_TEST=fake → handler usa o evolution REAL (mesmos envs EVOLUTION_API_URL/KEY)", async () => {
  await withEnv({
    DENO_ENV: "production",
    PROVIDER_UNDER_TEST: "fake",
    EVOLUTION_API_URL: "https://evo.stub.example",
    EVOLUTION_API_KEY: "stub-evolution-key-123",
  }, async () => {
    capturedCalls.length = 0;

    const res = await capturedHandlers[0](proxyRequest({
      method: "POST",
      path: "/message/sendText/wpp2",
      body: { number: "5511999999999", textMessage: { text: "oi" } },
    }));

    assertEquals(res.status, 200);
    const body = await res.json() as { key: { id: string } };
    assertEquals(body.key.id, "real-msg-id");

    // Provas de que foi o client canônico (providers/evolution/client.ts):
    // mesma URL e mesma key vindas dos envs EVOLUTION_API_URL/EVOLUTION_API_KEY
    const evoCalls = callsTo("evo.stub.example");
    assertEquals(evoCalls.length, 1);
    assertEquals(evoCalls[0].method, "POST");
    assertEquals(new URL(evoCalls[0].url).pathname, "/message/sendText/wpp2");
    assertEquals(evoCalls[0].headers.get("apikey"), "stub-evolution-key-123");
  });
});

Deno.test("E2E: fora de test sem EVOLUTION_API_URL → 502 (fake NUNCA vaza para produção)", async () => {
  await withEnv({
    DENO_ENV: "production",
    PROVIDER_UNDER_TEST: "fake",
    EVOLUTION_API_URL: undefined,
    EVOLUTION_API_KEY: undefined,
  }, async () => {
    capturedCalls.length = 0;

    const res = await capturedHandlers[0](proxyRequest({
      method: "POST",
      path: "/message/sendText/wpp2",
      body: { number: "5511999999999", textMessage: { text: "oi" } },
    }));

    assertEquals(res.status, 502);
    const body = await res.json() as { error: string };
    assertMatch(body.error, /EVOLUTION_API_URL not set/);
    // Se o fake tivesse vazado, o handler teria respondido 200 com o mock
    assertEquals(callsTo("evo.stub.example").length, 0);
  });
});
