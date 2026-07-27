# Matriz de Auditoria RLS (Row Level Security)

Auditado em 2026-07-26. Fonte: análise estática de `supabase/migrations/`.

## Resumo Executivo

| Métrica | Valor |
|---------|-------|
| Schemas com RLS | 6 (public, zapp, evo, financeiro, vendas, _backups) |
| Tabelas com RLS ENABLED | ~350+ (inclui bulk via loops dinâmicos) |
| Tabelas com DISABLE ROW LEVEL SECURITY | **0** |
| Schemas SEM cobertura RLS | email_app (tabelas em public/zapp) |
| Políticas por schema (estimativa) | Ver detalhes abaixo |

## Cobertura por Schema

### Schema `public` (~230 tabelas com RLS)

Abrange as tabelas principais de aplicação:
- Contatos, mensagens, conversas, campanhas
- Email (email_accounts, gmail_threads, gmail_messages)
- SLA, auditoria, webhooks, segurança
- Queue goals, campaign_contacts, sticky_assignments

**Modelo de acesso predominante**: `has_role()` + `workspace_members` join

### Schema `zapp` (~85 tabelas com RLS)

Tabelas migradas progressivamente de `public` para `zapp`:
- `analytics_events`, `user_sessions`, `feature_flags`
- `queue_skills`, `audio_meme_favorites`, `automation_executions`
- `connection_health_logs`, `sla_alert_preferences`, `security_audit_logs`
- Tabelas de Realtime adicionadas em migrações `20260724000047`–`20260724000051`

**Modelo de acesso predominante**: `zapp.is_admin_or_supervisor()` + `zapp.has_role()`

### Schema `evo` (~15 tabelas com RLS)

Tabelas da Evolution API WhatsApp:
- `evolution_messages`, `evolution_conversations`, `evolution_contacts`
- `evolution_webhook_events_v2_*` (particionadas)
- `evolution_logpatch_audit`, `vps_performance_snapshots`
- 8 tabelas adicionais via loop dinâmico

**Modelo de acesso**: `service_role` apenas (dados raw da Evolution API)

### Schema `financeiro` (5 tabelas)

- `colaboradores`, `emprestimos`, `pagamentos_diarios`
- `solicitacoes_alteracao_valor`, `vales`

**Modelo de acesso**: `has_role('admin')` + `workspace_id`

### Schema `vendas` (3+ tabelas)

- `creditos`, `parabens_enviados`, `trocas`
- Demais via `EXECUTE format('ALTER TABLE vendas.%I ENABLE ROW LEVEL SECURITY', t)`

### Schema `_backups` (1 tabela)

- `campaign_contacts_pre_dedup` — acesso restrito a `service_role`

## Funções de Autorização Utilizadas

| Função | Schema | Uso |
|--------|--------|-----|
| `has_role(user_id, role)` | `zapp` | Gate geral por role |
| `is_admin_or_supervisor()` | `zapp` | Gate rápido para operações admin |
| `log_rls_denied()` | `zapp` | Audit de negações (SECURITY DEFINER) |
| `is_workspace_member(ws_id)` | `zapp` | Isolamento por workspace |

## Padrões Identificados

### Bom ✅

1. **Zero tabelas com DISABLE RLS** — toda tabela criada tem RLS ou é explicitamente justificada
2. **search_path fixo** em todas as funções SECURITY DEFINER (`SET search_path = zapp`)
3. **service_role bypass** documentado — tabelas `evo.*` corretas para Evolution API
4. **Documentação existente**: `RLS_QUICK_REFERENCE_CARD.md`, `RLS_OWNERSHIP_MODELS_REFERENCE.md`

### Atenção ⚠️

1. **Schema `email_app` sem RLS próprio** — tabelas de email vivem em `public` ou `zapp`; ao criar tabelas diretamente em `email_app`, lembrar de habilitar RLS
2. **Loops dinâmicos** — tabelas adicionadas via `EXECUTE format(...)` sem listagem explícita dificultam auditoria futura
3. **SECURITY INVOKER faltando em views mais antigas** — ver `security-invoker-gate.yml` para monitoramento CI

## Verificação em Produção

```sql
-- Tabelas SEM RLS habilitado (esperado: zero em schemas de aplicação)
SELECT n.nspname, c.relname
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND c.relrowsecurity = false
  AND n.nspname IN ('zapp', 'evo', 'financeiro', 'vendas', 'email_app')
ORDER BY n.nspname, c.relname;

-- Tabelas sem nenhuma política RLS (RLS enabled mas sem policy = bloqueia tudo)
SELECT n.nspname, c.relname
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND c.relrowsecurity = true
  AND n.nspname IN ('zapp', 'evo', 'financeiro', 'vendas', 'email_app')
  AND NOT EXISTS (
    SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid
  )
ORDER BY n.nspname, c.relname;
```

## Documentação de Referência

| Arquivo | Conteúdo |
|---------|----------|
| `supabase/migrations/RLS_QUICK_REFERENCE_CARD.md` | Referência rápida de padrões |
| `supabase/migrations/RLS_OWNERSHIP_MODELS_REFERENCE.md` | Modelos de propriedade |
| `supabase/migrations/RLS_SECURITY_HARDENING_SUMMARY.md` | Resumo de hardening |
| `supabase/migrations/RLS_MIGRATION_TEST_SUITE.sql` | Suite de testes RLS |
| `.github/workflows/security-invoker-gate.yml` | Gate CI para security_invoker |
