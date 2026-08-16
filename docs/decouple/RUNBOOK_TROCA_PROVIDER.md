# RUNBOOK — Troca de Provider WhatsApp: Evolution API → WhatsApp Cloud API (Meta)

**Repo:** `adm01-debug/zapp-web-v3` · **Local final no repo:** `docs/decouple/RUNBOOK_TROCA_PROVIDER.md`
**Escopo:** procedimento operacional da troca de provider por porta, com verificação por passo, rollback e limites explícitos.
**Status:** DOCUMENTO DE PLANEJAMENTO — a troca real NUNCA foi executada em produção. Nenhum ensaio cronometrado foi feito até hoje (2026-08-14). Este runbook é o contrato para a etapa 56 do Plano V3; antes de executar, exigir ensaio fake↔evolution (etapa 57) e APROVADO de Joaquim (etapa 58).

---

## 1. Pré-requisitos (gates de entrada — TODOS verdes antes de começar)

| Gate | Critério | Como verificar |
|---|---|---|
| CI decouple | inventory **0/0/0/0** no último PR mergeado | `decouple-guard.yml` + `ownership-gate.yml` verdes no GitHub |
| Saúde | health score **A+ (≥95)**, wpp2 `state=open` | RPC `log_evolution_health` / dashboard / `connectionHealthCheck` |
| Pipeline | **DLQ = 0** e erro de envio ≤1% nas últimas 24h | `zapp.evolution_webhook_dlq` / `zapp.vw_dlq_pending` + `evolution-retry-metrics` |
| Baseline | msgs/24h registrado (baseline atual: **5.077**) | `docs/decouple/BASELINE.md` — qualquer queda >20% pós-troca é sinal de problema |

Critério de abort em qualquer passo: erro de envio >1%, DLQ >0 novo, p95 >2× baseline, health <95, ou webhook de entrada parado >10 min.

## 2. Mapa das 4 portas de egresso/ingestão

| # | Porta | Caminho | Papel |
|---|---|---|---|
| P1 | **Front (egresso)** | `src/lib/whatsappAdapter.ts` + `whatsappAdapterTransport.ts` | Único ponto de envio do app. Modo `unofficial` → edge `evolution-api`; modo `official` → edge `whatsapp-cloud-send`. Cache de modo 30s, fallback texto p/ sticker/reação/location no modo cloud. |
| P2 | **Edge gateway (egresso)** | `supabase/functions/_shared/providers/registry.ts` → `providers/evolution/client.ts` (12 verbos: sendText, sendMedia, sendSticker, getConnectionState, getQrCode, restartInstance, listInstances, listGroups, checkWhatsApp, getProfilePicture, get, post — SEM sendAudio) | Client único por provider. `registry.getProviderClient()` já aceita `'evolution' \| 'cloud'`; **cloud lança `not yet implemented`**. Fake (`providers/fake/`) só roda com `DENO_ENV=test` (guard anti-vazamento por verbo). |
| P3 | **Ingestão (webhook)** | `supabase/functions/_shared/ingest-port.ts` + normalizers (`evolution-response-normalizers.ts`, `whatsapp-cloud-normalizer.ts`) | Webhooks de entrada. Edge: `evolution-webhook` (atual) vs `whatsapp-cloud-webhook` + `whatsapp-cloud-webhook-verify` (Meta exige verificação de assinatura). RPCs de escrita: `rpc_claim_outbound_message`, `rpc_update_incoming_message`. |
| P4 | **SQL (egresso via Postgres)** | `ops.fn_evo_url()` / `ops.fn_evo_key()` → vault `evolution_api_url` / `evolution_api_key` | 5 fns SQL (ex.: `fn_outbound_dispatch`, `fn_sync_lid_from_api`, `fn_validate_whatsapp_connection_url`) montam URL/key SOMENTE via estes resolvers. Nenhuma fn pode montar endpoint direto (gate `scripts/decouple/sql-gate.mjs`). |

## 3. Procedimento de troca Evolution → Cloud (8 passos)

> Ordem: P1 (modo) → P2 (client) → P3 (webhook) → P4 (SQL). **Nunca desligar a instância Evolution em prod** — a troca é dual até o soak terminar. 1 commit por passo, PR por porta (protocolo AGENTS.md).

1. **Preparar Cloud (pré-deploy).** Criar app Meta/WhatsApp Cloud, phone number ID, token de acesso; cadastrar secrets no vault (`whatsapp_cloud_token`, `whatsapp_cloud_phone_id`, `whatsapp_cloud_webhook_secret`, `whatsapp_cloud_verify_token`) e no env das edges cloud. ✅ Verificar: `whatsapp-cloud-secrets-status` retorna todos presentes; `whatsapp-cloud-api` responde um GET de teste contra a Graph API.
2. **Contrato-test dos 12 verbos (P2).** Rodar contrato-test do gateway (etapa 78 do V3) contra o client cloud assim que implementado. ✅ Verificar: 12/12 verbos respondem shape canônico (não o shape Evolution); testes de paridade (`parity.test.ts`, `whatsapp-cloud-normalizer.test.ts`) verdes no CI.
3. **Implementar `providers/cloud/client.ts` (P2).** Mesma interface do `evolutionClient`; registrar no `registry.ts` (remover o throw). ✅ Verificar: `registry.getProviderClient('cloud')` resolve sem erro; teste unitário com fake mocks passa; guard `DENO_ENV=test` do fake intacto.
4. **Ligar modo `official` no front (P1).** `getWhatsAppMode()` passa a resolver `official` para o workspace alvo. ✅ Verificar: `whatsappAdapterTransport` resolve `transport='cloud'`; smoke de envio de texto via edge `whatsapp-cloud-send` (janela 24h aberta); mensagem chega no destinatário real.
5. **Migrar webhook de entrada (P3).** Configurar URL do webhook Meta apontando para `whatsapp-cloud-webhook` (com verify token) e ativar assinatura. ✅ Verificar: `whatsapp-cloud-webhook-verify` responde no GET de verificação; evento de teste chega e grava em `zapp.evolution_messages`/inbox (payload normalizado pelo `whatsapp-cloud-normalizer`).
6. **Congelar ingestão Evolution (P3).** Desativar/ignorar eventos da instância wpp2 no `ingest-port` (não deletar a instância). ✅ Verificar: `ingest_ledger` sem entradas novas do canal evolution; DLQ continua 0; nenhum 4xx/5xx novo em `evolution-webhook` nos logs.
7. **Migrar as 5 fns SQL (P4).** Editar `fn_outbound_dispatch` e as demais para resolver URL/key via novo par de resolvers (`ops.fn_cloud_url()`/`ops.fn_cloud_key()`, análogos aos de Evolution) — manutenção do padrão ADR-010, sem hardcode. ✅ Verificar: `ops.fn_bodies_backup` recebe snapshot dos corpos ANTES e DEPOIS; gate SQL do CI continua verde (whitelist atualizada + fixture `sql_report_snapshot.json` regenerado); 1 ciclo do cron 317 (outbound-dispatch) sem erro; `SHOW search_path` das roles executoras correto.
8. **Soak de 24h.** Monitorar msgs/24h, DLQ, health, p95, webhooks. ✅ Verificar: números ≈ baseline (5.077) com desvio ≤20%; zero erros de envio >1%; `health_score` ≥95 (A+). Só então considerar desligar Evolution (decisão separada, com APROVADO).

### 3.1 Verificações concretas por passo (consultas/checks de referência)

```sql
-- DLQ (pré-requisito e após cada passo): deve ser 0
-- View canônica do schema zapp (security_invoker sobre evo.evolution_webhook_dlq):
SELECT count(*) FROM zapp.evolution_webhook_dlq WHERE status = 'pending';
-- Atalho: view de pendências
SELECT count(*) FROM zapp.vw_dlq_pending;
-- ingest_ledger: entradas novas por canal (passos 5–6)
SELECT source, count(*) FROM zapp.ingest_ledger
WHERE inserted_at > now() - interval '1 hour' GROUP BY source;
-- Health (pós-passo 8): deve ser A+
SELECT score, grade FROM ops.v_health_latest ORDER BY 1 DESC LIMIT 1;
```

```bash
# Logs das edges (passos 5–6): sem 4xx/5xx novos
# via Portainer: service logs das tasks whatsapp-cloud-webhook / evolution-webhook
```

> Nota: os nomes de tabela/coluna acima são os do schema real (`zapp.*`, `ops.*`). A DLQ de webhook fica em `zapp.evolution_webhook_dlq` (view) e `zapp.vw_dlq_pending` (pendências) — não existe `ops.dlq`. Confirmar nomes exatos com `\d` antes de rodar em produção.

## 4. Rollback (qualquer passo falha → abort)

- **Passos 1–3 (pré-produção):** sem rollback necessário — nada em prod foi tocado; reverter o PR.
- **Passos 4–5:** voltar `getWhatsAppMode()` para `unofficial` (invalidate cache via `invalidateWhatsAppModeCache`) e reconfigurar webhook Evolution (URL antiga). Front volta a operar em minutos; wpp2 nunca saiu do ar.
- **Passo 6:** reativar ingestão Evolution no `ingest-port`; eventos voltam a fluir (idempotência do `ingest_ledger` absorve duplicatas do período de overlap).
- **Passo 7:** restaurar corpos SQL do `ops.fn_bodies_backup` (snapshot pré-edição); rodar `CREATE OR REPLACE` de cada fn; verificar 1 ciclo do cron 317.
- **Regra geral:** Evolution continua viva e configurada durante TODO o procedimento — rollback é sempre reverter flags/config, nunca restaurar infra.

## 5. Pontos de falha conhecidos

- **Webhook URL de config:** a URL ativa vem de `getActiveWebhookUrl()` (P1). Se o provider estiver em `official` mas o webhook Evolution ainda estiver configurado no provedor, eventos duplicam ou se perdem — verificar a URL REAL configurada no painel Meta/Evolution, não a do código.
- **Envelope v1:** webhooks antigos chegam no envelope v1 da Evolution (payload diferente do canônico). Normalizer precisa rejeitar/mapear explicitamente; envelope desconhecido deve ir para `zapp.evolution_webhook_dlq`/log, nunca quebrar o ingest.
- **Idempotência do `ingest_ledger`:** durante o overlap dual, a mesma mensagem pode entrar 2×. O ledger precisa deduplicar por message id canônico; se a chave for diferente entre providers, duplicatas entram no inbox.
- **`search_path`:** as fns SQL (P4) dependem do `search_path` correto (`zapp`, `ops`). `CREATE OR REPLACE` com search_path errado quebra resolução de tabelas em runtime — conferir `SHOW search_path` por role antes e depois.
- **Vault com secrets duplicados:** `evolution_api_key` × `evolution_api_key_v2` e `evolution_webhook_secret` × `webhook_secret_evolution` **foram eliminados em 2026-08-15** (dedup F6 — os duplicados `_v2`/`evolution_webhook_secret` deletados; canônicos `evolution_api_key` e `webhook_secret_evolution` preservados; vault 46 → 44).

## 6. O que NÃO está coberto (limites honestos)

- **Histórico de mídia:** mídias antigas (URLs/objetos no storage/S3/R2) não migram; só o fluxo novo passa pelo provider novo.
- **Templates:** `whatsapp-cloud-send`/templates Meta exigem aprovação prévia na Meta Business; templates ElevenLabs/Evolution (`evolution-templates`) não são traduzidos automaticamente.
- **Grupos:** `listGroups`/gestão de grupos é verbo Evolution sem equivalente Cloud direto no escopo atual; funcionalidades de grupo ficam degradadas no modo oficial.
- **QR/onboarding:** `getQrCode`/`restartInstance` não existem na Cloud API; o fluxo de conexão do número muda (número dedicado vs pareamento), não coberto aqui.
- **Ensaio cronometrado:** tempo real de execução nunca foi medido — estimativas abaixo são planejamento, não evidência.

## 7. Estimativa de tempo

| Fase | Tempo estimado | Observação |
|---|---|---|
| Planejamento | **1–2h** | revisar gates, secrets, contrato dos 12 verbos |
| Execução (passos 1–7) | **30–60 min** | com ensaio prévio feito; sem ensaio, dobre |
| Soak (passo 8) | **24h** | janela mínima de observação antes de desligar Evolution |

## 8. Evidências a arquivar após execução (sem sucesso fabricado)

- Saída do contrato-test dos 12 verbos (passo 2) — arquivar em `docs/decouple/`.
- PRs mergeados por porta (P1–P4) com CI verde (decouple-guard 0/0/0/0).
- Snapshot `ops.fn_bodies_backup` pré/pós (passo 7).
- Curvas de msgs/24h, DLQ e health do soak (passo 8) — comparadas ao baseline 5.077.
- Relato do ensaio cronometrado (etapa 57 do V3) em `RETRO_V2.md`, com tempo real.
- Se a troca real for executada: registrar em `RETRO_V3.md` com datas e números medidos — e o veredito de manter ou não a Evolution ligada.

---

*Limite declarado: a troca Evolution→Cloud NÃO foi executada nem ensaiada em produção até 2026-08-14. Este runbook é um contrato de planejamento; qualquer relato de sucesso deve vir de execução real com evidência (logs, DLQ, health).*
