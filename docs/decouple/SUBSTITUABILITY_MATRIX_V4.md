# SUBSTITUABILITY MATRIX V4 — Matriz de Substituibilidade por Porta (Provider WhatsApp)

**Repo:** `adm01-debug/zapp-web-v3` · **Local no repo:** `docs/decouple/SUBSTITUABILITY_MATRIX_V4.md`
**Escopo:** V4-FINAL #48–49 — para cada uma das 4 portas (P1 front adapter, P2 edge gateway, P3 ingest webhook→RPC, P4 SQL resolvers), documentar o que muda para trocar a Evolution por outro provider, esforço estimado, o que já está pronto (com evidência `arquivo:teste`) vs pendente, e a prova de mecanismo (fake provider 12/12 + `PROVIDER_UNDER_TEST`).
**Status:** DOCUMENTO DE ANÁLISE — leitura de código real em 2026-08-14 (worktree `chat-h713641`, sem git/deploy). Não refaz PR #1082. Cruzado com `RUNBOOK_TROCA_PROVIDER.md` §2; divergências corrigidas SOMENTE aqui (runbook não editado).

---

## 0. Resumo executivo

| Porta | Caminho | Esforço p/ trocar | Pronto (evidência) | Pendente |
|---|---|---|---|---|
| P1 | `src/lib/whatsappAdapter.ts` + `whatsappAdapterTransport.ts` + `whatsappAdapterTypes.ts` | **Baixo** | Roteamento dual modo `unofficial`/`official` por `resolveTransport()`; cache 30s; degraded mode; 4 edges cloud existem (`whatsapp-cloud-send`, `-webhook`, `-webhook-verify`, `-secrets-status`) | `sendInteractive` rejeitado pela edge cloud (zod 400); `sendPtv` (FormData) só Evolution; presence skip no cloud; fallback texto é condicional |
| P2 | `supabase/functions/_shared/providers/registry.ts` → `providers/evolution/client.ts` | **Médio** | Client Evolution com 12 verbos; `registry.getProviderClient()` aceita `'evolution' \| 'cloud' \| 'fake'`; fake 12/12 com guard `DENO_ENV=test`; `PROVIDER_UNDER_TEST` testado | `providers/cloud/client.ts` **não existe** (lança `not yet implemented`); nenhuma edge de produção usa o registry ainda (10+ edges importam `evolutionClient` direto) |
| P3 | `_shared/ingest-port.ts` + `evolution-webhook` → RPCs `zapp.rpc_*` | **Médio** | `ingest-port.ts` canônico (`rpc_insert_message` 21-arg, idempotente); normalizer cloud; edges cloud de webhook com contract tests; RPCs `rpc_claim_outbound_message`/`rpc_update_incoming_message` espelhados em migration | Ativação real do webhook Meta (verify + assinatura); congelamento da ingestão Evolution; dedupe no overlap dual |
| P4 | `ops.fn_evo_url()` / `ops.fn_evo_key()` (vault) | **Baixo–médio** | Padrão ADR-010 consolidado: 3 fns com uso real dos resolvers em migrations + gate `scripts/decouple/sql-gate.mjs` (whitelist + scan `prosrc`) | **Definições de `ops.fn_evo_url`/`ops.fn_evo_key` não estão versionadas no repo** (DB-as-source — só referências); resolvers cloud análogos a criar; fixture `sql_report_snapshot.json` a regenerar |

**Veredito:** a troca Evolution→outro provider é **viável por porta, sem rewrite**, porque P1 (roteamento dual) e P2 (registry + fake) já provam o mecanismo em teste. O caminho crítico é P2 (implementar client do provider novo + migrar edges para o registry) e P3 (ativação real do webhook novo). P4 é a porta mais barata graças ao gate SQL.

---

## P1 — Front adapter (egresso do app)

**Caminho:** `src/lib/whatsappAdapter.ts` (+ `whatsappAdapterTransport.ts`, `whatsappAdapterTypes.ts`) · **Modo:** `unofficial` → edge `evolution-api`; `official` → edge `whatsapp-cloud-send` (Graph API da Meta).

### (a) O que precisa mudar para trocar Evolution por outro provider

1. **Flip de modo:** o RPC que alimenta `getWhatsAppMode()` passa a resolver `official` para o workspace alvo (passo 4 do runbook). Nenhuma mudança estrutural no adapter — o roteamento dual por `resolveTransport()` já existe.
2. **Secrets:** cadastrar `whatsapp_cloud_token`/`whatsapp_cloud_phone_id`/`whatsapp_cloud_webhook_secret`/`whatsapp_cloud_verify_token` no vault e no env das edges cloud (`whatsapp-cloud-secrets-status` já valida presença).
3. **Completar suporte cloud em tipos não cobertos:** `sendInteractive` ainda é rejeitado pela edge `whatsapp-cloud-send` (zod não aceita `interactive` no enum de `type` — comentário explícito no adapter, linha 242–244); `sendPtv` (vídeo circular, FormData) só existe no caminho Evolution (linha 454); `sendPresence` no cloud retorna `{ skipped: true }`.
4. **Webhook ativo:** `getActiveWebhookUrl()` já alterna pela URL correta por modo (`whatsapp-cloud-webhook` vs `evolution-webhook`) — só reconfigurar no provedor.

### (b) Esforço estimado: **BAIXO** (mecanismo pronto; resta flip + secrets + cobrir gaps pontuais de tipo)

### (c) Pronto vs pendente (com evidência)

**JÁ PRONTO:**
- Roteamento dual por transport + cache 30s + degraded mode (secrets cloud ausentes → cai para evolution com `degraded=true` e `missingSecrets`) — `src/lib/whatsappAdapterTransport.ts`.
- Envios por tipo com payload canônico por provider: `sendText`, `sendMedia`, `sendAudio`, `sendSticker`, `sendReaction`, `sendLocation`, `sendContact`, `sendInteractive`, `sendTemplate` (só cloud), `markAsRead` — `src/lib/whatsappAdapter.ts`.
- Edges cloud implementadas: `supabase/functions/whatsapp-cloud-send/index.ts` (220 linhas; switch de tipo: text/media/template/sticker/reaction/location/contacts/read — Graph API v21.0), `whatsapp-cloud-webhook/index.ts` (272 linhas), `whatsapp-cloud-webhook-verify/index.ts`, `whatsapp-cloud-secrets-status`, `whatsapp-cloud-api`.
- Testes de modo/transporte: `src/lib/__tests__/whatsappAdapter.test.ts` — 13 `describe` cobrindo `getWhatsAppMode` (official/unofficial/fallback/cache 30s/force), `resolveTransport` (unofficial, official com creds ok, official degradado, cache), `invalidateWhatsAppModeCache`/`invalidateTransportCache`, `getActiveWebhookUrl`, `sendTemplate`, `sendPresence`, `sendText`; mais `src/lib/__tests__/whatsappAdapter.sendInteractive.test.ts`.
- Testes de contrato das edges cloud: `supabase/functions/whatsapp-cloud-webhook/__tests__/contract.test.ts`; parity: `supabase/functions/_shared/__tests__/parity.test.ts` + `whatsapp-cloud-normalizer.test.ts`.

**PENDENTE:**
- `sendInteractive` no schema da edge cloud (hoje falha 400 explícito — sem falso sucesso, mas sem envio).
- `sendPtv` em modo cloud (FormData não roteado).
- Fallback de texto para sticker/reação/location **não é automático**: `whatsapp-cloud-send` envia nativo (`payload.sticker`/`reaction`/`location`, linhas 145–176); o fallback é condicional (quando a Graph não suporta o tipo) e relatado em `error` — **divergência do runbook §2, ver §5**.

---

## P2 — Edge gateway (egresso via edge functions)

**Caminho:** `supabase/functions/_shared/providers/registry.ts` → `providers/evolution/client.ts` (12 verbos) · fake: `providers/fake/index.ts`.

### (a) O que precisa mudar para trocar Evolution por outro provider

1. **Implementar `providers/cloud/client.ts`** com a MESMA interface do `evolutionClient` (12 verbos canônicos, envelope `{ok,status,data?,error?,retries?}`) — passo 3 do runbook.
2. **Registrar no `registry.ts`** e remover o `throw 'Cloud provider client not yet implemented'` (linha 58).
3. **Migrar as edges que ainda importam `evolutionClient`/`getBaseUrl` direto** para `getProviderClient()` — hoje **nenhuma edge de produção usa o registry** (ver pendente abaixo). A edge `evolution-api/index.ts` importa apenas `getBaseUrl` de `providers/evolution/index.ts`.
4. **Rodar contrato-test 12/12** contra o client novo (parity) antes do flip.

### (b) Esforço estimado: **MÉDIO** (client novo + migração de edges + contrato-test; o arcabouço já existe e está testado)

### (c) Pronto vs pendente (com evidência)

**JÁ PRONTO:**
- `providers/evolution/client.ts` — 12 verbos: `sendText`, `sendMedia`, `sendSticker`, `getConnectionState`, `getQrCode`, `restartInstance`, `listInstances`, `listGroups`, `checkWhatsApp`, `getProfilePicture`, `get`, `post` — **SEM `sendAudio`** (áudio via `sendMedia`), retry com backoff exponencial (500ms·2^n, teto 4s), timeout 30s, API key em ponto único, envelope versionado. Confere 1:1 com o runbook §2 P2.
- `providers/registry.ts` — `getProviderClient(provider='evolution')` aceita `'evolution' | 'cloud' | 'fake'`; `PROVIDER_UNDER_TEST` **só honrado com `DENO_ENV=test`**; fora de test, a flag é ignorada e a resolução segue o provider pedido (guard absoluto, sem exceção de config).
- `providers/fake/index.ts` — **12/12 verbos espelhando o `evolutionClient`** (inclui `getProfilePicture` — o gap apontado no ensaio foi corrigido no repo), `mock()`/`reset()` por action, `FAKE_CAPABILITIES`, `assertTestEnv()` por verbo.
- **Prova de mecanismo (fake 12/12 + PROVIDER_UNDER_TEST):**
  - `supabase/functions/_shared/__tests__/registry.test.ts` — guard absoluto: `DENO_ENV=production|development` + `PROVIDER_UNDER_TEST=fake` → resolve `evolutionClient`; pedido explícito de `fake` fora de test lança; `DENO_ENV=test` + `PROVIDER_UNDER_TEST=fake` → `fakeProvider`; flag inválido (`hack`) ignorado; `'cloud'` lança `not yet implemented`.
  - `supabase/functions/_shared/__tests__/ensaio-fake.test.ts` — ensaio fake↔Evolution (etapa 57 V3, mesa/CI): **resultado `ok | 5 passed | 0 failed (216ms)`** (rodapé do arquivo): E1 guard do registry; E2 shapes canônicos com mock; E2b **0 verbos do `evolutionClient` sem par no fake** (paridade 12/12); E3 casamento fake→`normalizeBaileysMessage`→`IngestMessage` (12 campos, mapeamento 1:1, sem throw); E4 benchmark de mesa — 12 verbos × 200 iters, pior verbo `sendAudio` 0.0986ms (todos sub-ms).

**PENDENTE:**
- `providers/cloud/client.ts` **não existe** — `registry.getProviderClient('cloud')` lança `not yet implemented` (testado em `registry.test.ts`).
- **Nenhuma edge de produção usa `getProviderClient()`** (grep: zero imports de `providers/registry` fora de `_shared/providers` e testes). 10+ edges importam `evolutionClient`/`getBaseUrl` direto (ex.: `connection-health-check`, `evolution-proxy`, `evolution-credentials`, `batch-fetch-avatars`, `fetch-whatsapp-avatar`, `health`, `nps-scheduler`, `migrate-media-storage`, `recover-corrupted-audios`, `connection-test`) — a troca P2 real exige migrá-las para o registry (ou no mínimo a edge `evolution-api`), senão o client novo não é exercido.
- Contrato-test 12/12 contra um provider real diferente de Evolution nunca foi executado (o ensaio foi fake↔Evolution, sem rede).

---

## P3 — Ingestão (webhook de entrada → RPCs `zapp.rpc_*`)

**Caminho:** `supabase/functions/_shared/ingest-port.ts` + normalizers + edges `evolution-webhook` (atual) vs `whatsapp-cloud-webhook` + `whatsapp-cloud-webhook-verify` (Meta) · RPCs de escrita em `zapp`.

### (a) O que precisa mudar para trocar Evolution por outro provider

1. **Ativar webhook do provider novo:** configurar URL Meta para `whatsapp-cloud-webhook` com verify token e assinatura (passo 5 do runbook); `whatsapp-cloud-webhook-verify` responde no GET de verificação.
2. **Normalizar payload novo:** `whatsapp-cloud-normalizer.ts` já existe e é usado pela edge cloud; o `ingest-port` é agnóstico de provider (`IngestMessage.provider: 'evolution' | 'cloud'`).
3. **Congelar ingestão Evolution** no `ingest-port` (passo 6 — não deletar instância), observando `ingest_ledger` sem entradas novas do canal evolution.
4. **Garantir dedupe no overlap dual:** a chave de idempotência é `message_id + instance_ref` (`ON CONFLICT DO NOTHING`); se o provider novo gerar IDs com formato diferente (wamid vs id Baileys), duplicatas podem entrar no inbox — validar antes do overlap.

### (b) Esforço estimado: **MÉDIO** (código pronto; ativação/config real + overlap é o trabalho)

### (c) Pronto vs pendente (com evidência)

**JÁ PRONTO:**
- `_shared/ingest-port.ts` — porta única canônica: `ingestMessage()` via RPC **`rpc_insert_message` (21-arg)** com idempotência (ON CONFLICT DO NOTHING) e campos ricos ADR-004; `ingestContact()` via `rpc_upsert_contact`; comentário explícito: "NÃO importar supabase.from('evolution_messages') fora deste arquivo".
- `_shared/evolution-webhook-messages.ts` — usa `rpc_claim_outbound_message` (claim de mensagem outbound, F3-edge) + `rpc_update_incoming_message` (update de mensagem incoming) + `ingestMessage` — ou seja, **claim/update são RPCs de fluxo; a escrita canônica é `rpc_insert_message`** (divergência do runbook, ver §5).
- RPCs espelhados em migration versionada: `supabase/migrations/20260814210000_mirror_rpcs_claim_update_followup.sql` — `CREATE OR REPLACE FUNCTION zapp.rpc_claim_outbound_message(p_row_id uuid, p_message_id text, p_status text DEFAULT 'sent')` e `zapp.rpc_update_incoming_message(p_row_id uuid, p_contact_id uuid, p_content text, ..., p_ingest_meta jsonb, ...)`.
- Edge `evolution-webhook/index.ts` — HMAC multi-secret (`EVOLUTION_WEBHOOK_SECRETS`), strict mode, fallback deprecated shared-secret com gate `EVOLUTION_WEBHOOK_ALLOW_SHARED_SECRET`, proveniência `webhook_source` (consumer vs evolution-native), DLQ, instance-pause, rate-limit, Sentry.
- Normalizer do provider novo: `_shared/whatsapp-cloud-normalizer.ts` + edge `whatsapp-cloud-webhook` com contract test: `supabase/functions/whatsapp-cloud-webhook/__tests__/contract.test.ts`; parity: `_shared/__tests__/parity.test.ts`, `whatsapp-cloud-normalizer.test.ts`, `evolution-response-normalizers.test.ts`.
- Testes do fluxo atual: `supabase/functions/evolution-webhook/__tests__/contract.test.ts`, `_shared/__tests__/evolution-webhook-security.test.ts`, `hmac-multi-secret.test.ts`, `ensaio-fake.test.ts` (E3: fake→normalizer→IngestMessage sem throw).

**PENDENTE:**
- Ativação real do webhook Meta (URL + verify token + assinatura) e validação de evento de teste gravando em `zapp.evolution_messages`/inbox.
- Congelamento da ingestão Evolution no `ingest-port` (passo 6) — nunca executado.
- Validação de dedupe entre chaves de ID de providers distintos no overlap.

---

## P4 — SQL resolvers (egresso via Postgres)

**Caminho:** `ops.fn_evo_url()` / `ops.fn_evo_key()` → vault `evolution_api_url` / `evolution_api_key` · gate: `scripts/decouple/sql-gate.mjs`.

### (a) O que precisa mudar para trocar Evolution por outro provider

1. **Criar resolvers análogos** `ops.fn_cloud_url()`/`ops.fn_cloud_key()` (lendo `whatsapp_cloud_*` no vault) — manutenção do padrão ADR-010, sem hardcode.
2. **Editar as fns que montam endpoint** para usar o par novo (ex.: `fn_outbound_dispatch`, `fn_sync_lid_from_api`, `fn_validate_whatsapp_connection_url`, `fn_notify_critical_alerts`, `fn_health_preflight`).
3. **Atualizar o gate:** whitelist do `sql-gate.mjs` + fixture `sql_report_snapshot.json` regenerada; 1 ciclo do cron 317 (outbound-dispatch) sem erro; `SHOW search_path` das roles executoras correto (passo 7 do runbook).

### (b) Esforço estimado: **BAIXO–MÉDIO** (padrão consolidado e gate pronto; o volume de fns a editar é pequeno e mecânico)

### (c) Pronto vs pendente (com evidência)

**JÁ PRONTO:**
- Gate SQL enforce o padrão: `scripts/decouple/sql-gate.mjs` — `WHITELIST = ['ops.fn_evo_url', 'ops.fn_evo_key']` (linhas 31–32); regra: fn que resolve url/key **deve** usar `ops.fn_evo_url|ops.fn_evo_key` (`usesResolvers`, linha 102) e **não pode** ler `vault.decrypted_secrets` direto (violação, linhas 23–24). CI: `.github/workflows/decouple-guard.yml` + `ownership-gate.yml`.
- Uso real dos resolvers em migrations versionadas:
  - `supabase/migrations/20260814050000_fix_notify_v6_pending_view.sql:50` — `fn_notify_critical_alerts` monta URL via `ops.fn_evo_url()`.
  - `supabase/migrations/20260814130000_fn_health_preflight_check9_vault_key.sql:66-67` — `fn_health_preflight` valida `ops.fn_evo_key() IS NOT NULL` (comentário: "fn_evo_key() é o gateway canônico"; SECURITY DEFINER + search_path sem acesso direto ao vault).
  - `supabase/migrations/20260814220000_mirror_fn_validate_whatsapp_connection.sql` — mirror do corpo real de produção: `fn_validate_whatsapp_connection_url` usa `ops.fn_evo_url()`/`ops.fn_evo_key()` e monta `v_url||'/instance/connectionState/'||p_instance` (validação V6/V10 2026-08-14).

**PENDENTE:**
- **As definições de `ops.fn_evo_url()`/`ops.fn_evo_key()` NÃO estão versionadas no repo** (grep: zero `CREATE OR REPLACE FUNCTION ops.fn_evo*` em `supabase/migrations/` e `db/`; só referências). São objetos DB-as-source (vivem no banco de produção). Para a troca, versionar os resolvers (atuais e novos) é pré-requisito de rastreabilidade.
- `fn_outbound_dispatch`/`fn_sync_lid_from_api` não têm mirror com resolvers no repo (corpos atuais só em produção) — a lista "5 fns" do runbook não é integralmente verificável no repo (ver §5).
- Resolvers cloud (`ops.fn_cloud_*`) e migration versionada dos mesmos.

---

## §5. Cruzamento com RUNBOOK_TROCA_PROVIDER.md §2 — divergências corrigidas AQUI

> Regra da tarefa: o runbook não foi editado; as divergências abaixo são registradas e corrigidas somente neste documento.

| # | Runbook §2 diz | Realidade no código (2026-08-14) | Correção neste doc |
|---|---|---|---|
| D1 | P3 — "RPCs de escrita: `rpc_claim_outbound_message`, `rpc_update_incoming_message`" | A escrita canônica da porta é **`rpc_insert_message` (21-arg) via `ingest-port.ingestMessage`** + `rpc_upsert_contact`; claim/update são RPCs de fluxo (claim outbound / update incoming) usadas por `evolution-webhook-messages.ts` | §P3-(a) e (c): porta de escrita = `rpc_insert_message`/`rpc_upsert_contact`; claim/update = auxiliares |
| D2 | P2 — "Client único por provider" (registry) | O registry existe e está testado, mas **nenhuma edge de produção o usa**: 10+ edges importam `evolutionClient`/`getBaseUrl` direto; a edge `evolution-api` importa só `getBaseUrl` | §P2-(a) passo 3 e pendente: migrar edges para `getProviderClient()` é parte obrigatória da troca |
| D3 | P1 — "fallback texto p/ sticker/reação/location no modo cloud" | `whatsapp-cloud-send` envia **nativo** (`payload.sticker`/`reaction`/`location`); o fallback de texto é condicional (Graph não suporta o tipo na janela 24h) e o serviço relata em `error`, não troca silenciosamente | §P1-(c) pendente |
| D4 | P4 — "5 fns SQL ... montam URL/key SOMENTE via estes resolvers" | Verificável no repo: **3 fns** com uso real dos resolvers (`fn_notify_critical_alerts`, `fn_health_preflight`, `fn_validate_whatsapp_connection_url`); `fn_outbound_dispatch`/`fn_sync_lid_from_api` sem mirror no repo (corpos só em produção) | §P4-(c): evidenciadas 3; as demais são prod-only — validar com `pg_get_functiondef` antes da troca |
| D5 | P4 — resolvers `ops.fn_evo_url`/`ops.fn_evo_key` | Referenciados por migrations, **definidos apenas no DB de produção** (DB-as-source) | §P4-(c) pendente: versionar definições dos resolvers |
| — | P2 — "SEM sendAudio" (12 verbos) | **Confirmado** 1:1 no `evolutionClient` e no fake (12/12 sem `sendAudio`; áudio via `sendMedia`) | §P2-(c) — sem divergência |
| — | P2 — "`cloud` lança `not yet implemented`" | **Confirmado** (`registry.ts:58`, testado em `registry.test.ts`) | §P2 — sem divergência |
| — | P1 — "Cache de modo 30s" | **Confirmado** (`whatsappAdapterTransport.ts`, testado em `whatsappAdapter.test.ts`) | §P1 — sem divergência |

---

## §6. Prova de mecanismo (fake 12/12 + PROVIDER_UNDER_TEST)

- **Fake 12/12:** `supabase/functions/_shared/providers/fake/index.ts` implementa exatamente os 12 verbos do `evolutionClient` (paridade verificada por teste E2b do `ensaio-fake.test.ts`: "0 verbos do evolutionClient sem par no fake") e guard `assertTestEnv()` por verbo — fake jamais roda fora de `DENO_ENV=test`.
- **PROVIDER_UNDER_TEST:** `registry.ts:resolveProvider()` desvia a resolução somente em teste; `registry.test.ts` prova o guard absoluto em produção/development e a resolução `fake` em test.
- **Ensaio de mesa executado:** `W8_ensaio_fake.test.ts` — `ok | 5 passed | 0 failed (216ms)`, incluindo casamento fake→normalizer→`IngestMessage` (12 campos) e benchmark 12 verbos sub-ms (resultado real registrado no rodapé do arquivo).
- **Leitura para a troca:** o mecanismo de troca (interface canônica + client por provider + injeção via env em teste) está **provado em CI**; falta apenas o client do provider alvo e a migração das edges para o registry (P2) e a ativação real do webhook novo (P3).

---

## §7. Limites honestos

- Nenhuma troca real foi executada em produção; nenhum contrato-test contra um provider não-Evolution foi rodado com rede real (o ensaio foi fake↔Evolution, sem I/O).
- Estimativas de esforço são análise de código, não medição cronometrada.
- Gaps conhecidos fora do escopo das 4 portas: histórico de mídia não migra; templates exigem aprovação Meta; grupos/QR/onboarding não têm equivalente Cloud direto (ver runbook §6).
