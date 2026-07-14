# Achados Críticos de Segurança — Quarta Rodada de Validação
## Data: 2026-07-11 | Status: Requerem aprovação de Joaquim

---

## DEFAULT PRIVILEGES Inseguros nos Schemas Legados

### PRIORIDADE 1 — `financeiro` (GRAVISSIMO)
```sql
-- DEFAULT PRIVILEGES atuais (descobertos em 2026-07-11):
{anon=arwd/postgres}   -- para TABELAS (arwd = SELECT+INSERT+UPDATE+DELETE)
{anon=X/postgres}      -- para FUNCOES (EXECUTE)
{authenticated=X/postgres, service_role=X/postgres}  -- para FUNCOES
```
**Impacto:** Qualquer nova tabela criada no schema `financeiro` automaticamente
herda permissões `anon=arwd` (SELECT, INSERT, UPDATE, DELETE). Isso significa
que requisições não-autenticadas via PostgREST podem acessar dados financeiros
de tabelas criadas após a configuração deste DEFAULT PRIVILEGES.

**Nota:** A RLS pode mitigar isso se estiver ativa nas novas tabelas. Mas DEFAULT
PRIVILEGES incorretos é um vetor de erro humano significativo.

**Correção (após aprovacão):**
```sql
-- Revogar DEFAULT PRIVILEGES para anon no schema financeiro
ALTER DEFAULT PRIVILEGES IN SCHEMA financeiro
  REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA financeiro
  REVOKE EXECUTE ON FUNCTIONS FROM anon;
```

### PRIORIDADE 2 — `artes`
```sql
{anon=X/postgres}  -- para FUNCOES
{authenticated=arwd/postgres}  -- para TABELAS
```
**Impacto:** Novas funções criadas em `artes` herdam `anon=EXECUTE`.

**Correção (após aprovacão):**
```sql
ALTER DEFAULT PRIVILEGES IN SCHEMA artes
  REVOKE EXECUTE ON FUNCTIONS FROM anon;
```

### PRIORIDADE 3 — `vendas`
```sql
{anon=r/postgres}  -- para TABELAS (r = SELECT)
```
**Impacto:** Novas tabelas em `vendas` herdam `anon=SELECT`.

**Correção (após aprovacão):**
```sql
ALTER DEFAULT PRIVILEGES IN SCHEMA vendas
  REVOKE SELECT ON TABLES FROM anon;
```

---

## Schemas com DEFAULT PRIVILEGES CORRETOS (para referência)

| Schema | Tables | Functions | Seguro? |
|--------|--------|-----------|--------|
| `evo` | `service_role=arwdDxt` | n/a | ✅ |
| `zapp` | `authenticated=arwd, service_role=arwdDxt` | `authenticated=X, service_role=X` | ✅ |
| `public` | `authenticated=arwd, service_role=arwdDxt` | `authenticated=X, service_role=X` | ✅ |
| `financeiro` | **`anon=arwd`** | **`anon=X`** | ❌ RISCO ALTO |
| `artes` | `authenticated=arwd` | **`anon=X`** | ⚠️ RISCO MÉDIO |
| `vendas` | **`anon=r`** | n/a | ⚠️ RISCO MÉDIO |

---

## Gap de Monitoramento em fn_score_security_acl

A função `public.fn_score_security_acl()` verifica apenas o schema `public`.
Os schemas `evo` e `zapp` têm um gap de monitoramento para funções `anon+secdef`.

**Estado atual:** 0 funções `anon+secdef` em evo e zapp (após os REVOKEs de 20260711).
Se uma nova função for criada com esse padrão, não será detectada.

**Correção sugerida:**
Adicionar vetor `v_evo_zapp_anon_secdef` ao `fn_score_security_acl`:
```sql
SELECT count(*) INTO v_evo_zapp_anon_secdef
FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
WHERE n.nspname IN ('evo','zapp')
  AND has_function_privilege('anon', p.oid, 'EXECUTE')
  AND p.prosecdef=true;
-- Incluir no CASE de score: WHEN ... OR v_evo_zapp_anon_secdef>0 THEN 0
```

---

## Outros Achados (menores)

- **3 índices UNUSED_LARGE** em schema evo (5.2MB total): 
  `idx_messages_wpp2_conversation_timeline`, `evolution_webhook_events_v2_2026_07_remote_jid_created_at_idx`,
  `evolution_messages_wpp2_to_tsvector_idx`. Observar 30 dias antes de dropar.

- **v_security_invoker_audit sem SI**: View de auditoria de segurança que acessa
  apenas pg_catalog. `anon_can_select=false`. Risco: zero.

- **583 orphan logs do pg_cron**: deletados em 20260711_round4_cleanup.sql.
