# E6 — PLANO pgBackRest no supabase_db (replicando padrão Evolution)

**Data:** 2026-08-16 · **Modo:** read-only (nada aplicado) · **Fonte:** Portainer MCP (docker-cli 939499ae45bf)

## 1. Padrão Evolution extraído (stack 264 + runtime)

| Item | Valor observado |
|---|---|
| Sidecar | `docker:28-cli@sha256:625d…` svc `evolution-pgbackrest-backup_backup`, cmd `sh /opt/pgbackrest-backup.sh`, docker.sock ro, rede AtomicaBRNet, manager node, 0.5cpu/256M |
| Config | swarm config `pgbackrest_script_v1` → `/opt/pgbackrest-backup.sh` (0555). Loop: agenda domingo 05:00 BRT (`BACKUP_TARGET_HHMM_BRT=0500`, `INTERVAL_SECONDS=604800`, `STANZA=evolution`), `docker exec <postgres> su postgres -c "/opt/pgbackrest/pgbackrest.sh --stanza=… backup --type=full"` → `info` → `expire`; alerta P1/P2 p/ n8n warroom |
| No container postgres (fora do stack file!) | volume `pgbackrest_data` → `/opt/pgbackrest`: binário estático pgbackrest 2.59.0 (`bin/pgbackrest` 1.2MB), `lib/`, `ca-bundle.crt`, `pgbackrest.conf`, wrappers `pgbackrest.sh` (lê R2 de `/run/secrets`: `evolution_r2_access_key_v1` → fallback `r2_backup_access_key_v1` → `r2_s3_access_key_v2`) e `archive-push.sh` |
| pgbackrest.conf | repo1-type=s3, bucket `promo-brindes-backups`, endpoint `cd0f4eee…r2.cloudflarestorage.com`, region auto, key-type shared, `repo1-path=/evolution-pgbackrest`, retenção full=7 diff=14, start-fast=y; stanza `[evolution] pg1-path=/var/lib/postgresql/data` |
| PG | `archive_mode=on`, `archive_command='/opt/pgbackrest/archive-push.sh %p'` → WAL contínuo p/ R2 (RPO ~minutos) |

**⚠️ ALERTA (achado E6):** o ciclo automático de **2026-08-16 08:00:15Z FALHOU** — `ERROR [037]: backup command requires option: repo1-s3-key` (exit 37, alerta P1 enviado). Causa: secrets R2 **não estão montadas** no `postgres_postgres` (spec tem só `postgres_superadmin_password_v1`; `/run/secrets` no container confirma). O mount `pgbackrest_data` existe no runtime mas **não está no stack file 20** (drift out-of-band). Último backup válido: **full manual 2026-08-10T15:30Z** (restore validado 471s). Ou seja: o padrão de referência está **quebrado hoje** — o plano deve incluir corrigir esse wiring.

## 2. Estado atual do supabase (verificado)

- Imagem `supabase/postgres:15.8.1.085` **NÃO tem pgbackrest** (sem `/usr/bin/pgbackrest`, sem `/opt/pgbackrest/bin`).
- `archive_mode=on` com archive_command **local**: `cp %p /opt/pg_wal_archive/%f` + `find -mmin +1440 -delete` (janela WAL local 24h; dir 2.9G). DB data: **4.2G**.
- Backup atual = stack 124 `supabase-backup` v4.1: pg_dump custom diário **152MB** → R2 (bucket `promo-brindes-backups`, prefixo `backups/supabase-db/daily`, retenção 14d, passphrase). **Já usa** os secrets `evolution_r2_access_key_v1`/`evolution_r2_secret_key_v1`. `_supabase` (analytics) excluído do dump.
- supabase_db: manager node, `update_config order=stop-first parallelism=1 failure_action=rollback`, mem 10G.

## 3. Mudanças necessárias (NÃO aplicadas — plano)

1. **Volume `supabase_pgbackrest_data`** (manager node): copiar artefatos do `pgbackrest_data` da Evolution (bin/lib/ca-bundle + conf com `repo1-path=/supabase-pgbackrest`, stanza `[supabase] pg1-path=/var/lib/postgresql/data` + wrappers). Binário estático 2.59 é portável p/ imagem 15.8 Debian (validar no restore test).
2. **supabase_db (service update):** montar volume → `/opt/pgbackrest`; montar secrets `evolution_r2_access_key_v1` + `evolution_r2_secret_key_v1`; trocar `archive_command` p/ `archive-push.sh %p` **mantendo o cp local como fallback** (ex.: `cp … && /opt/pgbackrest/archive-push.sh %p` — evita gap se R2 falhar). → task é recriada (stop-first): **downtime curto ~1-3min** na única réplica; rollback automático já configurado.
3. **Novo stack `supabase-pgbackrest-backup`** (clonar stack 264): sidecar `docker:28-cli`, config `supabase_pgbackrest_script_v1`, `STANZA=supabase`, filtro container `supabase_db`, alvo **domingo 04:00 BRT** (full semanal), `INTERVAL_SECONDS=604800`, retenção full=7/diff=14, webhook warroom. RPO alvo: **~10min** via WAL (archive_timeout=600 já ativo). R2 extra: ~1-1.5G/full comprimido ×7 + diffs ≈ **10-15GB** (vs ~2GB de dumps hoje; custo <US$0.5/mês). Mantém pg_dump diário como 2ª camada (dump lógico p/ restore seletivo).

## 4. Teste de restore mínimo (design)

1. Pré-captura (prod, read-only): contagens top-10 tabelas (auth.users, storage.objects, evo.*, public.*) + nº de databases + nº tabelas (guard ≥400, igual ao backup).
2. `docker volume create sb_pgbr_restore_test` (manager node).
3. Restore full offline p/ volume descartável: `docker run --rm -v sb_pgbr_restore_test:/var/lib/postgresql/data -v supabase_pgbackrest_data:/opt/pgbackrest <img> su postgres -c "/opt/pgbackrest/pgbackrest.sh --stanza=supabase --pg1-path=/var/lib/postgresql/data restore --type=full"` (est. **15-30min** p/ 4.2G).
4. Subir PG temporário: `docker run -d --name sb-restore-test -p 127.0.0.1:55432:5432 -v sb_pgbr_restore_test:/var/lib/postgresql/data supabase/postgres:15.8.1.085`; aguardar healthy.
5. Conferir: contagens batem com pré-captura? tabelas ≥400? `_supabase` presente (bônus vs dump)? `SELECT count(*)` nas 10 tabelas-chave.
6. Teardown: `docker rm -f sb-restore-test && docker volume rm sb_pgbr_restore_test`.

## 5. Esforço/risco vs aceitar RPO 24h

| | Instalar pgBackRest | Aceitar RPO 24h |
|---|---|---|
| Esforço | **~4-6h** (artefatos 1-2h + wiring 1h + sidecar 1h + restore test 1-2h) + janela curta | 0 |
| RPO | ~10min (WAL) | 24h (pg_dump) |
| RTO | ~15-30min (restore 4.2G) | minutos (152MB) + risco de `_supabase` ausente |
| Riscos | (a) downtime 1-3min no service update (única réplica); (b) archive_command novo pode falhar → manter cp local como fallback; (c) 1º full lê 4.2G em horário off-peak; (d) drift do padrão evo (wiring) precisa ser corrigido junto, senão replica-se padrão quebrado | perda de até 24h de dados produtivos (zapp-web/evo) em desastre; dump não cobre `_supabase`; zero mitigação p/ corrupção silenciosa |

**Recomendação:** instalar (RPO 10min por ~4-6h de esforço), incluindo o fix do wiring R2 da Evolution (montar os 2 secrets no `postgres_postgres`) como passo 0 — sem isso o "padrão validado" não produz backups hoje. Decisão final: dono.
