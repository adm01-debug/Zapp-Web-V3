#!/usr/bin/env node
/**
 * build-patches.mjs — v2 (Plano B, bundle esbuild 0.27/tsup 8.5.1)
 * Porta BUILD-TIME do logpatch.cjs (stack 25 / config evolution_logpatch_t4_cjs).
 *
 * Aplica os patches T1-T6 no bundle ORIGINAL /evolution/dist/main.js da
 * Evolution API 2.3.7 e gera main.patched.js — o bundle copiado pela imagem
 * custom (Dockerfile.evolution-custom).
 *
 * v2: targets ADAPTADOS aos literais reais do bundle gerado com o lockfile da
 * tag 2.3.7 (esbuild 0.27.0/tsup 8.5.1 — NÃO é o bundle da imagem oficial de
 * 2025-12-05, que usava esbuild da época: _l/Nl/Lr/Br viraram Vh/qh/zl/Xl e o
 * T1 mudou de forma). Determinismo esbuild garante os mesmos nomes no CI.
 *
 * v3 (2026-08-06): a premissa de determinismo falhou — o build LOCAL do Plano B
 * (AG-EX-11) usou toolchain driftada e produziu nomes Vh/qh/zl/Xl; o bundle do
 * CI (npm ci + lockfile da tag 2.3.7 + fallback npx tsup) produz os NOMES
 * OFICIAIS (_l/Nl/Lr/Br) e o literal "messages.upsert" (não O.MESSAGES_UPSERT).
 * ALVO = bundle do CI (fonte da verdade da imagem publicada). Se o CI mudar de
 * toolchain, o modo fail-closed (T3/T6) aborta em vez de publicar bundle ruim.
 *
 * T1  remove console.log(p) antes de sendDataWebhook(O.MESSAGES_UPSERT,p)
 * T2  remove console.log("stanza",JSON.stringify(e)),      [TOLERANTE]
 * T3  Sentry: tracesSampleRate 0.05 / profilesSampleRate 0 / beforeSend
 *     filtra 401, 403, DEVICE_REMOVED, "Request failed with status code
 *     401/403" e makeBucket                                  [ESTRITO]
 * T4  prepend do prologue t4_prologue.cjs v2 (LGPD masking: apikey + conversation +
 *       pushName + remoteJid + agentId + WebMessageInfo — etapa-91 2026-08-08)
 * T5a remove console.log("CACHE:",...) de mensagens        [TOLERANTE]
 * T6  GET / mascara a versão ("2.x" no lugar da real) — F2-21 [ESTRITO]
 * libsignal/src/session_record.js: remove console.info/warn de sessões
 * (patch no Dockerfile, mesma dep git nas versões do baileys).
 *
 * MODOS:
 *  - ESTRITO (T3, T6): count == 1 obrigatório; count != 1 aborta. Críticos
 *    (Sentry flood / máscara de versão) — nunca publicar sem eles.
 *  - TOLERANTE (T1, T2, T5a): count == 0 → SKIP com warn explícito; count > 1
 *    → FAIL (ambiguidade nunca aplica); count == 1 → aplica. NUNCA produz
 *    bundle parcial.
 *
 * Uso:
 *   node build-patches.mjs [main.js] [main.patched.js] [t4_prologue.cjs] [versao]
 *   (defaults: ./main.js ./main.patched.js ./t4_prologue.cjs "2.3.7")
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const USAGE = `Uso: node build-patches.mjs [main.js] [main.patched.js] [t4_prologue.cjs] [versao]
(defaults: ./main.js ./main.patched.js ./t4_prologue.cjs "2.3.7")`;

if (process.argv.includes("-h") || process.argv.includes("--help")) {
  console.log(USAGE);
  process.exit(0);
}

const [srcArg, outArg, prologueArg, versionArg] = process.argv.slice(2);
const SRC = path.resolve(srcArg ?? "main.js");
const OUT = path.resolve(outArg ?? "main.patched.js");
const PROLOGUE = path.resolve(prologueArg ?? "t4_prologue.cjs");
const VERSION = versionArg ?? "2.3.7";

const fail = (msg) => {
  console.error(`[FAIL-CLOSED] ${msg}`);
  process.exit(1);
};
const warn = (msg) => console.warn(`[TOLERANT] ${msg}`);
const countOf = (haystack, needle) => haystack.split(needle).length - 1;
const sha256 = (p) =>
  crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");

// ============ Targets (literais REAIS do bundle CI — esbuild lockfile 2.3.7) =
// T1: console.log(c) antes do webhook messages.upsert (TOLERANTE — v3: literal "messages.upsert")
const T1 = 'console.log(c),this.sendDataWebhook("messages.upsert",c)';
const R1 = 'this.sendDataWebhook("messages.upsert",c)';
// T2: log de stanza (TOLERANTE)
const T2 = 'console.log("stanza",JSON.stringify(e)),';
// T3: init do Sentry (ESTRITO — nomes oficiais Lr/Br)
const T3O = 'Lr.DSN&&Br.init({dsn:Lr.DSN,environment:process.env.NODE_ENV||"development",tracesSampleRate:1,profilesSampleRate:1})';
const T3N = 'Lr.DSN&&Br.init({dsn:Lr.DSN,environment:"production",tracesSampleRate:0.05,profilesSampleRate:0,beforeSend:(event,hint)=>{try{const e=hint&&hint.originalException;if(e){if(e.response&&[401,403].includes(e.response.status))return null;if(e.message&&(e.message.includes("DEVICE_REMOVED")||e.message.includes("Request failed with status code 401")||e.message.includes("status code 403")||e.message.includes("makeBucket")))return null;}}catch(_){}return event;}})';
// T5a: log de cache de mensagens (TOLERANTE — nomes oficiais a/r/n/c)
const T5_COND = 'console.log("CACHE:",{cached:a,updateKey:r,messageTimestamp:n.messageTimestamp,secondsSinceEpoch:c}),n.messageTimestamp&&';
// T6: GET / mascara a versão real (F2-21) — ESTRITO (nomes oficiais _l/Nl)
const T6O = 'version:_l.version,clientName:Nl.CONNECTION.CLIENT_NAME';
const T6N = 'version:"2.x",clientName:Nl.CONNECTION.CLIENT_NAME';

// ============================= Execução =============================
if (!fs.existsSync(SRC)) {
  fail(`main.js original não encontrado: ${SRC} (extraia com: docker create + docker cp)`);
}

let out = fs.readFileSync(SRC, "utf8");
const applied = [];
const skipped = [];

// --- T1 (TOLERANTE) ---
{
  const c = countOf(out, T1);
  if (c === 0) {
    warn(`T1: target ausente (webhook log) — provavelmente removido/renomeado no bundle; seguindo sem este patch`);
    skipped.push("T1");
  } else if (c !== 1) {
    fail(`T1: target encontrado ${c}x (esperado 0 ou 1x) — ambiguidade nunca aplica`);
  } else {
    out = out.split(T1).join(R1);
    applied.push("T1");
  }
}

// --- T2 (TOLERANTE) ---
{
  const c = countOf(out, T2);
  if (c === 0) {
    warn(`T2: target ausente (stanza log) — seguindo sem este patch`);
    skipped.push("T2");
  } else if (c !== 1) {
    fail(`T2: target encontrado ${c}x (esperado 0 ou 1x) — ambiguidade nunca aplica`);
  } else {
    out = out.split(T2).join("");
    applied.push("T2");
  }
}

// --- T3 (ESTRITO — Sentry) ---
{
  const c = countOf(out, T3O);
  if (c !== 1) fail(`T3: init original do Sentry encontrado ${c}x (esperado 1x) — bundle mudou?`);
  out = out.split(T3O).join(T3N);
  applied.push("T3");
}

// --- T5a (TOLERANTE) ---
{
  const c = countOf(out, T5_COND);
  if (c === 0) {
    warn(`T5a: target ausente (CACHE log) — seguindo sem este patch`);
    skipped.push("T5a");
  } else if (c !== 1) {
    fail(`T5a: console.log("CACHE:...") encontrado ${c}x (esperado 0 ou 1x) — ambiguidade nunca aplica`);
  } else {
    out = out.split(T5_COND).join("");
    applied.push("T5a");
  }
}

// --- T6 (ESTRITO — máscara de versão F2-21) ---
{
  const c = countOf(out, T6O);
  if (c !== 1) fail(`T6: literal da rota raiz (version:Vh.version) encontrado ${c}x (esperado 1x) — bundle mudou?`);
  out = out.split(T6O).join(T6N);
  applied.push("T6");
}

// --- T4 (prologue MASKED) ---
if (!fs.existsSync(PROLOGUE)) {
  fail(`t4_prologue.cjs não encontrado: ${PROLOGUE} — extrair da config swarm evolution_t4_prologue_cjs e versionar ao lado do script`);
}
const prologue = fs.readFileSync(PROLOGUE, "utf8");
if (prologue.length <= 50) {
  fail(`T4: prologue com ${prologue.length} bytes (esperado > 50) — arquivo errado?`);
}
if (!prologue.includes("MASKED")) {
  fail('T4: prologue não contém o marcador "MASKED" — arquivo errado?');
}
out = prologue + "\n" + out;
applied.push("T4");

// Banner determinístico de auditoria (qual bundle base gerou este artefato)
const srcSha = sha256(SRC);
out = `/* evolution-api-custom ${VERSION} | patches T1-T6 build-time | base main.js sha256:${srcSha} */\n` + out;

fs.writeFileSync(OUT, out);

// ===================== Verificação pós-escrita (fail-closed) =====================
const check = fs.readFileSync(OUT, "utf8");
if (countOf(check, T1) !== 0) fail("pós-verificação T1 falhou");
if (countOf(check, T2) !== 0) fail("pós-verificação T2 falhou");
if (check.includes("tracesSampleRate:1,profilesSampleRate:1") || !check.includes("tracesSampleRate:0.05")) fail("pós-verificação T3 falhou");
if (!check.includes("MASKED")) fail("pós-verificação T4 v2 falhou: marcador MASKED ausente");
// T4 v2 LGPD markers
if (!check.includes("pushName")) fail("pós-verificação T4 v2 falhou: pushName mask ausente");
if (!check.includes("conversation")) fail("pós-verificação T4 v2 falhou: conversation mask ausente");
if (!check.includes("WebMessageInfo")) fail("pós-verificação T4 v2 falhou: WebMessageInfo mask ausente");
if (countOf(check, T5_COND) !== 0) fail("pós-verificação T5a falhou");
if (countOf(check, T6O) !== 0) fail("pós-verificação T6 falhou");
if (countOf(check, T6N) !== 1) fail("pós-verificação T6: literal mascarado ausente/ambíguo");

console.log(`Patches aplicados: ${applied.join(", ")}${skipped.length ? ` | SKIP (tolerante): ${skipped.join(", ")}` : ""}`);
console.log(`Versão do bundle:  ${VERSION}`);
console.log(`Original: ${SRC} (${fs.statSync(SRC).size} bytes, sha256 ${srcSha})`);
console.log(`Bundle:   ${OUT} (${fs.statSync(OUT).size} bytes, sha256 ${sha256(OUT)})`);
