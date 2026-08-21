/**
 * Contract tests — download-wa-status-media@v1.
 *
 * Chamada por pg_cron a cada 30min para baixar mídia de status do WhatsApp
 * antes da URL expirar (Evolution API). Schema testado: DownloadWaStatusMediaV1Schema
 * (contract-schemas.ts) — o MESMO usado em produção via parseOrReject, não mock.
 *
 * SEC-3 (2026-08-21): status_id compunha o path do storage
 * (`status/<data>/${status_id}.${ext}`) sem sanitização — path traversal /
 * poluição de bucket. O schema agora restringe status_id a [A-Za-z0-9_-].
 */
import { assertEquals } from "jsr:@std/assert";
import { DownloadWaStatusMediaV1Schema } from "../../_shared/contract-schemas.ts";

const VALID = {
  status_id: "3EB0C767D26A1E5C1F9A",
  participant_jid: "5511999999999@s.whatsapp.net",
  message_id: "3EB0C767D26A1E5C1F9A",
};

Deno.test("Contract: download-wa-status-media v1 — payload válido", () => {
  const result = DownloadWaStatusMediaV1Schema.safeParse(VALID);
  assertEquals(result.success, true);
});

Deno.test("Contract: download-wa-status-media v1 — message_type opcional é aceito", () => {
  const result = DownloadWaStatusMediaV1Schema.safeParse({ ...VALID, message_type: "image" });
  assertEquals(result.success, true);
});

Deno.test("Contract: download-wa-status-media v1 — status_id ausente é rejeitado", () => {
  const { status_id: _drop, ...rest } = VALID;
  const result = DownloadWaStatusMediaV1Schema.safeParse(rest);
  assertEquals(result.success, false);
});

Deno.test("Contract: download-wa-status-media v1 — participant_jid ausente é rejeitado", () => {
  const { participant_jid: _drop, ...rest } = VALID;
  const result = DownloadWaStatusMediaV1Schema.safeParse(rest);
  assertEquals(result.success, false);
});

Deno.test("Contract: download-wa-status-media v1 — message_id ausente é rejeitado", () => {
  const { message_id: _drop, ...rest } = VALID;
  const result = DownloadWaStatusMediaV1Schema.safeParse(rest);
  assertEquals(result.success, false);
});

Deno.test("Contract: download-wa-status-media v1 — status_id string vazia é rejeitado", () => {
  const result = DownloadWaStatusMediaV1Schema.safeParse({ ...VALID, status_id: "" });
  assertEquals(result.success, false);
});

Deno.test("Contract: download-wa-status-media v1 — status_id tipo errado (number) é rejeitado", () => {
  const result = DownloadWaStatusMediaV1Schema.safeParse({ ...VALID, status_id: 12345 });
  assertEquals(result.success, false);
});

Deno.test("Contract: download-wa-status-media v1 — payload null é rejeitado", () => {
  const result = DownloadWaStatusMediaV1Schema.safeParse(null);
  assertEquals(result.success, false);
});

Deno.test("Contract: download-wa-status-media v1 — payload {} é rejeitado (campos obrigatórios)", () => {
  const result = DownloadWaStatusMediaV1Schema.safeParse({});
  assertEquals(result.success, false);
});

// SEC-3 — path traversal via status_id.
Deno.test("Contract: download-wa-status-media v1 — status_id com '../' (path traversal) é rejeitado", () => {
  const result = DownloadWaStatusMediaV1Schema.safeParse({ ...VALID, status_id: "../../etc/passwd" });
  assertEquals(result.success, false);
});

Deno.test("Contract: download-wa-status-media v1 — status_id com '/' é rejeitado", () => {
  const result = DownloadWaStatusMediaV1Schema.safeParse({ ...VALID, status_id: "a/b" });
  assertEquals(result.success, false);
});

Deno.test("Contract: download-wa-status-media v1 — status_id com espaço/caractere especial é rejeitado", () => {
  const result = DownloadWaStatusMediaV1Schema.safeParse({ ...VALID, status_id: "abc def;rm -rf" });
  assertEquals(result.success, false);
});
