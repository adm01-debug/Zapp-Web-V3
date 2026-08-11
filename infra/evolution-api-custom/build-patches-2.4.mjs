#!/usr/bin/env node
/**
 * build-patches-2.4.mjs — v1 (Evolution 2.4.0 + Baileys 7.x)
 * Adapta os targets do build-patches.mjs (v7/2.3.7) para o bytecode
 * gerado pelo tsup no Evolution 2.4.0-rc2 com Baileys 7.0.0-rc.9.
 *
 * MUDANCAS vs v7:
 *  T1  : TOLERANTE (2.4.0 usa logger estruturado, console.log removido)
 *  T3  : Lr/Br -> ca/pa (nomes minificados mudaram)
 *  T6  : _l/Nl -> lu/pu
 *  T7  : r,a,c,E -> l,u,d,T
 *  T10 : {data:u}/a?.remoteJid -> {data:d}/p?.remoteJid
 *  T15 : g,c,f -> m,p,S
 *  T17 : let c=this.prepareMessage(n) -> let p=
 *  T18 : TOLERANTE (jpegThumbnail ausente no 2.4.0 nativamente)
 *  T19 : adapta T17N/T19O/T19N para variavel p
 *  T20 : er.default -> wr.default
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const TEST_MODE = process.env.TEST_MODE === "1";
const [srcArg, outArg, prologueArg, versionArg] = process.argv.slice(2);
const SRC = path.resolve(srcArg ?? "main.js");
const OUT = path.resolve(outArg ?? "main.patched.js");
const PROLOGUE = path.resolve(prologueArg ?? "t4_prologue.cjs");
const VERSION = versionArg ?? "2.4.0";

const fail = (msg) => { console.error(`[FAIL-CLOSED] ${msg}`); process.exit(1); };
const warn = (msg) => console.warn(`[TOLERANT] ${msg}`);
const countOf = (h,n) => h.split(n).length - 1;
const sha256 = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");

if (!fs.existsSync(SRC)) fail(`main.js nao encontrado: ${SRC}`);
let out = fs.readFileSync(SRC, "utf8");
const applied = [], skipped = [];

// --- T1 TOLERANTE: 2.4.0 usa logger estruturado, nao console.log ---
{
  const T1 = 'console.log(c),this.sendDataWebhook("messages.upsert",c)';
  const R1 = 'this.sendDataWebhook("messages.upsert",c)';
  const c = countOf(out, T1);
  if (c === 0) { warn("T1: ausente (2.4.0 usa logger) - SKIP"); skipped.push("T1"); }
  else if (c !== 1) fail(`T1: encontrado ${c}x`);
  else { out = out.split(T1).join(R1); applied.push("T1"); }
}
// --- T2 TOLERANTE ---
{
  const T2 = 'console.log("stanza",JSON.stringify(e)),';
  const c = countOf(out, T2);
  if (c === 0) { warn("T2: ausente - SKIP"); skipped.push("T2"); }
  else if (c !== 1) fail(`T2: ${c}x`);
  else { out = out.split(T2).join(""); applied.push("T2"); }
}
// --- T3 ESTRITO: ca/pa (era Lr/Br) ---
{
  const T3O = 'ca.DSN&&pa.init({dsn:ca.DSN,environment:process.env.NODE_ENV||"development",tracesSampleRate:1,profilesSampleRate:1})';
  const T3N = 'ca.DSN&&pa.init({dsn:ca.DSN,environment:"production",tracesSampleRate:0.05,profilesSampleRate:0,beforeSend:(event,hint)=>{try{const e=hint&&hint.originalException;if(e){if(e.response&&[401,403].includes(e.response.status))return null;if(e.message&&(e.message.includes("DEVICE_REMOVED")||e.message.includes("Request failed with status code 401")||e.message.includes("status code 403")||e.message.includes("makeBucket")))return null;}}catch(_){}return event;}})';
  const c = countOf(out, T3O);
  if (TEST_MODE && c === 0) { warn("T3: TEST_MODE skip"); skipped.push("T3"); }
  else if (c !== 1) fail(`T3: Sentry init encontrado ${c}x (esperado 1)`);
  else { out = out.split(T3O).join(T3N); applied.push("T3"); }
}
// --- T5a TOLERANTE ---
{
  const T5 = 'console.log("CACHE:",{cached:a,updateKey:r,messageTimestamp:n.messageTimestamp,secondsSinceEpoch:c}),n.messageTimestamp&&';
  const c = countOf(out, T5);
  if (c === 0) { warn("T5a: ausente - SKIP"); skipped.push("T5a"); }
  else if (c !== 1) fail(`T5a: ${c}x`);
  else { out = out.split(T5).join(""); applied.push("T5a"); }
}
// --- T6 ESTRITO: lu/pu (era _l/Nl) ---
{
  const T6O = 'version:lu.version,clientName:pu.CONNECTION.CLIENT_NAME';
  const T6N = 'version:"2.x",clientName:pu.CONNECTION.CLIENT_NAME';
  const c = countOf(out, T6O);
  if (TEST_MODE && c === 0) { warn("T6: TEST_MODE skip"); skipped.push("T6"); }
  else if (c !== 1) fail(`T6: versao rota raiz encontrado ${c}x`);
  else { out = out.split(T6O).join(T6N); applied.push("T6"); }
}
// --- T7 ESTRITO: l,u,d,T (era r,a,c,E) ---
{
  const T7O = 'origin(l,u){let{ORIGIN:d}=T.get("CORS");return d.includes("*")||d.indexOf(l)!==-1?u(null,!0):u(new Error("Not allowed by CORS"))';
  const T7N = 'origin(l,u){let{ORIGIN:d}=T.get("CORS");return !l||d.includes("*")||d.indexOf(l)!==-1?u(null,!0):u(new Error("Not allowed by CORS"))';
  const c = countOf(out, T7O);
  if (TEST_MODE && c === 0) { warn("T7: TEST_MODE skip"); skipped.push("T7"); }
  else if (c !== 1) fail(`T7: CORS origin encontrado ${c}x`);
  else { out = out.split(T7O).join(T7N); applied.push("T7"); }
}
// --- T4: prologue MASKED ---
if (TEST_MODE) { warn("T4: TEST_MODE skip"); skipped.push("T4"); }
else {
  if (!fs.existsSync(PROLOGUE)) fail(`t4_prologue.cjs nao encontrado: ${PROLOGUE}`);
  const p = fs.readFileSync(PROLOGUE, "utf8");
  if (p.length <= 50) fail(`T4: prologue pequeno demais (${p.length} bytes)`);
  if (!p.includes("MASKED")) fail("T4: marcador MASKED ausente");
  out = p + "\n" + out;
  applied.push("T4");
}
// --- T8 ESTRITO ---
{
  const T8O = 'await this.prismaRepository.messageUpdate.create({data:{fromMe:r.key.fromMe,keyId:r.key.id,remoteJid:r.key.remoteJid,status:"EDITED",instanceId:this.instanceId,messageId:h.id}})';
  const T8N = 'this.configService.get("DATABASE").SAVE_DATA.MESSAGE_UPDATE&&await this.prismaRepository.messageUpdate.create({data:{fromMe:r.key.fromMe,keyId:r.key.id,remoteJid:r.key.remoteJid,status:"EDITED",instanceId:this.instanceId,messageId:h.id}})';
  const c = countOf(out, T8O);
  if (TEST_MODE && countOf(out,T8N)!==0) { warn("T8: TEST_MODE skip"); skipped.push("T8"); }
  else if (c !== 1) fail(`T8: MU EDITED ${c}x`);
  else { out = out.split(T8O).join(T8N); applied.push("T8"); }
}
// --- T9 ESTRITO ---
{
  const T9O = 'await this.prismaRepository.messageUpdate.create({data:a})';
  const T9N = 'this.configService.get("DATABASE").SAVE_DATA.MESSAGE_UPDATE&&await this.prismaRepository.messageUpdate.create({data:a})';
  const c = countOf(out, T9O);
  if (TEST_MODE && countOf(out,T9N)!==0) { warn("T9: TEST_MODE skip"); skipped.push("T9"); }
  else if (c !== 1) fail(`T9: deleteMessage logico ${c}x`);
  else { out = out.split(T9O).join(T9N); applied.push("T9"); }
}
// --- T10 ESTRITO: p?.remoteJid/{data:d} (era a?.remoteJid/{data:u}) ---
{
  const T10O = 'participant:p?.remoteJid,status:"DELETED",instanceId:this.instanceId};await this.prismaRepository.messageUpdate.create({data:d})';
  const T10N = 'participant:p?.remoteJid,status:"DELETED",instanceId:this.instanceId};this.configService.get("DATABASE").SAVE_DATA.MESSAGE_UPDATE&&await this.prismaRepository.messageUpdate.create({data:d})';
  const c = countOf(out, T10O);
  if (TEST_MODE && countOf(out,T10N)!==0) { warn("T10: TEST_MODE skip"); skipped.push("T10"); }
  else if (c !== 1) fail(`T10: revoke DELETED ${c}x`);
  else { out = out.split(T10O).join(T10N); applied.push("T10"); }
}
// --- T11 ESTRITO ---
{
  const T11O = 'findFirst({where:{key:{path:["id"],equals:o}}})';
  const T11N = 'findFirst({where:{instanceId:this.instanceId,key:{path:["id"],equals:o}}})';
  const c = countOf(out, T11O);
  if (TEST_MODE && countOf(out,T11N)!==0) { warn("T11: TEST_MODE skip"); skipped.push("T11"); }
  else if (c !== 1) fail(`T11: deleteMessage findFirst ${c}x`);
  else { out = out.split(T11O).join(T11N); applied.push("T11"); }
}
// --- T13a ESTRITO ---
{
  const T13aO = '{this.logger.warn("Video upload is disabled. Skipping video upload.");return}';
  const T13aN = '{this.logger.warn("Video upload is disabled. Skipping video upload.");continue}';
  const c = countOf(out, T13aO);
  if (TEST_MODE && countOf(out,T13aN)!==0) { warn("T13a: TEST_MODE skip"); skipped.push("T13a"); }
  else if (c !== 1) fail(`T13a: S3 video ${c}x`);
  else { out = out.split(T13aO).join(T13aN); applied.push("T13a"); }
}
// --- T13b ESTRITO ---
{
  const T13bO = 'if(!D){this.logger.verbose("No valid media to upload (messageContextInfo only), skipping MinIO");return}';
  const T13bN = 'if(!D){this.logger.verbose("No valid media to upload (messageContextInfo only), skipping MinIO");continue}';
  const c = countOf(out, T13bO);
  if (TEST_MODE && countOf(out,T13bN)!==0) { warn("T13b: TEST_MODE skip"); skipped.push("T13b"); }
  else if (c !== 1) fail(`T13b: S3 !media ${c}x`);
  else { out = out.split(T13bO).join(T13bN); applied.push("T13b"); }
}
// --- T14 ESTRITO ---
{
  const T14O = '"Chat"."name" as "pushName",';
  const T14N = '"Chat"."name" as "chatName",';
  const c = countOf(out, T14O);
  if (TEST_MODE && countOf(out,T14N)!==0) { warn("T14: TEST_MODE skip"); skipped.push("T14"); }
  else if (c !== 1) fail(`T14: CTE pushName ${c}x`);
  else { out = out.split(T14O).join(T14N); applied.push("T14"); }
}
// --- T15 ESTRITO: m,p,S (era g,c,f) ---
{
  const T15O = 'let{pollUpdates:h,...m}=p,S=await this.prismaRepository.message.create({data:m})';
  const T15N = 'let{pollUpdates:h,...m}=p,keyIdV=m?.key?.id;if(keyIdV&&await this.prismaRepository.message.findFirst({where:{instanceId:this.instanceId,key:{path:["id"],equals:keyIdV}}}))continue;let S=await this.prismaRepository.message.create({data:m})';
  const c = countOf(out, T15O);
  if (TEST_MODE && countOf(out,T15N)!==0) { warn("T15: TEST_MODE skip"); skipped.push("T15"); }
  else if (c !== 1) fail(`T15: dedup upsert ${c}x`);
  else { out = out.split(T15O).join(T15N); applied.push("T15"); }
}
// --- T16 ESTRITO ---
{
  const T16O = 'let c=await this.prismaRepository.message.findFirst({where:{key:{path:["id"],equals:a}}});if(!c)throw new F("Message not found")';
  const T16N = 'let c=await this.prismaRepository.message.findFirst({where:{instanceId:this.instanceId,key:{path:["id"],equals:a}}});if(!c)throw new F("Message not found")';
  const c = countOf(out, T16O);
  if (TEST_MODE && countOf(out,T16N)!==0) { warn("T16: TEST_MODE skip"); skipped.push("T16"); }
  if (c === 0) { warn("T16: getMessageByKeyId no 2.4.0 ja filtra instanceId - SKIP"); skipped.push("T16"); }
  else if (c !== 1) fail(`T16: updateMessage findFirst ${c}x`);
  else { out = out.split(T16O).join(T16N); applied.push("T16"); }
}
// --- T17 ESTRITO: variavel p (era c) ---
{
  const T17O = 'let p=this.prepareMessage(n)';
  const T17N = 'let p=this.prepareMessage(n);try{if(p?.key?.remoteJid?.includes("@lid")&&!p.key.remoteJidAlt){let lidPn=await this.client.signalRepository.lidMapping.getPNForLID(p.key.remoteJid);if(typeof lidPn==="string"&&lidPn.includes("@s.whatsapp.net"))p.key.remoteJidAlt=lidPn}}catch{}';
  const c = countOf(out, T17O);
  if (TEST_MODE && (countOf(out,T17N)!==0||countOf(out,T19N_CHECK)!==0)) { warn("T17: TEST_MODE skip"); skipped.push("T17"); }
  else if (c !== 1) fail(`T17: prepareMessage upsert ${c}x`);
  else { out = out.split(T17O).join(T17N); applied.push("T17"); }
}
// --- T19 ESTRITO: variavel p (era c) ---
const T19N_CHECK = 'let p=this.prepareMessage(n);try{if(p?.key?.remoteJid?.includes("@lid")&&!p.key.remoteJidAlt){if(typeof p.key.senderPn==="string"&&p.key.senderPn.includes("@s.whatsapp.net"))p.key.remoteJidAlt=p.key.senderPn;else{let lidPn=await this.client.signalRepository.lidMapping.getPNForLID(p.key.remoteJid);if(typeof lidPn==="string"&&lidPn.includes("@s.whatsapp.net"))p.key.remoteJidAlt=lidPn}}}catch{}';
{
  const T19O = 'let p=this.prepareMessage(n);try{if(p?.key?.remoteJid?.includes("@lid")&&!p.key.remoteJidAlt){let lidPn=await this.client.signalRepository.lidMapping.getPNForLID(p.key.remoteJid);if(typeof lidPn==="string"&&lidPn.includes("@s.whatsapp.net"))p.key.remoteJidAlt=lidPn}}catch{}';
  const T19N = T19N_CHECK;
  const c = countOf(out, T19O);
  if (TEST_MODE && countOf(out,T19N)!==0) { warn("T19: TEST_MODE skip"); skipped.push("T19"); }
  else if (c !== 1) fail(`T19: bloco T17 para encadear senderPn ${c}x`);
  else { out = out.split(T19O).join(T19N); applied.push("T19"); }
}
// --- T18 TOLERANTE: 2.4.0 nao tem jpegThumbnail nativamente ---
{
  const T18O = 'source:(0,R.getDevice)(e.key.id)};!i.status&&e.key.fromMe===!1&&(i.status=ie[3])';
  const c = countOf(out, T18O);
  if (c === 0) { warn("T18: ausente (2.4.0 ja remove bloat nativamente) - SKIP"); skipped.push("T18"); }
  else if (c !== 1) fail(`T18: prepareMessage getDevice ${c}x`);
  else {
    const T18N = 'source:(0,R.getDevice)(e.key.id)};const mt=["imageMessage","videoMessage","stickerMessage","audioMessage","documentMessage","ptvMessage"],ep=i.message?.ephemeralMessage?.message||i.message?.viewOnceMessage?.message;for(let mi=0;mi<mt.length;mi++){if(i.message[mt[mi]]?.jpegThumbnail)delete i.message[mt[mi]].jpegThumbnail;if(i.message[mt[mi]]?.waveform)delete i.message[mt[mi]].waveform;if(ep?.[mt[mi]]?.jpegThumbnail)delete ep[mt[mi]].jpegThumbnail;if(ep?.[mt[mi]]?.waveform)delete ep[mt[mi]].waveform};!i.status&&e.key.fromMe===!1&&(i.status=ie[3])';
    out = out.split(T18O).join(T18N); applied.push("T18");
  }
}
// --- T20 ESTRITO: wr.default (era er.default) ---
{
  const T20O = 'this.msgRetryCounterCache=new wr.default;this.userDevicesCache=new wr.default({stdTTL:3e5,useClones:!1})';
  const T20N = 'this.msgRetryCounterCache=new wr.default({stdTTL:3600,useClones:!1});this.userDevicesCache=new wr.default({stdTTL:300,useClones:!1})';
  const c = countOf(out, T20O);
  if (TEST_MODE && countOf(out,T20N)!==0) { warn("T20: TEST_MODE skip"); skipped.push("T20"); }
  else if (c !== 1) fail(`T20: cache TTL ${c}x`);
  else { out = out.split(T20O).join(T20N); applied.push("T20"); }
}

const srcSha = sha256(SRC);
out = `/* evolution-api-custom ${VERSION} | patches T1-T20 build-time 2.4.x | base sha256:${srcSha} */\n` + out;
fs.writeFileSync(OUT, out);

// Verificacao pos-escrita
const chk = fs.readFileSync(OUT, "utf8");
if (!TEST_MODE) {
  if (!chk.includes("tracesSampleRate:0.05")) fail("pos-verify T3");
  if (!chk.includes("MASKED")) fail("pos-verify T4");
  if (!chk.includes('version:"2.x"')) fail("pos-verify T6");
  if (!chk.includes('!l||d.includes')) fail("pos-verify T7");
}
if (countOf(chk,'SAVE_DATA.MESSAGE_UPDATE&&await this.prismaRepository.messageUpdate.create({data:{fromMe:r.key.fromMe')!==1) fail("pos-verify T8");
if (countOf(chk,'SAVE_DATA.MESSAGE_UPDATE&&await this.prismaRepository.messageUpdate.create({data:a})')!==1) fail("pos-verify T9");
if (countOf(chk,'SAVE_DATA.MESSAGE_UPDATE&&await this.prismaRepository.messageUpdate.create({data:d})')!==1) fail("pos-verify T10");
if (countOf(chk,'findFirst({where:{instanceId:this.instanceId,key:{path:["id"],equals:o}}})')!==1) fail("pos-verify T11");
if (countOf(chk,'Skipping video upload.");continue}')!==1) fail("pos-verify T13a");
if (countOf(chk,'skipping MinIO");continue}')!==1) fail("pos-verify T13b");
if (countOf(chk,'"Chat"."name" as "chatName"')!==1) fail("pos-verify T14");
if (countOf(chk,'let{pollUpdates:h,...m}=p,keyIdV')!==1) fail("pos-verify T15");
if (countOf(chk,T19N_CHECK)!==1) fail("pos-verify T17+T19");
if (countOf(chk,'msgRetryCounterCache=new wr.default({stdTTL:3600')!==1) fail("pos-verify T20");

console.log(`OK patches=${applied.join(",")} skip=${skipped.join(",")}`);
console.log(`Versao: ${VERSION} | sha256 src: ${srcSha}`);
console.log(`OUT: ${OUT} (${fs.statSync(OUT).size} bytes)`);
