#!/usr/bin/env node
/**
 * build-patches.test.mjs — E46: regressão para os patches T1-T18 (2026-08-10)
 *
 * Valida o build-patches.mjs contra um FIXTURE mínimo contendo os literais
 * originais de TODOS os alvos (T1, T2, T3, T5a, T6, T7, T8, T9, T10, T11,
 * T13a, T13b, T14, T15, T16, T17, T18). Se qualquer literal do bundle real
 * mudar (esbuild variar nomes/quotes), o fail-closed do build-patches.mjs
 * aborta e este teste falha.
 *
 * Uso: node infra/evolution-api-custom/tests/build-patches.test.mjs
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const FIXTURE = [
  // T1 — webhook log
  'console.log(c),this.sendDataWebhook("messages.upsert",c)',
  // T2 — stanza log
  'console.log("stanza",JSON.stringify(e)),',
  // T3 — Sentry init original
  'Lr.DSN&&Br.init({dsn:Lr.DSN,environment:process.env.NODE_ENV||"development",tracesSampleRate:1,profilesSampleRate:1})',
  // T5a — CACHE log
  'console.log("CACHE:",{cached:a,updateKey:r,messageTimestamp:n.messageTimestamp,secondsSinceEpoch:c}),n.messageTimestamp&&',
  // T6 — versão original
  'version:_l.version,clientName:Nl.CONNECTION.CLIENT_NAME',
  // T7 — CORS original
  'origin(r,a){let{ORIGIN:c}=E.get("CORS");return c.includes("*")||c.indexOf(r)!==-1?a(null,!0):a(new Error("Not allowed by CORS"))}',
  // T8 — fluxo de edição (MU EDITED sem guard)
  'await this.prismaRepository.messageUpdate.create({data:{fromMe:r.key.fromMe,keyId:r.key.id,remoteJid:r.key.remoteJid,status:"EDITED",instanceId:this.instanceId,messageId:h.id}})',
  // T9 — deleteMessage lógico sem guard
  'await this.prismaRepository.messageUpdate.create({data:a})',
  // T10 — revoke sem guard
  'participant:a?.remoteJid,status:"DELETED",instanceId:this.instanceId};await this.prismaRepository.messageUpdate.create({data:u})',
  // T11 — findFirst do deleteMessage sem instanceId
  'findFirst({where:{key:{path:["id"],equals:o}}})',
  // T13a — S3 vídeo: return aborta batch
  '{this.logger.warn("Video upload is disabled. Skipping video upload.");return}',
  // T13b — S3 !media: return aborta batch
  'if(!D){this.logger.verbose("No valid media to upload (messageContextInfo only), skipping MinIO");return}',
  // T14 — CTE fetchChats: 2ª coluna pushName
  '"Chat"."name" as "pushName",',
  // T15 — create do messages.upsert SEM dedup (o handler real usa `g` = messageData
  //       sem pollUpdates; `c` = prepareMessage(n); `f` recebe a linha criada)
  'let{pollUpdates:h,...g}=c,f=await this.prismaRepository.message.create({data:g})',
  // T16 — findFirst de edição (updateMessage via app) SEM instanceId
  'let c=await this.prismaRepository.message.findFirst({where:{key:{path:["id"],equals:a}}});if(!c)throw new F("Message not found")',
  // T17 — prepareMessage no messages.upsert (âncora do lidMapping)
  'let c=this.prepareMessage(n)',
  // T18 — fim da montagem do objeto i no prepareMessage (âncora da poda de bloat)
  'source:(0,R.getDevice)(e.key.id)};!i.status&&e.key.fromMe===!1&&(i.status=ie[3])',
].join("\n");

const PROLOGUE =
  "/* prologue-test MASKED pushName conversation WebMessageInfo apikey remoteJid agentId */\n";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "evo-patch-test-"));
const mainJs = path.join(dir, "main.js");
const patchedJs = path.join(dir, "main.patched.js");
const prologue = path.join(dir, "prologue.cjs");
fs.writeFileSync(mainJs, FIXTURE);
fs.writeFileSync(prologue, PROLOGUE);

try {
  const out = execFileSync(
    "node",
    [
      path.resolve(import.meta.dirname, "..", "build-patches.mjs"),
      mainJs,
      patchedJs,
      prologue,
      "2.3.7",
    ],
    { encoding: "utf8", env: { ...process.env, TEST_MODE: "" } }
  );
  const patched = fs.readFileSync(patchedJs, "utf8");

  const MUST_CONTAIN = [
    // T3/T6/T7 (estritos)
    "tracesSampleRate:0.05",
    'version:"2.x"',
    'return !r||c.includes("*")',
    // T4 prologue
    "MASKED",
    // T8-T11 guards
    'SAVE_DATA.MESSAGE_UPDATE&&await this.prismaRepository.messageUpdate.create({data:{fromMe:r.key.fromMe',
    'SAVE_DATA.MESSAGE_UPDATE&&await this.prismaRepository.messageUpdate.create({data:a})',
    'status:"DELETED",instanceId:this.instanceId};this.configService.get("DATABASE").SAVE_DATA.MESSAGE_UPDATE&&await this.prismaRepository.messageUpdate.create({data:u})',
    'findFirst({where:{instanceId:this.instanceId,key:{path:["id"],equals:o}}})',
    // T13a/T13b (continue)
    'Skipping video upload.");continue}',
    'skipping MinIO");continue}',
    // T14 (chatName)
    '"Chat"."name" as "chatName"',
    // T15 (dedup no upsert)
    'keyIdV=g?.key?.id;if(keyIdV&&await this.prismaRepository.message.findFirst({where:{instanceId:this.instanceId,key:{path:["id"],equals:keyIdV}}}))continue',
    // T16 (instanceId no findFirst de edição)
    'findFirst({where:{instanceId:this.instanceId,key:{path:["id"],equals:a}}});if(!c)throw new F("Message not found")',
    // T17 (remoteJidAlt via lidMapping)
    'let lidPn=await this.client.signalRepository.lidMapping.getPNForLID(c.key.remoteJid)',
    // T18 (poda de bloat)
    'const mt=["imageMessage","videoMessage","stickerMessage","audioMessage","documentMessage","ptvMessage"]',
  ];
  const missing = MUST_CONTAIN.filter((m) => !patched.includes(m));
  if (missing.length > 0) {
    console.error("❌ E46: marcadores ausentes no bundle patcheado:");
    missing.forEach((m) => console.error("   -", m));
    console.error("stderr do build-patches:", out);
    process.exit(1);
  }
  console.log("✅ E46 PASS — T1-T18 aplicados no fixture; fail-closed e pós-verificação OK.");
  process.exit(0);
} catch (e) {
  console.error("❌ E46 FAIL — build-patches.mjs abortou ou pós-verificação falhou:");
  console.error("stdout:", e.stdout || "");
  console.error("stderr:", e.stderr || "");
  console.error("message:", e.message || "");
  process.exit(1);
}
