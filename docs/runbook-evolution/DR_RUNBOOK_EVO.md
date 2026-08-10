# 🛡️ Runbook de Disaster Recovery — Evolution API (banco evolution + sessão WhatsApp)

**Atualizado:** 2026-08-10 (onda 10/10 + onda 2 — PITR/pgBackRest ATIVO, rotação Redis executada, UNIQUE aplicado; T19, stack 25 e ACL fase 2 pendentes de janela única; fluxo do WhatsApp DEGRADADO)
**Escopo:** banco `evolution` (PG14 nativo da VPS — stack `postgres`/20), stack `evolution` (25, imagem `evolution-api-custom@6f78bb0d`), Redis DB 8 (sessão Baileys), R2 (mídia)

> **Este é o runbook da EVOLUTION.** O `docs/DR_RUNBOOK.md` cobre o Supabase/zapp (ambiente separado).

## ⚠️ LOCALIZAÇÃO DA SESSÃO (crítico)
A sessão do WhatsApp **NÃO** está na tabela `Session` (0 linhas) — está no **Redis DB 8**, hash `evolution:instance:f7a73e2c-327d-426c-8fa6-6ea7743ace02` (creds + pre-keys + app-state-sync). **Backup do Redis = backup da sessão.** O Redis exige auth (ACL — `redis_password_v2`; `evolution_app` com `~evolution:*`).
⚠️ **10/08 16:11Z:** o hash de sessão foi apagado por um LOGOUT do fluxo da evolution (HLEN 749→1) durante a janela de validação da rotação — não atribuível à rotação (auth OK no momento). Se a instância não voltar a `open` em ~15-30 min, re-parear via QR (perde o histórico de sessão).

## Artefatos de backup (host da VPS) — checksums verificados (10/08)
| Artefato | Caminho | sha256 (16) | Estado |
|---|---|---|---|
| Snapshot PG pré-fix | `/opt/backups/evolution-20260810/evolution_pre_fix_20260810.dump` | `68c63470…` | histórico |
| Snapshot PG **pos-fix** | `/opt/backups/evolution-20260810/evolution_pos_fix_20260810.dump` | `60b3f110…` | **restaurável (testado, 21s)** |
| Redis DB 8 (BGSAVE) | `/opt/backups/evolution-20260810/redis_db8_dump.rdb` | `7918c7f3…` | **restaurável (testado, 2s)** |
| Bundle da imagem 66bb579a | `/opt/backups/evolution-20260810/main_original_66bb579a.js` | `232dbf94…` | referência dos patches T8-T14 |

Backups automáticos (R2 `promo-brindes-backups`, GPG):
- `postgres-backup-daily` (112): **seg–sáb 02:00**, `backups/evolution-db/daily`, retenção 14d
- `postgres-backup-weekly` (84): **dom 03:00**, `backups/evolution-db/weekly`, retenção 35d
- `postgres-backup-monthly` (85): dia 1 04:00, `backups/evolution-db/monthly`, retenção 365d — ⚠️ passphrase **diferente** (`backup_passphrase_monthly_v1`)

## ⚠️ GAP DE RPO NO DOMINGO (decisão documentada 10/08)
- Daily não roda domingo; o weekly (dom 03:00) cobre — **mas se o weekly falhar num domingo, o RPO efetivo vira até 72h** (próximo daily = segunda 02:00).
- **Decisão:** manter weekly no domingo + verificação manual do objeto de domingo na segunda (mecanismo validado em 10/08). Alternativa futura: cron do daily 112 passar a incluir domingo.
- ✅ **Atenuado pelo PITR (10/08 15:30Z):** com o WAL archiving contínuo (pgBackRest), o gap dominical fica coberto — manter a verificação manual como segunda camada.

## RPO / RTO (medidos em 10/08)
- **RPO:** **~5 min** com PITR ativo (archive_timeout=300s desde 16:15Z — ver seção PITR); dumps diários seguem como camada extra (24h)
- **RTO:** PG **21s** (restore de dump testado) / **~8 min (471s)** (restore pgBackRest testado na ativação) · Redis **2s** (restore testado) · rollback de imagem: 1 comando

## PITR (Point-in-Time Recovery) — pgBackRest ATIVO e validado (onda 2, 10/08)
> **Estado: ✅ ATIVO E VALIDADO (~16:25Z).** WAL archiving em produção via **pgBackRest 2.59.0** (substitui o wal-g do plano original — 10/08 15:27-15:30Z). RPO efetivo **~5 min** (`archive_timeout=300s` desde 16:15Z); RTO testado **471s (~8 min)**. **Restore point-in-time real (`--type=time` / `recovery_target_time`) em teste na onda 2 — sem resultado final** (pendência datada 10/08; procedimento padrão abaixo).

| Item | Estado (10/08 ~16:25Z) |
|---|---|
| `archive_mode` | `on` (ativado no restart 15:27Z; **`archive_timeout=300s`** — reduzido de 60s em 16:15Z, reload sem restart) |
| `archive_command` | `/opt/pgbackrest/archive-push.sh %p` (wrapper; credenciais via env — zero segredo em disco) |
| `wal_level` | `replica` |
| pgBackRest | **2.59.0** no container postgres (`postgres_postgres`); stanza `evolution` status **ok**, cipher none |
| Full backup | `20260810-153006F` (15:30:06-15:42:33Z, DB 3.6GB → repo 1.9GB, wal 68/74) — **manual; agendar cron full semanal + expire (pendência)** |
| Retenção | `repo1-retention-full=7` (full semanal) + `repo1-retention-diff=14` |
| Destino R2 | bucket `promo-brindes-backups`, path `/evolution-pgbackrest`, endpoint R2 (`cd0f4eee…r2.cloudflarestorage.com`), key-type shared |
| WALs arquivados | `pg_stat_archiver`: archived 33→34+ (16:18-16:22Z), **failed=0** pós-ativação; min/max 5B/83 |
| Restore full | ✅ testado na ativação (**RTO 471s**); dir de teste removido (`/tmp/evo-restore-test` ausente); disco 51% |
| Restore point-in-time (`--type=time`) | ⏳ **em teste na onda 2 (16:23-16:30Z, `auditorias/pitr-test/`); sem resultado final** — pendência datada 10/08 (procedimento abaixo) |
| Volume WAL | ~17 GB/dia a 60s → **~3,5 GB/dia com `archive_timeout=300`** (~5x menor; RPO 5 min) |
| Watchdog sugerido | `pg_stat_archiver.failed_count > 0` ou `last_archived_time > 5min` → alerta (baseline stats_reset 15:43:24Z) |

**Procedimento de restore point-in-time (container EFÊMERO — nunca na produção):**
```bash
# 1. conferir backups disponíveis (container postgres)
docker exec <postgres-cid> pgbackrest --stanza=evolution info
# 2. montar PG descartável com volume NOVO e restaurar até o target time
#    (escolher o ponto ANTES do incidente; validar Message.max(messageTimestamp))
docker run -d --name pg-pitr-test --network none -e POSTGRES_PASSWORD=testpass \
  -v pgpitr_test_data:/var/lib/postgresql/data \
  postgres:14@sha256:ae46a8452f2c137766c9d4a62f4fe60166355ff8b00512e6c48692dbf1eed3d5
docker exec pg-pitr-test pgbackrest --stanza=evolution restore \
  --set 20260810-153006F --type=time --target='<YYYY-MM-DD HH:MM:SS UTC>' --target-action=promote
# 3. subir o PG restaurado e validar:
#    pg_is_in_recovery() = false (recovery concluído/promovido)
#    36+ tabelas, migrations 57, W1 dups=0, max(messageTimestamp) <= target
# 4. produção: parar evolution → restaurar volume postgres_data → subir evolution
```
**Variante manual (PG14, sem `--target-action`):** o restore escreve `recovery_target_time='<YYYY-MM-DD HH:MM:SS UTC>'` + `recovery_target_timeline='latest'` no `postgresql.auto.conf` e cria `recovery.signal`; iniciar o PG (replay dos WALs até o alvo) e promover com `pg_ctl promote` (ou `pg_promote()`). Alternativa equivalente a `--type=time`: `recovery_target_lsn`/`recovery_target_xid` (mesmo mecanismo).
⚠️ Enquanto o restore `--type=time` não for testado de ponta a ponta, em incidente seguir o procedimento acima e **validar o resultado** (pg_is_in_recovery=false + contagens) antes de devolver o volume à produção. Dumps diários (`postgres-backup-*`) seguem como camada extra independente do pgBackRest.

**Limpeza AG4 (10/08 ~16:20Z) — ✅ EXECUTADA:** sidecar `pitr-ag10-bb` (experimento wal-g) **removido** (`docker service rm`; task Exited GC'd); objeto `s3://promo-brindes-backups/evolution-wal/test-put.txt` **removido** (prefixo `evolution-wal/` ausente); 0 processos wal-g/mitserver/strace; `/opt/walg` (binários 108 MB) **mantido por decisão documentada** (remover quando o dono do AG4 descartar o experimento wal-g — pgBackRest é o pipeline oficial); `evolution-pgbackrest/` intacto; secrets e volume `postgres_data` não tocados.

## Rotação da senha do Redis — executada (10/08) + procedimento para futuras rotações
> **Estado: ✅ ROTAÇÃO EXECUTADA E VALIDADA (10/08, janela ~13:05-16:17Z).** Secret `redis_password_v2` (fp sha256-12 `b0f455ebbbd9`) **único** no swarm (v1 removida); **8 serviços** montam `source=redis_password_v2` com `target=redis_password_v1` preservado (alias): redis, evolution, n8n (editor/webhook/worker), ag6-watchdogs W3, redis-health-watchdog, mcp-health-monitor; ACL `redis_acl_v5` (3 users: `default`, `evolution_app` `~evolution:*`, `n8n_app` `~n8n:* ~bull:*` — ambos `-@admin -@dangerous`); **0 auth errors em 6h**; W3 v5 com `REDISCLI_AUTH` (0 processos com `-a`). Mapa de consumidores (nunca imprimir valores):

| Consumidor | Uso da senha |
|---|---|
| evolution (stack 25) | `CACHE_REDIS_URI=redis://evolution_app:<secret>@redis:6379/8` |
| n8n | `QUEUE_BULL_REDIS_PASSWORD=<secret>` (DB 2 bull) |
| realtime | DB 0 via secret compartilhado |
| redis (service) | healthcheck `redis-cli -a "$(cat /run/secrets/redis_password_v1)"` + ACL `redis_acl_v2` (users `default`/`evolution_app`/`n8n_app`) |
| watchdogs W3 (ag6) | `REDIS_PASS_FILE=/run/secrets/redis_password_v1` (W3 v5: `REDISCLI_AUTH` via env, nunca `-a` no argv) |
| mcp-health-monitor | probe redis com `REDISCLI_AUTH` (probe v4) |

**Procedimento (janela única, padrão validado em 10/08):**
```bash
# 1. criar o secret novo (v2) e referenciá-lo no serviço redis
printf '%s' '<nova-senha>' | docker secret create redis_password_v2 -
# 2. atualizar ACL: CONFIG SET requirepass <nova> + re-hash users default/evolution_app/n8n_app
# 3. atualizar todos os serviços do mapa (evolution, n8n, realtime, ag6-watchdogs, mcp-health) p/ redis_password_v2
# 4. redeploy em sequência (mesma janela); validar a cada passo:
redis-cli --no-auth-warning -a "$(cat /run/secrets/redis_password_v2)" -n 8 ping   # PONG
#    + W3 OK (hlen>=100, creds>=1000) + wpp2 conectado SEM QR + ingestão < 3 min
# 5. rollback: restaurar secret v1 + redeploy (procedimento reverso)
```
⚠️ Só rotacionar se **todos** os consumidores estiverem 100% via secret (mapeamento acima confirma). Senha nunca em argv/chat.

## UNIQUE (instanceId, key->>'id') — ✅ APLICADO E VALIDADO (10/08 ~15:05Z)
> **Estado: APLICADO E VALIDADO.** PR #1016 (T15-T18) merged e deployado (imagem fork `44a4eee1`, 15:05Z) e `CREATE UNIQUE INDEX CONCURRENTLY "Message_instanceId_keyId_uniq"` aplicado (28,3 MB; dups=0 no precheck). Validações: simulação 23505 em ROLLBACK PASS (counts idênticos antes/dentro/depois); **dups=0 global e na última hora**; W1 OK ininterrupto desde 13:27:59Z; P2002 = **0** na janela pós-deploy (~50 min); skipDuplicates do createMany (histórico) agora deduplica de verdade (UNIQUE presente).

```sql
-- 1. PRÉ-REQUISITO: T15 deployado (findFirst por key->>'id' + instanceId antes do create).
-- 2. DEDUP MANUAL (padrão validado 10/08 — nunca pular): listar e remover não-canônicas
SELECT count(*) FROM (
  SELECT "instanceId", "key"->>'id' AS kid, count(*) c, min(id) AS keep
  FROM "Message" GROUP BY 1, 2 HAVING count(*) > 1) d;
-- DELETE das não-canônicas (cada grupo mantém min(id)) — validar W1 dups=0 ANTES e DEPOIS
-- 3. ÍNDICE (sem lock de escrita):
CREATE UNIQUE INDEX CONCURRENTLY "Message_instanceId_keyId_uniq"
  ON "Message" ("instanceId", ("key"->>'id'));
-- 4. VALIDAÇÃO: W1 dups=0 · pg_index.indisvalid = t · ingestão normal
-- 5. ROLLBACK: DROP INDEX CONCURRENTLY "Message_instanceId_keyId_uniq";
```
Notas: múltiplos NULLs em `key->>'id'` são permitidos pelo UNIQUE (ok); se o índice nascer INVALID, dropar e refazer; P2002 residual pós-T15 é janela ~1ms documentada (100% só com ON CONFLICT futuro).

## Índices — novos e dropados (onda 10/10 + onda 2)
| Ação | Índice | Tabela | Modo | Estado (10/08 ~16:25Z) |
|---|---|---|---|---|
| ➕ NOVO | `Message_instanceId_keyId_uniq` | `Message` (instanceId, key->>'id') — ver seção UNIQUE | `CONCURRENTLY` | ✅ **criado e validado** (28,3 MB; 23505 simulado; W1 OK; idx_scan=11, 2,9M tup_read em 16:24:57Z) |
| ➕ NOVO | `MessageUpdate_instanceId_remoteJid_keyId_idx` | `MessageUpdate` (instanceId, remoteJid, keyId) | `CONCURRENTLY` | ✅ **criado** (confirmado V6 validação pós-melhorias 16:15Z: "novo idx OK") |
| 🗑️ DROP | `Message_instanceId_keyId_idx` | `Message` (não-único, redundante pós-UNIQUE) | `CONCURRENTLY` | ✅ **EFETIVADO 16:19-16:24Z** (presente 16:18:58Z com idx_scan=0 → ausente de pg_class/pg_indexes ~16:24Z; validado `valtrans-ond2/validacao-transversal.json` item 1a) |
| 🗑️ DROP | `Message_instanceId_idx` | `Message` | `CONCURRENTLY` (redundante) | ✅ confirmado (V6: 23 índices, 5 drops confirmados) |
| 🗑️ DROP | `Chat_instanceId_idx` | `Chat` | `CONCURRENTLY` (redundante) | ✅ confirmado (V6) |
| 🗑️ DROP | `Contact_remoteJid_idx` | `Contact` | `CONCURRENTLY` (redundante) | ✅ confirmado (V6) |
| 🗑️ DROP | `idx_integrationsession_instanceid` | `IntegrationSession` | `CONCURRENTLY` (redundante) | ✅ confirmado (V6) |
| 🗑️ DROP | `MessageUpdate_instanceId_idx` | `MessageUpdate` | `CONCURRENTLY` (coberto pelo novo composto) | ✅ confirmado (V6) |

> **Regra antes de cada DROP:** validar `pg_stat_user_indexes.idx_scan` (nunca dropar índice com scans ativos ou que suporte PK/UNIQUE/FK); após cada CREATE, verificar `pg_index.indisvalid = t`. Revalidar no fechamento: `idx_scan` do UNIQUE segue >0 e nenhum plano usa os índices removidos.

## ⚠️ FLUXO DO WHATSAPP — BLOQUEADO (10/08, colapso ~14:10Z; sessão perdida ~16:11Z)
- Taxa de ingestão **~50x abaixo do baseline** desde ~14:10Z (0,22 msg/min vs 5-14; colapso **ANTECEDE** o deploy T15-T18 15:05Z); webhooks 15:00h=6 vs 5.625 em 13:00h; RabbitMQ sem backlog → fluxo secou **na origem**.
- **16:11:03Z + 16:14:44Z: wpp2 LOGOUT/401 `Connection Failure` (2 eventos; W5 P1 flapping 16:18Z)** — sessão Redis DB8 **DELETADA** (chave `evolution:instance:f7a73e2c-…` ausente 16:21:37Z, dbsize 290→10); restart 16:06Z **não recuperou**; ingestão 0 msgs/10min (última 16:10:25Z); Bad MAC/SessionError sem tendência de queda; W3 alertou em tempo real (16:13:08Z hlen=1 → 16:18:12Z chave ausente).
- **Ação P1: re-parear wpp2 (QR/pairing)** — sem a sessão não há reconexão; após reconexão revalidar frescor <180s, taxa >5 msg/min, ACKs (SERVER_ACK), W3 (hlen>=100/creds>=1000). Não executar janela única (T19/stack 25/ACL fase 2) enquanto o fluxo não estabilizar.

## T19 — senderPn → remoteJidAlt (mapeamento @lid) — ⏳ PENDENTE
> **Estado: PENDENTE — sem PR aberto (10/08 ~16:30Z).** Branch local `fix/hermes-378591-evo-t17b` existe mas **sem commits próprios** (0/0 vs main); `gh pr list` vazio. **Nota: atualizar após consolidação.**

Contexto (validações da onda 2):
- T17 (getPNForLID, PR #1016) está **inefetivo**: 0/11 msgs @lid pós-deploy com `remoteJidAlt` (vs 56% histórico); coluna não existe em `Message`; `catch{}` silencioso engole o erro (sem diagnóstico).
- **`senderPn` É gravado** nas msgs @lid (dado existe — 24 msgs/2h na simulação) → T19 = mapear `senderPn` → `remoteJidAlt`.

Plano (M2, fallback triplo): usar `senderPn` se presente → senão `getPNForLID` → senão nada (nunca quebrar ingestão). Aplicar para recebidas E fromMe. Trocar o `catch{}` silencioso do T17 por `logger.warn` com remoteJid.
- **Deploy: janela única** com stack 25 + ACL fase 2 (1 redeploy) — só quando o fluxo estabilizar.
- Validação pós-deploy: `remoteJidAlt` preenchido em msgs @lid (KPI de cobertura; hoje 0%).

## Stack 25 (evolution) — arquivo stale + janela única planejada
> **Estado: ⏳ PENDENTE.** Runtime já atualizado (rotação 10/08); **arquivo do stack desatualizado** — `update_stack` futuro pode REGREDIR runtime.

| Item | Estado (10/08 ~16:02Z) |
|---|---|
| Runtime (`docker service inspect`) | monta `evolution_db_uri_evolution_app_v2` (alias v2→v1) + `redis_password_v2` (alias v2→v1); `CACHE_REDIS_URI` com `evolution_app` |
| Arquivo do stack (Portainer `/data/compose/25`) | **STALE**: `source: evolution_db_uri_evolution_app_v1` — risco de regressão v2→v1 em `update_stack` |

Ação: sincronizar o arquivo para `source: evolution_db_uri_evolution_app_v2` (manter target v1); validar com `docker stack config --compose-file <novo>` + diff vs Spec atual **antes de QUALQUER update_stack**. Aplicar na **janela única** (com T19 e ACL fase 2). Rollback: `docker service update` com o spec anterior (digest/spec conhecidos).

## ACL Redis — fase 2 (restringir user `default`) — ⏳ PENDENTE
> **Estado: ⏳ PENDENTE (depende da janela única).** Fase 1 concluída: `evolution_app` (`~evolution:*`) e `n8n_app` (`~n8n:* ~bull:*`), ambos `-@admin -@dangerous`; **`default` segue `~* &* +@all`** — necessário enquanto a evolution usar URI sem username.

Plano (M6): **SÓ restringir `default` DEPOIS do stack 25** (CACHE_REDIS_URI com `evolution_app`) — senão quebra a evolution; n8n já migrado para `n8n_app`; realtime → user próprio ou `default` limitado aos DBs 0/2. Rollback: aclfile com `default` restaurado + reload. ⚠️ Manter fluxo **config-based** (`redis_acl_v5`): `ACL SETUSER` em runtime não persiste.
NITs: (a) healthcheck do redis (stack 23) ainda usa `redis-cli -a` — trocar por `REDISCLI_AUTH` (padrão W3 v5); (b) os 3 users compartilham o **mesmo hash SHA-256 de senha** (validação 16:21Z) — na fase 2, rotacionar para **senhas distintas por user**.

## Cenário A — Perda do container postgres
```bash
# 1. validar checksum ANTES de restaurar
sha256sum /opt/backups/evolution-20260810/evolution_pos_fix_20260810.dump   # 60b3f110…
# 2. subir postgres descartável e restaurar (ou restaurar direto no volume em produção)
docker run -d --name pg-restore --network none -e POSTGRES_PASSWORD=testpass \
  postgres:14-alpine@sha256:bc06a4b2c6e50e3a9b7638fe7d3064d4497c89b3ce5e45a0bbc1124af6958adf \
  postgres -c listen_addresses='127.0.0.1'
docker cp /opt/backups/evolution-20260810/evolution_pos_fix_20260810.dump pg-restore:/tmp/evo.dump
docker exec pg-restore pg_restore --no-owner --no-privileges --exit-on-error -U postgres -d postgres /tmp/evo.dump
# 3. validar: 36+ tabelas, Message ~322.9k, duplicatas=0, 57 migrations
# 4. produção: parar evolution → restaurar no volume postgres_data → subir evolution
```
Senha: `PGPASSWORD=$(cat /run/secrets/postgres_superadmin_password_v1)` (nunca em texto no comando/chat).

## Cenário B — Perda do Redis DB 8 (sessão)
```bash
# 1. validar checksum
sha256sum /opt/backups/evolution-20260810/redis_db8_dump.rdb   # 7918c7f3…
# 2. restaurar (RTO medido: 2s)
docker cp /opt/backups/evolution-20260810/redis_db8_dump.rdb <redis-cid>:/data/dump.rdb
docker restart <redis-cid>
# 3. validar com auth:
redis-cli -a "$(cat /run/secrets/redis_password_v1)" --no-auth-warning -n 8 \
  hlen evolution:instance:f7a73e2c-327d-426c-8fa6-6ea7743ace02     # >= 100
redis-cli -a "$(cat /run/secrets/redis_password_v1)" --no-auth-warning -n 8 \
  hstrlen evolution:instance:f7a73e2c-327d-426c-8fa6-6ea7743ace02 creds   # >= 1000
# wpp2 reconecta SEM QR (sessão restaurada)
```
⚠️ O dump.rdb contém TODOS os DBs (0 realtime, 2 n8n, 8 evolution) — restaurar o arquivo inteiro preserva todos.

## Cenário C — Perda do bucket R2 (mídia)
- `Media.fileName` guarda o path no bucket → regenerar URLs assinadas sob demanda (`X-Amz-Expires=604800`).
- Path usa remoteJid com `@lid` (comportamento do fork) — relevante para ferramentas de re-upload.

## Cenário D — Rollback da imagem do fork
```bash
docker service update evolution_evolution \
  --image ghcr.io/adm01-debug/zapp-web-v3/evolution-api-custom@sha256:66bb579a5533dacbbf116893c3c8c10f6909c925269b7245679627ff75d2dafb
```
(imagem atual com patches T8-T14: `6f78bb0db489eebebe3681d81ca63b57a9c1873ce0d444cb894068e064157afc`)

## Pós-restore (sempre)
1. W3 (watchdog da sessão): `OK W3: hlen>=100 creds>=1000`
2. W1 (duplicatas): `OK W1: duplicatas=0`
3. Ingestão: `max(messageTimestamp)` < 3 min
4. `_purge_runs`: próximo ciclo normal (01:22)
5. Mirror: `v_evolution_pipeline_health` sem drift

## Referências
- Relatório de auditoria + plano 50 etapas + relatório de testes: `~/auditorias/evolution-schema-check/`
- Watchdogs: stack `ag6-watchdogs` (232), configs `ag6_wN_vN`
- Sessão/detalhes: `POLITICA-LID-20260810.md`, `GOTCHAS-JSONB-20260810.md` (mesma pasta)
