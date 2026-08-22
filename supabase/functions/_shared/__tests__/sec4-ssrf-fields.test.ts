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

// ─── Auditoria pós-Bloco 6 (2026-08-21) — 2 bypasses confirmados por ────────
// reprodução real e corrigidos: trailing dot (CRITICAL, explorável via o
// fetch() já ativo em transcribe-audio-internal) e notação numérica de IP
// em isSafeHost (MEDIUM, sem sink de rede ativo hoje, mas fecha a lacuna
// antes de existir um).

Deno.test("SEC-4 (CRITICAL): trailing dot não deve contornar o bloqueio de localhost", () => {
  assertEquals(isSafeHttpsUrl("https://localhost./x"), false);
  assertEquals(isSafeHttpsUrl("https://LOCALHOST./x"), false);
  assertEquals(isSafeHost("localhost."), false);
  assertEquals(isSafeHost("LOCALHOST."), false);
  assertEquals(isSafeHost("127.0.0.1."), false);
});

Deno.test("SEC-4: espaços de borda no host não devem contornar o bloqueio", () => {
  assertEquals(isSafeHost(" localhost"), false);
  assertEquals(isSafeHost("localhost "), false);
});

Deno.test("SEC-4 (MEDIUM): isSafeHost bloqueia notação alternativa de 127.0.0.1/0.0.0.0", () => {
  assertEquals(isSafeHost("2130706433"), false); // decimal
  assertEquals(isSafeHost("0x7f000001"), false); // hex
  assertEquals(isSafeHost("0177.0.0.1"), false); // octal
  assertEquals(isSafeHost("0"), false); // forma curta de 0.0.0.0
});

Deno.test("SEC-4: isSafeHost aceita IPv6 público bare (host legítimo sem colchetes)", () => {
  assertEquals(isSafeHost("2606:4700:4700::1111"), true);
});

Deno.test("SEC-4: host malformado (não forma URL válida) é rejeitado, não presumido seguro", () => {
  assertEquals(isSafeHost("["), false);
  assertEquals(isSafeHost(""), false);
});

// ─── Auditoria de re-verificação (segunda rodada, 5 especialistas) — gap ────
// CONFIRMED: mecanismos de transição IPv6<->IPv4 (NAT64, 6to4, Teredo)
// embutem um IPv4 arbitrário fora dos prefixos já bloqueados (::, fe80::/10,
// fec0::/10, fc00::/7). Reproduzido com deno run contra o código real: em
// topologias com gateway NAT64/6to4/Teredo, esses literais alcançam o IPv4
// embutido — incluindo o endpoint de metadata cloud (169.254.169.254) e
// loopback (127.0.0.1) — contornando o guard.

Deno.test("SEC-5 (HIGH): NAT64 (64:ff9b::/96) embutindo IPv4 privado/loopback é bloqueado", () => {
  assertEquals(isSafeHost("64:ff9b::a9fe:a9fe"), false); // embute 169.254.169.254
  assertEquals(isSafeHost("64:ff9b::7f00:1"), false); // embute 127.0.0.1
  assertEquals(isSafeHttpsUrl("https://[64:ff9b::a9fe:a9fe]/x"), false);
  assertEquals(isSafeHttpsUrl("https://[64:ff9b::7f00:1]/x"), false);
});

Deno.test("SEC-5 (HIGH): 6to4 (2002::/16) embutindo IPv4 privado/loopback é bloqueado", () => {
  assertEquals(isSafeHost("2002:a9fe:a9fe::"), false); // embute 169.254.169.254
  assertEquals(isSafeHost("2002:7f00:1::"), false); // embute 127.0.0.1
  assertEquals(isSafeHttpsUrl("https://[2002:a9fe:a9fe::]/x"), false);
  assertEquals(isSafeHttpsUrl("https://[2002:7f00:1::]/x"), false);
});

Deno.test("SEC-5 (HIGH): Teredo (2001:0000::/32) com cliente ofuscado apontando pra loopback é bloqueado", () => {
  // Cliente 127.0.0.1 ofuscado por XOR com 0xffffffff = 128.255.255.254 = 80ff:fffe
  assertEquals(isSafeHost("2001:0000:4136:e378:8000:63bf:80ff:fffe"), false);
  assertEquals(isSafeHttpsUrl("https://[2001:0000:4136:e378:8000:63bf:80ff:fffe]/x"), false);
});

Deno.test("SEC-5: NAT64/6to4 com IPv4 embutido público não geram falso positivo", () => {
  assertEquals(isSafeHost("64:ff9b::808:404"), true); // NAT64 embutindo 8.8.4.4 (público)
  assertEquals(isSafeHttpsUrl("https://[2002:808:404::]/x"), true); // 6to4 embutindo 8.8.4.4
});

Deno.test("SEC-5: NAT64/6to4/Teredo não afetam host IPv6 público comum", () => {
  assertEquals(isSafeHost("2001:4860:4860::8888"), true); // Google DNS público (não é 2001:0000::/32)
  assertEquals(isSafeHttpsUrl("https://[2606:4700:4700::1111]/x"), true); // Cloudflare DNS
});
