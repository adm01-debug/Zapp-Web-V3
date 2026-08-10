# ============================================================================
# evolution-api-custom — Evolution API 2.3.7 com patches T1-T19 em BUILD-TIME
# ----------------------------------------------------------------------------
# Substitui o monkey-patch RUNTIME (logpatch.cjs + configs Swarm
# evolution_logpatch_t4_cjs / evolution_main_v2_js) por um bundle patcheado
# em tempo de build, versionado em Git e publicado em registry próprio,
# pinado por digest no compose do Swarm.
#
# Patches embutidos em main.patched.js (gerado por build-patches.mjs):
#   T1  remove console.log(c) antes de sendDataWebhook("messages.upsert",c)
#   T2  remove console.log("stanza",JSON.stringify(e)),  [tolerante — Plano B]
#   T3  Sentry: tracesSampleRate 0.05 / profilesSampleRate 0 / beforeSend
#       filtra 401, 403, DEVICE_REMOVED, "Request failed with status code
#       401/403" e makeBucket
#   T4  prologue t4_prologue.cjs (log masking, marcador MASKED) prepended
#   T5a remove console.log("CACHE:",...) de mensagens    [tolerante — Plano B]
#   T6  GET / mascara a versão ("2.x" no lugar da real) — F2-21
#   T8  guard SAVE_DATA.MESSAGE_UPDATE no fluxo de EDIÇÃO (MU EDITED)
#   T9  guard SAVE_DATA.MESSAGE_UPDATE no deleteMessage lógico
#   T10 guard SAVE_DATA.MESSAGE_UPDATE no revoke (messages.update DELETED)
#   T11 instanceId no findFirst do deleteMessage (bug multi-instância)
#   T13a/T13b S3: return→continue no messages.upsert (não aborta o batch)
#   T14 fetchChats: "Chat"."name" as "chatName" (não sobrescreve pushName)
#   T15 dedup no messages.upsert: findFirst key->>'id'+instanceId antes do
#       create (duplicatas (instanceId,key->>'id') aceitas pelo banco)
#   T16 instanceId no findFirst do updateMessage (edição via app)
#   T17 remoteJidAlt via signalRepository.lidMapping.getPNForLID quando
#       key.remoteJid tem "@lid" e Alt ausente (try/catch — nunca quebra
#       a ingestão)
#   T18 poda de bloat no prepareMessage: remove jpegThumbnail/waveform dos
#       sub-objetos de mídia (image/video/sticker/audio/document/ptv +
#       ephemeral/viewOnce); mantém mediaKey/fileSha256/fileEncSha256/
#       messageSecret (download/descriptografia)
#   T19 remoteJidAlt via senderPn (Baileys 6.7.24 entrega senderPn no key):
#       fallback triplo senderPn → getPNForLID (T17) → nada, em try/catch —
#       nunca quebra a ingestão
# libsignal/src/session_record.js: remove console.info/warn de sessões.
#
# PLANO B (baileys 6.7.24): o bundle é rebuildado do source da tag 2.3.7 com
# o pin "baileys": "6.7.24" (exato) — ver workflow publish-evolution-api-custom.
# T2/T5a podem ser SKIPed pelo build-patches.mjs (origem baileys) — o VERIFY
# abaixo só exige ausência deles, então é compatível com ambos os casos.
#
# Build (gera main.patched.js e publica no GHCR):
#   ./build-evolution-custom.sh            # build local
#   PUSH=1 ./build-evolution-custom.sh     # build + push
# ============================================================================
ARG BASE_IMAGE=evoapicloud/evolution-api@sha256:6b195676b09abbbd8ac9372cd961674dea2587f23dc9bc1d1e6a595372556fb1
ARG GIT_SHA=unknown
FROM ${BASE_IMAGE}

LABEL org.opencontainers.image.title="evolution-api-custom" \
      org.opencontainers.image.version="2.3.7" \
      org.opencontainers.image.description="Evolution API 2.3.7 com patches T1-T19 build-time (log masking, Sentry filtrado, versao mascarada na raiz, sem logs de stanza/CACHE/webhook, guards MessageUpdate, dedup de ingestao, remoteJidAlt via senderPn com fallback lidMapping, poda de bloat) — bundle com baileys 6.7.24 (Plano B)" \
      org.opencontainers.image.source="https://github.com/adm01-debug/zapp-web-v3/tree/main/infra/evolution-api-custom" \
      org.opencontainers.image.base.digest="sha256:6b195676b09abbbd8ac9372cd961674dea2587f23dc9bc1d1e6a595372556fb1" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      com.atomicabr.baileys="6.7.24"

WORKDIR /evolution
EXPOSE 8080

# --- Bundle principal patcheado (T1-T19). Gerado por build-patches.mjs a partir
#     do /evolution/dist/main.js ORIGINAL extraído da imagem base (digest acima).
COPY main.patched.js /evolution/dist/main.js

# Alguns builds 2.3.x também expõem dist/main.mjs — o runtime (config
# evolution_main_v2_js) sobrescrevia AMBOS. Replicamos: mesmo bundle nos dois.
# BEST-EFFORT (não-crítico): o entrypoint oficial (npm run start:prod) carrega
# dist/main.js; main.mjs só existe para importadores ESM. Diagnóstico sempre
# imprime o estado do dist e o rc do cp — nunca bloqueia o build.
RUN ls -la /evolution/dist/; \
    if [ -f /evolution/dist/main.mjs ]; then \
      cp -f /evolution/dist/main.js /evolution/dist/main.mjs; \
      echo "mjs-sync rc=$? (0=ok; copiado main.js->main.mjs)"; \
    else \
      echo "main.mjs ausente na base — nada a fazer"; \
    fi; \
    true

# --- T4: prologue de log masking. Mantido na imagem como artefato de auditoria;
#     o conteúdo já está embutido no topo de main.patched.js pelo build-patches.mjs.
COPY t4_prologue.cjs /evolution/t4_prologue.cjs

# --- Baileys 6.7.24 (Plano B — Design B'): o bundle EXTERNALIZA o baileys
#     (require("baileys") em runtime) → o app usa /evolution/node_modules/baileys.
#     O source build usa o pin 6.7.24; aqui substituímos o pacote da base
#     (7.0.0-rc.9) pelo 6.7.24. Fail-closed: versão exata conferida em build.
RUN rm -rf /evolution/node_modules/baileys
COPY baileys/ /evolution/node_modules/baileys/
# etapa-41: alinhar package.json da base (7.0.0-rc.9) com o runtime (6.7.24).
RUN node -e 'var fs=require("fs"),p="/evolution/package.json",pkg=JSON.parse(fs.readFileSync(p,"utf8"));if(pkg.dependencies&&pkg.dependencies.baileys!=="6.7.24"){pkg.dependencies.baileys="6.7.24";fs.writeFileSync(p,JSON.stringify(pkg,null,2),"utf8");console.log("pkg.json baileys -> 6.7.24");}else{console.log("pkg.json baileys ok");}'
RUN node -e 'var fs=require("fs"),p="/evolution/node_modules/baileys/package.json";if(!fs.existsSync(p)){console.error("FAIL: baileys ausente");process.exit(1);}var v=JSON.parse(fs.readFileSync(p,"utf8")).version;if(v!=="6.7.24"){console.error("FAIL: baileys="+v);process.exit(1);}var pkg=JSON.parse(fs.readFileSync("/evolution/package.json","utf8"));var d=pkg.dependencies&&pkg.dependencies.baileys;if(d!=="6.7.24"){console.error("FAIL: package.json declara "+d);process.exit(1);}console.log("VERIFY OK: baileys "+v+" runtime+pkg=6.7.24");'

# --- Verificação fail-closed: o build FALHA se o bundle copiado não tiver os
#     patches T1-T19 exatamente como esperado (nunca sobe imagem com patch
#     quebrado). T2/T5a: tolerantes — só exigem AUSÊNCIA (aplicados ou SKIPed,
#     nunca presentes). T1/T3/T4/T6: estritos (marcadores obrigatórios).
#     T8-T19 (v4/v5/v6): marcadores obrigatórios de presença (T8/T9/T17/T18/T19
#     têm o original como substring do novo — só presença); T10/T11/T13a/T13b/
#     T14/T15/T16: presença do novo + ausência do original.
RUN node -e ' \
const fs=require("fs"); \
const s=fs.readFileSync("/evolution/dist/main.js","utf8"); \
const fail=(m)=>{console.error("VERIFY FAIL: "+m);process.exit(1);}; \
if(s.includes("console.log(c),this.sendDataWebhook(\"messages.upsert\",c)"))fail("T1 ainda presente (webhook log)"); \
if(s.includes("console.log(\"stanza\",JSON.stringify(e)),"))fail("T2 ainda presente (stanza log)"); \
if(s.includes("tracesSampleRate:1,profilesSampleRate:1"))fail("T3 nao aplicado (Sentry original)"); \
if(!s.includes("tracesSampleRate:0.05"))fail("T3 marcador ausente (tracesSampleRate:0.05)"); \
if(!s.includes("MASKED"))fail("T4 prologue ausente (marcador MASKED)"); \
if(s.includes("console.log(\"CACHE:\",{cached:"))fail("T5a ainda presente (CACHE log)"); \
if(s.includes("version:_l.version,clientName:Nl.CONNECTION.CLIENT_NAME"))fail("T6 nao aplicado (versao real na raiz)"); \
if(!s.includes("version:\"2.x\",clientName:Nl.CONNECTION.CLIENT_NAME"))fail("T6 marcador ausente (version 2.x)"); \
if(!s.includes("SAVE_DATA.MESSAGE_UPDATE&&await this.prismaRepository.messageUpdate.create({data:{fromMe:r.key.fromMe"))fail("T8 marcador ausente (guard MU EDITED)"); \
if(!s.includes("SAVE_DATA.MESSAGE_UPDATE&&await this.prismaRepository.messageUpdate.create({data:a})"))fail("T9 marcador ausente (guard deleteMessage logico)"); \
if(s.includes("status:\"DELETED\",instanceId:this.instanceId};await this.prismaRepository.messageUpdate.create({data:u})"))fail("T10 nao aplicado (revoke sem guard)"); \
if(!s.includes("status:\"DELETED\",instanceId:this.instanceId};this.configService.get(\"DATABASE\").SAVE_DATA.MESSAGE_UPDATE&&await this.prismaRepository.messageUpdate.create({data:u})"))fail("T10 marcador ausente (guard revoke)"); \
if(s.includes("findFirst({where:{key:{path:[\"id\"],equals:o}}})"))fail("T11 nao aplicado (deleteMessage sem instanceId)"); \
if(!s.includes("findFirst({where:{instanceId:this.instanceId,key:{path:[\"id\"],equals:o}}})"))fail("T11 marcador ausente (deleteMessage instanceId)"); \
if(s.includes("Skipping video upload.\");return}"))fail("T13a nao aplicado (return em vez de continue)"); \
if(!s.includes("Skipping video upload.\");continue}"))fail("T13a marcador ausente (continue S3 video)"); \
if(!s.includes("skipping MinIO\");continue}"))fail("T13b marcador ausente (continue S3 !media)"); \
if(s.includes("\"Chat\".\"name\" as \"pushName\","))fail("T14 nao aplicado (CTE pushName duplicado)"); \
if(!s.includes("\"Chat\".\"name\" as \"chatName\","))fail("T14 marcador ausente (chatName)"); \
if(s.includes("let{pollUpdates:h,...g}=c,f=await this.prismaRepository.message.create({data:g})"))fail("T15 nao aplicado (create upsert sem dedup)"); \
if(!s.includes("keyIdV=g?.key?.id;if(keyIdV&&await this.prismaRepository.message.findFirst({where:{instanceId:this.instanceId,key:{path:[\"id\"],equals:keyIdV}}}))continue"))fail("T15 marcador ausente (dedup upsert)"); \
if(s.includes("let c=await this.prismaRepository.message.findFirst({where:{key:{path:[\"id\"],equals:a}}});if(!c)throw new F(\"Message not found\")"))fail("T16 nao aplicado (findFirst edicao sem instanceId)"); \
if(!s.includes("let c=await this.prismaRepository.message.findFirst({where:{instanceId:this.instanceId,key:{path:[\"id\"],equals:a}}});if(!c)throw new F(\"Message not found\")"))fail("T16 marcador ausente (findFirst edicao instanceId)"); \
if(!s.includes("let lidPn=await this.client.signalRepository.lidMapping.getPNForLID(c.key.remoteJid)"))fail("T17 marcador ausente (remoteJidAlt lidMapping)"); \
if(!s.includes("if(typeof c.key.senderPn===\"string\"&&c.key.senderPn.includes(\"@s.whatsapp.net\"))c.key.remoteJidAlt=c.key.senderPn"))fail("T19 marcador ausente (remoteJidAlt senderPn)"); \
if(!s.includes("const mt=[\"imageMessage\",\"videoMessage\",\"stickerMessage\",\"audioMessage\",\"documentMessage\",\"ptvMessage\"],ep=i.message?.ephemeralMessage?.message"))fail("T18 marcador ausente (poda bloat prepareMessage)"); \
console.log("VERIFY OK: main.js com T1-T19 aplicados"); \
'

# --- libsignal/src/session_record.js: remove console.info/warn de sessões
#     (mesmas 4 substituições do logpatch.cjs). Fail-closed: arquivo ou target
#     ausente/ambíguo aborta o build.
RUN node -e ' \
const fs=require("fs"); \
const cands=["/evolution/libsignal/src/session_record.js","/evolution/node_modules/libsignal/src/session_record.js","/evolution/node_modules/@evolution-api/libsignal/src/session_record.js"]; \
const f=cands.find((p)=>fs.existsSync(p)); \
if(!f){console.error("FAIL: session_record.js nao encontrado em libsignal (candidatos: "+cands.join(", ")+")");process.exit(1);} \
const subs=[ \
["console.warn(\"Session already closed\", session);","console.warn(\"Session already closed\");"], \
["console.info(\"Closing session:\", session);","console.info(\"Closing session\");"], \
["console.info(\"Opening session:\", session);","console.info(\"Opening session\");"], \
["console.info(\"Removing old closed session:\", oldestSession);","console.info(\"Removing old closed session\");"] \
]; \
let s=fs.readFileSync(f,"utf8"); \
for(const[a,b]of subs){const n=s.split(a).length-1;if(n!==1){console.error("FAIL libsignal: "+n+"x ocorrencias de: "+a);process.exit(1);}s=s.split(a).join(b);} \
fs.writeFileSync(f,s); \
console.log("libsignal patched: "+f); \
'

# --- Healthcheck mantido (idêntico à imagem oficial) -------------------------
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/ || exit 1

# --- Entrypoint simplificado: NÃO roda logpatch (patches são build-time).
#     Só exporta secrets do Swarm e executa o app.
COPY docker-entrypoint.sh /evolution/docker-entrypoint.sh
RUN chmod +x /evolution/docker-entrypoint.sh

ENTRYPOINT ["/evolution/docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]

# ci-fix-20260807: fallback evolution_ref/base_image em push-triggered
