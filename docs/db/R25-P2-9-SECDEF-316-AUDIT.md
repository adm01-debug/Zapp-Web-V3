# R25 P2-9 — Auditoria dos 316 SECURITY DEFINER revogados (PR #668)

> Data: 2026-08-01 ~15:30 UTC · Método: medição ao vivo (pg_proc/pg_policy/pg_trigger/pg_get_viewdef)
> Contexto: PR #668 revogou EXECUTE de `authenticated` em 316 funções (231 `fn_*` internas + 85 sem referência).
> Desfecho: **2 funções eram necessárias dentro de RLS** (corrigidas no P0-1) e agora há rede permanente (RT26/RT27 + vetor ACL `auth_rls_fn_denied`).

## 1. Classificação por contexto de uso (resultado da auditoria)

| Contexto | Funções revogadas que o usam | Status | Ação |
|---|---|---|---|
| **Policies de RLS** (`USING`/`WITH CHECK`) | `zapp.current_user_is_privileged()`, `zapp.is_admin_painel()` | **QUEBRADAS (403 inbox)** | ✅ P0-1: re-GRANT EXECUTE p/ authenticated |
| **Views `security_invoker=true`** expostas em `public` | 0 | OK — nenhuma função de view inexecutável | Monitorar via RT26 (mesma query) |
| **Triggers** (funções `EXECUTE FUNCTION` em triggers de public/zapp/evo) | 45 funções (ex.: `fn_messages_instead_of_insert`, `trg_process_webhook_message`, `fn_auto_assign_contact`, `sync_contact_intelligence`, ...) | **OK por design** — PostgreSQL verifica EXECUTE de função de trigger no `CREATE TRIGGER`, não no fire | Sem ação; documentado |
| **Cron jobs** | comandos `SELECT schema.fn(...)` rodam como `postgres` (dono do cron) | OK | Sem ação |
| **Internas puras** (`fn_*` sem uso externo) | ~271 | OK — correto permanecerem sem EXECUTE | Manter |

## 2. Prova de que triggers não quebram (contexto authenticated)

- Front escreve em `public.messages` via INSTEAD OF trigger `zapp.fn_messages_instead_of_insert` (sem EXECUTE p/ authenticated) e **funciona**: webhook_pipeline 15/15, `msgs_7d=21430`, `audit_1h=125`, `processed_1h=125` (health score 2026-08-01 15:00).
- Leitura do inbox como `authenticated`: **59.127 linhas** (teste P0-1).
- Regra PostgreSQL: privilégio EXECUTE de função de trigger é verificado na criação do trigger (dono do trigger), não por request.

## 3. Rastreabilidade do diff dos 316

- Migration original: `supabase/migrations/20260801050003_triagem_security_definer.sql` (DO blocks dinâmicos — sem lista nominal no arquivo).
- **Gap encontrado**: a migration referencia `infra/stack35/SECDEF_REVOKED_20260801.md` para rollback, mas o arquivo **não existe no repo**. Corrigido nesta auditoria: contagem e classificação ao vivo acima + rede de testes (RT26/RT27).
- Rollback genérico (se necessário reverter pontualmente): `GRANT EXECUTE ON FUNCTION <schema>.<fn>(<args>) TO authenticated;`

## 4. Estado pós-fix (ao vivo 15:30 UTC)

```sql
-- RT26-equivalente: 0 funções de RLS inexecutáveis por authenticated
WITH rls_fns AS (SELECT DISTINCT (m)[1] AS fnname FROM (SELECT regexp_matches(
  COALESCE(pg_get_expr(polqual,polrelid),'')||' '||COALESCE(pg_get_expr(polwithcheck,polrelid),''),
  '([a-z_][a-z0-9_]*)\s*\(', 'g') AS m FROM pg_policy) s)
SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
JOIN rls_fns rf ON rf.fnname=p.proname
WHERE n.nspname IN ('public','zapp','evo')
  AND NOT has_function_privilege('authenticated', p.oid,'EXECUTE');
-- → 0

-- Views security_invoker: 0 funções quebradas
-- Triggers: 45 sem EXECUTE, seguro por design (ver seção 2)
-- Security ACL: 15 vetores = 0, score 5/5 (incl. novo auth_rls_fn_denied)
```

## 5. Ação recomendada pendente (fora do escopo R25)

- **Consolidar caminho de dados do front** (observação P0-2): REST direto via `public.messages` é canônico; `external-db-proxy` fica restrito a `evo.*` fora das views. Reduz superfície dupla de falha.
- Reconciliar `check_schema_drift()` com estado pós-migração (objetos renomeados/removidos) — sem quebras detectadas nesta auditoria.
