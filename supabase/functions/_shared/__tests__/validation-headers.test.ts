import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { mergeCsvHeaderValues, errorResponse, errorEnvelope, jsonResponse } from "../validation.ts";

Deno.test("mergeCsvHeaderValues: normaliza casing e remove duplicados", () => {
  const merged = mergeCsvHeaderValues(
    "Authorization, Content-Type, X-Request-Id",
    "authorization,content-type, x-request-id",
  );

  assertEquals(merged, "authorization, content-type, x-request-id");
});

Deno.test("mergeCsvHeaderValues: ignora valores vazios e espaços extras", () => {
  const merged = mergeCsvHeaderValues(
    "  authorization  ,   content-type  ",
    undefined,
    "",
    "x-client-info,   ",
  );

  assertEquals(merged, "authorization, content-type, x-client-info");
});

Deno.test("mergeCsvHeaderValues: preserva ordem de primeira ocorrência", () => {
  const merged = mergeCsvHeaderValues(
    "x-custom-b, x-custom-a",
    "x-custom-a, x-custom-c",
    "x-custom-b",
  );

  assertEquals(merged, "x-custom-b, x-custom-a, x-custom-c");
});

// Bloco 5.1 (hotfix, auditoria multi-agente 2026-08-21): errorResponse() ganhou
// o mesmo mecanismo de extraHeaders que jsonResponse() já tinha (Bloco 5) —
// sem isso, TODA resposta de erro pós-gate nos 6 webhooks v1/v2 descartava
// x-contract-version/x-contract-deprecated/sunset mesmo quando a resposta 200
// de sucesso do mesmo endpoint os carregava.

Deno.test("jsonResponse: extraHeaders são mesclados na resposta", async () => {
  const res = jsonResponse({ ok: true }, 200, undefined, { "x-contract-version": "v2" });
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("x-contract-version"), "v2");
  assertEquals(await res.json(), { ok: true });
});

Deno.test("jsonResponse: sem extraHeaders continua funcionando (aditivo, não quebra chamadas antigas)", async () => {
  const res = jsonResponse({ ok: true }, 200);
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("x-contract-version"), null);
});

Deno.test("errorResponse: extraHeaders são mesclados na resposta de erro", async () => {
  const res = errorResponse("algo deu errado", 500, undefined, undefined, {
    "x-contract-version": "v1",
    "x-contract-deprecated": "true",
    "sunset": "2027-06-01",
  });
  assertEquals(res.status, 500);
  assertEquals(res.headers.get("x-contract-version"), "v1");
  assertEquals(res.headers.get("x-contract-deprecated"), "true");
  assertEquals(res.headers.get("sunset"), "2027-06-01");
  assertEquals(await res.json(), { error: "algo deu errado" });
});

Deno.test("errorResponse: extraHeaders não interfere com `details` no body (4º parâmetro continua intacto)", async () => {
  const res = errorResponse("validação falhou", 400, undefined, { field: "email" }, { "x-contract-version": "v2" });
  assertEquals(res.headers.get("x-contract-version"), "v2");
  assertEquals(await res.json(), { error: "validação falhou", field: "email" });
});

Deno.test("errorResponse: sem extraHeaders continua funcionando (aditivo, não quebra chamadas antigas)", async () => {
  const res = errorResponse("erro simples", 400);
  assertEquals(res.status, 400);
  assertEquals(res.headers.get("x-contract-version"), null);
  assertEquals(await res.json(), { error: "erro simples" });
});

// ─── errorEnvelope (etapa 26, Bloco 2, 2026-08-21) ──────────────────────────
// Shape único {error:true, code, message} pra erros não-validação, reduzindo
// gradualmente os `{error: "string"}` ad-hoc espalhados pelo repo.

Deno.test("errorEnvelope: shape básico {error:true, code, message}", async () => {
  const res = errorEnvelope("unauthorized", "Token inválido", 401);
  assertEquals(res.status, 401);
  assertEquals(await res.json(), { error: true, code: "unauthorized", message: "Token inválido" });
});

Deno.test("errorEnvelope: extra mescla campos adicionais no body (requestId, reason, etc.)", async () => {
  const res = errorEnvelope("webhook_misconfigured", "Secret ausente", 503, undefined, { reason: "no_secret_configured", requestId: "abc123" });
  assertEquals(await res.json(), {
    error: true, code: "webhook_misconfigured", message: "Secret ausente",
    reason: "no_secret_configured", requestId: "abc123",
  });
});

Deno.test("errorEnvelope: extraHeaders são mesclados na resposta (mesmo mecanismo de errorResponse)", async () => {
  const res = errorEnvelope("internal_error", "Erro interno", 500, undefined, undefined, { "x-contract-version": "v1" });
  assertEquals(res.headers.get("x-contract-version"), "v1");
});

Deno.test("errorEnvelope: default status 400 quando omitido", () => {
  const res = errorEnvelope("bad_request", "Requisição inválida");
  assertEquals(res.status, 400);
});
