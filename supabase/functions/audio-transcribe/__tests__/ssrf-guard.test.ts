/**
 * SSRF guard tests — audio-transcribe isSafeAudioUrl + fetchAudioWithCap.
 *
 * O guard é INLINE no index.ts (não exportado) — padrão do repo: re-declarar
 * o espelho fiel + ancorar a fonte com readSourceFrom (se o index.ts regredir
 * o guard, a âncora quebra). Restaura os 36 vetores do security-simulations
 * apagado em a7d5efe67 (follow-up validação Claude #783).
 *
 * Rodar: deno test --allow-net --allow-env --allow-read supabase/functions/audio-transcribe/__tests__/ssrf-guard.test.ts
 */

import { assertEquals, assertMatch } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { readSourceFrom } from "../../_shared/test-helpers.ts";

const SOURCE = await readSourceFrom(import.meta.url, "../index.ts");

// ─── Espelho fiel do isSafeAudioUrl do index.ts (v2.3) ───────────────────────
function isSafeAudioUrl(raw: string): boolean {
  let parsed: URL;
  try { parsed = new URL(raw); } catch { return false; }
  if (parsed.protocol !== 'https:') return false;
  // REALIDADE do Deno: hostname IPv6 vem COM colchetes ('[::1]') — strip antes
  // de testar (fix v2.3.1, validação Claude #783: o v2.2 NUNCA bloqueava IPv6).
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '0.0.0.0' ||
    /^127\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host.startsWith('::') ||
    /^fe[89ab][0-9a-f]:/i.test(host) ||
    /^fec[0-9a-f]:/i.test(host) ||
    /^f[cd][0-9a-f]{2}:/i.test(host)
  ) return false;
  return true;
}

// ─── Âncora: o guard continua no index.ts (remoção silenciosa quebra o CI) ──

Deno.test("SSRF: isSafeAudioUrl e redirect:'error' estão no index.ts", () => {
  assertMatch(SOURCE, /function isSafeAudioUrl/);
  assertMatch(SOURCE, /redirect: 'error'/);
  assertMatch(SOURCE, /parsed\.protocol !== 'https:'/);
  assertMatch(SOURCE, /169\\.254/);
});

// ─── Vetores: URLs SEGURAS (devem passar) ────────────────────────────────────

Deno.test("SSRF: https público aceito", () => {
  assertEquals(isSafeAudioUrl("https://cdn.example.com/audio.wav"), true);
  assertEquals(isSafeAudioUrl("https://storage.googleapis.com/x/a.mp3"), true);
  assertEquals(isSafeAudioUrl("https://supabase.atomicabr.com.br/storage/v1/object/public/a.mp3"), true);
  assertEquals(isSafeAudioUrl("https://router.huggingface.co/a.wav"), true);
});

// ─── Vetores: protocolo / malformado (devem falhar) ──────────────────────────

Deno.test("SSRF: protocolo não-https bloqueado", () => {
  assertEquals(isSafeAudioUrl("http://example.com/a.wav"), false);
  assertEquals(isSafeAudioUrl("ftp://example.com/a.wav"), false);
  assertEquals(isSafeAudioUrl("file:///etc/passwd"), false);
  assertEquals(isSafeAudioUrl("gopher://internal:70/x"), false);
});

Deno.test("SSRF: URL malformada bloqueada", () => {
  assertEquals(isSafeAudioUrl("not-a-url"), false);
  assertEquals(isSafeAudioUrl(""), false);
  assertEquals(isSafeAudioUrl("https://"), false);
});

// ─── Vetores: loopback / local / privado / metadata (devem falhar) ───────────

Deno.test("SSRF: localhost e loopback bloqueados", () => {
  assertEquals(isSafeAudioUrl("https://localhost/a.wav"), false);
  assertEquals(isSafeAudioUrl("https://sub.localhost/a.wav"), false);
  assertEquals(isSafeAudioUrl("https://127.0.0.1/a.wav"), false);
  assertEquals(isSafeAudioUrl("https://127.0.0.2:8080/a.wav"), false);
  assertEquals(isSafeAudioUrl("https://0.0.0.0/a.wav"), false);
});

Deno.test("SSRF: metadata cloud bloqueado (169.254.x)", () => {
  assertEquals(isSafeAudioUrl("https://169.254.169.254/latest/meta-data/"), false);
  assertEquals(isSafeAudioUrl("https://169.254.169.254/computeMetadata/v1/"), false);
  assertEquals(isSafeAudioUrl("https://169.254.170.2/a"), false);
});

Deno.test("SSRF: RFC1918 privado bloqueado", () => {
  assertEquals(isSafeAudioUrl("https://10.0.0.1/a.wav"), false);
  assertEquals(isSafeAudioUrl("https://10.255.255.255/a"), false);
  assertEquals(isSafeAudioUrl("https://192.168.1.1/a"), false);
  assertEquals(isSafeAudioUrl("https://192.168.0.254/a"), false);
  // 172.16–172.31 (mas não 172.32+)
  assertEquals(isSafeAudioUrl("https://172.16.0.1/a"), false);
  assertEquals(isSafeAudioUrl("https://172.31.255.255/a"), false);
  assertEquals(isSafeAudioUrl("https://172.32.0.1/a"), true);
  assertEquals(isSafeAudioUrl("https://172.15.0.1/a"), true);
});

Deno.test("SSRF: IPv6 loopback/link-local/ULA bloqueado", () => {
  assertEquals(isSafeAudioUrl("https://[::1]/a.wav"), false);
  assertEquals(isSafeAudioUrl("https://[::]/a.wav"), false);
  assertEquals(isSafeAudioUrl("https://[fe80::1]/a.wav"), false);
  assertEquals(isSafeAudioUrl("https://[febf::1]/a.wav"), false);
  assertEquals(isSafeAudioUrl("https://[fec0::1]/a.wav"), false);
  assertEquals(isSafeAudioUrl("https://[fc00::1]/a.wav"), false);
  assertEquals(isSafeAudioUrl("https://[fd12:3456::1]/a.wav"), false);
});

// ─── Vetores: bypass com DNS tricks (devem falhar) ───────────────────────────

Deno.test("SSRF: DNS trick com prefixo perigoso é bloqueado (regex de prefixo)", () => {
  // REALIDADE: os regex de prefixo (^169\.254\. etc.) casam no hostname
  // literal — '169.254.169.254.nip.io' COMEÇA com '169.254.' → BLOQUEADO.
  assertEquals(isSafeAudioUrl("https://169.254.169.254.nip.io/a"), false);
  assertEquals(isSafeAudioUrl("https://127.0.0.1.nip.io/a"), false);
  // notação alternativa de IP: '0x7f000001' NÃO casa '^127\.' → passa
  // (limitação real do guard, documentada — mitigado por redirect:'error' + cap)
  assertEquals(isSafeAudioUrl("https://0x7f000001.nip.io/a"), true);
});

Deno.test("SSRF: fix v2.3.1 — IPv6 com colchetes é bloqueado (gap do v2.2)", () => {
  // O v2.2 usava host.startsWith('::') sem strip de colchetes — como o Deno
  // devolve '[::1]', NENHUM IPv6 era bloqueado. O fix normaliza antes.
  assertEquals(isSafeAudioUrl("https://[::1]/a.wav"), false);
  assertEquals(isSafeAudioUrl("https://[::]/a.wav"), false);
  assertEquals(isSafeAudioUrl("https://[fe80::1]/a.wav"), false);
  assertEquals(isSafeAudioUrl("https://[fc00::1]/a.wav"), false);
});

// ─── Limitações documentadas (comportamento REAL) ────────────────────────────

Deno.test("SSRF: subdomínio com 169.254 no NOME passa (hostname não-IP)", () => {
  // isSafeAudioUrl só checa hostname — um host com 169.254 no nome (não no IP)
  // passa; o risco real é de resolução DNS, mitigado pelo redirect:'error'.
  assertEquals(isSafeAudioUrl("https://169-254-169-254.example.com/a"), true);
});
