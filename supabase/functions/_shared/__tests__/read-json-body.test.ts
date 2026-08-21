/**
 * readJsonBodyOrEmpty (_shared/validation.ts) — Bloco 6 follow-up, correção
 * do antipadrão `req.json().catch(() => ({}))` (D1/etapa 27) sem quebrar
 * os ~35 endpoints cron/GET/health-check cujo contrato aceita "sem body".
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { readJsonBodyOrEmpty } from "../validation.ts";

function reqWithBody(body?: BodyInit): Request {
  return new Request("http://localhost", { method: "POST", body });
}

Deno.test("readJsonBodyOrEmpty: corpo genuinamente vazio → {}", async () => {
  const result = await readJsonBodyOrEmpty(reqWithBody(undefined));
  assertEquals(result, {});
});

Deno.test("readJsonBodyOrEmpty: corpo string vazia → {}", async () => {
  const result = await readJsonBodyOrEmpty(reqWithBody(""));
  assertEquals(result, {});
});

Deno.test("readJsonBodyOrEmpty: corpo só espaços em branco → {}", async () => {
  const result = await readJsonBodyOrEmpty(reqWithBody("   \n  "));
  assertEquals(result, {});
});

Deno.test("readJsonBodyOrEmpty: JSON válido → objeto parseado", async () => {
  const result = await readJsonBodyOrEmpty(reqWithBody(JSON.stringify({ limit: 20, dryRun: true })));
  assertEquals(result, { limit: 20, dryRun: true });
});

Deno.test("readJsonBodyOrEmpty: JSON válido mas array → array parseado (não é {})", async () => {
  const result = await readJsonBodyOrEmpty(reqWithBody(JSON.stringify([1, 2, 3])));
  assertEquals(result, [1, 2, 3]);
});

Deno.test("readJsonBodyOrEmpty: JSON malformado (não-vazio) → null (dispara invalid_json no gate)", async () => {
  const result = await readJsonBodyOrEmpty(reqWithBody("{invalid json"));
  assertEquals(result, null);
});

Deno.test("readJsonBodyOrEmpty: corpo é só uma string JSON válida (\"oi\") → string, não {}", async () => {
  // Regressão do antipadrão original: `{}`-catch mascarava ISSO também como
  // corpo vazio. O helper preserva a string real (não-estruturada — quem
  // consome via parseOrReject vai rejeitar por não ser objeto, corretamente,
  // via invalid_json — mas não é o helper que decide isso, é o gate).
  const result = await readJsonBodyOrEmpty(reqWithBody(JSON.stringify("oi")));
  assertEquals(result, "oi");
});

// ─── Auditoria pós-Bloco 6 (2026-08-21) — 3 lacunas de cobertura ────────────
// encontradas por reprodução real; a do BOM era um bug funcional de verdade
// (não só falta de teste) e foi corrigida em readJsonBodyOrEmpty.

Deno.test("readJsonBodyOrEmpty: JSON válido com BOM (U+FEFF) líder → parseado corretamente (bug corrigido)", async () => {
  // Antes da correção: JSON.parse rodava sobre o texto NÃO-trimado, e o BOM
  // não é sintaxe JSON válida no início — um payload correto era rejeitado
  // como malformado (null → 422 invalid_json). trim() remove BOM (é
  // WhiteSpace pela spec de ECMAScript) antes do parse.
  const bom = "﻿";
  const result = await readJsonBodyOrEmpty(reqWithBody(bom + JSON.stringify({ a: 1 })));
  assertEquals(result, { a: 1 });
});

Deno.test("readJsonBodyOrEmpty: corpo é a string JSON literal \"null\" → null (indistinguível do caminho de erro, por design)", async () => {
  // JSON.parse("null") retorna null com sucesso (não lança) — o mesmo valor
  // de retorno do caminho de JSON malformado. Documentado aqui como
  // comportamento aceito, não um bug: o consumidor (parseOrReject) rejeita
  // `null` de QUALQUER origem via isStructured = body !== null && ..., então
  // os dois casos convergem pro mesmo 422 invalid_json — a ambiguidade não
  // causa comportamento incorreto no caminho real de uso.
  const resultFromLiteralNull = await readJsonBodyOrEmpty(reqWithBody("null"));
  const resultFromMalformed = await readJsonBodyOrEmpty(reqWithBody("{invalid"));
  assertEquals(resultFromLiteralNull, null);
  assertEquals(resultFromMalformed, null);
});

Deno.test("readJsonBodyOrEmpty: número acima de Number.MAX_SAFE_INTEGER perde precisão silenciosamente (comportamento nativo do JSON.parse, documentado)", async () => {
  // JSON.parse não tem reviver customizado aqui — números grandes (ex.: IDs
  // int64/snowflake de sistemas externos) são arredondados para o double
  // mais próximo, sem erro. Não é peculiaridade desta função (é o
  // comportamento padrão de JSON.parse em qualquer engine JS conforme a
  // especificação ECMAScript), mas documentado aqui pra não passar
  // despercebido numa revisão futura.
  const result = await readJsonBodyOrEmpty(reqWithBody('{"id": 99999999999999999999}')) as { id: number };
  assertEquals(result.id, 100000000000000000000);
});
