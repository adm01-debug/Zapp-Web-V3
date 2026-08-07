import {
  assert,
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { proxyToEvolution } from "../../_shared/evolution-api-proxy.ts";
import {
  CORS_DEFAULT,
  extractBlock,
  KEY,
  leakSafeOpts,
  readSource,
  URL_BASE,
  withFetchStub,
} from "./_helpers.ts";

/**
 * TAREFA A1 — evolution-api: envelope aditivo + FASE 3 (400 → 422).
 *
 * Locks the contract introduced by this change:
 *  1. EVERY error envelope emitted by the router (index.ts) and the shared
 *     proxy (_shared/evolution-api-proxy.ts) carries
 *     `contract: 'evolution-api@v1'` (additive) plus
 *     `details: [{ path, message }]` naming the offending request field.
 *     `version/error/status/code/message` are preserved untouched.
 *  2. Pure-validation codes migrated from 400 → 422 (HTTP + internal
 *     `status`), keeping the exact pt-BR message:
 *     INVALID_NUMBER, INVALID_PRESENCE, MISSING_INSTANCE, MISSING_NUMBER,
 *     INVALID_MESSAGE_KEY, INSTANCE_NAME_IS_UUID, and the raw
 *     `{ error: 'Invalid instance name' }` site (~line 98).
 *  3. Non-validation codes are NOT migrated: MEDIA_EXPIRED stays 410,
 *     INSTANCE_PAUSED stays 503, INSTANCE_RATE_LIMIT stays 429, and the
 *     proxy re-emits upstream statuses (401/500/502/504…) unchanged.
 *
 * Tests follow the established suite style: static source analysis for
 * router-level envelopes (the handler can't be booted without Supabase
 * secrets — see v237-fallback.test.ts) and withFetchStub runtime tests for
 * the shared proxy.
 */

const NEXT_ACTION = /action === '/;

Deno.test(
  "send-chat-presence INVALID_NUMBER: envelope 422 com contract e details path 'number'",
  async () => {
    const source = await readSource();
    const block = extractBlock(source, "action === 'send-chat-presence'", {
      until: NEXT_ACTION,
      maxSize: 6000,
    });

    assert(block.includes("code: 'INVALID_NUMBER'"), "code INVALID_NUMBER presente");
    // HTTP status + status interno espelhado em 422.
    assert(
      block.includes("status: 422, code: 'INVALID_NUMBER'"),
      "status interno deve ser 422",
    );
    assert(
      block.includes("}), { status: 422, headers:"),
      "HTTP status deve ser 422",
    );
    // Envelope aditivo: contract + details com o campo relevante.
    assert(
      block.includes("contract: 'evolution-api@v1'"),
      "envelope deve carregar contract 'evolution-api@v1'",
    );
    assert(
      block.includes("details: [{ path: 'number', message: 'number é obrigatório (E.164, dígitos 10-15)' }]"),
      "details deve apontar path 'number' com a message pt-BR exata",
    );
  },
);

Deno.test(
  "get-media-base64 MEDIA_EXPIRED: continua 410 (HTTP + status interno) com contract presente",
  async () => {
    const source = await readSource();
    const block = extractBlock(source, "if (action === 'get-media-base64')", {
      until: "// ── Instance lifecycle",
      maxSize: 6000,
    });

    assert(block.includes("code: 'MEDIA_EXPIRED'"), "code MEDIA_EXPIRED presente");
    assert(
      block.includes("status: 410, code: 'MEDIA_EXPIRED'"),
      "status interno NÃO migrou — deve continuar 410",
    );
    assert(
      block.includes("}), { status: 410, headers:"),
      "HTTP status NÃO migrou — deve continuar 410",
    );
    assert(
      block.includes("contract: 'evolution-api@v1'"),
      "envelope MEDIA_EXPIRED também carrega contract",
    );
    assert(
      block.includes("details: [{ path: 'message', message: 'A mídia expirou no WhatsApp e não pode mais ser recuperada.' }]"),
      "details aponta o campo 'message' (a mídia)",
    );
  },
);

Deno.test(
  "FASE 3: demais codes de validação migraram para 422; codes não-validação intocados",
  async () => {
    const source = await readSource();

    // Migrados (422 em status interno e HTTP).
    for (const code of [
      "MISSING_INSTANCE",
      "MISSING_NUMBER",
      "INVALID_PRESENCE",
      "INSTANCE_NAME_IS_UUID",
    ]) {
      assert(
        source.includes(`status: 422, code: '${code}'`),
        `${code} deve ter status interno 422`,
      );
    }
    // INVALID_MESSAGE_KEY passa pelo helper invalidMessage(..., 'key', 422) —
    // os 3 call sites (key.id / key.remoteJid / key.fromMe) devem passar 422.
    const keyCallSites = source.match(
      /invalidMessage\('INVALID_MESSAGE_KEY'[^)]*,\s*'key',\s*422\)/g,
    );
    assert(
      keyCallSites?.length === 3,
      `os 3 call sites de INVALID_MESSAGE_KEY devem passar status 422 (achados: ${keyCallSites?.length})`,
    );
    // Nenhum status: 400 restante no router (validação pura migrou por completo).
    assert(
      !/status: 400/.test(source),
      "nenhum emissor de envelope deve permanecer com status 400",
    );
    // Não migrados (FASE 3 proíbe mexer).
    assert(
      source.includes("status: 503, code: 'INSTANCE_PAUSED'"),
      "INSTANCE_PAUSED deve continuar 503",
    );
    assert(
      source.includes("status: 429, code: 'INSTANCE_RATE_LIMIT'"),
      "INSTANCE_RATE_LIMIT deve continuar 429",
    );
    assert(
      source.includes("status: 410, code: 'MEDIA_EXPIRED'"),
      "MEDIA_EXPIRED deve continuar 410",
    );
  },
);

Deno.test({
  ...leakSafeOpts,
  name:
    "proxy 504 (timeout): envelope mantém shape com contract e details (assert por campo)",
  fn: () =>
    withFetchStub(
      () => {
        const err = new Error("timed out");
        err.name = "AbortError";
        return Promise.reject(err);
      },
      async () => {
        const res = await proxyToEvolution(
          URL_BASE,
          KEY,
          CORS_DEFAULT,
          "/message/sendMedia/wpp2",
          "POST",
          { number: "5511999999999" },
        );
        assertEquals(res.status, 200, "proxy sempre devolve HTTP 200");
        const body = await res.json();
        // Assert por campo — o shape do envelope é preservado (aditivo).
        assertEquals(body.error, true);
        assertEquals(body.status, 504);
        assertEquals(body.version, 1);
        assertEquals(body.contract, "evolution-api@v1");
        assert(
          typeof body.message === "string" &&
            body.message.includes("Falha ao conectar com a API Evolution"),
          `message inesperada: ${body.message}`,
        );
        assert(
          typeof body.retries === "number",
          "retries deve continuar numérico",
        );
        assertExists(body.details, "details aditivo presente");
        assert(
          Array.isArray(body.details) && body.details[0]?.path === "instance",
          "details[0].path deve ser 'instance'",
        );
      },
    ),
});

Deno.test({
  ...leakSafeOpts,
  name: "proxy error (upstream 500): contract presente e details (payload upstream) preservado",
  fn: () =>
    withFetchStub(
      () =>
        Promise.resolve(
          new Response(JSON.stringify({ message: "boom" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      async () => {
        const res = await proxyToEvolution(
          URL_BASE,
          KEY,
          CORS_DEFAULT,
          "/message/sendMedia/wpp2",
          "POST",
          { number: "5511999999999" },
        );
        const body = await res.json();
        assertEquals(body.error, true);
        assertEquals(body.status, 500);
        assertEquals(body.contract, "evolution-api@v1");
        // NADA foi removido: o payload upstream segue em details (dado cru).
        assertExists(body.details);
        assertEquals((body.details as { message: string }).message, "boom");
      },
    ),
});
