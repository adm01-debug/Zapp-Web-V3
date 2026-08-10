# 🛡️ Runbook de Disaster Recovery — Evolution API (banco evolution + sessão WhatsApp)

**Atualizado:** 2026-08-10 12:50 (pós-correções — checksums do estado pos-fix)
**Escopo:** banco `evolution` (PG14 nativo da VPS — stack `postgres`/20), stack `evolution` (25, imagem `evolution-api-custom@6f78bb0d`), Redis DB 8 (sessão Baileys), R2 (mídia)

> **Este é o runbook da EVOLUTION.** O `docs/DR_RUNBOOK.md` cobre o Supabase/zapp (ambiente separado).

## ⚠️ LOCALIZAÇÃO DA SESSÃO (crítico)
A sessão do WhatsApp **NÃO** está na tabela `Session` (0 linhas) — está no **Redis DB 8**, hash `evolution:instance:f7a73e2c-327d-426c-8fa6-6ea7743ace02` (creds + pre-keys + app-state-sync). **Backup do Redis = backup da sessão.** O Redis exige auth (ACL — `redis_password_v1`; `evolution_app` com `~evolution:*`).

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

## RPO / RTO (medidos em 10/08)
- **RPO:** 24h nominal (gap domingo documentado acima)
- **RTO:** PG **21s** (restore testado) · Redis **2s** (restore testado) · rollback de imagem: 1 comando

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
