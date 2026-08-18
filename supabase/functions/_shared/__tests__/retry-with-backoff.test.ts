/**
 * Testes do helper de retry com backoff (_shared/retry-with-backoff.ts).
 *
 * Garante:
 *  1. SÓ retenta 408/429/5xx — 4xx de contrato (400/401/403/404/422…) NUNCA.
 *  2. Retry 2x (3 tentativas) com backoff 300ms→600ms (full jitter) e teto.
 *  3. Erro de rede/timeout retenta; após esgotar, relança o último erro.
 *  4. Abort do chamador NUNCA retenta (relança imediatamente).
 *  5. Response da última tentativa é devolvida ao chamador (contrato preservado).
 *
 * Rodar: deno test supabase/functions/_shared/__tests__/retry-with-backoff.test.ts
 */

import { assertEquals, assert, assertRejects } from "jsr:@std/assert";
import {
  fetchWithRetry,
  isRetryableHttpStatus,
  isRetryableNetworkError,
  retryDelayMs,
} from "../retry-with-backoff.ts";

function fakeResponse(status: number, body = "{}"): Response {
  return new Response(body, { status });
}

function resetFetch(): void {
  // @ts-ignore — stub de teste
  globalThis.fetch = undefined as unknown as typeof fetch;
}

Deno.test("retryDelayMs: jitter dentro da janela esperada (300→600, teto)", () => {
  for (let i = 0; i < 200; i++) {
    const d1 = retryDelayMs(1, 300, 600);
    assert(d1 >= 0 && d1 < 300, `retry 1 deve ficar em [0,300): ${d1}`);
    const d2 = retryDelayMs(2, 300, 600);
    assert(d2 >= 0 && d2 < 600, `retry 2 deve ficar em [0,600): ${d2}`);
    const d3 = retryDelayMs(3, 300, 600);
    assert(d3 >= 0 && d3 < 600, `retry 3 deve respeitar teto [0,600): ${d3}`);
  }
});

Deno.test("isRetryableHttpStatus: 408/429/5xx sim; 4xx de contrato nunca", () => {
  assertEquals(isRetryableHttpStatus(408), true);
  assertEquals(isRetryableHttpStatus(429), true);
  assertEquals(isRetryableHttpStatus(500), true);
  assertEquals(isRetryableHttpStatus(502), true);
  assertEquals(isRetryableHttpStatus(503), true);
  assertEquals(isRetryableHttpStatus(504), true);
  assertEquals(isRetryableHttpStatus(400), false);
  assertEquals(isRetryableHttpStatus(401), false);
  assertEquals(isRetryableHttpStatus(403), false);
  assertEquals(isRetryableHttpStatus(404), false);
  assertEquals(isRetryableHttpStatus(422), false);
});

Deno.test("isRetryableNetworkError: qualquer exceção de fetch é transporte; abort do chamador nunca", () => {
  assertEquals(isRetryableNetworkError(new TypeError("fetch failed")), true);
  assertEquals(isRetryableNetworkError(new DOMException("timeout", "TimeoutError")), true);
  assertEquals(isRetryableNetworkError(new Error("fetch failed")), true);
  assertEquals(isRetryableNetworkError("string error"), true);
  const aborted = new AbortController();
  aborted.abort();
  assertEquals(isRetryableNetworkError(new TypeError("fetch failed"), aborted.signal), false);
  assertEquals(isRetryableNetworkError(new Error("qualquer"), aborted.signal), false);
});

Deno.test("fetchWithRetry: 500 → 200 retorna 200 com 2 chamadas (1 retry)", async () => {
  let calls = 0;
  // @ts-ignore — stub
  globalThis.fetch = async () => {
    calls++;
    return calls === 1 ? fakeResponse(500) : fakeResponse(200, `{"ok":${calls}}`);
  };
  try {
    const res = await fetchWithRetry("https://exemplo.test", {}, { attempts: 2, label: "Test" });
    assertEquals(res.status, 200);
    assertEquals(calls, 2);
  } finally {
    resetFetch();
  }
});

Deno.test("fetchWithRetry: 429 → 503 → 200 retorna 200 com 3 chamadas (2 retries)", async () => {
  const statuses = [429, 503, 200];
  let calls = 0;
  // @ts-ignore — stub
  globalThis.fetch = async () => fakeResponse(statuses[calls++]);
  try {
    const res = await fetchWithRetry("https://exemplo.test");
    assertEquals(res.status, 200);
    assertEquals(calls, 3);
  } finally {
    resetFetch();
  }
});

Deno.test("fetchWithRetry: 4xx de contrato NUNCA retenta (1 chamada)", async () => {
  let calls = 0;
  // @ts-ignore — stub
  globalThis.fetch = async () => {
    calls++;
    return fakeResponse(422, `{"message":"contract"}`);
  };
  try {
    const res = await fetchWithRetry("https://exemplo.test");
    assertEquals(res.status, 422);
    assertEquals(calls, 1, "422 não pode ser retentado");
  } finally {
    resetFetch();
  }
});

Deno.test("fetchWithRetry: 500 repetido devolve a última Response (contrato preservado)", async () => {
  let calls = 0;
  // @ts-ignore — stub
  globalThis.fetch = async () => {
    calls++;
    return fakeResponse(503);
  };
  try {
    const res = await fetchWithRetry("https://exemplo.test");
    assertEquals(res.status, 503);
    assertEquals(calls, 3, "esgotou os 2 retries");
  } finally {
    resetFetch();
  }
});

Deno.test("fetchWithRetry: erro de rede retenta e, esgotado, relança o último erro", async () => {
  let calls = 0;
  // @ts-ignore — stub
  globalThis.fetch = async () => {
    calls++;
    throw new TypeError("fetch failed (rede)");
  };
  try {
    await assertRejects(
      () => fetchWithRetry("https://exemplo.test"),
      TypeError,
      "fetch failed (rede)",
    );
    assertEquals(calls, 3, "2 retries após a 1ª falha de rede");
  } finally {
    resetFetch();
  }
});

Deno.test("fetchWithRetry: erro de rede → 200 retorna 200", async () => {
  let calls = 0;
  // @ts-ignore — stub
  globalThis.fetch = async () => {
    calls++;
    if (calls === 1) throw new TypeError("fetch failed");
    return fakeResponse(200);
  };
  try {
    const res = await fetchWithRetry("https://exemplo.test");
    assertEquals(res.status, 200);
    assertEquals(calls, 2);
  } finally {
    resetFetch();
  }
});

Deno.test("fetchWithRetry: abort do chamador NUNCA retenta e relança AbortError", async () => {
  const controller = new AbortController();
  let calls = 0;
  // @ts-ignore — stub
  globalThis.fetch = async (_url: string, init?: RequestInit) => {
    calls++;
    controller.abort(); // simula cliente desconectando durante a chamada
    throw new DOMException("The operation was aborted.", "AbortError");
  };
  try {
    await assertRejects(
      () => fetchWithRetry("https://exemplo.test", {}, { signal: controller.signal }),
      DOMException,
    );
    assertEquals(calls, 1, "abort do cliente não pode disparar retry");
  } finally {
    resetFetch();
  }
});

Deno.test("fetchWithRetry: onRetry recebe status/delay corretos", async () => {
  const retries: Array<{ attempt: number; status: number | null }> = [];
  const statuses = [503, 200];
  let calls = 0;
  // @ts-ignore — stub
  globalThis.fetch = async () => fakeResponse(statuses[calls++]);
  try {
    const res = await fetchWithRetry("https://exemplo.test", {}, {
      attempts: 2,
      onRetry: (info) => retries.push({ attempt: info.attempt, status: info.status }),
    });
    assertEquals(res.status, 200);
    assertEquals(retries, [{ attempt: 1, status: 503 }]);
  } finally {
    resetFetch();
  }
});
