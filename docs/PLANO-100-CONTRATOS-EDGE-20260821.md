# PLANO 100 ETAPAS — Contratos de Validação: Webhooks & Edge Functions

**Repo:** `adm01-debug/Zapp_Web_V3` · **Base:** `main @ 3380a52fb` · **Data:** 2026-08-21
**Origem:** auditoria exaustiva da malha de contratos (4 frentes paralelas — núcleo do `contract-kit`, adoção por function, testes/CI, consumo no frontend; leitura linha a linha de 11 arquivos `_shared/` + 122 `index.ts` + camada de invoke do front).
**Objetivo do usuário:** testes de contrato com validação de schema para **todos** os webhooks e edge functions, garantindo que payloads válidos e inválidos produzam respostas consistentes; envelope 422 único (código, mensagem, lista de campos); casos de campo ausente / tipo errado / valor vazio; versionamento v1/v2 com compatibilidade retroativa durante deprecação.

> **Regra de commits (multi-agente):** este documento é entregável de análise. Correções de código vão por branch + PR (nunca push direto no `main` a partir de sessão de chat) ou delegadas ao container `claude-code` — política canônica em `HERMES.md`/`CLAUDE.md`.

---

## SUMÁRIO EXECUTIVO — o que a auditoria encontrou

O ZAPP **já tem** uma infraestrutura de contratos sofisticada (`contract-kit.ts`, 125 schemas registrados, 6 camadas de teste, gate de CI). PRs #780/#927 declararam "cobertura 118/118". A auditoria confirma que a **cobertura de invocação é real** (117/122 functions chamam o gate), mas revela que a **qualidade e o enforcement degradaram** em três eixos:

1. **A métrica engana.** "118/118" conta *registro em `CONTRACT_SCHEMAS`*, não validação efetiva. Há schemas que não reprovam nada (`evolution-api` é 100% `.optional().passthrough()`), gates inalcançáveis (validação manual roda antes), gates decorativos (`.catch(() => ({}))` transforma JSON inválido em `{}` que passa — **23 functions**), e 84 de 122 nomes do registro legado caindo num fallback que aceita qualquer objeto.

2. **O gate de CI está cego desde 18/08.** `deno-contract-tests.yml` teve última conclusão real = `failure` (20/08); todos os runs em `main` desde então saem `cancelled` (`cancel-in-progress` + pushes em rajada). Localmente, HEAD atual tem **1 teste vermelho** (registro fantasma `zapp-auth-invite`) que ninguém viu.

3. **O envelope 422 canônico cobre <1% das respostas de erro reais.** O backend gera `details[]` com o campo que errou — e o frontend **descarta 100% das vezes** (nenhum call-site de `functions.invoke` lê `details`). Coexistem **5 formatos de erro** distintos; `{error: "string"}` aparece em **319 chamadas / 64 arquivos**.

### Achados de SEGURANÇA (fura a fila — Bloco 0)

| ID | Severidade | Function | Problema |
|---|---|---|---|
| **SEC-1** | 🔴 P1 | `gmail-webhook` | Bypass de auth: `action` truthy ≠ `registerWatch` pula token E `requireUser` → `POST {"action":"x","message":{"data":"<b64>"}}` sem token e sem JWT chega ao processamento. O campo que o contrato valida é justamente o que abre o buraco. |
| **SEC-2** | 🔴 P1 | `transcribe-audio-internal` | `audioUrl` vai direto a `fetch()` sem validação de host/esquema → **SSRF** para a rede interna a partir de qualquer caller com `HEALTH_SECRET`. |
| **SEC-3** | 🟠 P2 | `download-wa-status-media` | `status_id` entra sem sanitização no path do storage (`status/<data>/${status_id}.${ext}`) → path traversal / poluição de bucket. |
| **SEC-4** | 🟠 P2 | vários `*_url` internos | `evolution-credentials-write.api_url`, `zapp-n8n-sync.baseUrl`, `imap_host`/`smtp_host` sem `.url()` nem bloqueio RFC-1918 (o `isSafeHttpsUrl` de `schemas.ts:66` existe e é usado só nos schemas de IA). |
| **SEC-5** | 🟡 P3 | `whatsapp-cloud-webhook` | Sem `APP_SECRET`, a verificação `X-Hub-Signature-256` só emite `console.warn` e **segue** (não fail-closed, ao contrário de `evolution-webhook` e `zapp-email-inbound-webhook`). |

---

## MAPA DE ACHADOS (referência para as etapas)

### A. Núcleo `contract-kit.ts`
- **A1** Headers de versão/sunset **nunca chegam ao cliente**: `parseOrReject` devolve `parsed.headers`/`parsed.version`/`parsed.deprecated`, mas **zero handlers de produção** os consomem. Versionamento é invisível na prática (`contract-kit.ts:76,158-167`).
- **A2** `sunset` é warning que se auto-desliga: quando a data passa, o aviso some mas a versão continua em `supported` e aceita silenciosamente. Nenhum código remove versão pós-sunset (`contract-versions.ts:174-180`).
- **A3** `details` truncado em 25 issues silenciosamente, sem sinalizar truncamento (`contract-kit.ts:125`).
- **A4** `resolveRequestedVersion` lê `body.version` de qualquer contrato — footgun com `.passthrough()` (campo de negócio `version` → 422 espúrio).

### B. Registro & schemas
- **B1** Registro fantasma `zapp-auth-invite` em `CONTRACT_SCHEMAS` mas fora de `CONTRACTS` → **teste vermelho hoje** (`contract-schemas.ts:1208` vs `contract-versions.ts:58`). Invariante de CI só checa a direção CONTRACTS→SCHEMAS.
- **B2** Dois registros com o mesmo nome e **schemas diferentes** (drift não pego pelo CI, que só compara chaves): `whatsapp-cloud-webhook@v2`, `warroom-monthly-test`, `detect-new-device`, `zapp-auto-export`, `zapp-email-send` (canônico tem `superRefine`, legado não).
- **B3** `voice-changer`: registro aponta para schema multipart com `audio` obrigatório, mas o handler usa schema inline → **o registro não é o contrato efetivo** (`contract-schemas.ts:1253` vs `voice-changer/index.ts:90`).
- **B4** Fallback `NonEmptyObjectSchema.or(NoBodySchema)`: **84 de 122** nomes do registro legado caem nele (aceita qualquer objeto ≥1 campo), incl. `public-api`, `webauthn`, `sicoob-bridge`, `whatsapp-cloud-send`, `mcp-query`, `secure-upload` (`edge-contract-schemas.ts:521`).
- **B5** Schemas incapazes de reprovar: `EvolutionApiV1Schema` 100% `.optional().passthrough()`; 15 aliases `EmptyStrictV1Schema`; 5 stubs `z.object({}).passthrough()`.

### C. Formato de campos críticos
- **C1** Telefones sem E.164: `whatsapp-cloud-send.to` = `z.string().min(5)` no registro **efetivo** (a versão com regex `/^\d{10,15}$/` existe no registro legado, mas o gate lê `CONTRACT_SCHEMAS`). Também `whatsapp-cloud-api`, `zapp-crm-sync`, `evolution-api`, `fetch-whatsapp-avatar`.
- **C2** UUIDs como string solta: `ticket-router.contact_id`, `sla-alert-forward.contact_id`, `talkx-add-recipients.contactIds[]` (até 1000, sem formato), `sicoob-bridge-reply.{contact_id,message_id,agent_id}` (optional sem min/max), `contacts-import.workspace_id`. Inconsistência: `evolution-credentials-write` usa regex manual, `zapp-auto-export` usa `.uuid()`.
- **C3** E-mails sem `.email()`: `ImapSmtpConfig.email`, `zapp-email-inbound-webhook.{from,to[]}`, `webauthn.userEmail`, `sicoob.sender_email`.
- **C4** `z.any()` no payload inteiro do `evolution-webhook` (`webhook-schemas.ts:19`) e nos arrays Meta (`contacts`/`messages`/`statuses`).

### D. Adoção real por function
- **D1** Antipadrão `.catch(() => ({}))` em **23 functions** neutraliza `invalid_json` (JSON malformado vira `{}` e passa). Correto: `.catch(() => null)`.
- **D2** Gate inalcançável: `zapp-email-inbound-webhook` (validação manual `validateMinimalPayload` roda antes; o 422 canônico nunca é atingido — Resend sempre vê 400 artesanal com `details: string[]`).
- **D3** Gate depois de leitura: `whatsapp-cloud-webhook` lê `body.object`/`body.entry` antes do gate; `ai-router` parseia body antes do HMAC.
- **D4** 5 functions sem gate (cobertura fantasma via registro): `download-wa-status-media`, `email-health`, `transcribe-audio-internal`, `warroom-monthly-test`, `zapp-google-calendar-sync`.

### E. Testes & CI
- **E1** Gate `deno-contract-tests` não conclui em `main` (`cancelled` em série; última real = `failure`).
- **E2** Ponto cego do scanner de cobertura: só examina functions que leem body (`if (!readsBody) continue`) → 3 das 5 sem gate passam invisíveis.
- **E3** Matriz adversarial fina (campo-ausente/tipo-errado/vazio por campo) roda contra **1 contrato** (`talkx-send`); os outros ~118 só recebem `null`/primitivo/`v99`/`{}`.
- **E4** `undefined` nunca testado (só `null`) em toda a malha.
- **E5** Dois envelopes 422 testados como canônicos: `contract-kit` (com `contract`) vs `validation.ts:371` `contractErrorResponse` (com `fields[]`, sem `contract`), este assertado em `edge-contract-schemas.test.ts:250`.
- **E6** `sicoob-bridge`/`sicoob-bridge-reply` têm `sunset` declarado mas ficaram fora de `WEBHOOK_FIXTURES` — sem teste de retrocompat na deprecação.
- **E7** Só 6 de 124 contratos têm v2; versionamento não é sistêmico.

### F. Frontend (consumo do 422)
- **F1** Nenhum wrapper central de `invoke`: 153 call-sites em 88 arquivos, cada um tratando erro sozinho.
- **F2** `isContractErrorResponse` (parser do envelope canônico, com `details[]`) existe e é **órfão** — zero call-sites de `invoke` o usam.
- **F3** Extrator "esperto" do admin (`useAdminData.ts:121`) exige `typeof body.error === 'string'`, mas o envelope tem `error: true` (boolean) → **todo 422 de `invite-user`/`create-user` degrada para toast genérico**.
- **F4** CSAT silencioso: `CloseConversationDialog.tsx:89` chama `csat-auto-send` sem capturar `{error}`; o `catch` é inalcançável (supabase-js retorna, não lança) → 422 100% invisível.
- **F5** `contacts-import` mostra `"FunctionsHttpError: ...non-2xx status code"` numa importação de até 50k linhas — nenhuma linha/coluna inválida apontada.
- **F6** `gmailApi.ts` reescreve todo erro como `{code:500, status:'INTERNAL'}` → um 422 de validação vira 500 em toda a superfície Gmail.
- **F7** Drift de schema FE↔BE sem guard: `criticalPayloadSchemas` tem cópia no front e (até #1354) no back; o espelho backend foi **deletado**, o front continua em uso. Nenhum script compara schemas de contrato FE↔BE.

---

## ORDEM DE EXECUÇÃO RECOMENDADA

`Bloco 0 (segurança) → Bloco 1 (destravar CI) → Bloco 2 (envelope único) → Bloco 3 (gate real) → Bloco 4 (formato de campos) → Bloco 5 (versionamento) → Bloco 6 (testes por contrato) → Bloco 7 (frontend) → Bloco 8 (guard-rails) → Bloco 9 (limpeza) → Bloco 10 (validação final)`

Bloco 0 fura a fila: SEC-1 e SEC-2 são exploráveis. Cada bloco fecha com um **checkpoint** verificável.

---

## BLOCO 0 — Segurança (fura a fila) · etapas 1–10

| # | Etapa | Alvo | Checkpoint |
|---|-------|------|-----------|
| 1 | **SEC-1**: fechar bypass de `action` em `gmail-webhook` — trocar `if (!action)` por allowlist de ações; exigir push-token em TODO caminho não-`registerWatch` | `gmail-webhook/index.ts:48` | teste: `POST {action:'x',message:{...}}` sem token → 401 |
| 2 | **SEC-2**: validar `audioUrl` com `isSafeHttpsUrl` (bloqueio RFC-1918/link-local) antes do `fetch` | `transcribe-audio-internal/index.ts:40` + schema | teste: `audioUrl` apontando p/ `169.254.x`/`10.x` → 422 |
| 3 | Adicionar `parseOrReject` real em `transcribe-audio-internal` (hoje só truthy-check) + remover da allowlist de cobertura | `transcribe-audio-internal`, `contract-coverage.test.ts:36` | gate presente; allowlist −1 |
| 4 | **SEC-3**: sanitizar `status_id` (regex alfanumérico) antes de compor o path do storage | `download-wa-status-media/index.ts:66` | teste: `status_id='../x'` → rejeitado |
| 5 | Adicionar `parseOrReject` em `download-wa-status-media` (usar `DownloadWaStatusMediaV1Schema` já registrado) + remover da allowlist | idem, `contract-coverage.test.ts:35` | gate presente; allowlist −1 (volta a 2) |
| 6 | **SEC-4**: aplicar `isSafeHttpsUrl` em `evolution-credentials-write.api_url`, `zapp-n8n-sync.baseUrl`, `imap_host`/`smtp_host` | `contract-schemas.ts:423,472,332,335` | teste por campo: URL interna → 422 |
| 7 | **SEC-5**: fail-closed no `whatsapp-cloud-webhook` quando `APP_SECRET` ausente (503, paridade com `evolution-webhook`) | `whatsapp-cloud-webhook/index.ts:250-254` | teste: sem secret → 503, não 200 |
| 8 | Auditar `warroom-monthly-test` e `main`: JWT decodificado sem verificar assinatura — confirmar que o gateway (`main`) valida antes; documentar a premissa | `warroom-monthly-test/index.ts:31-43` | ADR curto registrando a fronteira de confiança |
| 9 | Escrever specs de segurança dos 5 achados (SEC-1..5) em `__tests__/contract.test.ts` das respectivas functions | novos testes | 5 specs verdes |
| 10 | **CHECKPOINT BLOCO 0**: `deno test` dos 5 arquivos passa; PR de segurança isolado aberto e revisado | — | PR verde, sem tocar em lógica de negócio |

---

## BLOCO 1 — Destravar o CI (o gate está cego) · etapas 11–18

| # | Etapa | Alvo | Checkpoint |
|---|-------|------|-----------|
| 11 | Corrigir o teste vermelho **B1**: remover `zapp-auth-invite` de `CONTRACT_SCHEMAS` (a edge virou `invite-user`) | `contract-schemas.ts:855,1208` | `contract-kit.test.ts:206` verde |
| 12 | Adicionar invariante bidirecional: `CONTRACT_SCHEMAS ⊆ CONTRACTS` também (hoje só a inversa é checada — B1 passou despercebido) | `contract-registry-integrity.test.ts` | novo teste pega registro órfão futuro |
| 13 | Resolver o **cancel-in-progress** (E1): mudar `concurrency` para não cancelar runs de `main` (só de PR), ou usar `group` que não colida entre pushes | `deno-contract-tests.yml:25-27` | runs de `main` concluem |
| 14 | Rodar o workflow manualmente 1x no `main` atual e confirmar verde ponta a ponta | GitHub Actions | run `success` registrada |
| 15 | Padronizar label do runner (`[Linux, X64,/vps-zapp]` vs `[Linux, X64, vps-zapp]`) entre `deno-contract-tests.yml` e `edge-parse-gate.yml` | ambos workflows | labels idênticos |
| 16 | Adicionar alerta quando o cron diário falhar 2x seguidas (hoje falhou 18+19/08 sem ninguém agir) | workflow/notificação | alerta configurado |
| 17 | Fechar **E2** (ponto cego do scanner): estender `contract-coverage.test.ts` para também exigir gate/registro em functions que leem **query string** ou multipart, não só `req.json()` | `contract-coverage.test.ts:69` | 3 functions antes invisíveis agora contam |
| 18 | **CHECKPOINT BLOCO 1**: CI verde no `main`, cron alertando, 0 testes vermelhos locais (`deno test _shared/__tests__/` = 100% pass) | — | badge verde estável |

---

## BLOCO 2 — Envelope de erro único (código+mensagem+campos) · etapas 19–30

Objetivo do usuário: "formato único de resposta de erro (código, mensagem e lista de campos) para todas as falhas 422". Hoje há 5 formatos.

| # | Etapa | Alvo | Checkpoint |
|---|-------|------|-----------|
| 19 | Decidir o envelope canônico ÚNICO e documentar (já existe: `{error,code,message,contract,requestId?,details[]}`) — ADR fixando que `details[]` é a "lista de campos" (`{path,message}`) | `docs/CONTRACT_TESTING.md` | ADR publicado |
| 20 | Eliminar **E5**: reconciliar `contractErrorResponse` (`validation.ts:371`, com `fields[]`) com o canônico — ou remover, ou mapear `fields[]`→`details[]` | `validation.ts:371-394` | 1 só shape de 422 |
| 21 | Substituir os 2 `parseBody` homônimos (assinatura invertida, **status 400**) pelo gate 422 nas 6 functions que ainda os usam | `schemas.ts:288`, `validation.ts:658` | 0 respostas 400 de validação |
| 22 | `evolution-api` **B/D**: unificar os 3 shapes de erro inline (incl. o 422 fora do envelope `{error:'Invalid instance name'}`) no canônico | `evolution-api/index.ts:97-130` | 1 shape |
| 23 | `zapp-email-inbound-webhook` **D2**: remover `validateMinimalPayload`, deixar o schema+gate mandarem (para de emitir 400 com `details: string[]`) | `zapp-email-inbound-webhook/index.ts:191` | 422 canônico atingível |
| 24 | `whatsapp-cloud-webhook` **D3**: mover `isBenignEmptyNotification` para depois do gate ou reescrever sem ler campos crus; `invalid_json` 400→422 | `whatsapp-cloud-webhook/index.ts:259-279` | sem leitura pré-gate |
| 25 | `securityErrorResponse` (envelope com `details` objeto) — documentar como exceção **explícita** e única (scan de vírus), não mais um formato ad-hoc | `validation.ts:339` | exceção registrada no ADR |
| 26 | Reduzir os 319 `{error:"string"}`: criar helper `errorEnvelope()` e migrar os erros não-validação (auth/500) para shape consistente com `code`/`message` | `validation.ts:279`, `cors.ts:70` | −80% de `{error:"string"}` |
| 27 | **D1**: trocar os 23 `.catch(() => ({}))` por `.catch(() => null)` para reativar `invalid_json` | 23 functions | teste: body malformado → 422 `invalid_json` |
| 28 | Remover truncamento silencioso de `details` (A3): quando >25 issues, sinalizar `truncated:true` ou elevar limite | `contract-kit.ts:125` | resposta indica truncamento |
| 29 | Teste: para CADA function, um payload inválido produz exatamente o envelope canônico (estender `contract-cross-endpoint.test.ts` para exercitar via `fetch` mockado, não só em memória) | novo teste | 1 shape em N functions reais |
| 30 | **CHECKPOINT BLOCO 2**: grep de shapes de erro no repo mostra 1 canônico + 1 exceção documentada (segurança); `unified-error-format.test.ts` cobre os codes todos | — | inventário de shapes = 2 |

---

## BLOCO 3 — Gate que realmente reprova · etapas 31–40

| # | Etapa | Alvo | Checkpoint |
|---|-------|------|-----------|
| 31 | **B5** `EvolutionApiV1Schema`: endurecer — `action` obrigatória (enum), tipar `key`/`message` mínimos em vez de `z.unknown()` | `contract-schemas.ts:916-926` | payload `{}` → 422 |
| 32 | `evolution-api` **D3**: derivar `action` do path ANTES do gate e validar contra o enum do schema | `evolution-api/index.ts:90` | action inválida → 422 |
| 33 | Trocar os 5 stubs `z.object({}).passthrough()` por `.strict()` onde há forma conhecida; documentar os genuinamente sem-body | `contract-schemas.ts:69,75,238,241,244` | stubs justificados ou apertados |
| 34 | **B3** `voice-changer`: reconciliar o registro (`VoiceChangerMultipartV1Schema`) com o schema efetivo do handler | `contract-schemas.ts:1253`, `voice-changer/index.ts:90` | registro == efetivo |
| 35 | Adicionar invariante que compara **schemas** (não só chaves) entre `CONTRACT_SCHEMAS` e `EdgeFunctionContractSchemas` — pega **B2** | `contract-registry-integrity.test.ts:188` | drift falha o CI |
| 36 | Resolver os 6 drifts de B2 (`whatsapp-cloud-webhook@v2`, `warroom-monthly-test`, `detect-new-device`, `zapp-auto-export`, `zapp-email-send`, `evolution-consumer-stats`) | ambos registros | schemas idênticos ou 1 removido |
| 37 | **B4**: reduzir os 84 fallbacks `NonEmptyObjectSchema.or(NoBodySchema)` — priorizar functions de alto tráfego/risco (public-api, webauthn, sicoob-bridge, mcp-query) | `edge-contract-schemas.ts:521` | −50% dos fallbacks nos críticos |
| 38 | `elevenlabs-scribe-token`, `talkx-scheduler`, `lgpd-scheduled-jobs` **D1**: `EmptyStrictV1Schema` + `.catch(()=>null)` para que body inesperado reprove | respectivas | body extra → 422 |
| 39 | `sicoob-bridge-reply`: promover o schema placeholder (tudo optional) para exigir `contact_id`+`content` de fato (hoje validação é manual em `:52`) | `contract-schemas.ts:609-615` | schema reprova o que o handler exige |
| 40 | **CHECKPOINT BLOCO 3**: rodar payload `{}` e `{lixo:1}` contra as 20 functions críticas — todas 422; nenhuma "coberta mas incapaz de reprovar" | — | matriz 20×2 verde |

---

## BLOCO 4 — Formato de campos críticos · etapas 41–52

| # | Etapa | Alvo | Checkpoint |
|---|-------|------|-----------|
| 41 | **C1** telefones: criar `phoneE164Schema` compartilhado (reuso do transform de `public-api`/`criticalPayloadSchemas`) | novo helper em `contract-schemas.ts` | 1 fonte de verdade p/ telefone |
| 42 | Aplicar `phoneE164Schema` em `whatsapp-cloud-send.to` (hoje `min(5)`), `whatsapp-cloud-api`, `zapp-crm-sync`, `evolution-api`, `fetch-whatsapp-avatar` | respectivos | telefone inválido → 422 |
| 43 | **C2** UUIDs: criar `uuidField` e aplicar em `ticket-router.contact_id`, `sla-alert-forward.contact_id`, `talkx-add-recipients.contactIds[]`, `contacts-import.workspace_id` | contract-schemas-infra.ts, contract-schemas.ts | UUID malformado → 422 |
| 44 | `sicoob-bridge-reply.{contact_id,message_id,agent_id}`: min/max + `.uuid()` onde aplicável | `contract-schemas.ts:610-614` | validado |
| 45 | Padronizar `evolution-credentials-write` (regex manual) → `.uuid()` para consistência com `zapp-auto-export` | `contract-schemas.ts:431` | consistente |
| 46 | **C3** e-mails: criar `emailField` (com `.email()`+max) e aplicar em `ImapSmtpConfig.email`, `zapp-email-inbound-webhook.{from,to[]}`, `webauthn.userEmail`, `sicoob.sender_email` | respectivos | e-mail inválido → 422 |
| 47 | **C4** apertar `z.any()` do `evolution-webhook`: tipar ao menos a discriminação de evento (o `event`/`type`), mantendo `data` tolerante mas não `any` cru | `webhook-schemas.ts:19` | evento sem `type` → 422 |
| 48 | Tipar os arrays Meta (`contacts`/`messages`/`statuses`) com shape mínimo em vez de `z.array(z.any())` | `webhook-schemas.ts:50-52`, `edge-contract-schemas.ts:210` | estrutura mínima exigida |
| 49 | Revisar os 24 `z.unknown()` em posição crítica — priorizar `evolution-api.key/message`, `bitrix-api.data/filters`, `mcp-query.sql` (limitar/validar) | mapa §5.2 do relatório | críticos tipados |
| 50 | Apertar `.passthrough()` dos endpoints **internos** (não-webhook): `create-user`, `zapp-auth-sessions`, `evolution-credentials-write`, `mcp-server`/`mcp-query` → `.strict()` | `contract-schemas.ts:790,838,419` + infra:280 | internos estritos |
| 51 | Teste por campo: para cada campo endurecido (41–50), um caso válido + um inválido | novos testes | matriz de campo verde |
| 52 | **CHECKPOINT BLOCO 4**: relatório de "campos frouxos restantes" gerado por script; críticos = 0 | — | inventário limpo |

---

## BLOCO 5 — Versionamento v1/v2 e retrocompat · etapas 53–62

Objetivo do usuário: "versionamento de contratos (v1/v2) e testes garantindo compatibilidade retroativa enquanto uma versão é descontinuada".

| # | Etapa | Alvo | Checkpoint |
|---|-------|------|-----------|
| 53 | **A1**: fazer os handlers propagarem `parsed.headers` na resposta de sucesso (hoje `x-contract-version`/`sunset` nunca chegam ao cliente) — começar pelos 6 webhooks com v2 | 6 `index.ts` | resposta traz header de versão |
| 54 | Helper `respondWithContract(parsed, body)` que anexa os headers automaticamente, para não repetir em 108 functions | novo helper contract-kit | 1 ponto de anexação |
| 55 | **A2**: definir política de sunset — o que acontece quando a data passa (remover de `supported`? 410?) e implementar a transição | `contract-versions.ts` + kit | comportamento pós-sunset definido |
| 56 | **E6**: adicionar `sicoob-bridge` e `sicoob-bridge-reply` a `WEBHOOK_FIXTURES` (têm sunset declarado, sem teste de retrocompat) | `contract-versioning.test.ts:83` | retrocompat testada |
| 57 | `send-scheduled-report` (tem v2, sem `__tests__/`): criar suíte de contrato + retrocompat | novo teste | v2 testada |
| 58 | Teste de **migração** real: mesmo handler aceita cliente v1 e v2 simultaneamente; payload v1 → resposta compatível | novos testes | coexistência provada |
| 59 | **A4**: proteger `resolveRequestedVersion` de ler `body.version` quando o contrato tem campo de negócio homônimo (só ler de `.passthrough()` se declarado) | `contract-kit.ts:113` | sem 422 espúrio |
| 60 | Documentar o fluxo de deprecação ponta a ponta (declarar sunset → header ao cliente → janela → remoção) em runbook | `docs/CONTRACT_TESTING.md` | runbook publicado |
| 61 | Teste: versão em sunset ATIVO continua aceita + emite header; versão pós-sunset segue a política de 55 | `contract-versioning.test.ts` | ambos casos verdes |
| 62 | **CHECKPOINT BLOCO 5**: os 6 contratos v2 têm retrocompat testada e headers propagados; política de sunset implementada e coberta | — | versionamento ponta a ponta |

---

## BLOCO 6 — Cobertura de teste por contrato · etapas 63–74

**E3**: hoje a matriz adversarial fina roda contra 1 contrato. Objetivo: campo-ausente/tipo-errado/vazio para **todos**.

| # | Etapa | Alvo | Checkpoint |
|---|-------|------|-----------|
| 63 | Criar gerador de matriz adversarial: dado um schema Zod, derivar automaticamente casos (campo obrigatório ausente, tipo trocado, string vazia, enum inválido, campo extra) | novo util de teste | gerador funcional |
| 64 | Rodar o gerador sobre os 125 contratos (loop), não só `talkx-send` — cada contrato recebe a matriz fina | `contract-matrix.test.ts` estendido | 125 × 5 eixos |
| 65 | **E4**: adicionar eixo `undefined` vs `null` vs ausente (hoje só `null`) ao gerador | idem | distinção coberta |
| 66 | Adicionar eixo "campo extra desconhecido" como **rejeição** nos schemas `.strict()` (hoje só `talkx-send`) | idem | strict rejeita extra |
| 67 | Happy-path por contrato: um payload VÁLIDO mínimo passa (hoje implícito só em alguns) | idem | 125 happy-paths |
| 68 | Testar via `fetch` contra handler real (mockado), não só `parseOrReject` em memória — pega gate-inalcançável/gate-decorativo | novos testes de integração | E2 real coberto |
| 69 | Suítes `__tests__/contract.test.ts` para as functions sem teste próprio (hoje 25/124) — priorizar webhooks e alto tráfego | novas suítes | +N functions com teste dedicado |
| 70 | Teste específico para o antipadrão `.catch(()=>({}))` — garantir que nenhuma function nova o reintroduza | novo lint/teste | guard contra regressão |
| 71 | Teste que `parsed.headers` são propagados (regressão de A1) | novo teste | headers testados |
| 72 | Cobertura de multipart/form-data e query-param (hoje fora do denominador) | `voice-changer`, `email-track-*`, `contact-media` | caminhos não-JSON testados |
| 73 | Baseline de contagem: registrar nº de casos antes/depois no CI (padrão do repo) | relatório de teste | número documentado |
| 74 | **CHECKPOINT BLOCO 6**: matriz adversarial roda para 100% dos contratos; `deno test` conta ≥N casos; 0 gate-decorativo sobrevive | — | cobertura fina universal |

---

## BLOCO 7 — Frontend: consumir o 422 · etapas 75–86

**F1–F7**: o backend gera `details[]` e o front descarta 100%.

| # | Etapa | Alvo | Checkpoint |
|---|-------|------|-----------|
| 75 | Criar `invokeEdge()` em `src/lib/` que envolve `functions.invoke`, lê `error.context.json()`, aplica `isContractErrorResponse` e retorna `{ok:false, code, message, fieldErrors: Record<string,string>}` | novo `src/lib/invokeEdge.ts` | wrapper testado |
| 76 | **F3**: corrigir `useAdminData.ts:121` — o extrator exige `error === 'string'` mas o envelope tem `error: true`; migrar para `invokeEdge` | `useAdminData.ts` | 422 de invite/create-user mostra campo |
| 77 | **F4**: `CloseConversationDialog.tsx:89` — capturar `{error}` do CSAT (hoje silencioso total); migrar para `invokeEdge` | `CloseConversationDialog.tsx` | erro de CSAT visível |
| 78 | **F5**: `ContactImportDialog` — mostrar linha/coluna inválida do 422 em vez de `String(FunctionsHttpError)` | `ContactImportDialog.tsx:170` | usuário vê campo errado |
| 79 | **F6**: `gmailApi.ts` — parar de reescrever 422 como 500; preservar `code`/`details` | `gmailApi.ts` (16 call-sites) | 422 preservado |
| 80 | Migrar os 5 fluxos com payload de usuário (invite-user, send-email, contacts-import, csat, request-password-reset) para exibir `fieldErrors` | respectivos formulários | campo inválido destacado |
| 81 | Reaproveitar o mapeamento `issue.path[0]→campo` de `useAuthForm.ts` para os erros vindos de `details[]` do servidor | `useAuthForm.ts:213` | erro de servidor por campo |
| 82 | **D-front (10 piores)**: corrigir os catches vazios/inalcançáveis de maior impacto (SLA, speech-to-text, gmail watch renewal, batch-fetch-avatars) | mapa §D do relatório | erros não mais engolidos |
| 83 | **F7**: decidir o destino de `criticalPayloadSchemas` (espelho backend deletado no #1354) — codegen a partir do backend ou fonte única compartilhada | `src/shared/criticalPayloadSchemas.ts` | drift eliminado |
| 84 | Migração incremental dos 88 arquivos com `invoke` para `invokeEdge` (priorizar fluxos com payload de usuário) | src/ | −X call-sites crus |
| 85 | Teste (Vitest) do `invokeEdge`: dado um 422 canônico mockado, extrai `fieldErrors` corretamente | novo teste | wrapper coberto |
| 86 | **CHECKPOINT BLOCO 7**: os 5 fluxos-alvo mostram o campo que errou; `invokeEdge` cobre os call-sites de payload de usuário | — | UX de erro por campo |

---

## BLOCO 8 — Guard-rails FE↔BE e anti-regressão · etapas 87–92

| # | Etapa | Alvo | Checkpoint |
|---|-------|------|-----------|
| 87 | Script CI que compara schemas de contrato FE↔BE (hoje inexistente — F7) e falha em drift | novo `scripts/check-contract-sync.mjs` | drift bloqueia PR |
| 88 | Guard que proíbe novo `functions.invoke` cru fora de `invokeEdge` (lint rule ou grep gate) | eslint/CI | invoke cru barrado |
| 89 | Guard que proíbe `.catch(() => ({}))` em edge functions (força `null`) | deno lint rule | antipadrão barrado |
| 90 | Guard que proíbe novo shape de erro fora do envelope canônico (grep de `{ error:` literais) | CI | shape ad-hoc barrado |
| 91 | Reduzir a allowlist de cobertura a 0 (após Bloco 0 tê-la esvaziado) e travar o teto em 0 | `contract-coverage.test.ts:98` | allowlist vazia |
| 92 | **CHECKPOINT BLOCO 8**: PR de teste tentando reintroduzir cada antipadrão é barrado pelo CI | — | 4 guards ativos |

---

## BLOCO 9 — Limpeza de dívida · etapas 93–96

| # | Etapa | Alvo | Checkpoint |
|---|-------|------|-----------|
| 93 | Remover o sistema legado B (`edge-contract-schemas.parseContractRequest`, `contractErrorResponse`) após confirmar 0 chamadores | `edge-contract-schemas.ts:589`, `validation.ts:371` | dead code removido |
| 94 | Remover `criticalPayloadSchemas.ts` de `_shared/` se confirmado dead code (0 importadores no backend) | `_shared/criticalPayloadSchemas.ts` | −1 sistema paralelo |
| 95 | Unificar os 2 `parseBody` homônimos (assinatura invertida) — deletar o de 400 ou renomear | `schemas.ts:288`, `validation.ts:658` | 1 só `parseBody` |
| 96 | Decidir destino das functions órfãs relevantes (`email-health`, `zapp-google-calendar-sync` — schema descreve API que não existe): arquivar ou realinhar contrato | ESTADO.md grupo F | contratos == realidade |

---

## BLOCO 10 — Validação final e gates de regressão · etapas 97–100

| # | Etapa | Alvo | Checkpoint |
|---|-------|------|-----------|
| 97 | Rodar a suíte completa `deno test supabase/functions/` no `main` pós-blocos — 100% verde | CI | run `success` |
| 98 | Rodar `bun run test` (Vitest) do frontend incl. `invokeEdge` e os fluxos migrados | CI | verde |
| 99 | Atualizar `docs/CONTRACT_TESTING.md` + `docs/EDGE_CONTRACT_VALIDATION.md` + `ESTADO.md` com o estado real (1 envelope, versionamento propagado, guards ativos) | docs | docs == código |
| 100 | Regenerar o knowledge graph (`graphify update`) no container VPS + snapshot do inventário de contratos (nº de schemas, cobertura fina, shapes de erro) | container `claude-code` | grafo + snapshot atualizados |

---

## APÊNDICE — Métricas de baseline (2026-08-21, `main @ 3380a52fb`)

| Métrica | Valor |
|---|---|
| Edge functions com `index.ts` | 122 |
| Com gate `parseOrReject` | 117 |
| Que leem body | 108 |
| Contratos em `CONTRACT_SCHEMAS` | 125 |
| Contratos em `CONTRACTS` | 124 |
| Contratos com v2 | 6 |
| Functions com `__tests__/contract.test.ts` | 25 |
| Antipadrão `.catch(() => ({}))` | 23 functions |
| Fallback permissivo (registro legado) | 84 de 122 nomes |
| Shapes de erro distintos em produção | 5 (+ `{error:"string"}` em 319 chamadas / 64 arquivos) |
| Call-sites `functions.invoke` no front | 153 (88 arquivos) |
| Call-sites que leem `details[]` do 422 | **0** |
| Teste de contrato vermelho hoje | 1 (`zapp-auth-invite`) |
| Última conclusão real do gate de CI | `failure` (2026-08-20) |

### Armadilhas de execução (deste ambiente)
- Deno local: a pasta `_shared/__tests__/` mistura `.test.ts` (Deno) e `.spec.ts` (Vitest); rodar só os `*.test.ts` de contrato, não a pasta inteira.
- Commits/PR: sessão de chat nunca faz push direto no `main` — branch + PR, ou delegar ao container `claude-code` (regra `CLAUDE.md`/`HERMES.md`).
- O gate de CI (`deno-contract-tests.yml`) cancela runs de `main` em rajada — validar localmente antes de confiar no verde do GitHub.
