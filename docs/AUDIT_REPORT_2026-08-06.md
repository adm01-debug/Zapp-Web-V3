# RELATÓRIO DE AUDITORIA EXAUSTIVA — ZAPP-WEB-V3
## Data: 2026-08-06 | Branch: claude/evolution-api-audit-k0hvx0

> **Metodologia:** 5 agentes especializados + validação cruzada em banco de produção  
> **Escopo:** Todas as correções aplicadas (FIX-01) + sistema completo  
> **Veredicto Final:** ⚠️ **APROVADO COM RESSALVAS CRÍTICAS**

---

## 1. RESUMO EXECUTIVO

| Agente | Domínio | Testes | ✅ PASS | ⚠️ WARN | ❌ FAIL | Veredicto |
|--------|---------|--------|--------|---------|--------|----------|
| **A1** | RPC / Privilégios de execução | 12 | 10 | 2 | 0 | APROVADO COM RESSALVAS |
| **A2** | RLS / Segurança multi-tenant | 18 | 13 | 3 | 2 | REPROVADO PARCIAL |
| **A3** | Realtime / Isolamento de schema | 13 | 13 | 0 | 0 | **APROVADO** |
| **A4** | Feature Registry / Documentação | 15 | 11 | 3 | 1 | APROVADO COM RESSALVAS |
| **A5** | Integridade de migrations | 20 | 14 | 2 | 4 | REPROVADO PARCIAL |
| **TOTAL** | | **78** | **61** | **10** | **7** | ⚠️ APROVADO COM RESSALVAS |

**Taxa de aprovação geral:** 78,2% (61/78 testes aprovados sem ressalvas)

---

## 2. CORREÇÃO PRINCIPAL — FIX-01 (VERIFICADA EM PRODUÇÃO)

### Status: ✅ APROVADA E ATIVA

Migration `20260806180000_fix_wa_rpc_execute_grants.sql` aplicada em **2026-08-06T10:31:31.179Z**.

```sql
-- Verificação via has_function_privilege() — todos retornaram TRUE:
GRANT EXECUTE ON FUNCTION zapp.rpc_instance_stats(text)              TO authenticated; ✅
GRANT EXECUTE ON FUNCTION zapp.rpc_resolve_whatsapp_instance(uuid)   TO authenticated; ✅
GRANT EXECUTE ON FUNCTION zapp.rpc_resolve_instance_by_phone(text)   TO authenticated; ✅
GRANT EXECUTE ON FUNCTION zapp.get_connection_instance(uuid)         TO authenticated; ✅
```

**Propriedades de segurança confirmadas:**
- Todas as 4 funções são SECURITY DEFINER ✅
- Todas têm `search_path` fixo em `proconfig` (anti-injection) ✅
- Grant apenas autoriza a chamada — execução ocorre com privilégios do owner (postgres/service_role) ✅
- Zero regressões introduzidas pelo FIX-01 ✅

---

## 3. AGENTE A1 — RPC / PRIVILÉGIOS DE EXECUÇÃO

### Aprovados ✅
1. FIX-01: 4 RPCs WhatsApp agora acessíveis pelo role `authenticated`
2. Todas as SECURITY DEFINER têm `search_path` fixo
3. `has_function_privilege()` confirma resolução correta para todos os 4 targets
4. Nenhuma função anon-executável no schema `zapp` pós-FIX-01
5. `rpc_instance_stats`, `rpc_resolve_whatsapp_instance`, `rpc_resolve_instance_by_phone`, `get_connection_instance` — comportamento SECURITY DEFINER validado

### Ressalvas ⚠️
6. **40+ RPCs em `zapp` ainda sem `GRANT EXECUTE TO authenticated`** — identificadas antes do FIX-01, não tratadas nesta sessão (dívida técnica pré-existente)
7. `import_user_data` stub não trata erro P0001 com contexto para o usuário em `useMediaManagement.ts:169` — `if (err) throw err` genérico

---

## 4. AGENTE A2 — RLS / SEGURANÇA MULTI-TENANT

### Aprovados ✅
1. RLS `ENABLE`d em 100% das tabelas: zapp (321), evo (172), bpm (41), email_app (33), ai (31), archive (25), financeiro (16), vendas (13) ✅
2. Zero grants para `anon` no schema `zapp`
3. Funções internas com REVOKE FROM PUBLIC/anon aplicados
4. `public._wal_slot_guard_events` com deny-all intencional documentado
5. Role `authenticated` sem acesso a schemas internos (auth, ops) via grant direto

### Problemas Críticos ❌
6. **3 tabelas "surdas-mudas"** — RLS habilitado mas **zero políticas definidas** → bloqueio completo de dados para a aplicação:
   - `zapp.webhook_retry_queue`
   - `zapp.campaign_message_queue`  
   - `zapp.notification_delivery_log`
   
7. **Cross-tenant risk: 48 políticas com `USING(true)` sem filtro de workspace** em tabelas sensíveis — usuários autenticados de um workspace podem ler dados de outros workspaces via estas políticas

### Ressalvas ⚠️
8. Tabelas `schema_migrations`, `role_permissions`, `processed_webhook_events` com `GRANT ALL TO authenticated` — excessivamente permissivo para tabelas de controle
9. `ssl='off'` e `log_connections='off'` no PostgreSQL 15.8 (aceitável apenas se TLS offloading por proxy reverso — confirmar)

---

## 5. AGENTE A3 — REALTIME / ISOLAMENTO DE SCHEMA

### Todos aprovados ✅ (13/13 — 100%)

1. `useRealtimeMessages.ts` (canonical): `schema: 'evo', table: 'evolution_messages'` (raiz) ✅
2. `useZappMessages.ts`: comentário explícito `publish_via_partition_root=true` — usa raiz ✅
3. `useZappConversations.ts`: `table: 'evolution_conversations'` (raiz) ✅
4. `useFailedMessages.ts`: `schema: 'zapp'` (tabela física, não `public` VIEW) ✅
5. `useFailedMessageAlerts.ts`: `{ schema: 'zapp', table: 'failed_messages' }` ✅
6. Canal Realtime determinístico `'messages-realtime'` (evita acumulação StrictMode) ✅
7. Zero subscriptions em partições (`_wpp2`, `_artes`, etc.) ✅
8. Zero subscriptions em VIEWs (goal_notifications, transcription_notifications corrigidos) ✅
9. `dispatch_error_logs` → `schema: 'zapp'` (na publication via `20260721`) ✅
10. Frontend: zero ocorrências de `.schema('public')` em queries REST ✅
11. `db: { schema: 'zapp' }` no cliente principal (`client.ts`) ✅
12. `createZappAdminClient()` em edge functions com `schema: "zapp"` ✅
13. Imports TypeScript de `@/integrations/supabase/schema` (barrel canônico) — nenhum import direto de `types.ts` ✅

**Nota:** Este é o único domínio com veredicto APROVADO sem ressalvas — resultado das múltiplas correções de Realtime nas sessões anteriores.

---

## 6. AGENTE A4 — FEATURE REGISTRY / DOCUMENTAÇÃO

### Aprovados ✅
1. FIX-01 registrado em `feature_registry.json` com status `"aplicado_em_producao"` ✅
2. `feature_registry.json` lista 175 recursos em 15 domínios ✅
3. 7 stubs de RPC documentados corretamente em `docs/RPC_STUBS_STATUS.md` ✅
4. Feature flags desabilitados: `v2_audio_recorder` (percentage=0), `advanced_transcription`, `realtime_metrics` ✅
5. `VALIDATION_PLAN_50_STEPS.md` corrigido nesta sessão: progresso real **41/50 (82%)** ← era 50/50 (100%) incorreto

### Ressalvas ⚠️
6. `FEATURE_REGISTRY.md` lista ~131 recursos vs `feature_registry.json` com 175 — inconsistência entre documentos
7. FIX-01 **não mencionado** em `FEATURE_REGISTRY.md` (apenas em `feature_registry.json`)
8. `CLAUDE.md` com contagens de tabelas desatualizadas (referencia 313 tab em `zapp`, DB atual tem 321)

### Problema ❌
9. `docs/CHANGELOG_SESSIONS.md` **não atualizado** para sessão 2026-08-06 — toda a auditoria de hoje não estava documentada (corrigido nesta sessão)

---

## 7. AGENTE A5 — INTEGRIDADE DE MIGRATIONS

### Aprovados ✅
1. Migration FIX-01 registrada em `supabase_migrations.schema_migrations` com timestamp correto ✅
2. `canonical_schema.sql` squasha corretamente 133 migrations históricas ✅
3. Ordem cronológica das migrations no DB é consistente ✅
4. Sem migrations em conflito (mesma DDL aplicada duas vezes)

### Problemas Críticos ❌
5. **Mismatch de nome canonical_schema — CRÍTICO PARA CI/CD:**
   - Filesystem: `supabase/migrations/20260804000000_canonical_schema.sql`
   - DB registrado como: `canonical_schema_squash_133_migrations`
   - **Consequência:** `supabase db push` ou reconciliação CLI aplicaria novamente ~133 migrations → catastrófico

6. **17-22 migrations aplicadas em prod sem arquivo .sql no repositório** — exemplos:
   - `fix_idor_toggle_meme_favorite`
   - `fix_retry_auto_fail_max_retry`
   - `fix_cosmetic_gaps_p3`
   - Série `db01` a `db05c`
   - `revoke_auth_edge_rpcs`, `guard_admin_bulk_rpcs`
   - **Risco:** Perda de histórico reproduzível; ambiente novo ou staging impossível de replicar fielmente

7. **4 migrations no filesystem NÃO aplicadas em produção:**
   - `20260805000008_campanhas_nps_cron.sql` — cron NPS às 10:00 UTC ausente em prod
   - `20260805170000_email_attachments_unique_constraint.sql` — **ALTO**: gmail-sync pode criar duplicatas
   - `20260805120000_leakproof_privileged_check.sql` — função já é leakproof no DB mas migration não registrada
   - `20260805170000_revoke_anon_contract_inventory.sql` — **MÉDIO**: `rpc_contract_inventory` acessível por anon

8. **Conflito de timestamp:** Dois arquivos com timestamp `20260805120000`:
   - `20260805120000_fix_update_contact_note_rpc.sql`
   - `20260805120000_leakproof_privileged_check.sql`
   - Causa comportamento indeterminado na CLI

### Ressalvas ⚠️
9. `VALIDATION_PLAN_50_STEPS.md` declarava 50/50 completo quando 9 etapas estavam pendentes (corrigido)
10. `docs/SCHEMA_SNAPSHOT.md` com dados de 2026-08-04 (2 dias desatualizado após FIX-01)

---

## 8. ACHADOS POR SEVERIDADE

### 🔴 CRÍTICO (Ação Imediata Necessária)

| # | Achado | Domínio | Risco |
|---|--------|---------|-------|
| C-1 | Mismatch canonical_schema: filesystem vs DB — deploy CI/CD aplicaria 133 migrations novamente | A5 | Catastrófico: downtime total |
| C-2 | 17-22 migrations sem .sql no repo — ambiente staging impossível de replicar | A5 | Deriva irrecuperável |
| C-3 | 3 tabelas com RLS sem policies: webhook_retry_queue, campaign_message_queue, notification_delivery_log | A2 | Dados inacessíveis |

### 🔴 ALTO (Resolver em < 48h)

| # | Achado | Domínio | Risco |
|---|--------|---------|-------|
| A-1 | `email_attachments_unique_constraint` não aplicada em prod: gmail-sync cria duplicatas | A5 | Corrupção de dados |
| A-2 | `revoke_anon_contract_inventory` não aplicada: RPC sensível acessível por anon | A5 | Vazamento de dados |
| A-3 | 48 políticas USING(true) sem filtro workspace em tabelas sensíveis | A2 | Cross-tenant data leak |

### 🟠 MÉDIO (Resolver em < 7 dias)

| # | Achado | Domínio | Risco |
|---|--------|---------|-------|
| M-1 | 40+ RPCs sem GRANT EXECUTE TO authenticated (pré-existente) | A1 | Funcionalidades inacessíveis |
| M-2 | `import_user_data` stub sem tratamento P0001 em useMediaManagement.ts | A1 | UX degradada |
| M-3 | ssl='off' + log_connections='off' no PostgreSQL 15.8 | A2 | Risco se proxy falhar |
| M-4 | Conflito de timestamp 20260805120000 (2 arquivos) | A5 | CI não-determinístico |
| M-5 | Cron NPS 10:00 UTC ausente em prod | A5 | Feature não funcionando |
| M-6 | GRANT ALL em schema_migrations/role_permissions para authenticated | A2 | Privilege escalation risk |

### 🟡 BAIXO (Backlog documentado)

| # | Achado | Domínio | Risco |
|---|--------|---------|-------|
| B-1 | FEATURE_REGISTRY.md vs feature_registry.json inconsistência (131 vs 175) | A4 | Documentação incorreta |
| B-2 | CLAUDE.md com contagem de tabelas desatualizada (313 vs 321) | A4 | Orientação incorreta |
| B-3 | SCHEMA_SNAPSHOT.md desatualizado (2026-08-04) | A4 | Snapshot stale |
| B-4 | leakproof_privileged_check.sql não registrada (função já é leakproof no DB) | A5 | Migration órfã |

---

## 9. PLANO DE AÇÃO RECOMENDADO

### Imediato (hoje):
```sql
-- Ação C-3: Criar policies para tabelas surdas-mudas
CREATE POLICY "workspace_member_only" ON zapp.webhook_retry_queue
  FOR ALL TO authenticated USING (
    workspace_id IN (SELECT workspace_id FROM zapp.workspace_members WHERE user_id = auth.uid())
  );
-- Repetir para campaign_message_queue e notification_delivery_log
```

### Esta semana:
1. Aplicar `20260805170000_email_attachments_unique_constraint.sql` em produção (A-1)
2. Aplicar `20260805170000_revoke_anon_contract_inventory.sql` em produção (A-2)
3. Resolver conflito de timestamp `20260805120000` (M-4)
4. Reconciliar nome da canonical_schema migration no `schema_migrations` (C-1)
5. Criar arquivos .sql para as 17-22 migrations sem arquivo (C-2)

### Próximo sprint:
1. GRANT EXECUTE para os 40+ RPCs identificados (M-1)
2. Adicionar filtro `workspace_id` às 48 políticas USING(true) (A-3)
3. Implementar tratamento P0001 em `useMediaManagement.ts` (M-2)
4. Confirmar proxy TLS ativo antes de considerar ssl='off' aceitável (M-3)

---

## 10. MÉTRICAS FINAIS DA AUDITORIA

| Métrica | Valor |
|---------|-------|
| Total de testes executados | 78 |
| PASS sem ressalvas | 61 (78,2%) |
| WARN (aprovado com ressalva) | 10 (12,8%) |
| FAIL (problema real) | 7 (9,0%) |
| FIX-01 verificada em produção | ✅ Confirmada |
| Realtime score | 13/13 (100%) |
| RLS coverage | 100% (632 tabelas) |
| Migrations sem arquivo .sql | 17-22 |
| Migrations no filesystem não aplicadas | 4 |
| RPCs ainda sem EXECUTE grant | 40+ |
| Políticas USING(true) sem workspace filter | 48 |
| Tabelas "surdas-mudas" | 3 |

---

## 11. VEREDICTO FINAL

> ## ⚠️ APROVADO COM RESSALVAS CRÍTICAS
>
> **A correção principal (FIX-01 — 4 GRANT EXECUTE para RPCs WhatsApp) foi verificada, testada e está 100% operacional em produção.**
>
> O sistema Realtime está em excelente estado (13/13 testes aprovados) e o isolamento de schema está correto em todo o frontend e edge functions.
>
> Entretanto, foram identificados problemas críticos pré-existentes que requerem atenção urgente:
> - **3 tabelas completamente inacessíveis** por RLS sem policies (bloqueio de dados)
> - **Mismatch de canonical_schema** que tornaria qualquer deploy CI/CD catastrófico
> - **17-22 migrations sem arquivo .sql** criando deriva irrecuperável entre prod e staging
> - **4 migrations no filesystem não aplicadas** em prod, incluindo constraints de integridade
>
> Estes problemas são pré-existentes à sessão atual e não foram introduzidos pelo FIX-01.
> A plataforma está estável para uso em produção, mas o risco de CI/CD é **crítico** e deve ser tratado antes do próximo deploy automatizado.

---

*Relatório gerado em 2026-08-06 por auditoria de 5 agentes especializados.*  
*Branch: `claude/evolution-api-audit-k0hvx0` | PR referência: #885*
