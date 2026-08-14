/**
 * providers/registry — guard PROVIDER_UNDER_TEST (E73/S9 do Plano V2)
 *
 * Invariantes:
 *  - Fora de DENO_ENV=test, PROVIDER_UNDER_TEST é IGNORADO: a resolução
 *    SEMPRE segue o provider pedido (default 'evolution') — guard absoluto,
 *    sem exceção de config.
 *  - Em DENO_ENV=test, PROVIDER_UNDER_TEST=fake resolve fakeProvider.
 *  - Pedido explícito de 'fake' fora de test lança erro (assertTestEnv).
 *  - 'cloud' continua lançando 'not yet implemented'.
 *
 * CI: deno test --allow-net --allow-env --allow-read (deno-contract-tests.yml).
 */
import { assertEquals, assertThrows } from "jsr:@std/assert";
import { getProviderClient } from "../providers/registry.ts";
import { fakeProvider } from "../providers/fake/index.ts";
import { evolutionClient } from "../providers/evolution/index.ts";

function setEnv(key: string, value: string | undefined) {
  if (value === undefined) Deno.env.delete(key);
  else Deno.env.set(key, value);
}

function withEnv(
  vars: Record<string, string | undefined>,
  fn: () => void,
) {
  const prev = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(vars)) {
    prev.set(key, Deno.env.get(key));
    setEnv(key, value);
  }
  try {
    fn();
  } finally {
    for (const [key, value] of prev) setEnv(key, value);
  }
}

// ─── Guard absoluto: flag NUNCA é honrado fora de DENO_ENV=test ────────────

Deno.test("registry: DENO_ENV=production + PROVIDER_UNDER_TEST=fake resolve 'evolution'", () => {
  withEnv({ DENO_ENV: "production", PROVIDER_UNDER_TEST: "fake" }, () => {
    assertEquals(
      getProviderClient(),
      evolutionClient,
      "fora de test o PROVIDER_UNDER_TEST NUNCA desvia para fake",
    );
  });
});

Deno.test("registry: DENO_ENV=development + PROVIDER_UNDER_TEST=fake resolve 'evolution'", () => {
  withEnv({ DENO_ENV: "development", PROVIDER_UNDER_TEST: "fake" }, () => {
    assertEquals(getProviderClient(), evolutionClient);
  });
});

Deno.test("registry: DENO_ENV=production + PROVIDER_UNDER_TEST=fake + pedido explícito de fake lança", () => {
  withEnv({ DENO_ENV: "production", PROVIDER_UNDER_TEST: "fake" }, () => {
    assertThrows(
      () => getProviderClient("fake"),
      Error,
      "Fake provider não pode ser usado fora de DENO_ENV=test",
    );
  });
});

// ─── Flag honrado em DENO_ENV=test ─────────────────────────────────────────

Deno.test("registry: DENO_ENV=test + PROVIDER_UNDER_TEST=fake resolve fakeProvider", () => {
  withEnv({ DENO_ENV: "test", PROVIDER_UNDER_TEST: "fake" }, () => {
    assertEquals(getProviderClient(), fakeProvider);
  });
});

Deno.test("registry: DENO_ENV=test sem PROVIDER_UNDER_TEST resolve 'evolution'", () => {
  withEnv({ DENO_ENV: "test", PROVIDER_UNDER_TEST: undefined }, () => {
    assertEquals(getProviderClient(), evolutionClient);
  });
});

Deno.test("registry: DENO_ENV=test + PROVIDER_UNDER_TEST inválido é ignorado", () => {
  withEnv({ DENO_ENV: "test", PROVIDER_UNDER_TEST: "hack" }, () => {
    assertEquals(getProviderClient(), evolutionClient);
  });
});

// ─── Comportamentos estáveis ───────────────────────────────────────────────

Deno.test("registry: 'cloud' continua lançando 'not yet implemented'", () => {
  withEnv({ DENO_ENV: "test", PROVIDER_UNDER_TEST: undefined }, () => {
    assertThrows(
      () => getProviderClient("cloud"),
      Error,
      "not yet implemented",
    );
  });
});

Deno.test("registry: provider desconhecido lança erro", () => {
  withEnv({ DENO_ENV: "test", PROVIDER_UNDER_TEST: undefined }, () => {
    assertThrows(
      () => getProviderClient("nope" as never),
      Error,
      "Unknown provider",
    );
  });
});
