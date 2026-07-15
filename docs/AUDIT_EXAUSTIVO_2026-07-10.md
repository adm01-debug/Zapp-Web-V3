> **📜 DOCUMENTO HISTÓRICO** — Reflete o estado do sistema na data indicada. A arquitetura atual usa um único Supabase Self-Hosted com schema `zapp`. Veja [SCHEMA_REFERENCE.md](docs/SCHEMA_REFERENCE.md).

# Relatório de Auditoria Exaustiva — 2026-07-10

## Escopo
Teste exaustivo de todas as correções e melhorias implementadas nas sessões anteriores.  
Baterias T1–T11b + VERIFY executadas via `public._audit_sim_results` (tabela permanente, persistente entre sessões).

---

## Resultados Globais

| Status         | Qtd | Notas |
|----------------|-----|-------|
| PASS           |  97 | Inclui 12/12 do VERIFY pós-fix |
| GAP            |  12 | Itens encontrados durante testes |
| FAIL           |  13 | Maioria erros de metodologia de teste (schema errado, coluna errada) |
| CRITICAL       |   4 | 2 falsos-positivos (público.gmail_accounts é view security_invoker) |
| CONFIRMED_BUG  |   2 | service_role bloqueado — bugs confirmados e CORRIGIDOS |
| ERROR          |   5 | Erros de teste (constraint violada por dados residuais) |
| CONFIRMED_GAP  |   1 | is_admin_or_supervisor(NULL)=false — inerente ao design |
| ANOMALY        |   2 | Testes com v_pre_role=NULL por coluna profiles.id≠user_id |
| INFO / NOTE    |  13 | Informativos |

---

## Bugs Confirmados e Corrigidos

### BUG-1 (CRITICAL): `prevent_role_escalation` bloqueava `service_role`
**Evidência:** T8c.1, T8c.5 — `CONFIRMED_BUG`  
**Causa:** `prevent_role_escalation()` chama `is_admin_or_supervisor(auth.uid())`. Service_role JWT não tem claim `sub` → `auth.uid()=NULL` → `is_admin_or_supervisor(NULL)=FALSE` → trigger reverte silenciosamente `role`, `access_level` e `permissions`.  
**Impacto:** Todo UPDATE de role/access_level via SDK backend (service_role) era silenciosamente descartado.  
**Fix:** Adicionado bypass no início da função:
```sql
IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
  RETURN NEW;
END IF;
```
**Verificação:** V2 PASS — `service_role` agora consegue mudar `profiles.role`; V3 PASS — não-admin continua bloqueado.

---

### BUG-2 (SECURITY): `email_app.gmail_accounts` — `service_full_access` com `qual=true`
**Evidência:** Análise direta via `pg_policies`  
**Causa:** Política `service_full_access` com `USING=true` se aplica a TODOS os roles autenticados, não só ao service_role. Qualquer usuário `authenticated` podia ver TODAS as contas Gmail (incluindo `access_token_encrypted`, `refresh_token_encrypted`).  
**Fix:** Política substituída por:
```sql
USING (current_setting('request.jwt.claim.role', true) = 'service_role')
```
Adicionadas 3 políticas específicas para `authenticated`: INSERT, UPDATE, DELETE restritas a `user_id = auth.uid()`.  
**Verificação:** V4 PASS, V5 PASS (5 políticas).

---

### BUG-3 (SECURITY): `saved_filters` — `auth_full_access` com `USING=true`
**Evidência:** T10.2, T11b.5 — `GAP`  
**Causa:** Política `auth_full_access` com `USING=true` e `WITH_CHECK=true` permitia que qualquer usuário autenticado visse e modificasse TODOS os filtros salvos. Coluna `user_id` existia mas não era usada na policy.  
**Design:** `is_shared=true` permite leitura por outros usuários (filtros compartilhados do workspace).  
**Fix:** Substituída por 4 políticas:
- SELECT: `user_id = auth.uid() OR is_shared = true`
- INSERT: `user_id = auth.uid()`
- UPDATE: `user_id = auth.uid()`
- DELETE: `user_id = auth.uid()`  
**Verificação:** V6 PASS (antiga removida), V7 PASS (novas com auth.uid()).

---

### GAP-1: `zapp.agent_stats` — 17 profiles sem linha de stats
**Evidência:** T11b.1 — `GAP`: "Profiles (17) without zapp.agent_stats: 17"  
**Causa:** Trigger `init_agent_stats` dispara apenas em INSERT INTO profiles (novos usuários). Profiles criados antes do trigger não tinham linha correspondente.  
**Fix:** `INSERT INTO zapp.agent_stats (profile_id) SELECT id FROM public.profiles ON CONFLICT DO NOTHING`  
**Resultado:** 17 linhas inseridas.  
**Verificação:** V8 PASS — "Profiles without agent_stats: 0".

---

### GAP-2: Índice UNIQUE duplicado em `zapp.agent_stats(profile_id)`
**Evidência:** T11b.2 — `GAP`: "2 UNIQUE indexes: idx_agent_stats_profile, agent_stats_profile_id_key"  
**Causa:** `agent_stats_profile_id_key` é UNIQUE CONSTRAINT (oficial); `idx_agent_stats_profile` é índice UNIQUE standalone redundante.  
**Fix:** `DROP INDEX zapp.idx_agent_stats_profile`  
**Verificação:** V9 PASS (índice removido), V10 PASS (constraint intacta), V11 PASS (`ON CONFLICT(profile_id)` continua funcionando).

---

## Gaps Documentados (sem correção de DDL)

### GAP-A: Double audit em `user_roles`
**Evidência:** T7b.3 — "3 role_updated entries created by single UPDATE"  
**Causa:** Dois triggers na mesma tabela: `audit_user_role_changes` (escreve `action='role_updated'`) + `tr_log_role_changes` via `on_role_change` (escreve `action='permission_change'`). Ambos em `public.audit_logs`.  
**Risco:** Double-logging (2 rows por evento), não perda de dados. Aceito como risco baixo.  
**Recomendação:** Avaliar se `on_role_change`/`tr_log_role_changes` pode ser removido em sprint futuro.

### GAP-B: `public.gmail_accounts` — falso positivo T9
**Evidência:** T9.1 CRITICAL — mas investigação revelou que é VIEW com `security_invoker=on`  
**Análise:** `public.gmail_accounts` é VIEW sobre `email_app.gmail_accounts`. Com `security_invoker=on` (confirmado via `reloptions`), a RLS da tabela subjacente aplica-se ao chamador. Usuários `authenticated` veem apenas suas próprias contas via policy `gmail_select_own`. `anon` não tem grant na view.  
**Conclusão:** Sem gap real — proteção correta via RLS na tabela base.

### GAP-C: `is_admin_or_supervisor(NULL)` retorna `false`
**Evidência:** T8.4 — `CONFIRMED_GAP`  
**Análise:** Comportamento esperado — NULL uid não deve ser admin. O BUG-1 foi a causa do problema real (service_role recebia NULL uid e era bloqueado). Após o fix de BUG-1, este comportamento de `is_admin_or_supervisor(NULL)=false` é seguro e correto.

---

## Verificação Final (pós-fix)

```
V1:  prevent_role_escalation tem bypass service_role                    PASS
V2:  service_role consegue mudar profiles.role (admin→supervisor)       PASS
V3:  Não-admin ainda bloqueado após fix                                 PASS
V4:  email_app.gmail_accounts service_full_access scoped para role      PASS
V5:  email_app.gmail_accounts tem 5 políticas                           PASS
V6:  saved_filters auth_full_access (USING=true) removida               PASS
V7:  saved_filters scoped por auth.uid() e is_shared                    PASS
V8:  Profiles sem agent_stats: 0 (eram 17)                              PASS
V9:  idx_agent_stats_profile duplicado removido                         PASS
V10: Constraint agent_stats_profile_id_key intacta                      PASS
V11: ON CONFLICT(profile_id) funciona após remoção do índice            PASS
V12: prevent_privilege_escalation trigger habilitado                    PASS
```

**12/12 PASS**

---

## Arquivos Modificados

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `db/parity/2026-07-10_gap_fixes.sql` | Migration | 5 correções aplicadas e verificadas |
| `docs/AUDIT_EXAUSTIVO_2026-07-10.md` | Documento | Este relatório |

## Tabela de Resultados Brutos

Todos os resultados de todas as baterias estão persistidos em:
```sql
SELECT * FROM public._audit_sim_results ORDER BY battery, test_id;
```
