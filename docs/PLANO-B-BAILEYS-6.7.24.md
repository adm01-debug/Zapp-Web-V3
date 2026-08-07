# PLANO B — Rebuild da imagem custom da Evolution com Baileys 6.7.24 (estável)

- **Data:** 2026-08-06
- **Branch:** `f2/runbook-fase2-20260805` (working tree sujo — **documento entregue SEM commit**)
- **Status:** ⏸️ **PLANEJADO — NADA FOI BUILDADO NEM DEPLOYADO** (tarefa 100% local/documental)
- **Objetivo:** eliminar o enforcement do WhatsApp contra o Baileys `7.0.0-rc.9` (issue [WhiskeySockets/Baileys #2248](https://github.com/WhiskeySockets/Baileys/issues/2248) — logout `401 "Log out instance"` pós-QR), publicando uma imagem custom da Evolution API **2.3.7 com Baileys 6.7.24 estável** (publicado 29/07/2026), mantendo os patches T1–T6, com deploy stop-first + rollback automático e validação pós-deploy completa.
- **Contexto do incidente:** [docs/INCIDENTE-EVOLUTION-20260806.md](../docs/INCIDENTE-EVOLUTION-20260806.md) (logout forçado de `wpp2` em 05/08 23:37Z; re-scan com `device_removed` por ~13h; reconexão em 06/08 ~13:00Z). A lição **L-1** daquele documento recomenda exatamente este plano B.

---

## 0) Fatos verificados (fonte primária, 06/08/2026)

| # | Fato | Evidência |
|---|---|---|
| F1 | Evolution **2.3.7** declara dependência **`"baileys": "7.0.0-rc.9"`** — nome **bare `baileys`** (não `@whiskeysockets/baileys`) | `package.json` da tag `2.3.7` (raw.githubusercontent, verificado) |
| F2 | Evolution **2.4.0-rc2 usa o MESMO rc.9** → upgrade de versão da Evolution **não resolve** o enforcement | fatos do runbook (verificado em sessão anterior) |
| F3 | `baileys@6.7.24` existe no npm (bare **e** `@whiskeysockets/baileys`), publicado **29/07/2026 00:57:39Z**, dist-tag `legacy`; `latest` = `7.0.0-rc14` | registry.npmjs.org (verificado) |
| F4 | Engines de `6.7.24` e `7.0.0-rc.9`: **`node >=20.0.0`** → compatível com a imagem oficial (node:24-alpine) | registry.npmjs.org (verificado) |
| F5 | `baileys@6.7.24` **não tem campo `exports`** (`main: lib/index.js`) → imports profundos `baileys/lib/Types/Label` e `baileys/lib/Types/LabelAssociation` (usados pela Evolution) **continuam resolvendo**; ambos os arquivos existem em 6.7.24 | package.json + file listing via jsdelivr (verificado) |
| F6 | API surface usada pela Evolution 2.3.7 (`WASocket`, `ConnectionState`, `WAConnectionState`, `BaileysEventMap`, `MessageUpsertType`, `WAMessage`, `Label`, `LabelAssociation`) existe em 6.7.x | lib/Types de 6.7.24 (verificado) |
| F7 | Build da Evolution 2.3.7 é **`tsc --noEmit && tsup`** (tsup/esbuild, **não** webpack — o webpack era da linha 1.x). `tsup.config.ts`: entry `src`, `splitting:false`, `minify:true`, `format:['cjs','esm']`, `clean:true` → gera **`dist/main.js` (CJS) e `dist/main.mjs` (ESM)**, bundle único self-contained (baileys embutido) | package.json + tsup.config.ts da tag `2.3.7` (verificado) |
| F8 | `package-lock.json` **existe** na tag 2.3.7 (590 KB) → pin exato de tsup/esbuild → **literais minificados do código da Evolution são determinísticos** entre builds (base p/ estabilidade dos targets T1/T3/T6) | raw.githubusercontent (verificado) |
| F9 | `tsconfig.json` 2.3.7: **`skipLibCheck:true`, `strict:false`, `strictNullChecks:false`, `noImplicitAny:false`** → risco de `tsc --noEmit` quebrar com os tipos do 6.7.24 é **baixo** | tsconfig.json (verificado) |
| F10 | Deps runtime do baileys: 6.7.24 = `@cacheable/node-cache, @hapi/boom, async-mutex, axios, libsignal(git), music-metadata, pino, protobufjs, ws`; rc.9 = idem **+ `lru-cache`, `p-queue`** (sem axios). Delta irrelevante: `axios` já é dep direta da Evolution; `lru-cache/p-queue` só existiam p/ rc.9 | registry (verificado) |
| F11 | `libsignal` é a **mesma dep git** (`whiskeysockets/libsignal-node`) nas duas versões → o patch de `session_record.js` do Dockerfile custom continua válido | registry (verificado) |
| F12 | Imagem oficial base: `evoapicloud/evolution-api@sha256:6b195676b09abbbd8ac9372cd961674dea2587f23dc9bc1d1e6a595372556fb1` (2.3.7, node:24-alpine). O Dockerfile oficial roda `npm ci` → `generate_database.sh` (prisma generate por `DATABASE_PROVIDER`) → `npm run build` → copia `node_modules` + `dist` | Dockerfile oficial 2.3.7 (verificado) |
| F13 | Workflow GHCR atual extrai `main.js` **da imagem oficial**, aplica T1–T6 (`build-patches.mjs`, fail-closed) e publica `ghcr.io/adm01-debug/zapp-web-v3/evolution-api-custom` (tags: sha12 + `:2.3.7`) | `.github/workflows/publish-evolution-api-custom.yml` (lido) |
| F14 | Imagem custom em produção é pinada **por digest** (prefixo `9d110bc7` — estado vivo, **não versionado no repo**; o compose do repo e o `docs/infra/evolution-stack.reconciled.yml` ainda apontam a imagem oficial) | contexto do runbook + leitura dos arquivos |
| F15 | `update_config` (compose canônico): `parallelism:1`, **`order: stop-first`**, **`failure_action: rollback`**, `delay:30s`, `monitor:180s`; `rollback_config` stop-first — a stack viva deve ser conferida no pré-flight | `infra/evolution/docker-compose.evolution.yml` (lido) |
| F16 | Release `v6.7.24` do Baileys: publicado por github-actions em **29 Jul 00:57**, commit `e062994` | github.com/WhiskeySockets/Baileys/releases (verificado) |
| F17 | Watchdog `watchdog-baileys v11.1` suprime restart em `device_removed` (comportamento correto — evita loop de re-pairing no cooldown) | docs/INCIDENTE-EVOLUTION-20260806.md (E7) |

> ⚠️ **Ferramentas de verificação do GHCR não funcionaram nesta sessão** (token `gh` sem escopo `read:packages`; `docker manifest inspect` exige auth) → a verificação do digest `9d110bc7` fica como **passo obrigatório do pré-flight** (§4.1), com os comandos exatos abaixo.

---

## 1) Estratégia: Design B (cirúrgico) — recomendado

Duas arquiteturas possíveis para a nova imagem:

| | **Design B — cirúrgico (RECOMENDADO)** | Design A — rebuild completo |
|---|---|---|
| Base da imagem | Mesma oficial `6b195676…` (node_modules, prisma, sharp, ffmpeg, libsignal intactos) | `node:24-alpine` + build completo do source |
| O que muda | **Somente** `dist/main.js` + `dist/main.mjs` (bundle recém-buildado com baileys 6.7.24 embutido) | `dist` + `node_modules` inteiros |
| Justificativa | tsup empacota o baileys **dentro** do bundle (F7); o runtime **não** lê `node_modules/baileys`; o delta de deps (F10) está coberto no node_modules da base; `libsignal` é a mesma dep git (F11) | Consistência total de node_modules × bundle |
| Esforço | Baixo — reaproveita 100% do Dockerfile custom e ~80% do workflow | Alto — novo Dockerfile multi-stage, prisma generate, reproduzir Docker oficial |
| Risco | Pequeno, **fechado por smoke test** (§1.1) | Menor, porém build mais frágil (mais superfície) |
| Fallback | — | Usar **somente se** o smoke test do Design B acusar módulo externo faltante |

**Decisão: Design B**, com **smoke test obrigatório e fail-closed** antes de publicar no GHCR.

### 1.1 Gate de segurança do Design B (não pulável)
Antes do push da imagem, bootar o bundle novo em um container **descartável** baseado na imagem oficial:
```bash
# (CI, após gerar main.patched.js)
docker create --name evo-smoke --entrypoint /bin/sh \
  evoapicloud/evolution-api@sha256:6b195676b09abbbd8ac9372cd961674dea2587f23dc9bc1d1e6a595372556fb1
docker cp infra/evolution-api-custom/main.patched.js evo-smoke:/evolution/dist/main.js
docker cp infra/evolution-api-custom/main.patched.js evo-smoke:/evolution/dist/main.mjs
docker start evo-smoke   # entrypoint real: sobe o app (sem secrets → boot parcial é suficiente p/ validar requires)
docker logs --tail 50 evo-smoke 2>&1 | grep -iE "cannot find module|error" && exit 1 || echo "SMOKE OK"
docker rm -f evo-smoke
```
Um boot que chega ao `ServerUP`/`bootstrap()` (ou ao log de erro esperado de conexão) prova que **nenhum `require` externo do baileys 6.7.24 ficou órfão** (R6).

---

## 2) Passo 1 — Build do bundle novo (dist/main.js com baileys 6.7.24)

> Correção de nomenclatura: a Evolution 2.3.7 **não usa webpack**; o build é `tsup` (esbuild) via `npm run build` (F7). O "webpack" era da linha 1.x.

### 2.1 Local (validação do procedimento; ambiente Windows ok para `npm`, mas o build oficial roda no CI Ubuntu — §3)
```bash
# 1. Clone da tag 2.3.7
git clone --depth 1 --branch 2.3.7 https://github.com/evolution-foundation/evolution-api.git evo-src
cd evo-src

# 2. Troca da dependência (atualiza package.json E package-lock.json — nunca editar só o package.json)
npm install baileys@6.7.24 --save-exact        # "^6.7.24" NÃO usar — pin exato determinístico

# 3. Pré-requisitos do build oficial (replica o Dockerfile oficial F12)
cp .env.example .env
export DATABASE_PROVIDER=postgresql
export DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"   # prisma generate NÃO conecta no banco
npm run db:generate                            # gera o client prisma (schema postgresql-schema.prisma)

# 4. Build: tsc --noEmit (typecheck) + tsup (bundle minificado)
npm run build
#   → dist/main.js (CJS) + dist/main.mjs (ESM) + dist/translations/ (onSuccess do tsup)

# 5. Verificações locais do artefato
node -e "const s=require('fs').readFileSync('dist/main.js','utf8'); console.log('bytes:', s.length); console.log('baileys 6.7.24 presente no bundle?', !s.includes('7.0.0-rc.9') && s.includes('6.7.24') || 'checar manualmente');"
ls -la dist/
```
**Verificação extra do conteúdo (importante):** conferir que o bundle contém o código do baileys 6.7.24 e **não** contém marcadores exclusivos do rc.9. Método prático: comparar tamanho/hash com o `main.js` da imagem oficial (o bundle muda de tamanho) e grepar por strings do changelog 6.7.24 se necessário.

### 2.2 Fallback se `tsc --noEmit` falhar (baixo risco — F9)
Com `skipLibCheck:true`, erros de tipos viriam só do uso direto na src da Evolution. Se ocorrerem:
1. Ler os erros e corrigir **minimamente** a src (ex.: assinaturas de `ConnectionState`/`BaileysEventMap` — estáveis entre 6.7.x/7.x, espera-se zero ou pouquíssimos);
2. **Alternativa aceitável e documentada:** build sem typecheck — `npx tsup` (o tsup/esbuild não typechecka) + smoke test runtime (§1.1) + bateria de validação pós-deploy (§5). O typecheck é desejável, não gate de correção funcional.

### 2.3 Produtos da fase de build
- `dist/main.js` e `dist/main.mjs` novos (bundle com baileys 6.7.24) → **artefato do CI** (§3);
- `package.json`/`package-lock.json` com `"baileys": "6.7.24"` (pin exato) — versionar no repo do workflow, para reprodutibilidade (ver §3.3).

---

## 3) Passo 2 — Portabilidade dos patches T1–T6 (build-patches.mjs + Dockerfile)

### 3.1 Origem de cada target e expectativa no bundle 6.7.24

| Patch | Target (literal minificado) | Origem | Expectativa no bundle novo |
|---|---|---|---|
| **T1** | `console.log(c),this.sendDataWebhook("messages.upsert",c)` | Código **Evolution** (webhook) | **Mantém** — mesmo source 2.3.7 + mesmo esbuild (lockfile) = literal idêntico (F8) |
| **T2** | `console.log("stanza",JSON.stringify(e)),` | Código de log de stanza (indeterminado entre Evolution/baileys) | **Pode sumir** no bundle 6.7.24 (código do baileys mudou) |
| **T3** | `Lr.DSN&&Br.init({dsn:Lr.DSN,environment:process.env.NODE_ENV\|\|"development",tracesSampleRate:1,profilesSampleRate:1})` | Código **Evolution** (Sentry) | **Mantém** (idem T1) |
| **T4** | prepend de `t4_prologue.cjs` (marcador `MASKED`) | Artefato externo (versionado no repo) | **Sempre aplica** — independente do bundle |
| **T5a** | `console.log("CACHE:",{cached:a,updateKey:r,messageTimestamp:n.messageTimestamp,secondsSinceEpoch:c}),` | Código de log de cache (indeterminado) | **Pode sumir** (idem T2) |
| **T6** | `version:_l.version,clientName:Nl.CONNECTION.CLIENT_NAME` | Código **Evolution** (rota GET /) | **Mantém** (idem T1) |
| libsignal | 4× `console.info/warn(..., session)` em `session_record.js` | `libsignal` — **mesma dep git** nas duas versões (F11) | **Mantém** — arquivo idêntico |

### 3.2 Estratégia de adaptação (obrigatória antes do build do CI)

**Problema:** `build-patches.mjs` é **fail-closed estrito** — `count != 1` aborta. Se T2/T5a sumirem do bundle (provável), o script quebraria o CI com "target encontrado 0x".

**Solução — modo tolerante para targets de origem baileys (T2, T5a):**
1. No `build-patches.mjs`, mudar T2 e T5a para: `count == 0` → **SKIP com warn** (`[TOLERANT] T2: target ausente — provavelmente removido no baileys 6.7.24; seguindo sem este patch`); `count > 1` → **FAIL** (ambiguidade sempre é erro — nunca aplicar em lugar errado); `count == 1` → aplica (comportamento atual).
2. **T1, T3, T6 permanecem estritos** (`count == 1` obrigatório): são código da Evolution com source fixo → se sumirem, algo grave mudou e o build DEVE falhar.
3. **Dockerfile VERIFY (fail-closed) já é tolerante** para T2/T5a: só exige que os literais **não estejam presentes** e que T3/T4/T6 tenham marcadores. → **nenhuma mudança necessária no Dockerfile** (apenas a label opcional do §3.4).
4. **Pós-verificação do script:** para T2/T5a, trocar `countOf(check, T2) !== 0` por "se foi aplicado, não pode estar presente" (o check atual de ausência já cobre ambos os casos — manter).

> Regra de ouro mantida: **nunca produzir bundle parcial**. SKIP só com warn explícito e registro no banner; ausência de T2/T5a é *aceitável por design* (o objetivo deles era silenciar logs que o baileys novo pode nem ter), ausência de T1/T3/T6 não é.

### 3.3 Mudanças de versionamento no repo
- O `build-patches.mjs` ganha parâmetro opcional de versão p/ o banner: `node build-patches.mjs main.js main.patched.js t4_prologue.cjs "2.3.7-baileys-6.7.24"` → banner `/* evolution-api-custom 2.3.7-baileys-6.7.24 | patches T1-T6 build-time | base main.js sha256:<hash> */` (auditoria).
- Versionar também `package.json`/`package-lock.json` do evolution-api 2.3.7 com o pin `baileys@6.7.24` (ex.: `infra/evolution-api-custom/evolution-src/`) para o CI não depender de rede/git mutável — ou, se preferir clonar no CI, **travar a tag `2.3.7`** e aplicar o pin por comando (recomendado: clonar + `npm install baileys@6.7.24 --save-exact`, que é autossuficiente).

### 3.4 Label da imagem
Adicionar no Dockerfile custom (auditoria/imutabilidade):
```dockerfile
LABEL org.opencontainers.image.version="2.3.7" \
      org.opencontainers.image.description="... baileys 6.7.24 ..." \
      com.atomicabr.baileys="6.7.24"
```

---

## 4) Passo 3 — Pipeline GHCR (parametrização do workflow)

Workflow atual: `.github/workflows/publish-evolution-api-custom.yml` — extrai `main.js` da base oficial → `build-patches.mjs` → buildx → push (tags sha12 + `:2.3.7`).

### 4.1 Mudanças propostas (diff conceitual)
```yaml
on:
  workflow_dispatch:
    inputs:
      baileys_version:
        description: 'Versão do Baileys (pin exato)'
        required: false
        default: '6.7.24'
        type: string
      evolution_ref:
        description: 'Tag/branch do evolution-foundation/evolution-api'
        required: false
        default: '2.3.7'
        type: string
      base_image:
        description: 'Imagem base oficial (digest imutável)'
        required: false
        default: 'evoapicloud/evolution-api@sha256:6b195676b09abbbd8ac9372cd961674dea2587f23dc9bc1d1e6a595372556fb1'
        type: string
  push:
    paths: ['infra/evolution-api-custom/**']
    branches: [main]
```
**Novo job `build-evolution-source`** (ubuntu-latest, `actions/setup-node@v4` com node 24):
1. `git clone --depth 1 --branch ${{ inputs.evolution_ref }} https://github.com/evolution-foundation/evolution-api.git evo-src`
2. `cd evo-src && npm install baileys@${{ inputs.baileys_version }} --save-exact`
3. `cp .env.example .env && export DATABASE_PROVIDER=postgresql DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" && npm run db:generate`
4. `npm run build`
5. `actions/upload-artifact@v4` → `dist/main.js` + `dist/main.mjs` (nome: `evo-main-${{ inputs.baileys_version }}`)

**Job `build-and-push` (alterado):**
- Substituir o passo "Extract original main.js from base image" por `actions/download-artifact` (main.js vindo do source build);
- `node build-patches.mjs main.js main.patched.js t4_prologue.cjs "2.3.7-baileys-${{ inputs.baileys_version }}"` (modo tolerante do §3.2);
- **Smoke test** (§1.1) como step fail-closed ANTES do buildx;
- Tags: sha12 + `:2.3.7` + **`:2.3.7-baileys-${{ inputs.baileys_version }}`** (tag estável e identificável);
- `build-args: BASE_IMAGE=${{ inputs.base_image }}` (mantém Design B);
- Registrar digest da imagem publicada em `$GITHUB_OUTPUT` (`digest` via `docker buildx imagetools inspect --format '{{.Manifest.Digest}}'`).

> A trigger `push` continua disparando nos dois designs; para o Plano B o disparo canônico é **`workflow_dispatch` com os inputs acima** (permite re-build com `7.0.0-rc14` no futuro sem tocar o YAML).

---

## 5) Passo 4 — Deploy com rollback garantido

> ⚠️ **Nada aqui foi executado.** Comandos de referência para a fase de execução (via Portainer ou SSH na VPS).

### 5.1 Pré-flight (obrigatório, ~15 min)
```bash
# a) Resolver o digest atual da imagem custom NO GHCR (confere o prefixo 9d110bc7)
docker manifest inspect ghcr.io/adm01-debug/zapp-web-v3/evolution-api-custom:2.3.7
#   → anotar "Digest: sha256:9d110bc7..." COMPLETO → ROLLBACK_DIGEST
#   (se o token local não tiver read:packages, rodar na VPS, onde o pull já funciona)

# b) Digest EM EXECUÇÃO no Swarm (fonte da verdade do rollback)
docker service inspect --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}' evolution
#   → deve ser ghcr.io/adm01-debug/zapp-web-v3/evolution-api-custom@sha256:9d110bc7...

# c) Confirmar que o serviço vivo tem o update_config correto
docker service inspect --format '{{json .Spec.UpdateConfig}}' evolution
#   → {"Parallelism":1,"Delay":30000000000,"FailureAction":"rollback","Monitor":180000000000,"Order":"stop-first",...}

# d) Exportar o stack file vivo do Portainer (backup do compose real — o repo está defasado, F14)

# e) Janela: baixo tráfego (recomendado 02:00–05:00 BRT). Comunicação prévia aos usuários do wpp2.
```

### 5.2 Deploy
```bash
# Opção A — Portainer (recomendada): editar a stack viva → imagem do serviço evolution:
#   ghcr.io/adm01-debug/zapp-web-v3/evolution-api-custom@sha256:<NOVO_DIGEST_COMPLETO>
#   → Update (mantém secrets, configs, volumes, entrypoint, update_config)

# Opção B — CLI equivalente:
docker service update --image ghcr.io/adm01-debug/zapp-web-v3/evolution-api-custom@sha256:<NOVO_DIGEST> evolution
```
**Invariantes do deploy (não mexer):**
- Volume `evolution_instances` (sessão do `wpp2` preservada — sem re-pairing);
- Secrets e configs atuais (chave v5, rabbitmq, s3, metrics);
- `update_config` com `order: stop-first` → downtime breve (~1–3 min) durante a troca de task;
- **NÃO** deletar instância / **NÃO** pedir QR do `wpp2** durante a transição (evita cooldown — F17/L-2).

### 5.3 Rollback (garantido por 3 camadas)
1. **Automático (Swarm):** `failure_action: rollback` + `monitor: 180s` — se o healthcheck da task nova falhar por 3×30s, o Swarm reverte sozinho para o spec anterior (digest `9d110bc7…`).
2. **Manual imediato (CLI/Portainer):**
   ```bash
   docker service update --image ghcr.io/adm01-debug/zapp-web-v3/evolution-api-custom@sha256:<ROLLBACK_DIGEST> evolution
   # ou botão Rollback no Portainer (restaura spec anterior)
   ```
3. **Último recurso (imagem oficial 2.3.7):** `evoapicloud/evolution-api@sha256:6b195676…` — volta ao comportamento pré-custom (com logpatch runtime do entrypoint antigo, se o compose vivo ainda o tiver; caso contrário, re-aplicar configs `evolution_main_v2_js`/`evolution_logpatch_t4_cjs`).

> Nota de compatibilidade de credenciais: o formato das credenciais Baileys é estável entre 6.x/7.x — um rollback após re-pairing eventual não deve exigir novo QR, mas se a instância não abrir após rollback, seguir o playbook de re-pairing respeitando o cooldown (L-2 do incidente).

---

## 6) Passo 5 — Validação pós-deploy (checklist)

**Janela de validação:** 60 min ativos + 24–48 h de observação (enforcement do rc.9 derrubava em **segundos** pós-QR; 6.7.24 precisa provar estabilidade no tempo).

| # | Verificação | Comando/ponto de checagem | Critério de sucesso |
|---|---|---|---|
| V1 | API up + versão mascarada (T6) | `GET https://evolution.atomicabr.com.br/` (com auth) | `{"status":200,...}` e **`"version":"2.x"`** (não expor `2.3.7`) |
| V2 | Instância `wpp2` aberta | `GET /instance/fetchInstances` e `GET /instance/connectionState/wpp2` | `connectionState: open`, `disconnectionAt` **inalterado** (sem novo 401), profile correto |
| V3 | **QR funcional pós-pairing** (sintoma #2248) | Instância **descartável** `qrtest-<ts>`: `POST /instance/create` → `GET /instance/qrcode/qrtest-<ts>` → escanear com número de teste → aguardar 5–10 min | `open` **sem** 401/`device_removed` no período (o rc.9 caía em segundos); depois `DELETE` da instância de teste |
| V4 | Consumer RabbitMQ | Filas `evolution*` no management/consumer v18 | `messages.upsert` fluindo, depth normal, sem mensagens paradas; eventos `QRCODE_UPDATED`/`LOGOUT_INSTANCE`/labels OK |
| V5 | Round-trip real | Enviar mensagem do `wpp2` p/ número de controle + resposta | Envio + recebimento com webhook/consumer íntegros |
| V6 | Logs do container | `docker service logs evolution` | **Sem** "Log out instance", sem `401/device_removed`; sem spam de stanza/CACHE (T2/T5a); Sentry sem flood (T3) |
| V7 | Marcadores T1–T6 no bundle em execução | `docker exec <task> sh -c "head -c 300 /evolution/dist/main.js"` + greps | Banner `2.3.7-baileys-6.7.24`; `MASKED` (T4); `tracesSampleRate:0.05` (T3); `version:"2.x"` (T6); ausência de T1/T2/T5a |
| V8 | Auditoria A-8 | Tabela `evolution_logpatch_audit` (Supabase) | Novo registro de boot com `image_digest` = digest novo, `mode: build-time` |
| V9 | Watchdog | `watchdog-baileys v11.1` / alertas | Sem disparos; sem reinícios não programados |
| V10 | Estabilidade estendida | Re-checagem em 1 h, 6 h, 24 h, 48 h | `state=open` contínuo, sem `disconnectionAt` novo |

**Gate de sucesso:** V1–V9 verdes + V10 estável por ≥ 24 h.

---

## 7) Passo 6 — Riscos e mitigações

| # | Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|---|
| R1 | Drift de API baileys 6.7.24 × rc.9 em ponto usado pela Evolution (eventos, message processing, voice calls) | Média | Instabilidade pós-deploy | Smoke test + instância descartável (V3) **antes** de depender do `wpp2`; canário primeiro; rollback automático em 180 s |
| R2 | Targets T2/T5a ausentes no bundle novo → build-patches fail-closed aborta | Alta | CI quebra (não é incidente) | Modo tolerante §3.2 (SKIP+warn p/ count=0; FAIL só p/ ambiguidade) |
| R3 | `tsc --noEmit` com tipos 6.7.24 | Baixa (F9) | CI quebra | Corrigir mínimos na src ou fallback `npx tsup` + validação runtime |
| R4 | Novo enforcement atingir 6.7.24 (desconhecido) | Baixa–Média | Novo logout + cooldown 12–24 h | Observação 24–48 h (V10); alternativa pronta: `7.0.0-rc14` (dist-tag `latest`) quando #2248 fechar; playbook de cooldown do incidente (L-2) |
| R5 | Módulo externo do baileys 6.7.24 ausente no node_modules da base (Design B) | Baixa (F10/F11) | Boot falha | **Smoke test §1.1 fail-closed antes do push**; fallback Design A |
| R6 | Perda de sessão `wpp2` durante transição | Baixa (volume persistente) | Re-pairing + cooldown | Não tocar instância; stop-first curto; watchdog suprime restart em `device_removed` |
| R7 | Downtime do stop-first (~1–3 min) | Certa | Janela curta sem WhatsApp | Agendar em baixo tráfego; comunicar usuários do `wpp2` |
| R8 | Pull da imagem nova na VPS falha (auth GHCR/rate limit) | Baixa | Deploy emperra | Pré-flight com `docker login ghcr.io` na VPS; digest pinado (imutável) |
| R9 | Drift de stack: compose do repo ≠ stack viva (F14) | Certa (hoje) | Confusão/futuro redeploy errado | Pós-deploy: **atualizar** `infra/evolution/docker-compose.evolution.yml` + `docs/infra/evolution-stack.reconciled.yml` com o digest novo (commit em branch própria do runbook) |
| R10 | Rollback pós re-pairing com 6.7.24 | Baixa | Sessão não abre no rc.9 | Credenciais são compatíveis 6.x/7.x; se necessário, re-pairing respeitando cooldown |

---

## 8) Plano de execução faseado (quando autorizado)

| Fase | Ação | Duração | Gate p/ avançar |
|---|---|---|---|
| **0** | Pré-flight (§5.1): digests (9d110bc7), update_config vivo, backup stack, janela | ~15 min | Digests anotados; rollback alvo confirmado |
| **1** | Patch do `build-patches.mjs` (modo tolerante §3.2) + label + banner; commit em branch própria | ~30 min | `node build-patches.mjs` local com bundle 6.7.24 → SKIPs/warns esperados |
| **2** | Workflow parametrizado (§4); `workflow_dispatch` com `baileys_version=6.7.24`; smoke test no CI | ~20 min | Imagem publicada com tags `:2.3.7-baileys-6.7.24` + sha12; digest novo anotado |
| **3** | Deploy (§5.2) na janela agendada | ~5 min | Task nova `Running` + healthcheck OK; `docker service ps evolution` limpo |
| **4** | Validação V1–V9 (§6) | ~60 min | Todos verdes |
| **5** | Observação 24–48 h (V10) + sync do repo (R9) | contínuo | `state=open` contínuo; docs/compose atualizados |
| **6** | (Se qualquer gate falhar) Rollback §5.3 + post-mortem | ~5 min | Serviço no digest `9d110bc7…` ou oficial |

---

## 9) Referências

- Issue upstream: [WhiskeySockets/Baileys #2248](https://github.com/WhiskeySockets/Baileys/issues/2248) (aberta — enforcement contra rc.9)
- Release: [Baileys v6.7.24](https://github.com/WhiskeySockets/Baileys/releases/tag/v6.7.24) (29/07/2026, commit `e062994`) · npm `baileys`/`@whiskeysockets/baileys` `6.7.24` (legacy)
- Incidente: `docs/INCIDENTE-EVOLUTION-20260806.md` (lições L-1 a L-5)
- Imagem custom atual: `infra/evolution-api-custom/` (Dockerfile, build-patches.mjs, t4_prologue.cjs, docker-entrypoint.sh)
- Workflow: `.github/workflows/publish-evolution-api-custom.yml`
- Stack canônico (a atualizar pós-deploy): `infra/evolution/docker-compose.evolution.yml` · `docs/infra/evolution-stack.reconciled.yml`
- Source upstream: `evolution-foundation/evolution-api` tag `2.3.7` (package.json, tsup.config.ts, Dockerfile, tsconfig.json — verificados em 06/08/2026)
