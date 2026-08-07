# RUNBOOK DE RECUPERAÇÃO DE DESASTRE — ECOSSISTEMA EVO (2026-08-06)

> **Objetivo:** restaurar o ecossistema Evolution API (VPS AtomicaBR) com RTO/RPO documentados, a partir dos backups offsite (R2) e locais.
> **Fontes:** AG-EX-15 (backups), A3 (PG14), rabbitmq-ops (definitions), volume-backup (220).
> **Regra:** nunca restaurar por cima do ambiente vivo sem parar os consumidores (consumer, purge, reconcile, watchdogs).

## 1. Inventário de backups (fonte da verdade)

| Dado | Onde | Frequência | Retenção | Recência validada |
|---|---|---|---|---|
| PG14 evolution (pg_dump -Fc) | R2 `promo-brindes-backups/backups/evolution-db/daily/` (stack 112) | Diária 02:00Z (seg–sáb) | 14d | 06/08 02:00Z (103 MB) ✅ |
| Sessão WhatsApp (Session.creds) | Dentro do pg_dump acima (tabela Session) | idem | idem | creds 17,3 kB vivos |
| Redis (sessões/cache) | R2 `backups/redis-data/daily/` (volume-backup 220, gpg) | Diária | 14d | — |
| RabbitMQ volume (mnesia) + definitions | R2 `backups/rabbitmq-data/daily/` (220, gpg + definitions JSON) | Diária | 14d | 154 MB→37 MB gz |
| Supabase PG15 | R2 (supabase-backup 124) | Diária | — | — |
| Mídia R2 | R2 `zapp-whatsapp-media/` (ativa) + `minio-archive/` (histórico) | Contínuo | — | 37.044 obj |
| Stack files Portainer | portainer-state-backup (198) | Diária | — | — |

**GPG:** passphrase `backup_passphrase_v1` / `backup_passphrase_dw_v1` (secrets do Swarm — ler via serviço temporário; nunca imprimir).

## 2. Procedimentos

### 2.1 Restaurar PG14 (banco evolution) — RTO ~20min
1. Parar consumidores: `docker service scale evolution-rabbit-consumer_consumer=0` + `evolution-db-purge_purge=0` + `evolution-reconcile_reconcile=0` + watchdog-baileys=0.
2. Baixar dump mais recente do R2: `mc cp r2/promo-brindes-backups/backups/evolution-db/daily/<dump> /tmp/` (ou aws cli no container 112).
3. `docker exec postgres sh -c 'dropdb -U postgres evolution && createdb -U postgres evolution'` → `pg_restore -U postgres -d evolution -j4 --no-owner /tmp/<dump>` (CUIDADO: dropdb é destrutivo — confirmar janela).
4. `setval` das sequences se o dump for antigo: `SELECT setval('evolution_webhook_events_id_seq', max(id)) FROM evolution_webhook_events;` etc.
5. Subir consumidores; validar: `SELECT length(creds) FROM public."Session"` (>15k), consumer [STATS] ok, wpp2 connectionState open (reconexão automática — sessão no PG).

### 2.2 Restaurar sessão WhatsApp (sem restaurar o banco inteiro)
- Se só a sessão corrompeu: restaurar APENAS as tabelas Session/Instance do dump: `pg_restore -U postgres -d evolution --table=public."Session" --table=public."Instance" <dump>` (se as tabelas existirem, usar `--data-only` após truncate) → restart do serviço evolution (`docker service update --force evolution_evolution`) → QR re-scan se necessário (runbook QR).
- Alternativa sem dump: re-pareamento (POST /instance/connect → QR) — o plano B de última instância (perde histórico local de sessão, mensagens não são afetadas — vivem no Supabase).

### 2.3 Restaurar Redis
- Parar evolution + consumer; restaurar volume `redis_data` do tar gpg (`backups/redis-data/daily/`) OU deixar o Redis esvaziar (cache efêmero; sessões Baileys vivem no PG — REDIS é cache, perda = reconexão normal). **Recomendado: não restaurar** — só validar que o CACHE_REDIS_SAVE_INSTANCES não é fonte primária (confirmado: DB-backed).

### 2.4 Restaurar RabbitMQ
- Opção A (volume): parar rabbitmq → restaurar `rabbitmq_data` do tar gpg → iniciar.
- Opção B (definitions, broker novo): importar definitions JSON (filas/quórum/policies/bindings) via `rabbitmqadmin import` ou API; mensagens não-recuperadas (filas em memória do quorum? quorum é persistente no volume) — validar policies (dlq-retention p20) após import.

### 2.5 Restaurar Mídia R2
- R2 é o próprio armazenamento (não há restore — o incidente seria deleção acidental): objetos deletados >30d irrecuperáveis (R2 versioning não configurado). **Recomendação: habilitar versioning no bucket** (próxima etapa) ou lifecycle snapshot. Manifest de deleções da onda 06/08: `.hermes/execucao-evo-20260806/r2-orphans-manifest-*.json` (0 objetos deletados — gates bloquearam).

### 2.6 Restaurar Supabase PG15
- Seguir runbook do supabase-backup (stack 124) — fora do escopo EVO; referência: `.hermes/auditoria-infra/AG-EX-15-backups.md`.

## 3. Pós-restore (verificação em camadas)
1. `SELECT 1` em PG14 + counts (Message/Contact/Chat) batendo com o dump.
2. `evo_status` (MCP) → wpp2 `open`.
3. `GET /manager/health` + `GET /` (versão mascarada 2.x).
4. Consumer logs: banner v7 + `[STATS] ok` crescendo + `filas=17/17`.
5. RabbitMQ API: 19 filas, 34 consumers, 0 msgs.
6. `zapp.evolution_messages` max(created_at) < 5min (ingestão real fluindo).
7. KPI: `evo.v_wpp2_uptime_24h` + `evo.v_kpi_overview` (gap_sync healthy).

## 4. RTO/RPO alvo
| Camada | RTO | RPO |
|---|---|---|
| PG14 evolution | 20 min | 24h (dump diário) — sessão WhatsApp: até 24h de atraso de creds (re-scan se >24h) |
| RabbitMQ | 30 min | 24h (volume) — filas vazias normalmente (0 msgs) |
| Redis | 0 min (não restaurar) | n/a (cache) |
| Supabase PG15 | runbook próprio | conforme supabase-backup |
| Mídia R2 | 0 min (ativo) | n/a (contínuo) |

## 5. Pendências conhecidas (afetam DR)
- **MinIO (stack 19):** bucket `evolution` (3.388 obj/1,6 GiB, abril/2026) NÃO arquivado no R2 (creds scoped sem permissão de escrita no prefixo; token de conta CF necessário) → MinIO mantido ativo como fonte única desse lote. Não remover até arquivar.
- **Versioning R2 não habilitado** → deleções acidentais >30d irrecuperáveis.
- Teste real de restore do PG14 agendado (pendência AG-EX-05 #24) — executar trimestralmente em container descartável (backup-restore-validation).
