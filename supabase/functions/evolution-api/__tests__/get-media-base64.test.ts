import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { proxyToEvolution } from "../../_shared/evolution-api-proxy.ts";
import {
  CORS_DEFAULT,
  KEY,
  leakSafeOpts,
  readSource,
  URL_BASE,
  withFetchStub,
  extractBlock,
} from "./_helpers.ts";

/**
 * Locks the get-media-base64 hardening contract:
 *  - per-call timeout override (timeoutMs, >= 25s used by the action);
 *  - caller AbortSignal propagation (pre-aborted and mid-flight);
 *  - 499 envelope when the caller aborts (vs 504 timeout);
 *  - router action source validates message.key and re-emits real HTTP status.
 *
 * The proxy tests follow the same withFetchStub style as
 * proxy-fetch-failure.test.ts (leakSafeOpts for error paths).
 */

const MEDIA_PATH = "/chat/getBase64FromMediaMessage/wpp2";
const MEDIA_BODY = { message: { key: { id: "ABC123", remoteJid: "5511999999999@c.us", fromMe: false } } };
const proxyWith = (proxyOpts: { signal?: AbortSignal; timeoutMs?: number }) =>
  proxyToEvolution(URL_BASE, KEY, CORS_DEFAULT, MEDIA_PATH, "POST", MEDIA_BODY, undefined, undefined, proxyOpts);

const abortError = () => {
  const err = new Error("aborted");
  err.name = "AbortError";
  return err;
};

Deno.test({
  ...leakSafeOpts,
  name: "get-media-base64 proxy: timeoutMs override maps AbortError to friendly 30s timeout",
  fn: () =>
    withFetchStub(() => Promise.reject(abortError()), async () => {
      const res = await proxyWith({ timeoutMs: 30_000 });
      assertEquals(res.status, 200); // envelope contract (body carries the real status)
      const body = await res.json();
      assertEquals(body.error, true);
      assertEquals(body.status, 504);
      assert(
        body.message.includes("Timeout após 30s"),
        `expected 30s timeout message, got: ${body.message}`,
      );
    }),
});

Deno.test({
  ...leakSafeOpts,
  name: "get-media-base64 proxy: pre-aborted caller signal returns 499 aborted envelope",
  fn: () =>
    withFetchStub(
      (_input, init) => {
        // Real fetch rejects immediately with AbortError when the signal is already aborted.
        if (init?.signal?.aborted) return Promise.reject(abortError());
        return Promise.reject(new TypeError("fetch must not be called"));
      },
      async () => {
        const controller = new AbortController();
        controller.abort();
        const res = await proxyWith({ signal: controller.signal });
        assertEquals(res.status, 200);
        const body = await res.json();
        assertEquals(body.error, true);
        assertEquals(body.status, 499);
        assert(
          body.message.includes("abortada pelo cliente"),
          `expected client-abort message, got: ${body.message}`,
        );
      },
    ),
});

Deno.test({
  ...leakSafeOpts,
  name: "get-media-base64 proxy: mid-flight caller abort propagates to upstream fetch",
  fn: () =>
    withFetchStub(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal as AbortSignal | undefined;
          signal?.addEventListener("abort", () => reject(abortError()));
        }),
      async () => {
        const controller = new AbortController();
        const pending = proxyWith({ signal: controller.signal });
        setTimeout(() => controller.abort(), 10);
        const res = await pending;
        const body = await res.json();
        assertEquals(body.error, true);
        assertEquals(body.status, 499);
      },
    ),
});

Deno.test("get-media-base64 proxy: success path with caller signal returns versioned { base64, mimetype }", () =>
  withFetchStub(
    () =>
      Promise.resolve(
        new Response(
          JSON.stringify({ base64: "AAAA", mimetype: "image/jpeg" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    async () => {
      const res = await proxyWith({ signal: new AbortController().signal });
      assertEquals(res.status, 200);
      const body = await res.json();
      assertEquals(body.base64, "AAAA");
      assertEquals(body.mimetype, "image/jpeg");
      assertEquals(body.version, 1);
    },
  ));

Deno.test("get-media-base64 action: source validates message.key, uses 30s timeout + req.signal, re-emits real HTTP status, maps expired media to 410 MEDIA_EXPIRED", async () => {
  const source = await readSource();
  const block = extractBlock(source, "if (action === 'get-media-base64')", {
    until: "// ── Instance lifecycle",
    maxSize: 6000,
  });
  assert(block.includes("INVALID_MESSAGE_KEY"), "deve validar message.key");
  assert(block.includes("key.id"), "deve exigir key.id");
  assert(block.includes("timeoutMs: 30_000"), "timeout >= 25s");
  assert(block.includes("signal: req.signal"), "deve propagar abort do caller");
  assert(block.includes("parsed.error === true"), "deve detectar envelope de erro");
  assert(block.includes("upstreamStatus"), "deve re-emitir status HTTP real");
  // Hardening mídia expirada (2026-08-06): upstream 400/404/410 ou body com
  // 'Failed to fetch stream'/'Media not found' → 410 Gone + MEDIA_EXPIRED pt-BR.
  assert(block.includes("MEDIA_EXPIRED"), "deve re-emitir code MEDIA_EXPIRED p/ mídia expirada");
  assert(block.includes("410"), "deve re-emitir status 410 (Gone) p/ mídia expirada");
  assert(block.includes("Failed to fetch stream"), "deve detectar marcador upstream de stream morto");
  assert(block.includes("Media not found"), "deve detectar marcador upstream de mídia não encontrada");
  assert(block.includes("A mídia expirou no WhatsApp"), "mensagem pt-BR de mídia expirada");
});
