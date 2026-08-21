/**
 * SEC-4 (Bloco 0, 2026-08-21, PLANO-100-CONTRATOS-EDGE): 3 campos que
 * persistem host/URL controlados pelo caller sem bloqueio de rede
 * interna/privada — mesma classe de SSRF do SEC-2 (transcribe-audio-internal),
 * fechada agora nos campos restantes:
 *
 *   - evolution-credentials-write.api_url (schema: isSafeHttpsUrl)
 *   - zapp-n8n-sync configure.baseUrl (handler, DEPOIS de normalizeBaseUrl —
 *     ver zapp-n8n-sync/index.ts; o schema aceita host sem protocolo de
 *     propósito, então o bloqueio SSRF não pode estar no schema)
 *   - email-imap-bridge config.{imap_host,smtp_host} (schema: isSafeHost —
 *     conecta via socket TCP direto, não fetch(), por isso um validador de
 *     HOSTNAME em vez de URL)
 */
import { assertEquals } from "jsr:@std/assert";
import { CONTRACT_SCHEMAS } from "../contract-schemas.ts";
import { isSafeHttpsUrl, isSafeHost } from "../schemas.ts";

const PRIVATE_HOSTS = [
  "169.254.169.254", // AWS/GCP metadata endpoint
  "localhost",
  "127.0.0.1",
  "10.0.0.5",
  "192.168.1.1",
  "172.16.0.1",
];

const PRIVATE_URLS = [
  "http://169.254.169.254/latest/meta-data/",
  "https://169.254.169.254/latest/meta-data/",
  "https://localhost/secret",
  "https://127.0.0.1:8080/admin",
  "https://10.0.0.5/internal",
  "https://192.168.1.1/router",
  "https://172.16.0.1/internal",
  "https://[::1]/internal",
  "http://evolution.atomicabr.com.br/x", // http (não https) também deve cair
];

// ---- evolution-credentials-write.api_url ----------------------------------

const EvoWriteSchema = CONTRACT_SCHEMAS["evolution-credentials-write"].v1;

for (const url of PRIVATE_URLS) {
  Deno.test(`SEC-4: evolution-credentials-write.api_url bloqueia SSRF — ${url}`, () => {
    const result = EvoWriteSchema.safeParse({
      action: "save", instance_name: "wpp-test", api_url: url, api_key: "k",
    });
    assertEquals(result.success, false);
  });
}

Deno.test("SEC-4: evolution-credentials-write.api_url HTTPS público legítimo passa", () => {
  const result = EvoWriteSchema.safeParse({
    action: "save", instance_name: "wpp-test", api_url: "https://evo.atomicabr.com.br", api_key: "k",
  });
  assertEquals(result.success, true);
});

// ---- zapp-n8n-sync configure.baseUrl (handler, pós-normalização) ----------
// O schema aceita baseUrl sem protocolo de propósito (normalizeBaseUrl
// prefixa https:// antes do check) — a validação SSRF roda no handler,
// então testamos isSafeHttpsUrl diretamente contra o valor JÁ normalizado
// (é exatamente o que handleConfigure faz).

for (const url of PRIVATE_URLS) {
  Deno.test(`SEC-4: zapp-n8n-sync baseUrl (pós-normalização) bloqueia SSRF — ${url}`, () => {
    assertEquals(isSafeHttpsUrl(url), false);
  });
}

Deno.test("SEC-4: zapp-n8n-sync baseUrl normalizado HTTPS público legítimo passa", () => {
  assertEquals(isSafeHttpsUrl("https://n8n.atomicabr.com.br"), true);
});

// ---- email-imap-bridge config.{imap_host,smtp_host} -----------------------

const EmailImapSchema = CONTRACT_SCHEMAS["email-imap-bridge"].v1;

for (const host of PRIVATE_HOSTS) {
  Deno.test(`SEC-4: email-imap-bridge config.imap_host bloqueia SSRF — ${host}`, () => {
    const result = EmailImapSchema.safeParse({
      action: "saveCredentials",
      config: { email: "a@b.com", imap_host: host, smtp_host: "smtp.gmail.com" },
    });
    assertEquals(result.success, false);
  });

  Deno.test(`SEC-4: email-imap-bridge config.smtp_host bloqueia SSRF — ${host}`, () => {
    const result = EmailImapSchema.safeParse({
      action: "saveCredentials",
      config: { email: "a@b.com", imap_host: "imap.gmail.com", smtp_host: host },
    });
    assertEquals(result.success, false);
  });
}

Deno.test("SEC-4: email-imap-bridge config com hosts públicos legítimos passa", () => {
  const result = EmailImapSchema.safeParse({
    action: "saveCredentials",
    config: { email: "a@b.com", imap_host: "imap.gmail.com", smtp_host: "smtp.gmail.com" },
  });
  assertEquals(result.success, true);
});

Deno.test("SEC-4: isSafeHost — cobertura direta do helper (IPv6 privado)", () => {
  assertEquals(isSafeHost("::1"), false);
  assertEquals(isSafeHost("fe80::1"), false);
  assertEquals(isSafeHost("imap.gmail.com"), true);
});
