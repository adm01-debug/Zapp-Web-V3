/**
 * Security verdict envelope — contrato ADITIVO (exceção documentada ao formato
 * canônico) de secure-upload / file-security-scanner.
 *
 * Garantias testadas aqui:
 *   - Envelope SEMPRE tem `contract` (emissor) quando informado; default é
 *     'secure-upload' (safety-net).
 *   - `details` é OBJETO de metadados do veredito (Record<string, unknown>),
 *     NUNCA array — o frontend src/lib/scanResponse.ts faz narrowing por
 *     `code` e lê details como objeto.
 *   - `code` é o veredito e é PRESERVADO (MALWARE_DETECTED / SUSPICIOUS_FILE /
 *     SCAN_TIMEOUT / SCAN_UNAVAILABLE / INVALID_INPUT / ...).
 *   - status e Content-Type preservados; error: true.
 *
 * Rodar: deno test supabase/functions/_shared/__tests__/security-error-envelope.test.ts
 */

import { assertEquals, assert, assertMatch } from "jsr:@std/assert";
import { securityErrorResponse } from "../validation.ts";

function req(): Request {
  return new Request("https://edge.local/scan", { method: "POST" });
}

interface Envelope {
  error: boolean;
  contract?: string;
  code: string;
  message: string;
  verdict?: string;
  scanId?: string | null;
  details?: unknown;
}

async function readEnvelope(res: Response): Promise<Envelope> {
  const body = (await res.json()) as Envelope;
  assertEquals(body.error, true, "error deve ser true");
  return body;
}

Deno.test("security-envelope: contract explícito é emitido e code/status preservados", async () => {
  const res = securityErrorResponse(
    {
      code: "MALWARE_DETECTED",
      message: "Arquivo bloqueado: conteúdo malicioso identificado.",
      verdict: "malicious",
      scanId: "abc123",
      details: { malicious: 3, suspicious: 0, fileName: "evil.exe" },
    },
    422,
    req(),
    "file-security-scanner",
  );
  assertEquals(res.status, 422);
  assertEquals(res.headers.get("Content-Type"), "application/json");
  const body = await readEnvelope(res);
  assertEquals(body.contract, "file-security-scanner", "contract deve refletir o emissor");
  assertEquals(body.code, "MALWARE_DETECTED", "code (veredito) deve ser preservado");
  assertEquals(body.verdict, "malicious");
  assertEquals(body.scanId, "abc123");
  // details é OBJETO de metadados, NUNCA array
  assert(body.details !== undefined, "details deve estar presente");
  assert(typeof body.details === "object" && !Array.isArray(body.details), "details deve ser objeto (não array)");
  const d = body.details as Record<string, unknown>;
  assertEquals(d.malicious, 3);
  assertEquals(d.fileName, "evil.exe");
});

Deno.test("security-envelope: secure-upload emite seu próprio contract", async () => {
  const res = securityErrorResponse(
    { code: "SUSPICIOUS_FILE", message: "Arquivo bloqueado por suspeita de ameaça.", verdict: "suspicious" },
    403,
    req(),
    "secure-upload",
  );
  assertEquals(res.status, 403);
  const body = await readEnvelope(res);
  assertEquals(body.contract, "secure-upload");
  assertEquals(body.code, "SUSPICIOUS_FILE");
  assertEquals(body.verdict, "suspicious");
});

Deno.test("security-envelope: default de contract é 'secure-upload' (safety-net)", async () => {
  const res = securityErrorResponse(
    { code: "SCAN_TIMEOUT", message: "A varredura de segurança expirou. Tente novamente.", verdict: "unknown", scanId: "s1" },
    408,
    req(),
  );
  assertEquals(res.status, 408);
  const body = await readEnvelope(res);
  assertEquals(body.contract, "secure-upload", "default deve ser 'secure-upload'");
  assertEquals(body.code, "SCAN_TIMEOUT");
  assertEquals(body.scanId, "s1");
});

Deno.test("security-envelope: SCAN_UNAVAILABLE e INVALID_INPUT preservam code sem details obrigatório", async () => {
  for (const [code, status] of [
    ["SCAN_UNAVAILABLE", 502],
    ["INVALID_INPUT", 400],
    ["STORAGE_ERROR", 500],
    ["INTERNAL_ERROR", 500],
  ] as const) {
    const res = securityErrorResponse(
      { code, message: `erro ${code}`, verdict: code === "INVALID_INPUT" ? undefined : "unknown" },
      status,
      req(),
      "file-security-scanner",
    );
    assertEquals(res.status, status, `${code}: status deve ser ${status}`);
    const body = await readEnvelope(res);
    assertEquals(body.code, code, "code deve ser preservado");
    assertEquals(body.contract, "file-security-scanner");
  }
});

Deno.test("security-envelope: details com metadados de engine/veredito permanece objeto e não vira array", async () => {
  const res = securityErrorResponse(
    {
      code: "MALWARE_DETECTED",
      message: "bloqueado",
      verdict: "malicious",
      details: { engine: "virustotal", signature: "Trojan.GenericKD.1", malicious: 5, suspicious: 1 },
    },
    422,
    req(),
    "secure-upload",
  );
  const body = await readEnvelope(res);
  assertMatch(body.contract!, /^(secure-upload|file-security-scanner)$/, "contract deve ser um emissor conhecido");
  assert(!Array.isArray(body.details), "details NUNCA pode ser array");
  const d = body.details as Record<string, unknown>;
  assertEquals(d.engine, "virustotal");
  assertEquals(d.signature, "Trojan.GenericKD.1");
});

Deno.test("security-envelope: sem details o campo é omitido (shape estável para o frontend)", async () => {
  const res = securityErrorResponse(
    { code: "UNAUTHORIZED", message: "Sessão inválida ou expirada." },
    401,
    req(),
    "secure-upload",
  );
  assertEquals(res.status, 401);
  const body = await readEnvelope(res);
  assertEquals(body.details, undefined, "details deve ser omitido quando ausente");
  assertEquals(body.code, "UNAUTHORIZED");
});
