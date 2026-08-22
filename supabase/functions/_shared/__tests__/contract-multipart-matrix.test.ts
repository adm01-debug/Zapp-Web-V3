/**
 * Contract Multipart Matrix — Bloco 6, etapa 72 do PLANO-100-CONTRATOS-EDGE.
 *
 * `contract-field-matrix.test.ts` (adversarial-matrix.ts) exclui os 3
 * contratos multipart (MULTIPART_CONTRACTS: file-security-scanner,
 * secure-upload, voice-changer) porque o gerador genérico não consegue
 * sintetizar um `File` real — o campo `z.custom<File>(...)` é implementado
 * internamente como `ZodAny.superRefine(...)` (vira ZodEffects→ZodAny na
 * introspecção de adversarial-matrix.ts), e o sintetizador para ZodAny
 * produz a string `"x"`, que FALHA o `v instanceof File` do refine — o
 * "happy path" automático já nasceria rejeitado. Por isso os 3 contratos
 * ficam fora do denominador de contract-field-matrix.test.ts e este arquivo
 * cobre o caso manualmente, com um `File` real (`Deno.File`/global `File`,
 * disponível no runtime Deno).
 *
 * Escopo desta suíte (mesmo nível dos demais arquivos de teste de contrato):
 * chama `parseOrReject` DIRETAMENTE com o payload que cada `index.ts` monta
 * de fato — `Object.fromEntries(formData.entries())` — sem subir o servidor
 * (`Deno.serve`) nem tocar DB/Storage/API externa (ElevenLabs). Isso testa a
 * camada de CONTRATO (aceita/rejeita o shape certo), não a lógica de negócio
 * downstream (fila, upload, chamada de API) — mesmo recorte de todo o resto
 * desta suíte de testes de contrato.
 *
 * Contratos de query-param puro (email-track-link, email-track-pixel,
 * contact-media@GET) ficam FORA desta etapa por um motivo estrutural
 * diferente: eles não usam `z.custom<File>` nem sintetização — o problema lá
 * é que a validação real do parâmetro (`?l=`/`?t=`/`?contact_id=`) é MANUAL,
 * inline no callback do `Deno.serve`, e o `parseOrReject` correspondente é
 * chamado com um corpo vazio/permissivo só para satisfazer o gate de
 * cobertura (documentado no próprio index.ts de cada um: "Schema permissivo
 * ({}) nunca bloqueia o 302/pixel"). Testar a validação real exigiria
 * refatorar a extração de query params para uma função pura testável (fora
 * do escopo de "adicionar teste" desta etapa) ou subir o servidor via HTTP
 * real (outra classe de teste, não a usada em nenhum arquivo desta suíte).
 * Registrado aqui como decisão consciente, não lacuna escondida.
 *
 * Rodar: deno test --allow-net --allow-env --allow-read
 *   supabase/functions/_shared/__tests__/contract-multipart-matrix.test.ts
 */
import { assertEquals } from "jsr:@std/assert";
import { parseOrReject } from "../contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../contract-schemas.ts";

function makeFile(name: string, type: string, content = "conteudo de teste"): File {
  return new File([content], name, { type });
}

/** Mesma transformação que os 3 index.ts fazem: `Object.fromEntries(formData.entries())`. */
function multipartPayload(entries: Record<string, string | File>): Record<string, unknown> {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.append(k, v);
  return Object.fromEntries(fd.entries());
}

function req(): Request {
  return new Request("https://edge.local/fn", { method: "POST" });
}

function assertAccepts(contractName: string, payload: Record<string, unknown>, label: string) {
  const result = parseOrReject(contractName, CONTRACT_SCHEMAS[contractName], req(), payload);
  assertEquals(result.ok, true, `${contractName} [${label}]: esperado ACEITAR — ${JSON.stringify(Object.keys(payload))}`);
}

function assertRejects(contractName: string, payload: Record<string, unknown>, label: string) {
  const result = parseOrReject(contractName, CONTRACT_SCHEMAS[contractName], req(), payload);
  assertEquals(result.ok, false, `${contractName} [${label}]: esperado REJEITAR — ${JSON.stringify(Object.keys(payload))}`);
}

// ─── file-security-scanner@v1 — { file: File, bucket?: string.max(100) } ──

Deno.test("Multipart: file-security-scanner v1 — file real + bucket → aceito", () => {
  assertAccepts(
    "file-security-scanner",
    multipartPayload({ file: makeFile("doc.pdf", "application/pdf"), bucket: "quarantine" }),
    "happy_path",
  );
});

Deno.test("Multipart: file-security-scanner v1 — só file (bucket opcional ausente) → aceito", () => {
  assertAccepts(
    "file-security-scanner",
    multipartPayload({ file: makeFile("doc.pdf", "application/pdf") }),
    "happy_path_min",
  );
});

Deno.test("Multipart: file-security-scanner v1 — file ausente (só bucket) → rejeitado", () => {
  assertRejects("file-security-scanner", multipartPayload({ bucket: "quarantine" }), "missing_required:file");
});

Deno.test("Multipart: file-security-scanner v1 — file como string (não é File real) → rejeitado", () => {
  // FormData.append(key, string) produz uma ENTRADA STRING, não File — é
  // exatamente o "tipo errado" que um multipart malformado produziria.
  assertRejects(
    "file-security-scanner",
    multipartPayload({ file: "nao-e-um-arquivo" }),
    "wrong_type:file",
  );
});

Deno.test("Multipart: file-security-scanner v1 — campo extra desconhecido (.strict()) → rejeitado", () => {
  assertRejects(
    "file-security-scanner",
    { ...multipartPayload({ file: makeFile("doc.pdf", "application/pdf") }), extra_unknown: "x" },
    "extra_field",
  );
});

Deno.test("Multipart: file-security-scanner v1 — bucket acima do max(100) → rejeitado", () => {
  assertRejects(
    "file-security-scanner",
    multipartPayload({ file: makeFile("doc.pdf", "application/pdf"), bucket: "x".repeat(101) }),
    "wrong_type:bucket_too_long",
  );
});

// ─── secure-upload@v1 — { file: File, bucket?: string.max(100), path?: string.max(500)|null } ──

Deno.test("Multipart: secure-upload v1 — file + bucket + path → aceito", () => {
  assertAccepts(
    "secure-upload",
    multipartPayload({ file: makeFile("img.png", "image/png"), bucket: "whatsapp-media", path: "2026/08/img.png" }),
    "happy_path",
  );
});

Deno.test("Multipart: secure-upload v1 — só file → aceito (bucket/path opcionais)", () => {
  assertAccepts("secure-upload", multipartPayload({ file: makeFile("img.png", "image/png") }), "happy_path_min");
});

Deno.test("Multipart: secure-upload v1 — file ausente → rejeitado", () => {
  assertRejects("secure-upload", multipartPayload({ bucket: "whatsapp-media" }), "missing_required:file");
});

Deno.test("Multipart: secure-upload v1 — file como string (não é File real) → rejeitado", () => {
  assertRejects("secure-upload", multipartPayload({ file: "nao-e-um-arquivo" }), "wrong_type:file");
});

Deno.test("Multipart: secure-upload v1 — campo extra desconhecido (.strict()) → rejeitado", () => {
  assertRejects(
    "secure-upload",
    { ...multipartPayload({ file: makeFile("img.png", "image/png") }), unexpected: true },
    "extra_field",
  );
});

Deno.test("Multipart: secure-upload v1 — path acima do max(500) → rejeitado", () => {
  assertRejects(
    "secure-upload",
    multipartPayload({ file: makeFile("img.png", "image/png"), path: "x".repeat(501) }),
    "wrong_type:path_too_long",
  );
});

Deno.test("Multipart: secure-upload v1 — path null explícito → aceito (.nullable())", () => {
  const payload = { ...multipartPayload({ file: makeFile("img.png", "image/png") }), path: null };
  assertAccepts("secure-upload", payload, "explicit_null:path");
});

// ─── voice-changer@v1 (multipart) — { audio: File, voice_preset?, task_id?, authorized? } ──

Deno.test("Multipart: voice-changer v1 — audio + voice_preset + authorized (string) → aceito", () => {
  assertAccepts(
    "voice-changer",
    multipartPayload({ audio: makeFile("in.mp3", "audio/mpeg"), voice_preset: "grave", authorized: "true" }),
    "happy_path",
  );
});

Deno.test("Multipart: voice-changer v1 — só audio → aceito (todos os outros são opcionais)", () => {
  assertAccepts("voice-changer", multipartPayload({ audio: makeFile("in.mp3", "audio/mpeg") }), "happy_path_min");
});

Deno.test("Multipart: voice-changer v1 — audio ausente → rejeitado", () => {
  assertRejects("voice-changer", multipartPayload({ voice_preset: "grave" }), "missing_required:audio");
});

Deno.test("Multipart: voice-changer v1 — audio como string → rejeitado", () => {
  assertRejects("voice-changer", multipartPayload({ audio: "nao-e-audio" }), "wrong_type:audio");
});

Deno.test("Multipart: voice-changer v1 — campo extra desconhecido (.strict()) → rejeitado", () => {
  assertRejects(
    "voice-changer",
    { ...multipartPayload({ audio: makeFile("in.mp3", "audio/mpeg") }), extra: "x" },
    "extra_field",
  );
});

Deno.test("Multipart: voice-changer v1 — task_id null explícito → aceito (.nullable())", () => {
  const payload = { ...multipartPayload({ audio: makeFile("in.mp3", "audio/mpeg") }), task_id: null };
  assertAccepts("voice-changer", payload, "explicit_null:task_id");
});

Deno.test("Multipart: voice-changer v1 — authorized como boolean real (não string) → aceito (union boolean|string)", () => {
  // FormData.entries() nunca produz boolean real (tudo vira string) — mas o
  // schema declara union([boolean, string]) mesmo assim (permissivo por
  // construção, não porque outro branch do index.ts reutilize este schema:
  // o branch JSON/fila do mesmo handler usa VoiceChangerV1Schema, um schema
  // SEPARADO — ver schemas.ts). O handler lê
  // `body.authorized === true || body.authorized === 'true'`, então aceitar
  // os dois formatos aqui é o comportamento correto a testar.
  const payload = { ...multipartPayload({ audio: makeFile("in.mp3", "audio/mpeg") }), authorized: true };
  assertAccepts("voice-changer", payload, "union_variant:authorized_boolean");
});
