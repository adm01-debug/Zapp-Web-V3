# 🔬 Auditoria de Acompanhamento — Evolution API + Banco de Dados (Sessão 2)

> **Data:** 2026-07-04 (madrugada, continuação da auditoria de 2026-07-03)
> **Escopo:** Verificação independente do estado pós-remediação da sessão 1 + novos achados,
> cobrindo: Evolution API (VPS/Swarm), PostgreSQL 14 do Evolution (db `evolution`),
> PostgreSQL 15 do Supabase self-hosted (schemas `evo` e `zapp`), pipeline de eventos e Edge Functions.
> **Método:** Recon direto via MCP (Portainer, Evolution API, Supabase self-hosted), leitura de logs
> de produção, reprodução da falha com a versão exata das dependências (zod 3.22.4) e verificação
> end-to-end em produção após cada correção.
> **Relatório anterior:** [`EVOLUTION_API_AUDIT_2026-07-03.md`](./EVOLUTION_API_AUDIT_2026-07-03.md)

---

## 0. TL;DR

**Corrigido e verificado em produção nesta sessão:**

| # | Achado | Correção | Verificação |
|---|--------|----------|-------------|
| 1 | 🔴 **Todos os eventos `connection.update` descartados com 422** (`contract_violation`) — 126 rejeições/24h. A Evolution v2.3.7 envia `apikey: null` e `sender: null` em eventos emitidos antes da sessão autenticar; o schema Zod usava `.optional()`, que **não aceita `null`** | `apikey`/`sender` → `.nullish()` em `supabase/functions/_shared/webhook-schemas.ts` + teste de regressão; hot-deploy no volume `/root/supabase/docker/volumes/functions` + restart do edge-runtime | POST sintético com o payload real rejeitado → `{"success":true}`; eventos **orgânicos** do ciclo de reconexão da wpp2 processados às 00:03:53, 00:05:53 e 00:06:15 UTC (antes: 100% descartados) |
| 2 | 🟠 **PG14 (db do Evolution) com `log_statement=mod`** — cada INSERT/UPDATE logado com parâmetros: conteúdo de mensagens WhatsApp e segredos (JWT `service_role` de workflows n8n) vazando nos logs Docker, além de I/O desnecessário | `ALTER SYSTEM SET log_statement='ddl'` + `pg_reload_conf()` (sem restart; `log_min_duration_statement=5000` mantido) | `pg_settings` confirma `log_statement=ddl` |

**Verificado como OK (sem regressão desde a sessão 1):**

- ✅ **Versão atualizada:** Evolution API `v2.3.7` (package.json do container) = **última release estável** do upstream. A `v2.4.0-rc2` segue pré-release — e a página de releases anuncia que a 2.4.0 passará a exigir **ativação de licença** no servidor da Evolution Foundation; **não recomendamos** migrar para RC.
- ✅ Tuning de banco da sessão 1 **em vigor** (nível database): `effective_cache_size=16GB`, `work_mem=32MB`, `maintenance_work_mem=512MB` (confirmado em `pg_db_role_setting`).
- ✅ Índices consolidados na partição `evo.evolution_messages_wpp2` (1,93 GB / 1,84M linhas): 0 dead tuples, VACUUM/ANALYZE recentes, **zero hotspots de seq scan** em `evo`/`zapp`.
- ✅ ~40 cron jobs (`pg_cron`) ativos e saudáveis nas últimas 24h (retenção, reconciliação, watchdogs, partições mensais automáticas); falhas pontuais apenas na janela do incidente wpp2 (15:14–15:53 UTC).
- ✅ RabbitMQ 14/14 filas com consumer conectado (`evolution` e `evolution_v2` running); DLQ vazia; consumer com 0 erros.
- ✅ PG14 do Evolution: schema Prisma íntegro (`_prisma_migrations` ok), `Message` ~200k linhas/698 MB com retenção ativa (`evolution-db-purge`), autovacuum em dia.
- ✅ Backups diário/semanal/mensal rodando; mídia por referência no R2.

**Continua pendente (exige ação humana coordenada — runbook §4):**

- 🔴 `wpp2` (linha principal) **offline desde 2026-06-13** — Baileys `401/loggedOut`, credencial perdida: **só reconecta com novo QR code** (§4.1).
- 🔴 `AUTHENTICATION_API_KEY` ainda é a chave default pública da documentação (rotação coordenada — §4.2).
- 🟠 Drift do stack `evolution` no Portainer (compose diz MinIO; runtime usa R2; memória 2G vs 3G) — um redeploy pela UI **quebra mídia**.
- 🟠 Redis continua único store de sessões Baileys com AOF off.
- 🟡 Restarts não explicados de serviços na janela da auditoria (§5).

---

## 1. Anatomia do incidente 422 (novo achado, corrigido)

### 1.1 Linha do tempo (UTC, 2026-07-03)

| Hora | Evento |
|------|--------|
| ~16:40 | wpp2 desconecta (`401/loggedOut`) e entra em loop de reconexão (~a cada 3,5 min) |
| até ~23:34 | Cada ciclo → webhook nativo da Evolution rejeitado com **401** (sem header de assinatura) e forward do consumer rejeitado com... 401 também (HMAC estrito — corrigido na sessão 1) |
| 23:34 | Sessão 1 publica o fix de autenticação (aceita `x-webhook-secret` compartilhado) — autenticação passa a validar (`[HMAC] Signature validated successfully`) |
| 23:34→00:03 | **Nova falha exposta:** payload autenticado é rejeitado pelo Zod com 422 `INVALID_WEBHOOK_PAYLOAD` — a Evolution manda `"apikey": null`, e `z.string().optional()` aceita `undefined` mas **não `null`**. O consumer loga `[DROP 422]` e envia para Sentry; a Evolution loga "Erro não recuperável (422). Cancelando retentativas" |
| 00:03+ | Fix desta sessão no ar → eventos orgânicos `connection.update` **processados** |

### 1.2 Evidência

- `public.webhook_audit_log` (24h): 3.954 `messages.upsert` processados, **126 `contract_violation`**, 362 `Missing webhook signature`.
- Log do edge-runtime: `ZodError: invalid_type, expected string, received null, path: ["apikey"]`.
- Log do consumer: `[DROP 422] connection-update … INVALID_WEBHOOK_PAYLOAD` (drop=151 acumulado).

### 1.3 Correção

`supabase/functions/_shared/webhook-schemas.ts`:

```diff
   data: z.record(z.any()).optional(),
-  sender: z.string().optional(),
-  apikey: z.string().optional(),
+  sender: z.string().nullish(),   // aceita string | null | undefined
+  apikey: z.string().nullish(),
```

- Semântica validada com a **versão exata** usada pela função (zod 3.22.4): schema antigo reproduz o bug; novo aceita `null`, continua aceitando string, continua rejeitando `instance` ausente e tipos errados.
- Teste de regressão adicionado em `_shared/webhook-contracts.test.ts` com o payload real de produção.
- **Deploy:** arquivo gravado em `/home/deno/functions/_shared/webhook-schemas.ts` (volume host `/root/supabase/docker/volumes/functions`, backup `.bak.20260704-422fix` ao lado) + restart do serviço `supabase_functions`. md5 do arquivo em produção = md5 do repositório (`500eeed3448919a133751e7eff7a5774`).

### 1.4 Sobre os 401 "Missing webhook signature" remanescentes

Os 401 que restam são do **webhook nativo** da Evolution no caminho `connection-update`, que chega **sem o header** `x-webhook-secret` (comportamento do próprio Evolution nesse code path, apesar de o header estar configurado no webhook da instância). Não é perda de dados: o mesmo evento chega pelo caminho **RabbitMQ → consumer → Edge Function** (autenticado e agora processado), e o guard de idempotência da função deduplicaria o duplo-envio se ambos passassem. Opções futuras (não urgente):
- Remover `CONNECTION_UPDATE` da lista de eventos do webhook nativo (mantendo no RabbitMQ), zerando o ruído de 401 no log da Evolution; **ou**
- Conviver com o ruído (custo: ~2 requests rejeitados por ciclo de reconexão).

---

## 2. PG14 do Evolution — logging (novo achado, corrigido)

`log_statement=mod` estava logando **todo INSERT/UPDATE/DELETE com parâmetros** dos databases `evolution` e `n8n_queue`:

- Conteúdo integral de mensagens WhatsApp em texto puro nos logs Docker (LGPD);
- Workflows n8n serializados com **JWT `service_role` do Supabase e a API key da Evolution** dentro do log;
- Volume de I/O de log proporcional ao tráfego de mensagens.

**Aplicado:** `ALTER SYSTEM SET log_statement='ddl'` + `pg_reload_conf()` (mantém auditoria de DDL e o `log_min_duration_statement=5000` para queries lentas). Reversão documentada em [`db/remediation/APPLIED_2026-07-04_followup.sql`](../db/remediation/APPLIED_2026-07-04_followup.sql).

**Recomendação decorrente (runbook):** tratar o JWT `service_role` hardcoded nos workflows n8n (ex.: "ZAPP - Media Download Worker") como **exposto** — migrar os workflows para *n8n Credentials* e rotacionar o JWT secret quando houver janela (rotação afeta todos os serviços Supabase).

---

## 3. Banco de dados — estado verificado (PhD mode 🧑‍🔬)

### 3.1 Supabase PG15 (schemas `evo` + `zapp`)

| Métrica | Valor | Avaliação |
|---------|-------|-----------|
| Tamanho do database | 3.285 MB | ok; 61% é a partição `evolution_messages_wpp2` |
| Cache hit ratio | 85,2% | ⚠️ baixo para OLTP (ideal >99%) — causa-raiz é `shared_buffers` do container; item de janela de manutenção (sessão 1 §8) |
| Conexões | 34/100 (6 ativas) | ok |
| Dead tuples (evo/zapp) | ~0 nas tabelas quentes | ✅ pós-VACUUM sessão 1 |
| Partições `evo.evolution_messages` | LIST por instância (18 partições + DEFAULT) | ✅ retenção correta = `DROP PARTITION` |
| `evo.evolution_webhook_events_v2_*` | particionado por mês 2026-03→2027-06 + cron `auto-create-monthly-partitions` | ✅ |
| Settings nível-database | `effective_cache_size=16GB`, `work_mem=32MB`, `maintenance_work_mem=512MB` | ✅ aplicados (sessão 1) |
| Seq scans em tabelas >5k linhas | nenhum | ✅ |
| pg_cron | ~40 jobs ativos, 24h sem falha estrutural | ✅ (job history com retenção de 7 dias) |

### 3.2 PG14 do Evolution (db `evolution`, 833 MB)

- Prisma schema oficial v2.3.7 íntegro; `Message` 698 MB/~200k linhas (retenção 90d via `evolution-db-purge`), `Contact` 21k, `Chat` 9k, `Media` 11,5k por referência.
- Tabelas auxiliares de observabilidade (`_baileys_error_events` 70k linhas/20 MB, `_swarm_guardian_events`, `_audit_*`) — sugerido incluir purga futura de `_baileys_error_events` (>30d) no `evolution-db-purge`.
- Tuning: `shared_buffers=1GB`, `effective_cache_size=6GB`, `work_mem=16MB`, `random_page_cost=1.1` — adequado para o host.
- ⚠️ O database `n8n_queue` (2,4 GB) coabita o mesmo PG14 — competição de cache com o db `evolution`; aceitável hoje, monitorar crescimento.

---

## 4. Runbook — pendências que exigem ação humana

### 4.1 🔴 Reconectar a `wpp2` (linha principal — parada desde 13/06)

A sessão Baileys foi **invalidada pelo WhatsApp** (`401/loggedOut`); não existe credencial recuperável (nem no Redis nem no PG). Único caminho:

1. Abrir o Manager: `https://evolution.atomicabr.com.br/manager` → instância `wpp2` → **Connect/QR Code** (ou `GET /instance/connect/wpp2` com a apikey).
2. No celular com o chip 55 11 4637-5517: WhatsApp → **Aparelhos conectados** → **Conectar aparelho** → escanear o QR.
3. Se o WhatsApp recusar repetidamente (banimento de sessão), aguardar ~24h antes de reinsistir.
4. Após conectar, validar: `connectionStatus=open` no fetchInstances e novos `messages.upsert` em `webhook_audit_log`.

> Enquanto isso o loop de reconexão continua gerando 2 eventos/3,5min — inofensivo, mas o passo acima é o que restaura a operação.

### 4.2 🔴 Rotacionar `AUTHENTICATION_API_KEY` (chave default pública)

Coordenar em uma janela única (a chave atual está referenciada em): stack `evolution` (env), workflows n8n (headers HTTP hardcoded), worker MCP `evolution-mcp`, e possivelmente scripts/watchdogs. O secret `evolution_api_key_v1` **já existe** no Swarm mas não é lido pelo entrypoint — o passo natural é passar a exportá-lo no entrypoint (como já é feito com `evolution_db_uri_v1`) e remover a chave do env em texto puro.

### 4.3 🟠 Reconciliar o stack `evolution` no Portainer

O compose armazenado difere do runtime (S3 MinIO vs R2; secrets `minio_*` vs `r2_*`; memória 2G vs 3G). Atualizar o stack file com a configuração real **antes** de qualquer redeploy pela UI. (O kit da sessão 1 contém o compose reconciliado.)

### 4.4 🟡 Restarts não explicados (observado nesta sessão — §5) e demais itens da sessão 1

Redis AOF, `shared_buffers` do Supabase (exige restart do PG), CORS refletido do Evolution, RLS permissivo no `zapp` — continuam válidos como documentado na sessão 1.

---

## 5. Observação operacional nova: restarts em cascata durante a auditoria

Na janela 23:44→00:05 UTC observamos:

- `postgres_postgres` (PG14): **"received fast shutdown request"** às 23:44:49 — shutdown administrativo (não OOM, não crash), task Swarm recriada em seguida;
- `supabase_functions`: task recriada ~00:00 e novamente ~00:05.

Não há evidência de falha; o padrão é consistente com **atualização/força de serviço via Swarm** (há stacks `watchtower`, `swarm-task-guardian` e `zapp-health-guard` ativos). Recomendação: conferir a política do `watchtower` (excluir bancos de dados de auto-update) e revisar os critérios do `swarm-task-guardian`, para que Postgres nunca seja reciclado fora de janela.

---

## 6. Verificação executada (evidência de cada correção)

1. **Reprodução do bug** com zod 3.22.4 (mesma versão da função): schema antigo rejeita `apikey:null` → `success:false`; novo aceita → `success:true`; casos negativos preservados (instance ausente, apikey numérico).
2. **Self-test em produção** (POST autenticado no `evolution-webhook` com o payload real): `{"success":true,"requestId":"b481afa5-…"}` e `webhook_audit_log.status='processed'`.
3. **Tráfego orgânico**: 3 ciclos de reconexão da wpp2 processados após o deploy (00:03:53, 00:05:53, 00:06:15 UTC) — zero novos `contract_violation`.
4. **PG14**: `pg_settings` → `log_statement=ddl`, `log_min_duration_statement=5000`; sem restart do banco.
5. **md5** do arquivo implantado = md5 do repositório; backup `.bak.20260704-422fix` no volume.
