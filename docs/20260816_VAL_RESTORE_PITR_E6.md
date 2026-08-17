# VALIDAÇÃO E6 — Prova de Restore / PITR (Supabase self-hosted)

**Data:** 2026-08-16 | **Modo:** read-only (nada foi restaurado) | **Escopo:** Supabase (`supabase_db`) + comparação com Evolution

---

## 1. Backup pgBackRest configurado?

### Supabase (`supabase_db`) — ❌ NÃO
| Verificação | Resultado |
|---|---|
| Binário `pgbackrest` no container | ❌ `not found` (imagem supabase/postgres:15.8.1 sem pgBackRest) |
| `/etc/pgbackrest.conf` / `/etc/pgbackrest/` | ❌ inexistente |
| `/var/lib/pgbackrest` (repo local) | ❌ inexistente |
| Stanza/backup pgBackRest | ❌ nenhum |
| Serviço de backup real | ✅ `supabase-backup_backup` (postgres:15-alpine) — **pg_dump** custom diário + sha256 + gpg + offsite R2 + sentinel |

**Conclusão: PITR NÃO existe para o Supabase. Backup = pg_dump (RPO ~24h).**

### Evolution (`postgres_postgres`) — ✅ SIM (contexto)
- pgBackRest 2.59.0 ativo, stanza `evolution` status **ok**, WAL archiving contínuo (RPO ~5min, `archive_timeout=300s`).
- Serviço: `evolution-pgbackrest-backup_backup`. Restore **full** testado (RTO 471s); restore **PIT (`--type=time`) ainda em teste** — gap conhecido: creds de archive-push são write-only (restore → Unauthorized); creds de leitura v2 pendentes de consolidação.
- Fonte: `docs/runbook-evolution/DR_RUNBOOK_EVO.md` (atualizado 10/08).

---

## 2. Estado atual do backup Supabase (evidência coletada)

| Item | Valor |
|---|---|
| Último dump | `supabase_selfhosted_20260815_183609.dump` (152 MB, 15/08 18:36) |
| sha256 | ✅ **OK** (`sha256sum -c` no container) |
| Sentinel `ops.backup_sentinel` | `last_backup_at` = `last_offsite_at` = 15/08 15:36-03 → **offsite R2 sincronizado** |
| Guardrail BACKUP-01 | dentro do limite (≥60MB, ≤26h) |
| Restore test prévio | `restore-test.sh` + logs no container; **restore real em 08/08**: 719 tabelas, 632MB, 26 schemas, `auth.users` 19=19, `evo.evolution_contacts` 20713=20713; 17 erros não-fatais conhecidos (pg_cron, 4 views/matviews, 1 FK órfã pré-existente) |

---

## 3. Documentação de restore testado (repo `C:/zapp-web-v3/docs`)

| Doc | Status |
|---|---|
| `BACKUP-RECOVERY-STRATEGY.md` (v1.0, 11/04) | ⚠️ **Desatualizada** — era cloud (projeto `allrjhkpuscmgbsnmjlv`); PITR marcado como "ação necessária" nunca implementada; não menciona pg_dump stack nem pgBackRest |
| `RUNBOOK_DISASTER_RECOVERY.md` | 🔴 **Fictício** — cita `zapp-postgres`, `/opt/zapp/scripts/backup-database.sh`, cron 03:00, dumps `.sql` que **não existem** no runtime real |
| `DR_RUNBOOK.md` | ⚠️ Genérico (RPO 24h), sem procedimento executável para o stack real |
| `audits/history/data-loss-simulation-report.md` (30/07) | ℹ️ Simulação de 7 cenários (identificou WAL retido 446GB e secrets corrompidos) — não é prova de restore |
| `runbook-evolution/DR_RUNBOOK_EVO.md` | ✅ Atualizado — **só Evolution**, não cobre Supabase |
| **Prova de restore do Supabase** | 🔴 **FORA do repo**: `runbook-evolution-artifacts/docs/BACKUP_RESTORE_TEST_RESULT.md` (08/08) — nada em `zapp-web-v3/docs/` documenta restore testado do Supabase self-hosted |

---

## 4. O que FALTA para PROVAR restore (cenário mínimo em staging)

1. **Reexecutar o restore test com o dump atual** (08/08 → dump cresceu 96.8→152MB): container efêmero `postgres:15-alpine` (network none), `pg_restore --clean --if-exists --no-owner --no-privileges --dbname=postgres`, validar (TOC vs tabelas restauradas, `auth.users`, `evo.evolution_contacts`, schemas) e medir RTO.
2. **Provar restore a partir do off-site (R2 `.gpg`)**: baixar → `gpg --decrypt` → `pg_restore`. Hoje só o dump local foi provado — o ciclo R2→restore não tem evidência.
3. **Documentar no repo**: criar `docs/BACKUP_RESTORE_TEST_RESULT_2026-08.md` + procedimento; corrigir/arquivar docs fictícias (`RUNBOOK_DISASTER_RECOVERY.md`, atualizar `BACKUP-RECOVERY-STRATEGY.md` para arquitetura self-hosted real).
4. **Decisão formal de RPO**: sem pgBackRest no Supabase, RPO efetivo = **24h** (dump diário). PITR real (~5min) exige: instalar pgBackRest no `supabase_db` + WAL archiving + creds de **leitura** para restore (replicar padrão já validado na Evolution) — ou aceitar RPO 24h por decisão documentada (CC7 cobre só `_supabase`, não o RPO do dump).
5. **Drill recorrente (opcional)**: agendar restore test mensal + alerta se >30 dias sem prova.

---

## Veredito E6

- **EXISTE:** backup diário pg_dump íntegro (sha256 OK, offsite OK) + um restore test real (08/08) documentado fora do repo.
- **FALTA:** pgBackRest/PITR no Supabase, prova de restore do dump atual, prova de restore via R2, documentação de restore DENTRO do repo e runbooks atualizados para a arquitetura real.
- **Risco atual:** em incidente, restore possível via pg_dump (RPO 24h, RTO ~8-15min estimado) — **não provado com o dump vigente nem pelo caminho off-site**.
