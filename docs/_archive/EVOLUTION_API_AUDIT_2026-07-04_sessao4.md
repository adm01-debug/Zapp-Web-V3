# 🔬 Auditoria Exaustiva — Evolution API + Banco de Dados (Sessão 4 — verificação noturna independente)

> **Data:** 2026-07-04 (~01:00–01:45 UTC)
> **Escopo:** Evolution API na VPS (Docker Swarm/Portainer), PostgreSQL 14 nativo do Evolution
> (db `evolution`), PostgreSQL 15.8 do Supabase self-hosted (schemas `evo`, `zapp`), RabbitMQ,
> Redis, mídia no Cloudflare R2, host (memória/disco/OS) e versão do upstream.
> **Método:** Recon direto e independente via MCP (Portainer, Evolution API, Supabase self-hosted),
> `psql` dentro dos containers PG14 e PG15, `rabbitmqctl`, `redis-cli`, logs de produção ao vivo,
> Docker Hub e GitHub do upstream. Cruzamento item a item com as sessões 1–3.
> **Relatórios anteriores:**
> [`EVOLUTION_API_AUDIT_2026-07-03.md`](./EVOLUTION_API_AUDIT_2026-07-03.md) ·
> [`EVOLUTION_API_AUDIT_2026-07-04_followup.md`](./EVOLUTION_API_AUDIT_2026-07-04_followup.md) ·
> [`EVOLUTION_API_AUDIT_2026-07-04_sessao3.md`](./EVOLUTION_API_AUDIT_2026-07-04_sessao3.md) ·
> [`EVOLUTION_API_AUDIT_2026-07-04_scorecard.md`](./EVOLUTION_API_AUDIT_2026-07-04_scorecard.md)

---

## 0. TL;DR — veredito das 4 perguntas da auditoria

| Pergunta | Veredito | Evidência |
|---|---|---|
| **A Evolution API está instalada corretamente?** | ✅ **SIM** — instalação madura: imagem oficial pinada por digest, secrets Docker (DB URI, API key v4 rotacionada hoje, R2, RabbitMQ), Traefik+TLS, healthcheck, limites de recursos, `init:true`, telemetria off, `EXPOSE_IN_FETCH_INSTANCES=false`. | Inspeção do serviço `evolution_evolution` + stack file (id 25). |
| **O banco foi configurado corretamente?** | ✅ **SIM** — **57/57 migrações Prisma aplicadas, zero pendentes/falhas** (re-verificado no boot de 01:34: “No pending migrations to apply”). Índices do `Message` corretos e usados; autovacuum saudável (160 dead / 179 047 live); tuning do PG14 adequado (shared_buffers 1 GB, effective_cache 6 GB, work_mem 16 MB, random_page_cost 1.1). | `_prisma_migrations`, `pg_stat_user_tables`, `pg_stat_user_indexes`, `pg_settings`. |
| **A versão está atualizada?** | ✅ **SIM** — instalada **v2.3.7** = última release **estável** do upstream (`evolution-foundation/evolution-api`, ex-`EvolutionAPI`). A 2.4.0 continua em RC (rc2 de 17/05/2026, “not for production”) e passará a exigir ativação de licença → **não migrar**. | `package.json` no container (2.3.7); GitHub releases; Docker Hub `evoapicloud/evolution-api` (tags mais novas que a atual: só `homolog` e RCs). |
| **Está configurada para a melhor performance/integração?** | 🟡 **QUASE** — pipeline RabbitMQ→consumer→espelho 100% funcional (31 filas, todas com consumer, backlog 0, DLQ vazia), Redis OK, mas há **5 achados novos** abaixo (S3/R2 AccessDenied no boot, GlitchTip engolindo alertas, `_analytics` com 35 GB, drift do stack reaberto pelo logpatch, churn de restarts na madrugada). | Seções 2–6. |

### 🔴 Ação humana continua pendente (inalterado desde a sessão 3)

- **`wpp2` (linha principal 551146375517) segue deslogada** — `401 device_removed` desde
  2026-07-03 16:40 UTC, estado `connecting`. Watchdog v8 suprime restarts corretamente
  (verificado ao vivo: “restart suppressed (already alerted)” a cada ciclo de 5 min).
  **Só resolve com re-pareamento por QR code no aparelho.** Última `Message` persistida do
  wpp2 no PG14: **2026-05-07 14:01 UTC** (158 139 linhas) — confirmado de novo nesta sessão.
  Após reconectar, rodar a reconciliação (`evolution_reconcile_jobs`).

---

## 1. O que mudou entre a sessão 3 (~00:30–01:00) e esta sessão (~01:00–01:45)

Esta janela pegou **manutenção ativa em produção** (deploys às 00:54, 01:31 e 01:34 UTC — exits
143/SIGTERM do serviço, não crashes):

1. **Logpatch LGPD entrou em produção às 01:34 UTC.** O entrypoint do serviço agora gera
   `dist/main.patched.js` no boot removendo dois `console.log` do bundle:
   o **dump completo de cada mensagem recebida** (LGPD) e o **dump de stanza com material de
   sessão Signal** (chaves privadas de ratchet apareciam nos logs — eu as vi ao vivo às 01:32
   no container anterior). O patch é *fail-open* (se o alvo não for único, sobe o main original).
   **Verificado pós-deploy:** logs a partir de 01:34 não contêm mais conteúdo de mensagem nem
   `SessionEntry`; “Closing session” agora loga sem o objeto. ✅
2. **Rotação da API key v4** (`evolution_api_key_v4_20260704`) aplicada — o drift v3/v4 apontado
   na sessão 3 foi eliminado; stack e runtime usam o mesmo secret v4.
3. **Custo colateral do churn:** cada redeploy derruba e resincroniza as sessões Baileys
   (“Timeout in AwaitingInitialSync”, flapping leve do `wpp_pink_test` — coerente com o item 4
   da sessão 3). Evitar redeploys em horário comercial.

---

## 2. 🆕 Achados novos desta sessão

| # | Severidade | Achado | Evidência | Recomendação |
|---|---|---|---|---|
| **S4-1** | 🟠 ALTO (integridade de config) | **Drift do stack REABERTO pelo logpatch.** O entrypoint com logpatch existe **só no spec vivo do serviço** (`docker service update` direto); o stack file no Portainer (atualizado 00:54) ainda tem o entrypoint antigo, sem o patch. Um redeploy pela UI do Portainer **reverte a correção LGPD** silenciosamente. | `inspect_service` (01:20) ≠ `inspect_container` da task criada 01:31; stack file id 25 sem o bloco `logpatch.cjs`. | Persistir o entrypoint com logpatch no stack file do Portainer (mesmo padrão da correção de drift da sessão 3). É o mesmo erro de processo que a sessão 3 marcou como resolvido — voltar a tratar o stack file como fonte única. |
| **S4-2** | 🟠 MÉDIO (mídia) | **`S3 ERROR: Access Denied` em todo boot** — o cliente MinIO chama `makeBucket('zapp-whatsapp-media')` na inicialização e o token R2 nega (provavelmente token escopado ao bucket, sem permissão de criar/listar buckets). A geração de URLs assinadas continua funcionando (mediaUrls R2 nos logs), mas o erro polui o log e, se o bucket algum dia não existir, a criação automática **falhará silenciosamente**. | Stack trace `S3Error: Access Denied … at async Client.makeBucket … main.patched.js` às 01:34:37, repetido em cada boot. | Validar com upload de mídia real (já há evidência de PUT ok na sessão 3); opcionalmente conceder `ListBucket` ao token R2 ou aceitar o ruído documentado. Monitorar `evo.evolution_media` para confirmar que novos registros continuam chegando. |
| **S4-3** | 🟠 MÉDIO (observabilidade) | **GlitchTip está engolindo TODOS os alertas do watchdog** — cada `sentry_send` retorna **HTTP 500** (visto no startup do watchdog v8 e nos envios de warning). Ou seja: o alerta crítico “QR re-scan needed” do wpp2 **não chega a ninguém** por esse canal. O `glitchtip-web` reiniciou às ~01:35. | Logs do watchdog: `[sentry] info http=500`, `[sentry] warning http=500`. | Investigar o GlitchTip (migrações pendentes? Postgres dele saudável?) e criar um teste sintético de ingestão. Enquanto isso, os alertas em `evo.evolution_alerts` são o canal confiável. |
| **S4-4** | 🟠 ALTO (capacidade) | **DB `_supabase` (Logflare/analytics) = 35 GB**, sendo **uma única tabela `_analytics.log_events_d8f3db66…` com 29 GB** + outra com 5,3 GB. Disco do host a **76%** (147 G/193 G, 46 G livres). Sem retenção, é o maior consumidor de disco da VPS e o principal candidato a causar a próxima crise de espaço. | `psql -d _supabase` top relations; `df -h` no host. | Configurar retenção do Logflare (`LOGFLARE_…_RETENTION` / truncar partições antigas de `log_events_*`). Ganho imediato: ~30 GB. Fazer em janela de manutenção — é o analytics do Supabase, não afeta dados de negócio. |
| **S4-5** | 🟡 MÉDIO (estabilidade) | **`supabase_db` levou exit 137 (SIGKILL/OOM-pattern) de novo ~01:11 UTC** — segundo restart não-limpo do PG15 na mesma madrugada (sessão 3 registrou o primeiro). Host: 24 GB RAM, 9,2 GB em uso + 13 GB cache, **swap 0**. Os ~90 schemas `pg_temp_*` órfãos vistos na sessão 3 continuam listados no catálogo. | `list_containers` (container `8f78f5a18c34` Exited 137); `free -m`; `pg_postmaster_start_time`. | Priorizar a investigação de memória: definir `resources.limits/reservations` no serviço `supabase_db`, avaliar swap pequeno (2–4 G) como amortecedor, e reduzir o apetite do Logflare (S4-4 ajuda — a ingestão de 29 GB de log_events passa pelo mesmo Postgres). |
| **S4-6** | 🟡 BAIXO (ciclo de vida) | **Host Ubuntu 20.04 LTS (kernel 5.4, cgroup v1)** — standard support encerrado em 04/2025; Docker 28.1.1 moderno sobre base EOL. PG14 do Evolution: suporte upstream até 11/2026. | `docker info`. | Planejar (sem urgência): upgrade do host para 22.04/24.04 e do PG14 → 16 na próxima janela grande. Ambos exigem parada; não fazer junto com nada crítico. |

---

## 3. Evolution API — estado verificado em produção

- **Versão/imagem:** `evoapicloud/evolution-api@sha256:6b1956…` (build 2025-12-05, rev `cd800f2`,
  Node 24.11.1, Baileys 7.x) = **v2.3.7** confirmada no `package.json` dentro do container.
  Nota recorrente: o `evo_status` do MCP reporta `version: 4.2.0` — é a versão do **worker MCP**,
  não da API.
- **Instâncias:**
  - `wpp_pink_test` (556484450900): `open`, tráfego real fluindo (mensagens + mídia R2 ao vivo);
    `rejectCall=true` com mensagem, `readMessages=true`, `syncFullHistory=true`.
    ⚠️ `syncFullHistory=true` encarece cada reconexão (e houve 3 restarts esta noite) — se o
    histórico completo não for necessário nessa instância de teste, desligar reduz o churn.
  - `wpp2` (551146375517): `connecting`, `401 device_removed` — **aguardando QR** (seção 0).
- **Integrações:** RabbitMQ ativo (vhost `evolution`, exchange `evolution`, 31 filas
  `wpp2.*`/`wpp_pink_test.*`, todas com 1 consumer, mensagens=0, `wpp2.dlq` vazia);
  Webhook global/WebSocket/SQS desligados de propósito; Chatwoot/Typebot/Dify/OpenAI off;
  S3→R2 ligado (`zapp-whatsapp-media`, `S3_SAVE_VIDEO=true`).
- **Cache:** Redis `db 8` prefixo `evolution`, `CACHE_REDIS_SAVE_INSTANCES=true` + cache local.
  Redis global: 1,71 G/3 G, `noeviction` (correto para store de credenciais), AOF ligado.
- **Guardiões:** watchdog-baileys v8 (supressão de 401 funcionando — confirmado ao vivo),
  infra-boot-guard (max 5 restarts/dia, cooldown 600 s), swarm-task-guardian (heartbeat 5 min),
  baileys-backup, dlq-inspector, wa-version-monitor. `ForceUpdate=472` no serviço é o acumulado
  histórico dessas automações + deploys.

## 4. Banco nativo do Evolution (PG14, db `evolution`, 759 MB)

- **Migrações:** 57/57 aplicadas, nenhuma `finished_at IS NULL`; última:
  `20251122003044_add_chat_instance_remotejid_unique` (16/12/2025) — schema exatamente o esperado
  para a v2.3.7. Deploy de migração roda a cada boot e reporta “No pending migrations”.
- **Volumetria:** `Message` 698 MB/179 k linhas (wpp2 158 139 congeladas desde 07/05 +
  wpp_pink_test 20 394 crescendo); `Contact` 21 277; `Chat` 9 057; `IsOnWhatsapp` 6 518.
- **Índices do `Message`:** todos os índices Prisma presentes e usados
  (`instanceId_keyId` 21 915 scans, `instanceId_remoteJid` 23 566, `instanceId` 45 419,
  pkey 206 667). “Unused” relevantes são só os artefatos do outage do wpp2 (não dropar —
  ver sessão 3) + 3 índices de tabelas auxiliares (`_baileys_error_events` etc.).
- **Saúde:** autovacuum em dia (Message: 160 dead/179 k live, último às 23:31), conexões 5/100,
  cache hit 74% **ainda em aquecimento** (o PG14 reiniciou há ~1h50 junto com o ciclo do host) —
  re-medir amanhã; a sessão 3 mediu 99–100% na janela quente.
- **Tabelas custom no schema `public`** (`_baileys_error_events` 12 MB/70 k,
  `_swarm_guardian_events` 12,8 k, `_audit_*`, `evolution_webhook_events` 20,8 k): funcionais,
  mas recomendo **retention** para as duas primeiras (o guardian insere 1 linha/5 min para sempre).

## 5. Supabase self-hosted (PG15.8) — schemas `evo` (176 tabelas) e `zapp` (148 tabelas)

- **Pipeline do espelho:** `zapp.webhook_events_processed` recebendo (2 752 inserts desde o
  restart de ~00:35); partições mensais `evolution_webhook_events_v2_*` ativas; jobs `pg_cron`
  de archive/retention da sessão 3 presentes.
- **Performance:** cache hit 98,2%, 19/150 conexões, sem `idle_in_transaction`. Índices: nenhum
  FK sem índice em `zapp`; os 3 “candidatos” do analisador têm 1–4 seq scans — irrelevantes.
- **Riscos:** concentrados no host/analytics (S4-4/S4-5 acima), não nos schemas de negócio.

## 6. O que esta sessão NÃO alterou (e por quê)

- **Nenhum redeploy/restart do serviço `evolution_evolution`:** havia manutenção concorrente em
  andamento (deploys 01:31/01:34) e cada restart derruba as sessões Baileys. As correções
  recomendadas (S4-1) são edição de stack file — fazer em janela controlada.
- **Nenhuma limpeza no `_analytics` (S4-4):** deleção de 29 GB é destrutiva; requer decisão de
  retenção (sugestão: 7–14 dias) e janela.
- **Nenhum `service update` no `supabase_db`:** mexer em limites de memória do Postgres de
  produção às 01:40 sem janela é risco desnecessário.

## 7. Checklist de próximos passos (ordem sugerida)

1. 🔴 **Re-parear `wpp2` via QR** (única pendência crítica; depois disparar reconciliação).
2. 🟠 **Persistir o entrypoint com logpatch no stack file** do Portainer (S4-1) — 15 min, sem
   downtime extra se feito junto com o próximo deploy planejado.
3. 🟠 **Consertar ingestão do GlitchTip** (S4-3) — hoje os alertas críticos morrem com HTTP 500.
4. 🟠 **Retenção do Logflare/`_analytics`** (S4-4) — recupera ~30 GB (disco a 76%).
5. 🟡 **Limites de memória do `supabase_db` + swap pequeno no host** (S4-5).
6. 🟡 Retention para `_baileys_error_events`/`_swarm_guardian_events` no PG14 (seção 4).
7. 🟡 Avaliar `syncFullHistory=false` no `wpp_pink_test` (seção 3).
8. ⚪ Planejar upgrades de ciclo de vida: Ubuntu 20.04 → 22.04/24.04; PG14 → 16 (S4-6).
   **Não** migrar Evolution para 2.4.0 enquanto for RC/licenciada.
