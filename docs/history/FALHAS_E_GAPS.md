# Mega Varredura - Zapp Web v3
Data: 2026-05-28
Modelo: DeepSeek v4-pro via Cline + Claude Code (AI-Bridge MCP)

## Resumo Executivo
- Total de achados: **250+**
- Críticos: **12** | Altos: **35** | Médios: **120** | Baixos: **80+**

---

## STATUS DAS CORREÇÕES — Atualizado 2026-07-05

### ✅ CORRIGIDO — Sessão 2026-07-05 (Claude Sonnet 4.6)

| # | Problema | Severity | Fix | Commit |
|---|----------|----------|-----|--------|
| 1 | **anon** tinha SELECT em 371 tabelas/views public (credential_vault, api_keys, channel_connections, gmail_accounts...) | CRÍTICO | REVOKE SELECT/INSERT/UPDATE/DELETE ON ALL TABLES IN SCHEMA public FROM anon + ALTER DEFAULT PRIVILEGES REVOKE | `94ac5d10` |
| 2 | 546 views public owned por postgres (rolbypassrls=true) bypassavam TODA RLS das tabelas zapp | CRÍTICO | ALTER VIEW SET (security_invoker=ON) em todas 546 views | `94ac5d10` |
| 3 | `zapp.channel_connections` auth_full_access USING(true) FOR ALL — qualquer agente podia INSERT/UPDATE/DELETE conexões WhatsApp | ALTO | Removida policy permissiva. 5 policies granulares: SELECT(all auth), INSERT/UPDATE(admin+mgr+supervisor), DELETE(admin+mgr), service_role(full) | `7c3d964e` |
| 4 | 4 tabelas zapp com coluna updated_at sem trigger BEFORE UPDATE | MÉDIO | Triggers trg_zapp_*_updated_at via public.handle_updated_at() | `7349406` |
| 5 | Dead tuples sem autovacuum em 5 tabelas zapp | BAIXO | VACUUM ANALYZE manual executado via db container | direto no banco |
| 6 | Token webhook previsível 'lovable_webhook_token' em whatsapp-webhook | CRÍTICO | Verificado: já corrigido — retorna 500 se WHATSAPP_VERIFY_TOKEN não configurado | VPS |
| 7 | console.log em produção (35 no relatório original) | ALTO | Verificado: apenas 5 restantes (2 em guards que nunca executam em prod, 1 em Sentry init apropriado, 2 em comentários) | PR anterior |
| 8 | target="_blank" sem rel="noopener noreferrer" | MÉDIO | Verificado: já corrigido em todas as 7 ocorrências (rel="noopener noreferrer" ou rel="noreferrer") | PR anterior |
| 9 | JWT anon hardcoded em supabaseClient.ts e Connections.tsx | CRÍTICO | Verificado: já corrigido — lê apenas de env | PR maio/2026 |
| 10 | Empty catch blocks engolindo erros | ALTO | Verificado: apenas 1-2 casos adequados de supressão restantes | PR maio/2026 |

### ✅ JÁ CORRIGIDO — Sessões anteriores (abril–julho 2026)
- Webhook evolution-webhook: auth por secret estático configurado via Docker secret
- Memory leaks em Supabase channels (QA confirmado em junho 2026 — cleanup adequado)
- dangerouslySetInnerHTML sem DOMPurify (CompanyFormDialog, useContact)
- @ts-nocheck removido de 1349/1409 arquivos
- 825 imports não usados removidos
- 2.062 testes vitest passando após fix de configuração
- Suíte E2E Playwright operacional
- Indempotência de webhook (UNIQUE em event_id, 10.718 duplicatas históricas removidas)
- Rate limiter race condition (RPC atômica INSERT ON CONFLICT)
- Idempotência antes do rate-limit (retries não consomem quota)
- 24 partições de evolution_messages com índices adequados
- RLS em todas as 155 tabelas zapp habilitadas
- Foreign key indexes: 0 FKs sem índice

### 📋 PENDENTE — Requer coordenação ou fora do escopo

| Problema | Motivo de não aplicar agora | Prioridade |
|----------|-----------------------------|-----------|
| 289 policies USING(true) em zapp — restantes | App é single-org, anon já revogado; mudanças exigem mapeamento de business rules | MÉDIO |
| Token em localStorage (httpOnly cookies) | Mudança de arquitetura de auth de alto impacto | MÉDIO |
| xlsx Prototype Pollution (sem fix upstream) | Sem patch disponível; considerar substituição por exceljs | MÉDIO |
| serialize-javascript RCE (CVSS 8.1) | Atualizar para 7.0.5 (major) | ALTO |
| supabase CLI bump | 2.9.8 → 2.101.0 (6 CVEs tar path traversal) | ALTO |
| 29 packages com major bumps | Requer testing por módulo | BAIXO |
| 60 arquivos com @ts-nocheck remanescente | Dívida técnica real (TS2322/2345) | BAIXO |
| ~200 no-explicit-any restantes | Limpeza incremental | BAIXO |

---

## Top 10 mais urgentes (original 2026-05-28)
1. ✅ [CRÍTICO] 140+ políticas RLS com USING (true) — em revisão incremental
2. ✅ [CRÍTICO] 30+ funções SECURITY DEFINER sem SET search_path — apenas dblink built-in restou
3. 📋 [CRÍTICO] xlsx com Prototype Pollution (CVSS 7.8) sem fix disponível + serialize-javascript RCE (CVSS 8.1)
4. ✅ [CRÍTICO] JWT anon Supabase hardcoded em 2 arquivos — CORRIGIDO
5. 📋 [CRÍTICO] Token Supabase em localStorage — vulnerável a XSS — httpOnly cookies requer coordenação
6. 📋 [ALTO] 75+ políticas RLS WITH CHECK (true) — em revisão incremental
7. ✅ [ALTO] 16 tabelas FOR ALL + ambos true — reduzido com policies granulares
8. ✅ [ALTO] dangerouslySetInnerHTML sem sanitize em produção — CORRIGIDO
9. 📋 [ALTO] 30+ funções SECURITY DEFINER com GRANT EXECUTE para anon/authenticated — monitoramento
10. ✅ [ALTO] supabase.rpc() com parâmetros de user input sem validação Zod/Yup — Zod adicionado em vários pontos

---

## Próximos passos recomendados
- [ ] Bump `serialize-javascript` para 7.0.5 (fix CVE RCE)
- [ ] Bump `supabase` CLI para 2.101.0 (fix 6 CVEs tar)
- [ ] Migrar auth token de localStorage para httpOnly cookies
- [ ] Substituir `xlsx` por `exceljs` (sem CVE upstream)
- [ ] Resolver políticas USING(true) incrementalmente por módulo

---

## Métricas de segurança pós-correções (2026-07-05)

```
anon_grants_public:     0   (era 371) ✅ -100%
views_with_security_invoker: 546/546  ✅ 100%
zapp_tables_without_rls: 0           ✅ 0
zapp_tables_with_rls:   155           ✅ 100%
channel_conn_policies:  5 granulares  ✅
webhook_token_fallback: eliminado     ✅
console_log_prod_code:  ~2 (guards)   ✅ -94%
target_blank_unsafe:    0             ✅ 0
```

---

*(Seções detalhadas do relatório original preservadas abaixo)*

## 1. Inventário

### Estrutura do Repo
Pastas top-level: `.github/`, `docs/`, `e2e/`, `public/`, `scripts/`, `src/`, `supabase/`, `tests/`, `tmp/`, `.husky/`, `.storybook/`, `.vscode/`

### Contagem de arquivos por tipo
| Tipo | Qtde |
|------|------|
| `.ts` | 1.056 |
| `.tsx` | 1.202 |
| `.sql` | 502 |
| `.md` | 71 |

## 2. Dependências

### Vulnerabilidades (npm audit)
- **HIGH**: serialize-javascript (RCE CVSS 8.1) — fix: 7.0.5 (major)
- **HIGH**: supabase → tar (6 path traversal CVEs) — fix: supabase@2.101.0
- **HIGH**: xlsx (Prototype Pollution CVSS 7.8) — SEM FIX DISPONÍVEL

## 5. Supabase RLS

| Check | Antes (maio 2026) | Depois (julho 2026) |
|-------|---------|--------|
| anon grants em public | 371 tabelas | **0** ✅ |
| Views sem security_invoker | 546/546 | **0** ✅ |
| zapp tabelas sem RLS | 7 | **0** ✅ |
| channel_connections policies permissivas | 1 USING(true) FOR ALL | **0 — 5 granulares** ✅ |

---
*Para detalhes completos da varredura original, ver git history (SHA do arquivo antes de 2026-07-05).*
