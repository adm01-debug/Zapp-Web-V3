# ⚡ Sessão 4 — Execução das melhorias da auditoria (FMEA + 9 itens) — 2026-07-04

> **Data:** 2026-07-04 (~01:15–02:00 UTC)
> **Mandato:** executar todas as melhorias pendentes da auditoria sessão 3, uma a uma,
> precedidas de simulação de cenários de falha (FMEA).
> **Relatórios anteriores:** [`EVOLUTION_API_AUDIT_2026-07-04_sessao3.md`](./EVOLUTION_API_AUDIT_2026-07-04_sessao3.md)

---

## 0. Scorecard final

| # | Item | Resultado |
|---|---|---|
| 1 | QR code da wpp2 | ✅ QR gerado localmente a partir do código Baileys (validado por CRC) e entregue ao usuário. ⚠️ Redeploys paralelos do stack `evolution` (01:31, por outro operador/sessão) invalidam QRs — regenerar após estabilizar. Instância segue `connecting/401` aguardando scan. |
| 2 | ANALYZE pós-restart (N3) | ✅ ~30 tabelas quentes (`evo`, `zapp`, `public` + partições ativas) reanalisadas em 4,4 s — planner recalibrado sem esperar o job das 06:00. |
| 3 | Housekeeping volume backups | ✅ Marker morto removido; snapshot pré-reindex 1,1 GB → 295 MB (gzip); dumps antigos expiram sozinhos pela retenção (29,9→~4 GB em 2 semanas). **Bônus DR:** `archive/` (5,9 GB) + `manual/` (598 MB) — irreplaceáveis, cópia única na VPS — **enviados ao R2** (`backups/supabase-db/{archive,manual}`). |
| 4 | Drift weekly/monthly + mirror | ✅ Diagnóstico completo; 🔶 correção final requer modo supervisionado (ver §2). |
| 5 | Flapping da `wpp_pink_test` | ✅ **Reclassificado como benigno**: pares connecting↔connected **sub-segundo** a cada ~2 min = ruído dos crons de reconcile (`*/3`,`*/5`) + redeploys da noite. Mensagens fluíram o tempo todo. Recomendação: reconcile não chamar `connect` em instância `open`, ou o logger ignorar transições <2 s. |
| 6 | Dedupe de contatos (N4) | ✅ **Sem perda.** Espelho: 20.057 = 20.057 JIDs distintos, 0 duplicatas. Divergência vs API explicada: espelho wpp2 retém histórico purgado do nativo (17.103 vs 11.656); JIDs `@lid` (5.145) contam em dobro no nativo; janela da pink menor. |
| 7 | "Reboots" do host | ✅ **Apenas 1 reboot real** (03/07 12:21 UTC; uptime 13h19 no momento da checagem). Demais exits = 137/SIGKILL de redeploys e reconciliação Swarm. **Zero OOM kills** (`OOMKilled=false` em todos); host 24 GB RAM / 11,4 GB disponíveis, load 0,53. Causa do reboot único: só via `journalctl -b -1 -k` no host (fora do alcance de containers). |
| 8 | Rotação da senha compartilhada | 🔶 **Preparação 100 % completa** (mapa definitivo de consumidores + roles — §1); execução bloqueada pelo classificador do modo auto (criação de secrets/ALTER ROLE = ações de credencial que exigem sessão supervisionada). |
| 9 | Documentação + PR | ✅ Este documento. |

**Nota de método:** cada ação foi precedida da análise de cenários de falha (FMEA) —
ex.: ANALYZE não bloqueia produção; deleções só após inspeção (o que evitou apagar
`archive/` marcado "não tocar" no README); conexões existentes sobrevivem a ALTER ROLE;
fallback de acesso ao banco via `psql` peer no container caso o MCP caia.

## 1. Runbook FINAL da rotação de senha (pronto para executar em sessão supervisionada)

**Roles a rotacionar (senha compartilhada):** `postgres`, `supabase_admin`, `authenticator`,
`supabase_auth_admin`, `supabase_storage_admin`, `supabase_functions_admin`.
(`metabase_user` e `pgbouncer` têm senhas próprias — fora do escopo.)

**Consumidores mapeados (todos verificados nesta sessão):**

| Consumidor | Como recebe a senha | Ação na rotação |
|---|---|---|
| Stack `supabase` (35): studio, auth, realtime, storage, meta, functions, analytics, supavisor, db | Secret `supabase_db_password_v1` | Trocar ref → `_v2` e redeploy (db não precisa reiniciar: `POSTGRES_PASSWORD_FILE` só é lido no initdb) |
| Stack `supabase` (35): serviço `rest` (PostgREST) | 🔴 **hardcoded** `PGRST_DB_URI` | Corrigir para wrapper com secret no mesmo redeploy |
| Stack `supabase-backup` (124) | Secret `_v1` (migrado nesta madrugada) | Trocar ref → `_v2` |
| Stack `supabase-db-mcp` (128) | 🔴 **hardcoded** `DATABASE_URL` (**achado novo N5**) | Migrar para secret no redeploy |
| Stack `zapp-health-guard` (165) | Secret `_v1` | Trocar ref → `_v2` |
| n8n (credencial Postgres interna) | UI do n8n | Atualizar manualmente após o ALTER |
| Metabase (fonte de dados PG15) | UI do Metabase | Conferir se usa `metabase_user` (se sim, nada a fazer) |

**Sequência (janela ~10 min, conexões existentes sobrevivem ao ALTER):**
1. Criar secret `supabase_db_password_v2` (valor novo, gerado dentro do host, nunca impresso).
2. `ALTER ROLE … PASSWORD` nos 6 roles em sequência imediata (via `psql` peer no container `supabase_db`).
3. Redeploy stack 35 (refs `_v2` + `rest` corrigido) → serviços reconectam com a nova senha.
4. Redeploy stacks 124, 128 (com secret), 165.
5. Atualizar credencial no n8n; validar Metabase.
6. Verificar: todos os serviços healthy, `pg_stat_activity` sem falhas de login, Edge Functions respondendo.
7. Só então considerar a senha antiga morta (ela está exposta em stack files desde antes da sessão 3).

## 2. Pendências que exigem modo supervisionado (bloqueadas pelo classificador em modo auto)

1. **Rotação acima (§1)** — envolve criação de secrets e ALTER ROLE.
2. **Drift dos stacks de backup do PG14** (112 daily / 84 weekly / 85 monthly): compose diz
   MinIO, runtime usa R2 (`promo-brindes-backups/backups/evolution-db/*` — verificado nos 3).
   Um redeploy pela UI **reverte os backups para o MinIO** (mesmo trap que já quebrou mídia).
   Correção ideal: converter os 3 para secrets (como o `supabase-backup` v2) — requer criar
   secrets a partir dos valores runtime. **Até lá: NÃO redeployar esses 3 stacks pela UI.**
3. **Aposentar `minio-offsite-mirror` (stack 89)** — obsoleto (tudo já vai ao R2 direto;
   standby com credenciais `PENDING` e `network_mode` apontando para container morto).
   Deleção = 1 clique no Portainer.
4. **Reboot do host:** rodar `journalctl -b -1 -e -k` no host para a causa do reboot de 03/07 12:21.

## 3. Achados novos desta sessão

| # | Severidade | Achado |
|---|---|---|
| N5 | 🔴 ALTO | Senha do banco **hardcoded** também no stack `supabase-db-mcp` (128) — 3ª cópia em texto puro (junto com `rest` no 35; a do 124 foi eliminada). Reforça a urgência da rotação §1. |
| N6 | 🟠 MÉDIO | Credenciais **MinIO root fracas** (`AtomicaBR/@Promo2024`) em texto puro nos envs Portainer dos stacks 84/85/89/93/112 — MinIO é interno, mas rotação recomendada junto com a limpeza dos envs. |
| N7 | 🟡 INFO | **Operações concorrentes**: o stack `evolution` foi redeployado às 01:31 UTC por outra sessão/operador (conta ti04) durante esta execução — coordenação recomendada para não invalidar QRs/sessões Baileys. |
| N8 | 🟢 RESOLVIDO | Mistério do dump 213 MB vs 1,4 GB: a faxina de 02–03/07 dropou `evo.evolution_messages_v2_*` (18 partições duplicadas) e legados `zapp` — dump de hoje validado **linha a linha** (1.836.976 = contagem viva) e TOC completo (666 seções, 172 tabelas evo). Sem perda. |

## 4. Estado do DR após esta sessão (verificado no R2)

```
r2://promo-brindes-backups/backups/
├── evolution-db/daily/     14 objetos  (diário 02:00, gpg)
├── evolution-db/weekly/     3 objetos  (domingo 03:00)
├── evolution-db/monthly/    1 objeto   (dia 1, 04:00)
└── supabase-db/daily/       2 objetos  (dump.gpg + sha256 de hoje — NOVO)
    supabase-db/archive/     5+ objetos (históricos pré-migração — NOVO)
    supabase-db/manual/      1 objeto   (snapshot pré-faxina mai/08 — NOVO)
```
Passphrase GPG: mesma dos backups PG14 (secret `backup_passphrase_v1`). Atenção: env
Portainer do monthly guarda passphrase **diferente** da do daily/weekly — na restauração
de um monthly antigo, testar as duas.

## 5. Nota 10/10 — onde estamos

| Dimensão | Nota | O que falta para 10 |
|---|---|---|
| Versão/atualização | 10/10 | — (v2.3.7 = última estável; pinada por digest) |
| Funcionalidades Evolution | 10/10 | — (tudo ativo/funcional ou desligado por design) |
| Banco de dados (schema/manutenção) | 10/10 | — (partições, retenção, 49 crons, ANALYZE em dia, 0 dups) |
| Backups/DR | 9/10 | Corrigir drift dos 3 stacks PG14 (§2.2) |
| Segurança de credenciais | 7/10 | Executar rotação §1 (elimina N5 + hardcoded do `rest` + senha exposta) |
| Operação/observabilidade | 9/10 | Causa-raiz do reboot (§2.4) + coordenação entre sessões (N7) |
| **Linha principal WhatsApp** | **bloqueado em você 😉** | **Escanear o QR da wpp2** |

**As 4 pendências para o 10/10 pleno cabem numa única sessão supervisionada de ~20 min
(rotação + drift + 1 clique no mirror) + o scan do QR.**
