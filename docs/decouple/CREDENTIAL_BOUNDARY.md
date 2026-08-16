# CREDENTIAL_BOUNDARY — credenciais que cruzam a fronteira ZAPP × EVOLUTION (E34)

**Data:** 2026-08-16 | **Etapa:** E34 | **Status:** documentação (NENHUMA rotação executada nesta rodada)

## Propriedade operacional

| Secret | Dono (repo que gere/roda) | Usado em | Observação |
|---|---|---|---|
| `supabase_anon_key_v2` | atomica-platform (stack supabase) | stack supabase (ID 35) | plataforma compartilhada |
| `supabase_service_key_v3` | atomica-platform | stack supabase **e** evolution.yml (25) | **cruzamento**: evolution-stack consome — documentado, rotação coordenada |
| `supabase_jwt_secret_v1` | atomica-platform | stack supabase | plataforma |
| `supabase_db_password_v1` | atomica-platform | stack supabase **e** reconcile-ops.yml (226) | **cruzamento** — removido de evolution-watchdogs (240) em 2026-08-16, ver `pg_supa_url_evo_reconciler_v1` |
| `pg_supa_url_evo_reconciler_v1` | zapp-web-v3 | evolution-watchdogs.yml (240), serviço `evo-reconcile` | **cruzamento least-privilege** — URL completa do role `evo_reconciler` (NOBYPASSRLS, sem USAGE em zapp/evo). Substituiu o uso de `postgres` superuser. Bootstrap: ver RUNBOOK_EVO_RECONCILER.md |
| `supabase_webhook_secret_v1` | atomica-platform | evolution-rabbit-consumer.yml (113) | **cruzamento** — HMAC do webhook |
| `logflare_api_key_v2` / `logflare_*` | atomica-platform | stack supabase (analytics) | plataforma |
| `postgrest_conf_*` | atomica-platform | stack supabase (rest) | plataforma |
| `pg_meta_crypto_key_v2` | atomica-platform | stack supabase (studio/meta) | plataforma |
| `evolution_api_key_v6_20260808` | evolution-stack | evolution.yml (25) | provider |
| `evolution_db_uri_evolution_app_v2` | evolution-stack | evolution.yml (25) | banco próprio da Evolution |
| `rabbitmq_url_*` | evolution-stack | evolution.yml + consumer (113) | filas |

## Regras

1. **Rotação coordenada:** qualquer rotação de `supabase_service_key_v3`/`supabase_db_password_v1`/`supabase_webhook_secret_v1` exige atualizar o stack supabase (atomica-platform) E os stacks consumidores do evolution-stack no mesmo janela (precedente: rotação HMAC v3 12/08).
2. **Propriedade documental ≠ propriedade runtime:** o evolution-stack consome secrets da plataforma porque o provider fala com o Supabase — o registro acima é o mapa oficial; o CI dos dois repos não altera secrets.
3. **Nunca versionar** secrets em arquivos (todos `external: true` no Swarm).
4. Alvo futuro (não bloqueante): criar secrets dedicados por consumidor para eliminar compartilhamento (E34 estendida).
5. **Roles de writer externo:** processos que escrevem no banco de fora (containers Swarm, n8n, jobs) NÃO devem usar `postgres`/superuser. Padrão: role dedicado com `NOBYPASSRLS`, sem `USAGE` nos schemas de dados, e acesso exclusivo via função `SECURITY DEFINER` em `ops`. Precedente: `evo_reconciler` (2026-08-16). Esses writers são invisíveis ao `fn_boundary_audit()`/I1 — só o registro documental os cobre.
