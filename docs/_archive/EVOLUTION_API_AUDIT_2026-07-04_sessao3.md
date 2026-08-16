# 🔬 Auditoria Exaustiva — Evolution API + Banco de Dados (Sessão 3 — verificação independente)

> **Data:** 2026-07-04 (~00:30–01:00 UTC)
> **Escopo:** Evolution API na VPS (Docker Swarm/Portainer), PostgreSQL 14 nativo do Evolution
> (db `evolution`), PostgreSQL 15.8 do Supabase self-hosted (schemas `evo`, `zapp`, `public`),
> pipeline RabbitMQ → consumer → espelho, webhooks → Edge Function, backups (MinIO/offsite),
> mídia no Cloudflare R2 e versão do upstream.
> **Método:** Recon direto e independente via MCP (Portainer, Evolution API, Supabase self-hosted),
> `psql` dentro do container PG14, leitura de logs de produção ao vivo e cruzamento com os
> relatórios anteriores.
> **Relatórios anteriores:** [`EVOLUTION_API_AUDIT_2026-07-03.md`](./EVOLUTION_API_AUDIT_2026-07-03.md)
> · [`EVOLUTION_API_AUDIT_2026-07-04_followup.md`](./EVOLUTION_API_AUDIT_2026-07-04_followup.md)

---

## 0. TL;DR

### ✅ Itens pendentes das sessões 1–2 que agora estão RESOLVIDOS (verificado em produção)

| Item pendente (sessão 2) | Estado verificado nesta sessão |
|---|---|
| 🔴 `AUTHENTICATION_API_KEY` = chave default pública | **RESOLVIDO.** A chave agora vem de Docker secret rotacionado — o stack referencia `evolution_api_key_v3_20260703` e o container em execução já carrega `evolution_api_key_v4_20260704` (rotação de hoje). Nenhuma chave em texto puro no compose. |
| 🟠 Drift do stack no Portainer (compose dizia MinIO; runtime usava R2; memória 2G vs 3G) | **RESOLVIDO.** O stack file no Portainer (atualizado 2026-07-04 00:36 UTC) agora declara `S3_ENDPOINT=…r2.cloudflarestorage.com`, bucket `zapp-whatsapp-media`, secrets externos e `memory: 3G`. Label de auditoria: `com.atomicabr.secrets=r2-restore-apikey-secret-v3-20260704`. Um redeploy pela UI **não quebra mais** a mídia. |
| 🔴 Webhook 401/422 em loop (contrato Zod) | **RESOLVIDO e operando.** Eventos fluem: `zapp.webhook_events_processed` com registros recentes; último evento v2 gravado minutos antes desta auditoria. |
| 🟠 Espelho sem retenção (`evolution_messages_wpp2` crescendo sem limite) | **MITIGADO.** Job `pg_cron` #88 `archive-old-wpp2-messages` (mensal, retenção 12 meses, lotes de 5 000) + `evolution_messages_wpp2_archive` criada. Particionamento mensal automático de `evolution_webhook_events_v2_*` ativo até 2027-06 (job #64). |

### 🔴 O que continua quebrado (ação humana necessária)

| # | Severidade | Problema | Evidência desta sessão |
|---|---|---|---|
| 1 | 🔴 **CRÍTICO** | **`wpp2` (linha principal, 551146375517) deslogada — precisa de QR code novo.** Baileys retornou `401 device_removed`; o watchdog v8 detecta e **suprime restarts corretamente** (restart não resolve logout). | `connectionStatus=connecting`, `disconnectionReasonCode=401`, `disconnectionAt=2026-07-03T16:40Z`; alerta `qrcode_required` (critical) aberto desde 2026-07-03 16:50 em `evo.evolution_alerts`. |
| 2 | 🟠 ALTO | **Janela de mensagens perdidas no espelho.** Fluxo do `wpp2` no espelho morreu em degradê: 19/06 (108 msgs) → 21/06 (1 msg) → zero depois. No PG14 nativo, a última `Message` do wpp2 é de **07/05** (158 139 linhas). Após reconectar, será preciso reconciliação/backfill do período 21/06 → reconexão (infra já existe: `evolution_reconcile_jobs`, `fn_reconcile_dispatch/apply`). | `max(created_at)` espelho = 2026-06-21 17:14; distribuição diária zera após 21/06. |
| 3 | 🟠 MÉDIO | **Reboot do host ~12h atrás + restart do `supabase_db` há ~20 min** (containers `Exited (255)` em massa; `pg_stat` do PG15 zerado — shutdown não-limpo). O stack `infra-boot-guard` foi criado hoje 00:26 para tratar boot; item "restarts não explicados" da sessão 2 **persiste**. | Uptime PG15 = 22 min; dezenas de containers `Exited (255) 12 hours ago`; ~90 schemas `pg_temp_*`/`pg_toast_temp_*` órfãos de crashes anteriores. |
| 4 | 🟡 BAIXO | `wpp_pink_test` com flapping leve (ciclos connecting↔connected a cada ~5 min entre 00:28–00:43 UTC), coincidindo com os redeploys da madrugada. Funcional: mensagens + mídia R2 fluindo ao vivo nos logs. | `evo.evolution_connection_history`. |

### 🆕 Achados novos desta sessão (não listados nas sessões 1–2)

| # | Severidade | Achado | Recomendação |
|---|---|---|---|
| N1 | 🔴 ALTO (segurança) | **Senha do `supabase_admin` em texto puro** no stack file `supabase-backup` (id 124), visível a qualquer usuário do Portainer com acesso a stacks. | Migrar para Docker secret (mesmo padrão já usado no stack `evolution`) e **rotacionar a senha** exposta. |
| N2 | 🟠 ALTO (DR) | **Dumps do Supabase ficam só em volume local** (`backup_data`) na própria VPS — não vão para MinIO nem para o espelho offsite. Se o disco da VPS morrer, perdem-se banco e backups juntos. Os backups do PG14 (evolution) vão para MinIO + offsite; os do Supabase não. | Enviar os dumps `supabase_selfhosted_*.dump` para o MinIO (bucket próprio) para pegarem carona no `minio-offsite-mirror`, ou direto para o R2. |
| N3 | 🟡 MÉDIO | Estatísticas do planner/`pg_stat_statements` zeradas pelo restart de hoje — análises de slow query ficam cegas até acumular novamente; o job diário `analyze-catalogo-diario` (06:00) re-analisa as tabelas quentes. | Nenhuma ação urgente; considerar `ANALYZE` manual nas tabelas `evo` se houver query lenta antes das 06:00. |
| N4 | 🟡 BAIXO | Divergência de contagem contatos: espelho `evo.evolution_contacts` = 20 057 vs API (`fetchInstances`) = 11 656 (wpp2) + 9 653 (pink) = 21 309. Diferença ~6% provavelmente de dedupe/merge — vale conferir a regra de upsert do consumer. | Auditar chave de dedupe (`remote_jid` vs `instanceId+remoteJid`). |

---

## 1. Versão — está atualizada?

- **Instalada:** Evolution API **v2.3.7** — imagem `evoapicloud/evolution-api` pinada por digest
  (`sha256:6b1956…`), build de **2025-12-05**, revisão `cd800f2976e1…`, Node 24.11.1.
- **Upstream:** v2.3.7 é **a última release estável** do `evolution-foundation/evolution-api`
  (ex-`EvolutionAPI`). A 2.4.0 segue em RC e passará a exigir **ativação de licença** —
  a recomendação das sessões anteriores de **não migrar** continua válida.
- Pinagem por digest é boa prática (Watchtower não sobe versão surpresa). Observação: o
  `evo_status`/`evo_dashboard` do MCP reportam `version: 4.2.0` — isso é a versão do **MCP worker**,
  não da API (fonte da confusão em conversas anteriores; a API real responde 2.3.7 em `GET /`).

## 2. Funcionalidades da Evolution API — instaladas, configuradas e funcionais?

| Funcionalidade | Estado | Verificação |
|---|---|---|
| PostgreSQL (Prisma, PG14) | ✅ ativo | `DATABASE_ENABLED=true`; db `evolution` = 833 MB, PG 14.22; purge v2 com retenções 7–90d + VACUUM ANALYZE por ciclo |
| Redis cache | ✅ ativo | `redis://redis:6379/8`, prefixo `evolution`, `SAVE_INSTANCES=true`; container healthy |
| RabbitMQ | ✅ ativo | 15 eventos/instância; consumer dedicado `evolution-rabbit-consumer` **14/14 filas, 0 err, DLQ vazia** (stats ao vivo) |
| S3 → **Cloudflare R2** | ✅ funcional | `zapp-whatsapp-media` @ `…r2.cloudflarestorage.com`; logs ao vivo mostram `mediaUrl` presignada R2 gerada para áudio/sticker recebidos hoje; `S3_SAVE_VIDEO=true` |
| Webhook por instância → Edge Function | ✅ funcional | `https://supabase.atomicabr.com.br/functions/v1/evolution-webhook`, 15 eventos; eventos processados recentes |
| Webhook global / WebSocket / SQS / NATS | ⬜ desligados | Intencional (pipeline é RabbitMQ-first) |
| Chatwoot / Typebot / Dify / OpenAI / n8n (nativos) | ⬜ desligados | Intencional — automação vive no pipeline próprio (cron + Edge Functions + n8n externo) |
| Reject call + mensagem | ✅ | Ambas instâncias |
| Telemetria | ✅ off | `TELEMETRY=false` |
| Healthcheck/limites | ✅ | wget 30s, CPU 2.0 / RAM 3G, `init: true`, rollback configurado |
| Secrets | ✅ | DB URI, API key (v4), R2 keys, RabbitMQ URI — todos via Docker secrets |

**Instâncias:**

| Instância | Número | Estado | Observação |
|---|---|---|---|
| `wpp_pink_test` | 556484450900 | 🟢 `open` | Recebendo mensagens ao vivo; mídia → R2 ok; RabbitMQ ok |
| `wpp2` (principal) | 551146375517 | 🔴 `connecting` (401) | **Deslogada — exige QR** (runbook §4.1 da sessão 2 continua válido) |

## 3. Banco de dados — visão de DBA

### 3.1 PG14 nativo (db `evolution`)
- 833 MB, PG 14.22, schema Prisma íntegro. Purge v2 saudável (Message 90d, MessageUpdate 30d,
  webhooks 30d, Baileys errors 7d) com batches de 50k e VACUUM ANALYZE ao final de cada ciclo.
- `Message`: wpp2 = 158 139 (última 07/05 — consistente com a linha offline; ingestão nova ocorre
  apenas na pink), pink = 20 315 (última = agora).

### 3.2 PG15 Supabase (3,2 GB, 150 conexões máx, 19 em uso, cache hit 94%)
- **Schemas:** `evo` 172 tabelas (espelho/operacional), `zapp` 148 (app), `public` 130 + 539 views,
  + `bpm`, `ai`, `financeiro`, `vendas`, `archive`, `ops`, `monitoring` etc. RLS habilitado em
  100% das tabelas `evo`/`zapp` listadas (o achado de RLS permissivo da sessão 1 segue como risco
  de *policy*, não de ausência de RLS).
- **Maior objeto:** `evo.evolution_messages_wpp2` — 1,93 GB / 1 836 973 linhas (61% do banco).
  Retenção nova (12 meses/mensal) já criada; primeira execução em 01/08 03:00.
- **Particionamento:** `evolution_webhook_events_v2` particionada por mês (2026-03 → 2027-06)
  com criação automática (job #64) — desenho correto para alto volume.
- **49 cron jobs ativos** cobrindo retenção (webhook audit, alerts, realtime events, cron history,
  media queue), reconciliação WhatsApp (dispatch/apply/reaper), watchdogs de pipeline, health
  score, partições, ANALYZE diário e archive mensal. Cobertura de manutenção **acima da média**.
- **Extensões:** pg_cron, pg_net, pgmq, pg_stat_statements, pg_trgm, vector 0.8, pgsodium/vault,
  hypopg + index_advisor — stack completa para diagnóstico e evolução.
- **Pós-restart de hoje:** `pg_stat` zerado (uptime 22 min) — bloat/seq-scan/slow-queries ilegíveis
  até reacumular; ~90 schemas `pg_temp_*` órfãos confirmam shutdowns não-limpos recorrentes (§0 item 3).

### 3.3 Pipeline espelho (RabbitMQ → consumer → `evo`)
- Consumer: 1 réplica, 14/14 filas, `err=0`, DLQ vazia, logging de stats a cada 30s + Sentry.
- Espelho da pink atualizado (última msg 03/07 17:31); espelho do wpp2 parado desde 21/06
  (consequência do logout, não defeito do consumer).

## 4. Backups & DR

| Camada | Mecanismo | Destino | Retenção | Estado |
|---|---|---|---|---|
| PG14 evolution diário | `postgres-backup-s3` (02:00, seg-sáb) | MinIO `evolution-backups/daily` (criptografado com passphrase) | 14 dias | 🟢 rodando |
| PG14 semanal/mensal | stacks dedicados | MinIO | — | 🟢 rodando |
| Offsite | `minio-offsite-mirror` | espelho externo do MinIO | — | 🟢 ativo |
| Supabase PG15 diário | `pg_dump -Fc` + validação de tamanho mínimo (100 MB) + SHA-256 | **volume local `backup_data`** | 14 dias | 🟠 **sem cópia offsite** (achado N2) + senha em texto puro no stack (achado N1) |
| Sessão Baileys | `baileys-backup` | — | — | 🟢 ativo |
| Validação de restore | stack `restore-validate` | — | — | 🟢 existe |

## 5. Recomendações priorizadas

1. **HOJE — Reconectar `wpp2`:** escanear novo QR (celular da linha 551146375517 → WhatsApp →
   Aparelhos conectados). O watchdog v8 vai limpar o alerta sozinho ao ver `state=open`.
   Em seguida disparar reconciliação para o período 21/06→reconexão.
2. **Esta semana — Fechar achado N1:** mover `PGPASSWORD` do stack `supabase-backup` para Docker
   secret e rotacionar a senha do `supabase_admin`.
3. **Esta semana — Fechar achado N2:** enviar dumps do Supabase para MinIO/R2 (offsite).
4. **Investigar os reboots do host** (2 janelas em 24h). O `infra-boot-guard` mitiga o sintoma;
   a causa (OOM? kernel? provedor?) segue sem diagnóstico — checar `journalctl -k` / logs do provedor.
5. **Manter v2.3.7** e pinagem por digest; acompanhar releases do upstream (2.4.0 exigirá licença).
6. Menores: auditar dedupe de contatos (N4); observar flapping da pink; considerar `DATABASE_SAVE_DATA_CHATS`
   permanece `false` por design (chats vêm do espelho) — ok.

## 6. Veredito

A instalação está **madura e bem operada**: última versão estável, secrets bem geridos (após a
rotação de hoje), mídia no R2 funcionando, filas saudáveis, retenção/particionamento/cron de nível
profissional e DR em camadas. Os dois riscos reais são **operacionais**, não de arquitetura:
a linha principal deslogada (exige ação humana com o celular) e a cópia do backup do Supabase que
ainda mora no mesmo disco do banco. Resolvidos esses dois pontos + a senha em texto puro, o
ambiente fica em estado exemplar.

---

## 7. ADENDO — Remediação executada (2026-07-04 ~01:10 UTC, aprovada pelo usuário)

Os achados **N1** (senha em texto puro no stack `supabase-backup`) e **N2** (dumps do Supabase
sem cópia offsite) foram **corrigidos em produção** nesta mesma sessão:

### N1 — Senha fora do texto puro ✅
- O stack `supabase-backup` (Portainer id 124) foi atualizado para ler `PGPASSWORD` do secret
  **já existente** `supabase_db_password_v1` (o mesmo que o stack do Supabase monta) via
  `/run/secrets/…` — a senha não aparece mais no compose.
- **Nota importante descoberta no processo:** o mesmo valor de senha também está hardcoded no
  serviço `rest` (PostgREST, `PGRST_DB_URI`) do stack `supabase` (id 35), junto com o
  `PGRST_JWT_SECRET`. Ou seja, a **rotação** dessa senha é uma manutenção coordenada do stack
  inteiro (roles `supabase_admin`, `authenticator`, `supabase_auth_admin`,
  `supabase_storage_admin`, `postgres` + secret `supabase_db_password_v1` + o URI hardcoded do
  `rest` + possíveis credenciais salvas no n8n/metabase) com janela de indisponibilidade de
  alguns minutos. **Runbook resumido:**
  1. Gerar nova senha e atualizar o secret (criar `supabase_db_password_v2`).
  2. `ALTER ROLE … PASSWORD` para os 5 roles (na mesma transação/sequência imediata).
  3. Atualizar stack 35: trocar referências do secret e corrigir o `PGRST_DB_URI` do `rest`
     para também ler de secret; redeploy (serviços reiniciam; DB não precisa reiniciar).
  4. Atualizar consumidores externos (credencial do Postgres no n8n, metabase, guards).
  5. Validar: auth/storage/realtime/rest/functions healthy + `pg_stat_activity` sem falhas de login.
  - Recomenda-se executar em janela de manutenção supervisionada — **não** foi executado de
    forma autônoma nesta sessão por decisão de segurança.

### N2 — Backup do Supabase com cópia offsite ✅
- Descoberta adicional: o backup diário do PG14 (evolution) **já envia direto para o
  Cloudflare R2** (bucket `promo-brindes-backups`, prefixo `backups/evolution-db/daily`) —
  o stack file dizia MinIO (drift de runtime; o espelho `minio-offsite-mirror` está em
  standby com referência a container antigo e pode ser aposentado ou corrigido).
- O `supabase-backup` v2 agora, após o `pg_dump` validado (tamanho mínimo + SHA-256):
  1. Cifra o dump com **GPG AES-256** usando a mesma passphrase dos backups do PG14
     (secret novo `backup_passphrase_v1`);
  2. Envia `*.dump.gpg` + `*.sha256` para `r2://promo-brindes-backups/backups/supabase-db/daily/`
     (secrets novos `r2_backup_access_key_v1`/`r2_backup_secret_key_v1`, copiados do runtime
     do backup diário — nunca impressos);
  3. Aplica retenção remota de 14 dias (`mc rm --older-than 14d`);
  4. Em falha de upload, preserva o dump local e cria marker `OFFSITE_FAILED_*` (não perde backup).
- Cópia local em `backup_data` continua igual (14 dias, validação, SHA-256).

**Secrets criados no Swarm:** `r2_backup_access_key_v1`, `r2_backup_secret_key_v1`,
`backup_passphrase_v1`. Nenhum valor de credencial foi exposto em logs ou neste documento.
