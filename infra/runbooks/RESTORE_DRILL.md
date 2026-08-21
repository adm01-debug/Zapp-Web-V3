# Runbook — Drill de restore de backups (plano-100 etapas 56/57)

> Estado validado **ao vivo em 2026-08-20** (Portainer exec + listagem R2).
> Última revisão: 2026-08-20.

## 1) Fotografia atual dos backups

### supabase-db (Postgres do Supabase self-hosted — o banco do ZAPP)

| Camada | Estado 2026-08-20 | Evidência |
|---|---|---|
| **Dump lógico local** (stack 124 `supabase-backup`, `BACKUP_MODE=local+r2`) | ✅ SAUDÁVEL — dumps de 2026-08-20 03:19 (188 MB) e 17:34 (140 MB), com `.sha256`; 33 cópias locais (19,3 GB) | `ls /backups` no container |
| **Offsite R2** (`backups/supabase-db/daily/`) | 🔴 **QUEBRADO desde 2026-08-10** — marcador `OFFSITE_FAILED_20260810_211518`; último "OK offsite" no log é de 2026-07-12; R2 sem dump completo recente | marcador + `backup_v4.log` + listagem R2 |
| **Config offsite** (`backups/supabase-db/config/`) | ✅ tarballs diários de config chegando ao R2 | listagem R2 |
| **pgbackrest** (stack 270, criado 2026-08-16) | ⚠️ camada nova, **não validada** neste drill | — |
| **Drill de restore** | ✅ **EXECUTADO em 2026-08-17** (`drill-restore-e93-20260817.log`): `pg_restore` completou com **19 erros ignorados** | log no container |

Erros reais registrados no drill E93 (a corrigir para um restore 100% limpo):
1. FK `evolution_whatsapp_status_contact_id_fkey` falha ao reaplicar —
   existe `contact_id` órfão (`409ebe64-…`) sem linha em `evo.evolution_contacts`
   (violação de integridade pré-existente nos dados).
2. `REFRESH MATERIALIZED VIEW zapp.mv_system_status` falha — a MV não existe no
   destino do restore (dependência de ordem/objeto ausente do dump).

### evolution-db (pg14 — stacks 112/84/85)

| Item | Estado |
|---|---|
| Daily → R2 (`backups/evolution-db/daily/`, retenção 14d, GPG) | ✅ dump de **2026-08-20 02:00** presente (81 MB) |
| **Lacunas** na janela de 14 dias | ⚠️ faltam os dias **09, 11, 12, 13 e 16/08** — runs falharam nesses dias (investigar `postgres-backup-daily` logs) |
| Weekly/monthly | presentes (retenções 35d/365d) |
| Snapshots de credenciais (`backups/evolution-creds-snapshot/`) | ✅ a cada 15 min (watchdog `evolution-creds-snapshot`) |

## 2) AÇÃO PRIORITÁRIA (P0) — religar o offsite do supabase-db

O dado local existe e está íntegro; o risco é perder a VPS. Passos:

```bash
# no container supabase-backup_backup (Portainer > console):
cat /backups/OFFSITE_FAILED_20260810_211518          # timestamp da 1ª falha
grep -n -i 'r2\|offsite\|error' /backups/backup_v4.log | tail -30
# testar credencial R2 manualmente (aws cli ou rclone conforme o script backup_v4.sh):
sh /infra/backup/backup_v4.sh --offsite-only --dry-run   # ver flags reais no script
```

Causas prováveis (ordem de verificação) — **a falha começou em 2026-08-10, o
stack 261 `r2-rotation` só existe desde 2026-08-13: a rotação NÃO explica a
falha original, só uma continuação/agravamento a partir de 08-13.** Investigar
os dois períodos separadamente, com logs de cada um:
1. **Período 08-10 → 08-13 (pré-rotação, causa ainda desconhecida)** — checar
   `backup_v4.log` desse intervalo especificamente; credencial R2 rotacionada
   não é hipótese válida aqui.
2. **Período pós-08-13 (rotação como hipótese)** — se a falha persistiu depois
   do stack 261 subir: credencial R2 rotacionada — se rotacionou `r2_backup_*`
   sem atualizar o consumo do stack 124, o upload passa a falhar com 403.
3. Bucket/endpoint alterado.
4. Falha de rede pontual sem retry — o script marca `OFFSITE_FAILED` e não
   reenvia (backfill manual necessário após o conserto).

Após religar: **backfill** dos dumps locais mais recentes para
`backups/supabase-db/daily/`. Só remover o marcador `OFFSITE_FAILED_*` depois
de (a) confirmar que o upload terminou sem erro, (b) conferir o checksum do
objeto no R2 contra o dump local, e (c) validar que o objeto está presente e
legível no bucket. Se qualquer uma dessas checagens falhar, mantenha o
marcador — removê-lo cedo demais esconde o incidente em vez de fechá-lo.

## 3) Procedimento de drill completo (repetir trimestralmente)

1. **Integridade do artefato (sem tocar em banco):**
   ```bash
   # evolution-db (a partir do container postgres-backup-daily):
   . /env.sh; aws s3 cp s3://promo-brindes-backups/backups/evolution-db/daily/<mais-recente>.dump.gpg /tmp/d.gpg --endpoint-url "$S3_ENDPOINT"
   gpg --decrypt --batch --passphrase "$PASSPHRASE" /tmp/d.gpg > /tmp/d.dump
   pg_restore --list /tmp/d.dump | wc -l     # TOC legível = arquivo íntegro
   ```
2. **Restore em banco descartável** (nunca no principal):
   ```bash
   createdb -h <host> -U postgres restore_drill_$(date +%Y%m%d)
   pg_restore -h <host> -U postgres -d restore_drill_... -j 4 --no-owner /tmp/d.dump
   psql -d restore_drill_... -c "select count(*) from evo.evolution_messages_wpp2;"
   dropdb restore_drill_...
   ```
3. **Registrar o resultado** neste arquivo (data, dump usado, nº de erros
   ignorados, contagens de sanidade) — o drill E93 (2026-08-17) é o baseline.
4. Meta: **0 erros ignorados**. Os 2 erros conhecidos acima têm correção própria
   (limpar FK órfã de `evolution_whatsapp_status`; incluir/normalizar
   `mv_system_status` no dump ou pós-restore).

> Nota da sessão 2026-08-20: a re-execução remota do passo 1 via exec não
> concluiu (env do container `postgres-backup-daily` não expõe as credenciais em
> shell de exec — o `/env.sh` exige `POSTGRES_PASSWORD` do entrypoint). O passo 1
> deve ser rodado pelo console do Portainer no container, onde o entrypoint já
> populou o ambiente.

## 4) O que "pronto" significa para backup (critério ESTADO.md)

- Dump local diário ✅ · Offsite diário ✅ (**hoje: NÃO — P0 acima**)
- Drill trimestral com 0 erros ✅ (hoje: 19 erros ignorados — 2 causas conhecidas)
- Lacunas de calendário = alerta (hoje: 5 dias faltando no evolution-db/daily)
