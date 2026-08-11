#!/usr/bin/env node
/**
 * build-patches.mjs — v8 (Plano B, bundle esbuild 0.27/tsup 8.5.1)
 * Porta BUILD-TIME do logpatch.cjs (stack 25 / config evolution_logpatch_t4_cjs).
 *
 * v4 (2026-08-10): adiciona T8-T14 — correções da auditoria evolution (onda 5):
 *   T8  guard SAVE_DATA.MESSAGE_UPDATE no fluxo de EDIÇÃO (MU EDITED)     [ESTRITO]
 *   T9  guard SAVE_DATA.MESSAGE_UPDATE no deleteMessage lógico            [ESTRITO]
 *   T10 guard SAVE_DATA.MESSAGE_UPDATE no revoke (messages.update DELETED) [ESTRITO]
 *   T11 instanceId no findFirst do deleteMessage (bug multi-instância)    [ESTRITO]
 *   T12 CANCELADO: console.log(c) não existe no main.js (só no dist/api
 *       resquício do tsc — runtime é o bundle). T4 prologue já mascara.   [NO-OP]
 *   T13a S3: return→continue no messages.upsert (vídeo com SAVE_VIDEO=false
 *       abortava o batch inteiro — doc §3.1.1)                            [ESTRITO]
 *   T13b S3: return→continue no messages.upsert (!media válida)           [ESTRITO]
 *       (sendMessageWithTyping NÃO recebe continue — não há loop; mantido)
 *   T14 fetchChats: "Chat"."name" as "pushName" → "chatName" (2ª coluna
 *       sobrescrevia o CASE do Contact.pushName no node-postgres)         [ESTRITO]
 *
 * v5 (2026-08-10): adiciona T15-T18 — ingestão e edição (onda 6):
 *   T15 dedup no messages.upsert: findFirst por key->>'id' + instanceId
 *       ANTES do message.create (duplicatas (instanceId,key->>'id') eram
 *       aceitas pelo banco — causa-raiz 2026-08-10; catch engolia P2002)  [ESTRITO]
 *   T16 instanceId no findFirst do updateMessage (edição via app usava
 *       só key id — mesmo padrão do bug que o T11 corrigiu no delete)     [ESTRITO]
 *   T17 remoteJidAlt via signalRepository.lidMapping.getPNForLID quando
 *       key.remoteJid contém "@lid" e remoteJidAlt ausente (regressão
 *       remoteJidAlt 07/08 — mitigação documentada) — try/catch, nunca
 *       quebra a ingestão                                               [ESTRITO]
 *   T18 poda de bloat no prepareMessage: remove jpegThumbnail/waveform dos
 *       sub-objetos de mídia (image/video/sticker/audio/document/ptv +
 *       ephemeral/viewOnce) — mantém mediaKey/fileSha256/fileEncSha256/
 *       messageSecret (download/descriptografia)                          [ESTRITO]
 *
 * v6 (2026-08-10): adiciona T19 — remoteJidAlt via senderPn (Baileys 6.7.24):
 *   O Baileys 6.7.24 entrega senderPn no key (validado em runtime: 24 msgs
 *   @lid com senderPn nas últimas 2h, remoteJidAlt 0) e o T17 (getPNForLID)
 *   não produziu remoteJidAlt (lidMapping vazio no fork). T19 estende o bloco
 *   T17 no messages.upsert com fallback triplo: senderPn → getPNForLID (T17)
 *   → nada. Tudo em try/catch — nunca quebra a ingestão.              [ESTRITO]
 *   TEST_MODE agora também cobre T8-T20 (skip quando o literal NOVO já está
 *   presente) — permite validar o script contra o bundle JÁ patcheado.
 *
 * v8 (2026-08-11): adiciona T20b — appStateMacVerification:"strict" no
 *   socketConfig do makeWASocket (Baileys 6.7.24): o campo não é declarado
 *   (default da lib {patch:false,snapshot:false} = MACs NÃO validados). A
 *   string "strict" ativa a validação via default validateMacs=true de
 *   decodeSyncdSnapshot/decodePatches (chats.js lê .snapshot/.patch = undefined
 *   → default true). Falha de MAC → catch do fluxo de sync → resync do zero,
 *   nunca derruba a conexão. Inserido ANTES de markOnlineOnConnect (após o
 *   spread `...o`), prevalece sobre options do usuário.              [ESTRITO]
 *
 * MODOS:
 *  - ESTRITO: count == 1 obrigatório; count != 1 aborta (fail-closed).
 *  - TOLERANTE (T1, T2, T5a): count == 0 → SKIP com warn; count > 1 → FAIL.
 *  - TEST_MODE=1: T3/T6/T7/T4 e T8-T20b viram SKIP quando o literal NOVO já
 *    está presente (para validar contra bundle que JÁ recebeu os patches —
 *    teste local; no CI o modo normal vale).
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

const TEST_MODE = process.env.TEST_MODE === "1";

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
// T1: console.log(c) antes do webhook messages.upsert (TOLERANTE — v3)
const T1 = 'console.log(c),this.sendDataWebhook("messages.upsert",c)';
const R1 = 'this.sendDataWebhook("messages.upsert",c)';
// T2: log de stanza (TOLERANTE)
const T2 = 'console.log("stanza",JSON.stringify(e)),';
// T3: init do Sentry (ESTRITO — nomes oficiais Lr/Br)
const T3O = 'Lr.DSN&&Br.init({dsn:Lr.DSN,environment:process.env.NODE_ENV||"development",tracesSampleRate:1,profilesSampleRate:1})';
const T3N = 'Lr.DSN&&Br.init({dsn:Lr.DSN,environment:"production",tracesSampleRate:0.05,profilesSampleRate:0,beforeSend:(event,hint)=>{try{const e=hint&&hint.originalException;if(e){if(e.response&&[401,403].includes(e.response.status))return null;if(e.message&&(e.message.includes("DEVICE_REMOVED")||e.message.includes("Request failed with status code 401")||e.message.includes("status code 403")||e.message.includes("makeBucket")))return null;}}catch(_){}return event;}})';
// T5a: log de cache de mensagens (TOLERANTE)
const T5_COND = 'console.log("CACHE:",{cached:a,updateKey:r,messageTimestamp:n.messageTimestamp,secondsSinceEpoch:c}),n.messageTimestamp&&';
// T6: GET / mascara a versão real (F2-21) — ESTRITO
const T6O = 'version:_l.version,clientName:Nl.CONNECTION.CLIENT_NAME';
const T6N = 'version:"2.x",clientName:Nl.CONNECTION.CLIENT_NAME';
// T7: CORS sem-Origin permitido (etapa 81) — ESTRITO
const T7O = 'origin(r,a){let{ORIGIN:c}=E.get("CORS");return c.includes("*")||c.indexOf(r)!==-1?a(null,!0):a(new Error("Not allowed by CORS"))}';
const T7N = 'origin(r,a){let{ORIGIN:c}=E.get("CORS");return !r||c.includes("*")||c.indexOf(r)!==-1?a(null,!0):a(new Error("Not allowed by CORS"))}';

// ============ T8-T14 (v4 — auditoria 2026-08-10, literais validados no main.js da imagem 66bb579a) =
// T8: guard MESSAGE_UPDATE no fluxo de EDIÇÃO (MU EDITED) — ESTRITO
const T8O = 'await this.prismaRepository.messageUpdate.create({data:{fromMe:r.key.fromMe,keyId:r.key.id,remoteJid:r.key.remoteJid,status:"EDITED",instanceId:this.instanceId,messageId:h.id}})';
const T8N = 'this.configService.get("DATABASE").SAVE_DATA.MESSAGE_UPDATE&&await this.prismaRepository.messageUpdate.create({data:{fromMe:r.key.fromMe,keyId:r.key.id,remoteJid:r.key.remoteJid,status:"EDITED",instanceId:this.instanceId,messageId:h.id}})';
// T9: guard MESSAGE_UPDATE no deleteMessage lógico — ESTRITO
const T9O = 'await this.prismaRepository.messageUpdate.create({data:a})';
const T9N = 'this.configService.get("DATABASE").SAVE_DATA.MESSAGE_UPDATE&&await this.prismaRepository.messageUpdate.create({data:a})';
// T10: guard MESSAGE_UPDATE no revoke (messages.update, message===null) — ESTRITO
const T10O = 'participant:a?.remoteJid,status:"DELETED",instanceId:this.instanceId};await this.prismaRepository.messageUpdate.create({data:u})';
const T10N = 'participant:a?.remoteJid,status:"DELETED",instanceId:this.instanceId};this.configService.get("DATABASE").SAVE_DATA.MESSAGE_UPDATE&&await this.prismaRepository.messageUpdate.create({data:u})';
// T11: instanceId no findFirst do deleteMessage (bug multi-instância) — ESTRITO
const T11O = 'findFirst({where:{key:{path:["id"],equals:o}}})';
const T11N = 'findFirst({where:{instanceId:this.instanceId,key:{path:["id"],equals:o}}})';
// T13a: S3 vídeo SAVE_VIDEO=false — return→continue no messages.upsert — ESTRITO
const T13aO = '{this.logger.warn("Video upload is disabled. Skipping video upload.");return}';
const T13aN = '{this.logger.warn("Video upload is disabled. Skipping video upload.");continue}';
// T13b: S3 !media válida — return→continue no messages.upsert — ESTRITO
const T13bO = 'if(!D){this.logger.verbose("No valid media to upload (messageContextInfo only), skipping MinIO");return}';
const T13bN = 'if(!D){this.logger.verbose("No valid media to upload (messageContextInfo only), skipping MinIO");continue}';
// T14: fetchChats CTE — 2ª coluna pushName (Chat.name) sobrescrevia o CASE — ESTRITO
const T14O = '"Chat"."name" as "pushName",';
const T14N = '"Chat"."name" as "chatName",';

// ============ T15-T18 (v5 — ingestão/edição, literais validados no main.js da imagem 6f78bb0d, sha256 280ed0af) =
// T15: dedup no messages.upsert — findFirst key->>'id'+instanceId antes do create — ESTRITO
const T15O = 'let{pollUpdates:h,...g}=c,f=await this.prismaRepository.message.create({data:g})';
const T15N = 'let{pollUpdates:h,...g}=c,keyIdV=g?.key?.id;if(keyIdV&&await this.prismaRepository.message.findFirst({where:{instanceId:this.instanceId,key:{path:["id"],equals:keyIdV}}}))continue;let f=await this.prismaRepository.message.create({data:g})';
// T16: instanceId no findFirst do updateMessage (edição via app) — ESTRITO
const T16O = 'let c=await this.prismaRepository.message.findFirst({where:{key:{path:["id"],equals:a}}});if(!c)throw new F("Message not found")';
const T16N = 'let c=await this.prismaRepository.message.findFirst({where:{instanceId:this.instanceId,key:{path:["id"],equals:a}}});if(!c)throw new F("Message not found")';
// T17: remoteJidAlt via lidMapping quando key.remoteJid tem @lid e Alt ausente — ESTRITO
const T17O = 'let c=this.prepareMessage(n)';
const T17N = 'let c=this.prepareMessage(n);try{if(c?.key?.remoteJid?.includes("@lid")&&!c.key.remoteJidAlt){let lidPn=await this.client.signalRepository.lidMapping.getPNForLID(c.key.remoteJid);if(typeof lidPn==="string"&&lidPn.includes("@s.whatsapp.net"))c.key.remoteJidAlt=lidPn}}catch{}';
// T18: poda de bloat no prepareMessage — remove jpegThumbnail/waveform dos sub-objetos de mídia — ESTRITO
const T18O = 'source:(0,R.getDevice)(e.key.id)};!i.status&&e.key.fromMe===!1&&(i.status=ie[3])';
const T18N = 'source:(0,R.getDevice)(e.key.id)};const mt=["imageMessage","videoMessage","stickerMessage","audioMessage","documentMessage","ptvMessage"],ep=i.message?.ephemeralMessage?.message||i.message?.viewOnceMessage?.message;for(let mi=0;mi<mt.length;mi++){if(i.message[mt[mi]]?.jpegThumbnail)delete i.message[mt[mi]].jpegThumbnail;if(i.message[mt[mi]]?.waveform)delete i.message[mt[mi]].waveform;if(ep?.[mt[mi]]?.jpegThumbnail)delete ep[mt[mi]].jpegThumbnail;if(ep?.[mt[mi]]?.waveform)delete ep[mt[mi]].waveform};!i.status&&e.key.fromMe===!1&&(i.status=ie[3])';

// ============ T19 (v6 — remoteJidAlt via senderPn, Baileys 6.7.24; literais validados no bundle 72b5524f) =
// T19: fallback triplo senderPn → getPNForLID (T17) → nada. O Baileys 6.7.24
// entrega senderPn no key (runtime validado: 24 msgs @lid com senderPn nas
// últimas 2h, remoteJidAlt 0) e o T17 isolado não produziu remoteJidAlt
// (lidMapping vazio no fork). Alvo = bloco T17 já aplicado (T17N); T19N
// preserva o getPNForLID como fallback no else, mas NÃO contém T17N como
// substring (o `{` diverge — T17N é consumido). Tudo em try/catch — ESTRITO
const T19O = 'let c=this.prepareMessage(n);try{if(c?.key?.remoteJid?.includes("@lid")&&!c.key.remoteJidAlt){let lidPn=await this.client.signalRepository.lidMapping.getPNForLID(c.key.remoteJid);if(typeof lidPn==="string"&&lidPn.includes("@s.whatsapp.net"))c.key.remoteJidAlt=lidPn}}catch{}';
const T19N = 'let c=this.prepareMessage(n);try{if(c?.key?.remoteJid?.includes("@lid")&&!c.key.remoteJidAlt){if(typeof c.key.senderPn==="string"&&c.key.senderPn.includes("@s.whatsapp.net"))c.key.remoteJidAlt=c.key.senderPn;else{let lidPn=await this.client.signalRepository.lidMapping.getPNForLID(c.key.remoteJid);if(typeof lidPn==="string"&&lidPn.includes("@s.whatsapp.net"))c.key.remoteJidAlt=lidPn}}}catch{}';

// ============ T20 (v7 — cache TTL fix, literal validado no main.js da imagem 03ac2a5d) =
// T20: userDevicesCache stdTTL 3e5 (83h) → 300s + msgRetryCounterCache sem TTL → 3600s — ESTRITO
const T20O = 'this.msgRetryCounterCache=new er.default;this.userDevicesCache=new er.default({stdTTL:3e5,useClones:!1})';
const T20N = 'this.msgRetryCounterCache=new er.default({stdTTL:3600,useClones:!1});this.userDevicesCache=new er.default({stdTTL:300,useClones:!1})';

// ============ T20b (v8 — appStateMacVerification strict no socketConfig do Baileys) =
// T20b: o socketConfig do makeWASocket (Baileys 6.7.24) NÃO declara
// appStateMacVerification (default da lib = {patch:false,snapshot:false} → MACs NÃO
// validados — risco de estado adulterado/desync silencioso). O Baileys 6.7.24 tipa o
// campo como {patch,snapshot} (boolean), mas `"strict"` (string) também ATIVA a
// validação: chats.js chama decodeSyncdSnapshot(..., appStateMacVerification.snapshot)
// e decodePatches(..., appStateMacVerification.patch) — com string, `.snapshot`/`.patch`
// são undefined e o DEFAULT validateMacs=true entra (decodeSyncdSnapshot/decodePatches
// em Utils/chat-utils.js). Falha de MAC → catch do fluxo de sync → resync do zero
// (nunca derruba a conexão). Inserido ANTES de markOnlineOnConnect (após o spread
// `...o`), então prevalece sobre qualquer option do usuário. — ESTRITO
const T20bO = 'markOnlineOnConnect:this.localSettings.alwaysOnline,retryRequestDelayMs:350';
const T20bN = 'appStateMacVerification:"strict",markOnlineOnConnect:this.localSettings.alwaysOnline,retryRequestDelayMs:350';

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

// --- T3 (ESTRITO — Sentry; TEST_MODE: skip) ---
{
  const c = countOf(out, T3O);
  if (TEST_MODE && c === 0) {
    warn(`T3: TEST_MODE — bundle já patcheado, skip`);
    skipped.push("T3");
  } else if (c !== 1) fail(`T3: init original do Sentry encontrado ${c}x (esperado 1x) — bundle mudou?`);
  else {
    out = out.split(T3O).join(T3N);
    applied.push("T3");
  }
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

// --- T6 (ESTRITO — máscara de versão F2-21; TEST_MODE: skip) ---
{
  const c = countOf(out, T6O);
  if (TEST_MODE && c === 0) {
    warn(`T6: TEST_MODE — bundle já patcheado, skip`);
    skipped.push("T6");
  } else if (c !== 1) fail(`T6: literal da rota raiz (version:Vh.version) encontrado ${c}x (esperado 1x) — bundle mudou?`);
  else {
    out = out.split(T6O).join(T6N);
    applied.push("T6");
  }
}

// --- T7 (ESTRITO — CORS sem-Origin, etapa 81; TEST_MODE: skip) ---
{
  const c = countOf(out, T7O);
  if (TEST_MODE && c === 0) {
    warn(`T7: TEST_MODE — bundle já patcheado, skip`);
    skipped.push("T7");
  } else if (c !== 1) fail(`T7: callback origin do CORS encontrado ${c}x (esperado 1x) — bundle mudou?`);
  else {
    out = out.split(T7O).join(T7N);
    applied.push("T7");
  }
}

// --- T4 (prologue MASKED; TEST_MODE: skip) ---
if (TEST_MODE) {
  warn(`T4: TEST_MODE — prologue não reaplicado (bundle já o contém)`);
  skipped.push("T4");
} else {
  if (!fs.existsSync(PROLOGUE)) {
    fail(`t4_prologue.cjs não encontrado: ${PROLOGUE} — extrair da config swarm evolution_t4_prologue_cjs e versionar ao lado do script`);
  }
  const prologue = fs.readFileSync(PROLOGUE, "utf8");
  if (prologue.length <= 50) fail(`T4: prologue com ${prologue.length} bytes (esperado > 50) — arquivo errado?`);
  if (!prologue.includes("MASKED")) fail('T4: prologue não contém o marcador "MASKED" — arquivo errado?');
  out = prologue + "\n" + out;
  applied.push("T4");
}

// --- T8 (ESTRITO — guard MU no fluxo de edição) ---
{
  const c = countOf(out, T8O);
  if (TEST_MODE && countOf(out, T8N) !== 0) {
    warn(`T8: TEST_MODE — bundle já patcheado, skip`);
    skipped.push("T8");
  } else if (c !== 1) fail(`T8: fluxo de edição (MU EDITED) encontrado ${c}x (esperado 1x) — bundle mudou?`);
  else {
    out = out.split(T8O).join(T8N);
    applied.push("T8");
  }
}

// --- T9 (ESTRITO — guard MU no deleteMessage lógico) ---
{
  const c = countOf(out, T9O);
  if (TEST_MODE && countOf(out, T9N) !== 0) {
    warn(`T9: TEST_MODE — bundle já patcheado, skip`);
    skipped.push("T9");
  } else if (c !== 1) fail(`T9: deleteMessage (create({data:a})) encontrado ${c}x (esperado 1x) — bundle mudou?`);
  else {
    out = out.split(T9O).join(T9N);
    applied.push("T9");
  }
}

// --- T10 (ESTRITO — guard MU no revoke) ---
{
  const c = countOf(out, T10O);
  if (TEST_MODE && countOf(out, T10N) !== 0) {
    warn(`T10: TEST_MODE — bundle já patcheado, skip`);
    skipped.push("T10");
  } else if (c !== 1) fail(`T10: revoke (create({data:u}) sem guard) encontrado ${c}x (esperado 1x) — bundle mudou?`);
  else {
    out = out.split(T10O).join(T10N);
    applied.push("T10");
  }
}

// --- T11 (ESTRITO — instanceId no findFirst do deleteMessage) ---
{
  const c = countOf(out, T11O);
  if (TEST_MODE && countOf(out, T11N) !== 0) {
    warn(`T11: TEST_MODE — bundle já patcheado, skip`);
    skipped.push("T11");
  } else if (c !== 1) fail(`T11: findFirst do deleteMessage encontrado ${c}x (esperado 1x) — bundle mudou?`);
  else {
    out = out.split(T11O).join(T11N);
    applied.push("T11");
  }
}

// --- T13a (ESTRITO — return→continue vídeo S3) ---
{
  const c = countOf(out, T13aO);
  if (TEST_MODE && countOf(out, T13aN) !== 0) {
    warn(`T13a: TEST_MODE — bundle já patcheado, skip`);
    skipped.push("T13a");
  } else if (c !== 1) fail(`T13a: bloco S3 vídeo encontrado ${c}x (esperado 1x) — bundle mudou?`);
  else {
    out = out.split(T13aO).join(T13aN);
    applied.push("T13a");
  }
}

// --- T13b (ESTRITO — return→continue !media) ---
{
  const c = countOf(out, T13bO);
  if (TEST_MODE && countOf(out, T13bN) !== 0) {
    warn(`T13b: TEST_MODE — bundle já patcheado, skip`);
    skipped.push("T13b");
  } else if (c !== 1) fail(`T13b: bloco S3 !media (messages.upsert) encontrado ${c}x (esperado 1x) — bundle mudou?`);
  else {
    out = out.split(T13bO).join(T13bN);
    applied.push("T13b");
  }
}

// --- T14 (ESTRITO — CTE fetchChats pushName duplicado) ---
{
  const c = countOf(out, T14O);
  if (TEST_MODE && countOf(out, T14N) !== 0) {
    warn(`T14: TEST_MODE — bundle já patcheado, skip`);
    skipped.push("T14");
  } else if (c !== 1) fail(`T14: CTE fetchChats (Chat.name as pushName) encontrado ${c}x (esperado 1x) — bundle mudou?`);
  else {
    out = out.split(T14O).join(T14N);
    applied.push("T14");
  }
}

// --- T15 (ESTRITO — dedup no messages.upsert) ---
{
  const c = countOf(out, T15O);
  if (TEST_MODE && countOf(out, T15N) !== 0) {
    warn(`T15: TEST_MODE — bundle já patcheado, skip`);
    skipped.push("T15");
  } else if (c !== 1) fail(`T15: create do messages.upsert encontrado ${c}x (esperado 1x) — bundle mudou?`);
  else {
    out = out.split(T15O).join(T15N);
    applied.push("T15");
  }
}

// --- T16 (ESTRITO — instanceId no findFirst do updateMessage/edição) ---
{
  const c = countOf(out, T16O);
  if (TEST_MODE && countOf(out, T16N) !== 0) {
    warn(`T16: TEST_MODE — bundle já patcheado, skip`);
    skipped.push("T16");
  } else if (c !== 1) fail(`T16: findFirst de edição (updateMessage) encontrado ${c}x (esperado 1x) — bundle mudou?`);
  else {
    out = out.split(T16O).join(T16N);
    applied.push("T16");
  }
}

// --- T17 (ESTRITO — remoteJidAlt via lidMapping no messages.upsert) ---
// TEST_MODE: skip se T17N (standalone) OU T19N (chain senderPn, que ENGLOBA a
// lógica do T17 como fallback) já estiverem presentes — T17N NÃO é substring
// do T19N (o `{` diverge), por isso as duas formas são checadas.
{
  const c = countOf(out, T17O);
  if (TEST_MODE && (countOf(out, T17N) !== 0 || countOf(out, T19N) !== 0)) {
    warn(`T17: TEST_MODE — bundle já patcheado, skip`);
    skipped.push("T17");
  } else if (c !== 1) fail(`T17: prepareMessage no messages.upsert encontrado ${c}x (esperado 1x) — bundle mudou?`);
  else {
    out = out.split(T17O).join(T17N);
    applied.push("T17");
  }
}

// --- T19 (ESTRITO — remoteJidAlt via senderPn, fallback triplo senderPn → T17 → nada) ---
// Alvo = bloco T17 JÁ aplicado (T17N). Roda depois do T17 no mesmo build (CI: source
// limpo → T17 aplica e T19 encadeia; TEST_MODE: bundle deployado → T17N já presente).
{
  const c = countOf(out, T19O);
  if (TEST_MODE && countOf(out, T19N) !== 0) {
    warn(`T19: TEST_MODE — bundle já patcheado, skip`);
    skipped.push("T19");
  } else if (c !== 1) fail(`T19: bloco T17 (prepareMessage no messages.upsert) encontrado ${c}x (esperado 1x) — bundle mudou?`);
  else {
    out = out.split(T19O).join(T19N);
    applied.push("T19");
  }
}

// --- T18 (ESTRITO — poda de bloat no prepareMessage) ---
{
  const c = countOf(out, T18O);
  if (TEST_MODE && countOf(out, T18N) !== 0) {
    warn(`T18: TEST_MODE — bundle já patcheado, skip`);
    skipped.push("T18");
  } else if (c !== 1) fail(`T18: montagem do objeto no prepareMessage encontrado ${c}x (esperado 1x) — bundle mudou?`);
  else {
    out = out.split(T18O).join(T18N);
    applied.push("T18");
  }
}

// --- T20 (ESTRITO — cache TTL: userDevicesCache 3e5→300s, msgRetryCounterCache sem TTL→3600s) ---
{
  const c = countOf(out, T20O);
  if (TEST_MODE && countOf(out, T20N) !== 0) {
    warn(`T20: TEST_MODE — bundle já patcheado, skip`);
    skipped.push("T20");
  } else if (c !== 1) fail(`T20: literal de cache TTL encontrado ${c}x (esperado 1x) — bundle mudou?`);
  else {
    out = out.split(T20O).join(T20N);
    applied.push("T20");
  }
}

// --- T20b (ESTRITO — appStateMacVerification:"strict" no socketConfig do Baileys) ---
// Alvo = socketConfig do makeWASocket (markOnlineOnConnect — count 1 no bundle). O
// T20bN contém o T20bO como substring (prefixo inserido antes) — pós-verificação só do
// novo; TEST_MODE skip por presença do T20bN.
{
  const c = countOf(out, T20bO);
  if (TEST_MODE && countOf(out, T20bN) !== 0) {
    warn(`T20b: TEST_MODE — bundle já patcheado, skip`);
    skipped.push("T20b");
  } else if (c !== 1) fail(`T20b: socketConfig (markOnlineOnConnect) encontrado ${c}x (esperado 1x) — bundle mudou?`);
  else {
    out = out.split(T20bO).join(T20bN);
    applied.push("T20b");
  }
}

// Banner determinístico de auditoria (qual bundle base gerou este artefato)
const srcSha = sha256(SRC);
out = `/* evolution-api-custom ${VERSION} | patches T1-T20,T20b build-time | base main.js sha256:${srcSha} */\n` + out;

fs.writeFileSync(OUT, out);

// ===================== Verificação pós-escrita (fail-closed) =====================
const check = fs.readFileSync(OUT, "utf8");
if (countOf(check, T1) !== 0) fail("pós-verificação T1 falhou");
if (countOf(check, T2) !== 0) fail("pós-verificação T2 falhou");
if (!TEST_MODE) {
  if (check.includes("tracesSampleRate:1,profilesSampleRate:1") || !check.includes("tracesSampleRate:0.05")) fail("pós-verificação T3 falhou");
  if (!check.includes("MASKED")) fail("pós-verificação T4 v2 falhou: marcador MASKED ausente");
  if (!check.includes("pushName")) fail("pós-verificação T4 v2 falhou: pushName mask ausente");
  if (!check.includes("conversation")) fail("pós-verificação T4 v2 falhou: conversation mask ausente");
  if (!check.includes("WebMessageInfo")) fail("pós-verificação T4 v2 falhou: WebMessageInfo mask ausente");
  if (countOf(check, T6O) !== 0) fail("pós-verificação T6 falhou");
  if (countOf(check, T6N) !== 1) fail("pós-verificação T6: literal mascarado ausente/ambíguo");
  if (countOf(check, T7O) !== 0) fail("pós-verificação T7 falhou (callback original ainda presente)");
  if (countOf(check, T7N) !== 1) fail("pós-verificação T7: guard !r ausente/ambíguo");
}
if (countOf(check, T5_COND) !== 0) fail("pós-verificação T5a falhou");
// v4 — novos (T8N/T9N/T10N contêm os literais originais como substring — verificar só o novo)
if (countOf(check, T8N) !== 1) fail("pós-verificação T8 falhou");
if (countOf(check, T9N) !== 1) fail("pós-verificação T9 falhou");
if (countOf(check, T10N) !== 1) fail("pós-verificação T10 falhou");
if (countOf(check, T11O) !== 0 || countOf(check, T11N) !== 1) fail("pós-verificação T11 falhou");
if (countOf(check, T13aO) !== 0 || countOf(check, T13aN) !== 1) fail("pós-verificação T13a falhou");
if (countOf(check, T13bO) !== 0 || countOf(check, T13bN) !== 1) fail("pós-verificação T13b falhou");
if (countOf(check, T14O) !== 0 || countOf(check, T14N) !== 1) fail("pós-verificação T14 falhou");
// v5/v6 — T15/T16: novos NÃO contêm os originais como substring (verificar ambos);
// T17: T17N vira o ALVO do T19 (T19O == T17N) — após o T19, T17N some (não é
// substring do T19N); checar "T17N standalone OU T19N chain presente".
// T18/T19: T18N contém T18O; T19N contém T19O (T17N) — verificar só o novo.
if (countOf(check, T15O) !== 0 || countOf(check, T15N) !== 1) fail("pós-verificação T15 falhou");
if (countOf(check, T16O) !== 0 || countOf(check, T16N) !== 1) fail("pós-verificação T16 falhou");
if (countOf(check, T17N) === 0 && countOf(check, T19N) === 0) fail("pós-verificação T17 falhou (remoteJidAlt ausente)");
if (countOf(check, T18N) !== 1) fail("pós-verificação T18 falhou");
if (countOf(check, T19N) !== 1) fail("pós-verificação T19 falhou");
if (countOf(check, T20O) !== 0 || countOf(check, T20N) !== 1) fail("pós-verificação T20 falhou");
// T20b: T20bN contém T20bO como substring — verificar só o novo (padrão T8/T9/T10/T18)
if (countOf(check, T20bN) !== 1) fail("pós-verificação T20b falhou (appStateMacVerification strict ausente/ambíguo)");

console.log(`Patches aplicados: ${applied.join(", ")}${skipped.length ? ` | SKIP (tolerante): ${skipped.join(", ")}` : ""}`);
console.log(`Versão do bundle:  ${VERSION}`);
console.log(`Original: ${SRC} (${fs.statSync(SRC).size} bytes, sha256 ${srcSha})`);
console.log(`Bundle:   ${OUT} (${fs.statSync(OUT).size} bytes, sha256 ${sha256(OUT)})`);
