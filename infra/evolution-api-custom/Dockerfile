# ============================================================================
# evolution-api-custom — Evolution API 2.3.7 com patches T1-T6 em BUILD-TIME
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
      org.opencontainers.image.description="Evolution API 2.3.7 com patches T1-T6 build-time (log masking, Sentry filtrado, versao mascarada na raiz, sem logs de stanza/CACHE/webhook) — bundle com baileys 6.7.24 (Plano B)" \
      org.opencontainers.image.source="https://github.com/adm01-debug/zapp-web-v3/tree/main/infra/evolution-api-custom" \
      org.opencontainers.image.base.digest="sha256:6b195676b09abbbd8ac9372cd961674dea2587f23dc9bc1d1e6a595372556fb1" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      com.atomicabr.baileys="6.7.24"

WORKDIR /evolution
EXPOSE 8080

# --- Bundle principal patcheado (T1-T6). Gerado por build-patches.mjs a partir
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
RUN node -e ' \
const fs=require("fs"); \
const p="/evolution/node_modules/baileys/package.json"; \
if(!fs.existsSync(p)){console.error("FAIL: node_modules/baileys ausente apos COPY");process.exit(1);} \
const v=JSON.parse(fs.readFileSync(p,"utf8")).version; \
if(v!=="6.7.24"){console.error("FAIL: baileys no node_modules = "+v+" (esperado 6.7.24 — nunca publicar imagem com rc.9)");process.exit(1);} \
console.log("VERIFY OK: baileys "+v+" no node_modules (Plano B)"); \
'

# --- Verificação fail-closed: o build FALHA se o bundle copiado não tiver T1-T6
#     exatamente como esperado (nunca sobe imagem com patch quebrado).
#     T2/T5a: tolerantes — só exigem AUSÊNCIA (aplicados ou SKIPed, nunca
#     presentes). T1/T3/T4/T6: estritos (marcadores obrigatórios).
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
console.log("VERIFY OK: main.js com T1-T6 aplicados"); \
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
