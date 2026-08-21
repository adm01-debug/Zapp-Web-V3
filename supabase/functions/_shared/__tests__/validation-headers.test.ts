import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { mergeCsvHeaderValues, errorResponse, jsonResponse } from "../validation.ts";

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
