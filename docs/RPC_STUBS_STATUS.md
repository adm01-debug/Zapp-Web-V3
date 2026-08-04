# STATUS DOS RPC STUBS — ZAPP-WEB

> **Referência ativa para stubs de RPC.** Atualizado em: 2026-08-04
> Migration de stubs: `supabase/migrations/20260717000002_create_missing_rpcs_stubs.sql`
> Plano de implementação: `docs/AUDIT_MIGRATION_VS_DB_50_STEPS.md` (Etapa 20)

---

## Resumo

| RPC | Schema | Comportamento Atual | Implementação Real | Prioridade |
|-----|--------|--------------------|--------------------|-----------|
| `initiate_gmail_oauth` | `zapp` | RAISE EXCEPTION P0001 | Edge Function OAuth flow | 🔴 Alta |
| `complete_gmail_oauth` | `zapp` | RAISE EXCEPTION P0001 | Edge Function OAuth callback | 🔴 Alta |
| `sync_to_crm` | `zapp` | RAISE EXCEPTION P0001 | Integração CRM via webhook/API | 🟡 Média |
| `export_user_data` | `zapp` | Retorna dados básicos de perfil (JSON apenas) | Edge Function com export completo | 🟡 Média |
| `import_user_data` | `zapp` | RAISE EXCEPTION P0001 | Edge Function com validação + import | 🟡 Média |
| `enrich_contact` | `zapp` | Retorna dados do contato com `enriched: false` | Integração com API de enriquecimento | 🟢 Baixa |
| `get_latest_analysis` | `zapp` | Retorna avg de `contact_intelligence.engagement_score` | Analytics completo por contato | 🟢 Baixa |

> `check_download_permission` — **NÃO é stub**. Função intencionalmente ausente.
> Frontend faz fail-open via SQLSTATE 42883. Ver `20260720000001`.

---

## Detalhes por RPC

### `initiate_gmail_oauth` 🔴

**Chamador:** `src/hooks/useIntegrationManagement.ts:54`
**Assinatura:** `initiate_gmail_oauth(p_workspace_id UUID) RETURNS JSONB`
**Comportamento atual:**
```sql
RAISE EXCEPTION 'initiate_gmail_oauth: OAuth Gmail não implementado. Use Edge Function.' 
USING ERRCODE = 'P0001';
```
**Por que existe:** Evita erro 42883 (function does not exist) que causava falso `setIsAuthenticated(true)` incondicionalmente (BUG-11).

**Implementação real necessária:**
1. Gerar URL de autorização OAuth 2.0 do Google
2. Armazenar `state` anti-CSRF em `email_app.oauth_states`
3. Retornar `{auth_url: string, state: string}`

**Dependências:** Google OAuth credentials (env var), `email_app.oauth_states` table

---

### `complete_gmail_oauth` 🔴

**Chamador:** `src/hooks/useIntegrationManagement.ts:69`
**Assinatura:** `complete_gmail_oauth(p_workspace_id UUID, p_code TEXT, p_state TEXT) RETURNS JSONB`
**Comportamento atual:** RAISE EXCEPTION P0001 (igual ao anterior)

**Implementação real necessária:**
1. Validar `state` anti-CSRF
2. Trocar `code` por `access_token` + `refresh_token` via Google Token API
3. Salvar tokens em `email_app.email_accounts` (Realtime na publication ✅)
4. Retornar `{success: true, account_id: UUID}`

**Dependências:** Google OAuth credentials, Edge Function para troca de token, `email_app.email_accounts`

---

### `sync_to_crm` 🟡

**Chamador:** `src/hooks/useIntegrationManagement.ts:156`
**Assinatura:** `sync_to_crm(p_workspace_id UUID, p_crm_type TEXT) RETURNS VOID`
**Comportamento atual:** RAISE EXCEPTION P0001

**Implementação real necessária:**
- Disparar Edge Function `crm-sync` com `p_workspace_id` e `p_crm_type`
- Suporte inicial: HubSpot, Pipedrive, RD Station
- Resultado assíncrono via `zapp.app_notifications`

---

### `export_user_data` 🟡

**Chamador:** `src/hooks/useMediaManagement.ts:93`
**Assinatura:** `export_user_data(p_user_id UUID, p_format TEXT) RETURNS JSONB`
**Comportamento atual:** Retorna dados de perfil básico (somente `format='json'`; outros formatos → RAISE)

**Implementação real necessária:**
- Exportar TODOS os dados do usuário: perfil, mensagens, contatos, settings
- Formatos: JSON, CSV, ZIP
- Edge Function assíncrona com geração de URL assinada no Storage

---

### `import_user_data` 🟡

**Chamador:** `src/hooks/useMediaManagement.ts:128`
**Assinatura:** `import_user_data(p_user_id UUID, p_data JSONB) RETURNS JSONB`
**Comportamento atual:** RAISE EXCEPTION P0001

**Implementação real necessária:**
- Validar estrutura do JSONB de import
- Import idempotente com conflict resolution
- Transação atomica com rollback em caso de violação de constraint

---

### `enrich_contact` 🟢

**Chamador:** `src/hooks/useCRMManagement.ts:146`
**Assinatura:** `enrich_contact(p_contact_id UUID) RETURNS JSONB`
**Comportamento atual:** Retorna `{enriched: false, ...dados básicos do contato}`

**Implementação real necessária:**
- Integração com APIs: Clearbit, FullContact, ou similar
- Cache de resultados em `zapp.contact_intelligence`
- Rate limiting (evitar cobranças excessivas de API)

---

### `get_latest_analysis` 🟢

**Chamador:** `src/hooks/useAnalyticsManagement.ts:168`
**Assinatura:** `get_latest_analysis(p_contact_id UUID) RETURNS JSONB`
**Comportamento atual:** Retorna `{avg_engagement: float}` calculado da tabela `contact_intelligence`

**Implementação real necessária:**
- Análise completa: sentiment trend, response time, engagement score
- Integração com `zapp.evolution_sentiment_analysis` (na publication ✅)
- Cache com TTL de 1 hora (evitar recalcular em cada chamada)

---

## Como Implementar um Stub

Quando a implementação real estiver pronta, substituir o stub:

```sql
-- 1. Drop o stub existente
DROP FUNCTION IF EXISTS zapp.nome_da_funcao(tipos_de_params);

-- 2. Criar a implementação real
CREATE OR REPLACE FUNCTION zapp.nome_da_funcao(...)
RETURNS ...
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
BEGIN
  -- implementação real aqui
END;
$$;

-- 3. GRANT correto
REVOKE EXECUTE ON FUNCTION zapp.nome_da_funcao(...) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.nome_da_funcao(...) TO authenticated;
```

---

## Referências

- Migration de stubs: `supabase/migrations/20260717000002_create_missing_rpcs_stubs.sql`
- Plano de migração: `docs/AUDIT_MIGRATION_VS_DB_50_STEPS.md` Etapa 20
- Histórico de bugs de stubs: `docs/CHANGELOG_SESSIONS.md` (BUG-11, GAP-2 a GAP-6)
- Fail-open pattern: `supabase/migrations/20260720000001_stub_check_download_permission.sql`
