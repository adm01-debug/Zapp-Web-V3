# Relatório Fase E0 — Contenção (2026-08-01)

## Executado e validado com evidência real

### E1. Bloqueio de `external-db-proxy` no self-hosted ✅
- **Exploit confirmado antes do bloqueio:** `POST /functions/v1/external-db-proxy` sem `Authorization` retornou **62.577 mensagens** de `evolution_messages` (`count: 62577`, `schema: public`), além de `id` de registros reais.
- **Versão deployada era v1.5** (sem `requireUser`); repo main tem v1.10-issuer-fastpath com `requireUser` + allowlist de RPCs (balde B).
- **Ação:** adicionadas 4 rotas `request-termination` (404) no Kong para `external-db-proxy`, `external-db-bridge`, `e2e-fixtures`, `e2e-webhook-fixture` (antes da rota genérica `functions-v1`).
- **Arquivo atualizado no host:** `/root/supabase/docker/volumes/api/kong.yml` (sha256 `d942f205ed5074e7...`), serviço `supabase_kong` reiniciado (`docker service update --force`), converged.
- **Validação pós-deploy (evidência real):**

| Endpoint | Antes | Depois |
|---|---|---|
| `external-db-proxy` POST sem token | **200 + dados** (62.577 msgs) | **404** |
| `external-db-proxy` GET | 200 (v1.5) | **404** |
| `external-db-bridge` POST | 401 (gate próprio) | **404** |
| `e2e-fixtures` POST | 401 (missing-bearer) | **404** |
| `e2e-webhook-fixture` POST | 401 | **404** |
| `health-check` GET | 200 | **200** (baseline OK) |
| `evolution-webhook` POST | — | **401** (rota genérica intacta) |

### E2. Sondagem `external-db-bridge` ✅
- Já respondia 401 sem token (`{"error":"Unauthorized"}`) — gate de aplicação presente, mas função também bloqueada no Kong por defesa em profundidade (família de proxy de dados).

### E3. Bloqueio de fixtures nos dois ambientes ✅ (self-hosted)
- `e2e-fixtures` e `e2e-webhook-fixture` respondiam 401 (`missing-bearer`) no self-hosted — já havia gate de código, mas agora **404 no Kong** (nunca devem ser alcançáveis de fora).
- Ambientes cloud: pendente de confirmação (ver pendências).

### E4. Deletar `migrate-helper` do Lovable Cloud ⚠️ BLOQUEADO (requer acesso ao painel)
- **Exploit confirmado:** função VIVA em `https://uqysyzndkfiwfztbqvsl.supabase.co/functions/v1/migrate-helper`:
  - `GET ?action=ping` com `x-access-key: 7bdebc20c45afa11240dc19bb8680e20c3cb84d9dd6127fe` → `{"ok":true,"project_ref":"https://uqysyzndkfiwfztbqvsl.supabase.co",...}` (200)
  - Código expõe `action=credentials` que retorna `SUPABASE_URL`, `SERVICE_ROLE_KEY` e `DB_URL` — **a chave estática está commitada no repo main** (`supabase/functions/migrate-helper/index.ts` linha 16).
- **Acesso:** não há tool MCP para deletar função no projeto Lovable/cloud. Necessário painel Supabase Cloud (projeto `uqysyzndkfiwfztbqvsl`) → Edge Functions → migrate-helper → Delete. **URGENTE.**

### E5. Rotacionar credenciais do projeto `uqysyzndkfiwfztbqvsl` ⚠️ BLOQUEADO (requer painel)
- `SERVICE_ROLE_KEY`, `ANON_KEY` e senha do Postgres do cloud. Sem tool MCP. Efeito colateral desejado: 127 funções do cloud perdem acesso ao self-hosted.

### E6. Cron `sicoob-outbox-drain` no cloud ✅ (já removido)
- `SELECT jobid, jobname, schedule, active FROM cron.job` → **apenas `purge_query_telemetry_daily` (jobid 1)**. O drain **não existe mais** no cron do cloud.
- Histórico: `cron.job_run_details` mostra jobid 2 com **30.117 execuções** `succeeded` (histórico acumulado — o job foi removido posteriormente).

### E7. Auditoria de logs de invocação do cloud ✅ (parcial)
- Tabelas `supabase_functions.*` não existem no cloud via Lovable MCP (só `cron.job` e `cron.job_run_details`). Invocações de migrate-helper precisam ser auditadas no dashboard (Logs → Edge Functions).

## Artefatos
- Kong atualizado no host: `/root/supabase/docker/volumes/api/kong.yml` (cópia versionada: `docs/edge/kong.yml.e0-bloqueios-2026-08-01`)
- Snapshot das funções: `.hermes/prod-snapshot/prod-functions-20260801.tgz` (438.878 bytes, sha256 `3743de44eef82e3319a80178c463a4995a5a1b441b73d4c22be25c7a34bc16c7`)
- Branch `prod-snapshot` (commit `e31ad4d8`) + diff canônico `docs/edge/drift-2026-08-01.diff` (32.014 linhas, 176 arquivos)

## Pendências críticas (ação manual obrigatória)
1. **Deletar `migrate-helper` no painel do Supabase Cloud** (projeto `uqysyzndkfiwfztbqvsl`) — chave comprometida.
2. **Rotacionar credenciais** do mesmo projeto (E5).
3. Confirmar que as fixtures não existem como rotas públicas no cloud.
