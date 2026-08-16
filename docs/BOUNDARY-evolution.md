# Boundary — Evolution API: o que fica aqui, o que foi para evolution-stack

**Separação realizada em:** 2026-08-12/13  
**Repo de infra:** https://github.com/adm01-debug/evolution-stack

## Regra de decisão

| Pergunta | Resposta | Repo |
|---|---|---|
| É o servidor da Evolution API, imagem Docker, stack Portainer, worker Python? | sim | `evolution-stack` |
| Chama a Evolution API a partir do app React ou de um Edge Function Supabase? | sim | `zapp-web-v3` ← aqui |

## O que FICA neste repo (e por quê)

| Grupo | Arquivos | Por quê |
|---|---|---|
| Adapters TS | `src/adapters/evolution*` | Código React que chama a API |
| Hooks React | `src/hooks/evolution*` | Estado browser-side |
| Libs cliente | `src/lib/evolution*` | Circuit breaker, retry, diagnostics do browser |
| Integração | `src/adapters/evolutionAdapter.ts` + `src/hooks/useEvolutionApi.ts` | HTTP client do app |
| Tipos | `src/types/evolutionExternal.ts` | Tipos consumidos pelo app |
| Edge Functions | `supabase/functions/evolution-*` | Deployadas via Supabase CLI COM este repo |
| Shared Deno | `supabase/functions/_shared/evolution-*` | Shared libs das edge functions |
| Migrations | `supabase/migrations/*evolution*` | Schema do banco deste projeto — intocável |
| Testes | `e2e/*evolution*`, `src/**/__tests__/*evolution*` | Testam o cliente |

## O que FOI para evolution-stack

| Item |
|---|
| Servidor Evolution API (Dockerfile, build-patches, docker-entrypoint) |
| Consumer RabbitMQ → Supabase (`consumer/consumer.py`) |
| Todos os stacks Portainer (`stacks/evolution*.yml`) |
| Watchdogs (4 scripts alpine) |
| Scripts operacionais (evo-forceupdate, security-guardian, purge) |
| Workflows de build (publish-evolution-api-custom, consumer, update-check) |
| GitOps (gitops-stacks.yml) |
| Runbooks de infra (DR, RabbitMQ bindings, tables inventory) |
| ADR-004 (bridge webhook — decisão de arquitetura de infra) |
| Consumer HMAC remediation |

## O que NÃO fazer

- **Não mover** `src/`, `supabase/functions/` ou `supabase/migrations/` para evolution-stack.  
  Isso quebra o build Bun, o deploy Supabase CLI e o histórico de migrations.
- **Não usar** `docs/infra/evolution-stack.reconciled.DEPRECATED.yml` para redeploy.  
  O arquivo tem namespace e digest obsoletos. Fonte da verdade: [evolution-stack/stacks/evolution.yml](https://github.com/adm01-debug/evolution-stack/blob/main/stacks/evolution.yml).

## Auditoria classificatória (2026-08-13)

- 38 arquivos `src/` confirmados como código cliente TypeScript/React
- 9 edge functions `supabase/functions/evolution-*` confirmadas como Deno/Supabase
- 6 migrations `supabase/migrations/*evolution*` mantidas como histórico de schema
- 3 suítes e2e + 6 testes unitários confirmados como testes do cliente
- TypeScript: 0 erros pré/pós operação (baseline limpo)

## Auditoria de referências — estado final (2026-08-16, AUDIT_EVO_REFS_20260816)

Sweep completo de 1.278 arquivos com referência à Evolution (100 etapas, gate humano aprovado, validação Claude APROVADO):

- **FICA 1.203** (1.191 + 12 REVISAR): contrato vivo — 10 edge functions `evolution-*` (todas deployadas, webhook com 548 eventos/24h), hooks/UI, libs de resiliência, gates de CI, 214 migrations (R1, intocáveis)
- **ARQUIVA 85**: histórico (série de auditorias jul/2026, cutover, reconciliation, simulation) → `docs/_archive/`
- **EXCLUI 28**: duplicatas (ts-nocheck, RUNBOOK_DR_EVO), working files `.hermes/`, código morto (2 clients antigos, barrel, normalizer), yml residuais — todos com prova de zero consumidores
- **MIGRA 7** → evolution-stack (`docs/` e `docs/history/`): FMEA, incidente, runbooks DR/401, plano de correção 100E, RUNBOOK_EVO_DB, sessao5_infra, rabbitmq-bindings
- Triagem completa: `docs/decouple/AUDIT_EVO_REFS_20260816/triagem.csv` · Relatório: `RELATORIO_FINAL.md`

**Achados vivos desta auditoria** (acompanhar): produção Evolution **2.4.0** (fallbacks v237 e contract.zod ainda assumem 2.3.x → REVISAR); bug bilateral consumer-stats (POST HTTP 404 do lado do consumer); rule `no-direct-evo-url.ts` não plugada no CI; dependência reversa `evo → zapp.fn_normalize_send_jid` (13 refs) a formalizar como contrato.



## Fronteira lógica (4 portas de egresso/ingestão)

A fronteira com a Evolution é composta por **4 portas** (mapa formal em
[`docs/decouple/RUNBOOK_TROCA_PROVIDER.md`](./decouple/RUNBOOK_TROCA_PROVIDER.md) §2 e
matriz de substituibilidade em
[`docs/decouple/SUBSTITUABILITY_MATRIX_V4.md`](./decouple/SUBSTITUABILITY_MATRIX_V4.md)):

| # | Porta | Caminho | Papel |
|---|---|---|---|
| P1 | **Front (egresso)** | `src/lib/whatsappAdapter.ts` + `whatsappAdapterTransport.ts` | Único ponto de envio do app; modo `unofficial` → edge `evolution-api`; modo `official` → edge `whatsapp-cloud-send`; cache de modo 30s |
| P2 | **Edge gateway (egresso)** | `supabase/functions/_shared/providers/registry.ts` → `providers/evolution/client.ts` (12 verbos) | Client único por provider; `registry.getProviderClient()` aceita `'evolution' \| 'cloud' \| 'fake'`; fake só roda com `DENO_ENV=test` |
| P3 | **Ingestão (webhook)** | `supabase/functions/_shared/ingest-port.ts` + normalizers (`evolution-response-normalizers.ts`, `whatsapp-cloud-normalizer.ts`) | Webhooks de entrada: `evolution-webhook` (atual) vs `whatsapp-cloud-webhook` (+verify); escrita via RPCs `rpc_claim_outbound_message` / `rpc_update_incoming_message` |
| P4 | **SQL (egresso via Postgres)** | `ops.fn_evo_url()` / `ops.fn_evo_key()` → vault `evolution_api_url` / `evolution_api_key` | 5 fns SQL montam URL/key SOMENTE via estes resolvers (ADR-010; gate `scripts/decouple/sql-gate.mjs`) |

**Porta edge canônica (egresso browser → Evolution): `evolution-api`** — decisão
formalizada no [`docs/decouple/ADR-011-egress-gateway.md`](./decouple/ADR-011-egress-gateway.md):
allowlist documentada de **41 actions** agrupadas por categoria (envio, leitura de
conversa, gerenciamento de conversa, perfil, mídia/config, instância), contrato
`evolution-api@v1`, rate limit por IP/instância, instance-pause e idempotência.
`evolution-proxy` (allowlist de 6 paths, uso restrito à `ZappWebbDemoPage`) está
**DEPRECATED formal** — candidata a remoção após migrar a demo para `evolution-api`
(ver ADR-011 §3 para o mapa path→action e o critério de remoção).

### Gateway de acesso (12 verbos canônicos — P2)

Toda saída HTTP de edge functions ou frontend para a Evolution passa pelo gateway:
`supabase/functions/_shared/providers/evolution/client.ts`

| # | Verbo | Endpoint |
|---|---|---|
| 1 | `sendText(instance, number, text)` | POST `/message/sendText/{instance}` |
| 2 | `sendMedia(instance, payload)` | POST `/message/sendMedia/{instance}` |
| 3 | `sendSticker(instance, number, stickerUrl)` | POST `/message/sendSticker/{instance}` |
| 4 | `getConnectionState(instance)` | GET `/instance/connectionState/{instance}` |
| 5 | `getQrCode(instance)` | GET `/instance/connect/{instance}` |
| 6 | `restartInstance(instance)` | DELETE `/instance/restart/{instance}` |
| 7 | `listInstances()` | GET `/instance/fetchInstances` |
| 8 | `listGroups(instance)` | GET `/{instance}/group/findGroups` |
| 9 | `checkWhatsApp(instance, numbers[])` | POST `/chat/whatsappNumbers/{instance}` |
| 10 | `getProfilePicture(instance, number)` | GET `/chat/fetchProfilePictureUrl/{instance}` |
| 11 | `get<T>(path)` | GET genérico (escape hatch) |
| 12 | `post<T>(path, body)` | POST genérico (escape hatch) |

**Egresso via Postgres (não HTTP):**
- `rpc_claim_outbound_message` + `rpc_update_incoming_message`
- Normalizer: `fn_process_whatsapp_message` (edge fn `evolution-webhook v10`)

### Prova de substituibilidade (trocar Evolution por outro provider)

O mecanismo de troca está provado em teste, sem depender de rede ou de provider novo:

- **Fake provider 12/12** — `supabase/functions/_shared/providers/fake/index.ts`
  espelha a interface completa do `evolutionClient` (12 verbos canônicos:
  sendText, sendMedia, sendSticker, getConnectionState, getQrCode,
  restartInstance, listInstances, listGroups, checkWhatsApp, getProfilePicture,
  get, post), com `mock()`/`reset()` por action e `FAKE_CAPABILITIES`.
- **`PROVIDER_UNDER_TEST`** — `supabase/functions/_shared/providers/registry.ts`:
  a flag **só é honrada com `DENO_ENV=test`** (guard absoluto, sem exceção de
  config); fora de teste, `getProviderClient()` ignora a flag e resolve o
  provider pedido; `'cloud'` lança `not yet implemented`.
- **Contrato Zod** — `supabase/functions/_shared/providers/evolution/contract.zod.ts`
  define `evolutionGatewayContract`: contrato request/response de cada um dos
  12 verbos do gateway (REQUEST estrito `.passthrough()`, RESPONSE sempre
  permissivo — regra do incidente 2026-07-03: 422 indevido em payload real causa
  perda de dados).
- **Evidência em teste:**
  - `supabase/functions/_shared/__tests__/registry.test.ts` — guard absoluto do
    `DENO_ENV=test` + `PROVIDER_UNDER_TEST` (fake só em test; flag inválida
    ignorada; `'cloud'` → not yet implemented).
  - `supabase/functions/_shared/__tests__/ensaio-fake.test.ts` — ensaio
    fake↔Evolution: **`ok | 5 passed | 0 failed (216ms)`**, incl. E2b paridade
    **12/12** (0 verbos do `evolutionClient` sem par no fake) e E3 casamento
    fake → `normalizeBaileysMessage` → `IngestMessage` (12 campos, 1:1, sem throw).

> Reciprocidade: [adm01-debug/evolution-stack/docs/BOUNDARY-zapp.md](https://github.com/adm01-debug/evolution-stack/blob/main/docs/BOUNDARY-zapp.md)

## Contratos reversos aceitos — evo → zapp (formalizado 2026-08-16)

A direção canônica é `zapp → evo via contrato curado`. Excepcionalmente, objetos evo referenciam `zapp.*` (146 refs na baseline e41, REVISADAS contra o banco vivo em 2026-08-16: **0 STALE — todas são contratos vivos**):

| Objeto zapp | Direção/uso | Tipo |
|---|---|---|
| `rpc_boundary_raise_alert` / `rpc_boundary_resolve_alert` | evo→zapp, alertas de fronteira | RPC de fronteira (I1/I2) |
| `fn_normalize_send_jid` | evo→zapp | utilitária (13 refs, 100% suítes de teste/regressão evo) |
| `is_admin_or_supervisor` | evo→zapp, RLS de 5 tabelas evo.media_* | utilitária (SECURITY-CRITICAL) |
| `fn_system_health_score` | evo→zapp, leitura de score | utilitária |
| `handle_updated_at` | evo→zapp, **133 triggers** (incl. evo.evolution_conversations_* e evo.media_storage_config) | função trigger (SECURITY-CRITICAL) |
| `fn_trg_quarantine_alert` | evo→zapp, trigger AFTER INSERT em evo.media_quarantine | função trigger |
| `webhook_event_status` | evo→zapp, enum usado no CASE da view evo.active_webhook_events | tipo de contrato |
| views espelho `zapp.evolution_*` | leitura por funções evo | bridge views (6 objetos) |
| `_consumer_dlq`, `evolution_retention_log_id_seq` | objetos referenciados por funções evo | tabela/sequência |

**Regras destes contratos:** (1) mudança de assinatura exige atualização bilateral no MESMO ciclo; (2) RPCs de fronteira versionadas em migration zapp; (3) remoção de qualquer objeto acima exige varredura na baseline do evolution-stack antes.
