# RELATÓRIO DE EXECUÇÃO DA ANÁLISE — `zapp-web-v3`

> Documento vivo. Atualizado bloco a bloco conforme o `PLANO_QA_ANALISE_100.md` é executado.
> Cada etapa fechada gera 0..N achados; achados vão para `PLANO_IMPLEMENTACAO_100.md`.
>
> **Instância:** Chat de análise. Correção é responsabilidade do próximo chat.

---

## Estado geral

| Bloco | Descrição | Status | Achados |
|---|---|---|---|
| 1 | Inventário estrutural e mapeamento (1-10) | ✅ Concluído | 14 (F1-01 a F1-14) |
| 2 | Auditoria do banco (11-20) | ✅ Concluído | 13 (F2-01 a F2-13) |
| 3 | Autenticação e sessão (21-30) | ⏸ Pendente para próximo chat | — |
| 4 | Inbox e mensageria (31-45) | ⏸ Pendente para próximo chat | — |
| 5 | Contatos e CRM (46-55) | ⏸ Pendente para próximo chat | — |
| 6 | Conexões WhatsApp (56-65) | ⏸ Pendente para próximo chat | — |
| 7 | Admin e monitoramento (66-75) | ⏸ Pendente para próximo chat | — |
| 8 | SLA/BPM (76-80) | ⏸ Pendente para próximo chat | — |
| 9 | Resiliência e edge cases (81-90) | ⏸ Pendente para próximo chat | — |
| 10 | Cross-browser / a11y / perf (91-100) | ⏸ Pendente para próximo chat | — |

**Achados até aqui: 27 (14 do Bloco 1 + 13 do Bloco 2).**

---

## Bloco 1 — Inventário estrutural (etapas 1-10)

_(Detalhes já registrados na versão anterior deste documento — mantidos.)_

Resumo: 74+ views lazy-loaded, ~55 rotas totais, 5 pastas de teste convivendo, 8+ arquivos-lixo na raiz, padrão duplo URL vs `?view=X&tab=Y`, script `lint` com `|| true` mascarando falhas.

---

## Bloco 2 — Auditoria do banco (etapas 11-20)

### Etapa 11 — SECDEF chamáveis por `authenticated` — inventário completo

Consulta `pg_proc + aclexplode`:

| Schema | Functions SECDEF+authenticated |
|---|---|
| **zapp** | **119** |
| financeiro | 25 |
| public | 19 |
| artes | 11 |
| vendas | 5 |
| **Total** | **179** |

`public` — 19 detalhadas via `supabase_get_advisors`:
- 6 TRIGGER functions com `EXECUTE` grant incorreto para `authenticated` (`fn_contacts_proxy_*`, `fn_messages_bridge_*`).
- 3 outras TRIGGER functions (`handle_new_user_settings`, `on_role_change`, `trg_fn_set_transfer_ticket`).
- 10 RPCs legítimas mas que exigem revisão de `auth.uid()` interno: `rpc_get_contact` (2 overloads), `rpc_app_bootstrap`, `rpc_dashboard_init`, `generate_transfer_ticket`, `get_companies_by_phones_batch`, `get_contact_intelligence_by_phone`, `increment_webhook_rate_limit`, `is_instance_paused`, `log_rls_denied`.

### Etapa 12 — Views sem `security_invoker=on`

Consulta `pg_class + reloptions`:

- **Views regulares (`relkind='v'`): 0** sem `security_invoker=on` nos 11 schemas de aplicação. ✅ Hardening prévio bem-sucedido.
- Materialized views (`relkind='m'`) sem opção: 6 em `zapp`, 4 em `evo`, 1 em `ops`. **Não é problema** — MVs no PG 15 sempre executam com role do owner; `security_invoker` só se aplica a views regulares.

### Etapa 13 — Cron jobs — duplicatas e overlaps

Consulta `cron.job` (46 jobs filtrados por padrão de nome):

**Duplicatas confirmadas (mesmo propósito, jobids diferentes):**

| Par | Jobids | Schedule |
|---|---|---|
| `cleanup_expired_contact_ids` vs `evo_cleanup_expired_contact_ids` | 190, 189 | ambos `0 2 * * *` |
| `purge-processed-webhook-events` vs `purge_webhook_events_processed` | 54, 152 | 03:30 / 04:30 |
| `purge-webhook-audit-log-90d` vs `purge_webhook_audit` | 209, 61 | 03:45 / 04:15 |
| `cleanup-cron-job-history` vs `cleanup-cron-job-logs` | 99, 216 | 03:00 / 04:00 |

**Overlaps de VACUUM (janela apertada 02:06–02:21):** 6 vacuums diários (`vacuum-alerts-daily`, `vacuum-pipeline-health-log-daily`, `vacuum-instance-credentials-daily`, `vacuum-burnin-tracker-daily`, `vacuum-bootstrap-log-daily`, `vacuum-connection-history-daily`) executando em 15 minutos — risco de I/O saturation.

**Chain de logflare cleanup (03:00–03:45):** 7 jobs consecutivos (`logflare-cloudflare/deno/postgres/gotrue/realtime/storage/postgrest-cleanup`) escalonados de 5 em 5min. OK em teoria mas concentra 45 min de I/O em janela única.

**Alta frequência:** `reprocess_pending_webhooks` (`1-59/2 * * * *` = a cada 2 min), `refresh-health-score-cache` (`*/5`), `vps-matview-auto-refresh` (`*/5`), `redis_sentinel_refresh_5min` (`*/5`), `route-failed-webhooks-to-dlq` (`*/10`), `wal-alert-state-cleanup` (`*/15`).

### Etapa 14 — Top ofensores por consumo total (`pg_stat_statements`)

| # | Query (resumo) | Calls | Avg ms | Total s |
|---|---|---:|---:|---:|
| 1 | PostgREST SchemaCache introspection | 182 | 563 | 103 |
| 2 | `zapp.fn_system_health_score_cached(...)` | 334 | 289 | 97 |
| 3 | `ops.fn_regression_tests()` (rows) | 8 | **8 803** | 70 |
| 4 | `ops.fn_regression_tests()` (agg) | 8 | **8 758** | 70 |
| 5 | `VACUUM ANALYZE evo.evolution_messages` | 14 | 4 480 | 63 |
| 6 | `INSERT INTO financeiro.pagamentos_diarios` | **588 042** | 0,08 | 48 |
| 7 | `INSERT INTO evo.evolution_pipeline_health_log` | 111 | 275 | 30 |
| 8 | PostgREST table_privileges introspection | 112 | 262 | 29 |
| 9 | PostgREST pks_fks introspection | 39 | 652 | 25 |
| 10 | PostgREST functions introspection | 181 | 127 | 23 |
| 11 | PostgREST types introspection | 204 | 113 | 23 |
| 12 | `evo.fn_detect_dedup_cap_failures(...)` | 334 | 62 | 21 |

Observações:
- **PostgREST schema cache** custa >155 s (queries #1, #8, #9, #10, #11 somadas) — cache invalidando muito ou TTL curto.
- **`ops.fn_regression_tests()`** roda 8,8 s por chamada e é chamada 2x consecutivas (linhas + agregado). Deveria estar em CTE ou cacheada; não deveria rodar em janela de produção.
- **`financeiro.pagamentos_diarios`** recebe 588 042 INSERTs unitários — deve virar batch INSERT ou `COPY`.
- **`fn_system_health_score_cached`** roda 289 ms apesar do nome — cache não está funcionando.

### Etapa 15 — Query `pgrst_source` em `zapp.messages`

Consulta filtrada em `pg_stat_statements`: a maior query real de aplicação em `zapp.messages` é o **badge de mensagens não lidas** — `SELECT count(*) AS total_msgs, count(*) FILTER (WHERE is_read=$1 AND direction=$2) FROM zapp.messages` — média 1 399 ms. Full scan em tabela particionada de 62k+ linhas.

### Etapa 16-20 — Marcadas como pendentes

Índice sugerido, EXPLAIN ANALYZE detalhado, catálogo CSV das 179 SECDEF, e análise por-tenant permanecem para o próximo chat.

---

## Achados do Bloco 2 (13 itens registrados em `PLANO_IMPLEMENTACAO_100.md`)

- **F2-01** — Revogar `EXECUTE` de `authenticated` para as 6 TRIGGER functions em `public` (`fn_contacts_proxy_*`, `fn_messages_bridge_*`).
- **F2-02** — Revogar `EXECUTE` de `authenticated` para 3 TRIGGER functions restantes em `public` (`handle_new_user_settings`, `on_role_change`, `trg_fn_set_transfer_ticket`).
- **F2-03** — Revisar 9 RPCs SECDEF em `public` e garantir `auth.uid()` + tenant check no corpo.
- **F2-04** — Auditoria completa: gerar `docs/audits/secdef-zapp.csv` das 119 SECDEF+authenticated em `zapp`.
- **F2-05** — Auditoria similar em `financeiro` (25), `artes` (11), `vendas` (5).
- **F2-06** — Consolidar duplicatas de cron (4 pares identificados) em job único.
- **F2-07** — Escalonar 6 VACUUMs diários em janelas > 5 min entre execuções.
- **F2-08** — Reagrupar chain logflare (7 jobs) em job único com processamento paralelo interno OU distribuir ao longo do dia.
- **F2-09** — Auditar `ops.fn_regression_tests()`: 8,8 s por call em produção. Mover para off-peak ou cachear resultado em MV.
- **F2-10** — Consolidar 588 042 INSERTs unitários em `financeiro.pagamentos_diarios` para batch INSERT ou `COPY FROM`.
- **F2-11** — Investigar `zapp.fn_system_health_score_cached`: 289 ms por chamada apesar do nome — cache não está funcionando.
- **F2-12** — Reduzir invalidações do PostgREST schema cache OU aumentar TTL — 155 s de custo total só de introspection.
- **F2-13** — Criar índice parcial em `zapp.messages` para o badge de unread inbound: `CREATE INDEX CONCURRENTLY idx_msg_unread_inbound ON zapp.messages (direction, is_read) WHERE is_read=false AND direction='inbound';` — reduzir 1,4 s → milissegundos.

---

## Retomada — próximo chat

Onde parar de Bloco 2 e o que executar em seguida:

1. **Bloco 3 — Autenticação e sessão (etapas 21-30):**
   - `src/features/auth/` — inventariar `AuthProvider`, `AuthContext`, `ProtectedRoute`, `useAuth`, `useRole`.
   - `src/integrations/supabase/externalSessionBridge.ts` — histórico documentado de double-login; validar fix.
   - `src/integrations/supabase/cookieStorage.ts` — histórico de bug regressão silenciosa (`token` no nome).
   - `pages/Auth.tsx`, `SSOCallback.tsx`, `TwoFactorAuth.tsx`, `ForgotPassword.tsx`, `ResetPassword.tsx`, `VerifyEmail.tsx`.
   - Simulação de fluxos: login válido, inválido, sessão expirada, refresh token, deep-link enquanto sem sessão.

2. **Bloco 4 — Inbox e mensageria (etapas 31-45):**
   - `src/features/inbox/*` — `RealtimeInboxView`, hooks de realtime, message queue local, retry.
   - `src/features/inbox/hooks/*` — busca, filtros, tab counters.
   - Fluxos: envio de texto/áudio/mídia, marca lida, transferência de conversa, encerramento.

3. **Blocos 5-10 conforme `PLANO_QA_ANALISE_100.md`.**

**Documentos ao final desta sessão:**
- `docs/audits/PLANO_QA_ANALISE_100.md` — roteiro completo (não alterado).
- `docs/audits/PLANO_IMPLEMENTACAO_100.md` — 27 achados catalogados nos Temas 1, 2, 3, 4, 5, 6.
- `docs/audits/RELATORIO_EXECUCAO_ANALISE.md` — este documento.
