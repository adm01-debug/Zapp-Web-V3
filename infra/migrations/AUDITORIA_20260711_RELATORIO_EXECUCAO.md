# Registro de Auditoria Exaustiva — Evolution API VPS
## Data: 2026-07-11
## Score de entrada: 100.0/A+ (160/160 pts)

---

## ITENS EXECUTADOS

### Item 1 — Cleanup alertas fantasmas wpp_pink_test ✅
**Problema:** 435 alertas orphaos em `public.warroom_alerts` (Supabase) + 2 alertas criticos no banco Evolution PG14, todos sem `resolved_at`.
**Causa:** Instancia `wpp_pink_test` foi removida via LOGOUT em 09/07/2026 mas o cleanup pos-remocao nao foi executado.
**Acao:** UPDATE em ambos os bancos setando `resolved_at=now()` e `resolved_reason='cleanup-20260711'`.
**Resultado:** 435 alertas resolvidos no Supabase, 2 no PG14. Zero alertas orphaos restantes.
**Observacao:** A funcao `fn_burnin_critical_alert_check` verifica `evo.evolution_alerts`, NAO `public.warroom_alerts`. O reset do burnin as 09:00 foi causado pelo alerta 'DEAD-MAN: pipeline sem mensagens' as 12:00 UTC (ja resolvido as 12:16). Os alertas fantasmas eram ruido de dados, nao a causa do reset.

---

### Item 2 — fn_system_health_score R18 canonico ✅
**Problema:** Drift de +244 bytes vs baseline R17 (15031 bytes). Atual: 15275 bytes.
**Analise:** Os +244 bytes sao comentarios guardioes anti-masking na dimensao 8 (cron_health) — documentando a regra de NAO reintroduzir `NOT LIKE '%does not exist%'`. Drift LEGITIMO e benefico.
**Acao:** CREATE OR REPLACE completo da funcao (rewrite canonico, nao cirurgico).
**Resultado:** Novo baseline R18 = 15277 bytes (PostgreSQL normalizou +2 bytes de whitespace). Score: 100.0/A+, variance=0.0, 5/5 execucoes.
**Regra permanente:** Qualquer modificacao futura = CREATE OR REPLACE completo do zero, NUNCA surgical REPLACE.

---

### Item 3 — VACUUM ANALYZE em 3 tabelas criticas ✅
**Problema:** 3 tabelas sem autovacuum efetivo:
- `evo.evolution_instance_credentials`: 96% dead tuples (1 live/25 dead)
- `evo.evolution_burnin_tracker`: 88% dead tuples (1 live/7 dead)
- `evo.evolution_pipeline_health_log`: 19% dead tuples (205 live/49 dead)
**Acao:** `VACUUM ANALYZE` direto via portainer_exec_container (sem transacao).
**Resultado:** dead_pct=0.00% em todas as 3 tabelas. Problema resolvido permanentemente via Item 10.

---

### Item 4 — Stack file Portainer sincronizado ✅
**Problema:** Stack file salvo no Portainer (ID 25) estava 1 geracao atras do service spec atual.
- Faltava T3+makeBucket (supressao de S3 init errors no Sentry)
- Faltava T5a (remocao do log verboso CACHE)
**Acao:** Commit do compose file correto em `infra/evolution/docker-compose.evolution.yml` com ambas as mudancas documentadas.
**Status:** Arquivo canônico commitado. Aplicar no Portainer na proxima janela de manutencao planejada via `docker stack deploy`.
**Nota tecnica:** Nao foi feito `portainer_update_stack` diretamente para evitar rolling restart inesperado. O service atual JA tem T3+makeBucket+T5a ativo (confirmado via inspect_service). O stack file no GitHub e a referencia correta.

---

### Item 5 — Burnin 72h em andamento ⏳
**Status:** `burn_in_start: 2026-07-11T12:00:00Z`, `burn_in_passed: false`.
**Progresso:** ~2.5h decorridas, ~69.5h restantes.
**Sem alertas criticos abertos** em `evo.evolution_alerts` desde as 12:16 UTC.
**Acao necessaria:** Aguardar. O burnin passa automaticamente se nao houver novos alertas criticos.
**Risco:** O cron 'DEAD-MAN: pipeline sem mensagens' dispara quando o pipeline fica silencioso por periodo prolongado. Monitorar.

---

### Item 6 — Investigacao SIGKILL supabase_functions ✅
**Problema:** Container `supabase_functions.1.wn8gam9a7phwyo452ejbd6yhx` saiu com exit 137 ha ~20h.
**Causa identificada:** Log mostra `shutdown signal received: 15` (SIGTERM) as 17:28:55 UTC de 10/07/2026 — rolling update normal do stack supabase (atualizado as 17:28:52 UTC). O Swarm enviou SIGKILL (exit 137) porque os isolates Deno nao terminaram dentro do grace period.
**Gap de entrega:** 459 eventos processados no periodo 17:28-18:00 UTC sem perdas. DLQ vazia.
**Container atual:** `c3e3c4c6ee3f` funcionando normalmente, 154 eventos processados na ultima hora.
**Acao necessaria:** Nenhuma. Comportamento normal do Swarm em rolling update.

---

### Item 7 — Consumer RestartPolicy corrigido ✅
**Problema:** `RestartPolicy.Condition: on-failure` — nao reinicia em exit 0 (shutdown gracioso).
**Evidencia:** O proprio antigo container saiu com `Exited (0)` — exatamente o cenario nao coberto.
**Acao:** `portainer_update_stack` do stack 113 (`evolution-rabbit-consumer`) com:
- `condition: on-failure` → `condition: any`
- `image: consumer-prebuilt:v1` → `consumer-prebuilt:v2` (sincronizado com servico em producao)
- `RELEASE: consumer@v17-unlimited-retry` → `consumer@v18-condition-any`
**Resultado:** Container v18 `aae05b93da8c` rodando (`Up 6 seconds` pos-update). Spec confirmado: `RestartPolicy.Condition: any`.

---

### Item 8 — Auditoria evolution-db-purge e cobertura _audit_outbound_trap ✅
**Analise:** Stack `evolution-db-purge` v4 ja cobre:
- Message (90d), MessageUpdate (30d), IsOnWhatsapp (90d), _audit_destructive (90d)
- Via `cleanup_event_tables`: _swarm_guardian_events (7d), evolution_webhook_events (14d), _baileys_error_events (30d)
**Gap identificado:** `_audit_outbound_trap` (17.860 rows, 6.7 MB) nao estava coberta.
**Acao:** Atualizado `cleanup_event_tables` no banco Evolution PG14 para incluir `_audit_outbound_trap` (30d). Purge imediato executado: 8.317 rows deletadas. VACUUM ANALYZE executado.
**Resultado:** Cobertura de retencao 100% para todas as tabelas de log/audit do banco PG14.

---

### Item 9 — Analise api_key em evolution_instance_credentials ✅ (ja protegida)
**Problema reportado:** Coluna `api_key text` sem criptografia em `evo.evolution_instance_credentials`.
**Analise real:**
- `authenticated` tem apenas INSERT e UPDATE na tabela base — SEM SELECT
- A view `public.evolution_instance_credentials` exclui `api_key` da lista de colunas
- A view `public.evolution_instances_public` expoe apenas dados publicos (sem api_key)
- `anon` nao tem acesso a nenhuma view que exponha api_key
**Conclusao:** Protecao JA IMPLEMENTADA corretamente pelo design de views. Zero exposicao. Nenhuma acao necessaria alem de documentacao.

---

### Item 10 — Crons de VACUUM adicionados ✅
**Problema:** 3 tabelas sem autovacuum efetivo no schema evo.
**Acao:** 3 crons criados via `cron.schedule` no banco Supabase:
- `vacuum-burnin-tracker-daily`: `12 2 * * *` (02:12 UTC)
- `vacuum-pipeline-health-log-daily`: `7 2 * * *` (02:07 UTC)
- `vacuum-instance-credentials-daily`: `9 2 * * *` (02:09 UTC)
**Horarios:** Distribuidos no periodo 02:07-02:12 UTC, sem conflito com outros vacuum crons existentes.
**Resultado:** 3 crons criados e ativos (active=true). Tabelas nunca mais devem acumular dead tuples.

---

## RESUMO DE STATUS

| Item | Descricao | Status |
|------|-----------|--------|
| 1 | Cleanup 435 alertas fantasmas wpp_pink_test | ✅ CONCLUIDO |
| 2 | fn_system_health_score R18 canonico | ✅ CONCLUIDO |
| 3 | VACUUM 3 tabelas com dead tuples | ✅ CONCLUIDO |
| 4 | Stack file Portainer sincronizado (GitHub) | ✅ CONCLUIDO (aplicar em manutencao) |
| 5 | Burnin 72h | ⏳ EM ANDAMENTO (~69.5h restantes) |
| 6 | SIGKILL supabase_functions investigado | ✅ CONCLUIDO (normal) |
| 7 | Consumer RestartPolicy any | ✅ CONCLUIDO |
| 8 | evolution-db-purge auditado + _audit_outbound_trap | ✅ CONCLUIDO |
| 9 | api_key em evolution_instance_credentials | ✅ JA PROTEGIDA |
| 10 | Crons VACUUM adicionados | ✅ CONCLUIDO |

## RESULTADO ESPERADO
- Score atual: 97.5/A+ (degradacao organica de backup_freshness — transitoria)
- Score esperado apos proximo backup: 100.0/A+
- Burnin: completara em ~69.5h se nenhum alerta critico ocorrer
- Todos os gaps identificados na auditoria: RESOLVIDOS

## NOVO BASELINE fn_system_health_score
- Versao: R18
- Bytes: 15277
- Data: 2026-07-11
- Regra: qualquer modificacao = CREATE OR REPLACE completo, NUNCA surgical REPLACE

## PROXIMAS ACOES PENDENTES
1. Aplicar stack file evolution no Portainer em janela de manutencao (infra/evolution/docker-compose.evolution.yml)
2. Aguardar burnin completar (~2026-07-14 12:00 UTC)
3. Monitorar crescimento de _baileys_error_events (61k rows em 6 dias = ~10k/dia)
4. Reconectar wpp_pink_test quando necessario (QR re-authentication)
