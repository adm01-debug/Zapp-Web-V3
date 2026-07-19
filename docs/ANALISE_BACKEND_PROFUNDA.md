# Análise Profunda do Backend — ZAPP-WEB v3

> **Arquitetura atual**: Supabase Self-Hosted (`supabase.atomicabr.com.br`), schema `zapp`. Veja [SCHEMA_REFERENCE.md](SCHEMA_REFERENCE.md).


> **Autor:** Análise sênior de Back-End
> **Data:** 2026-05-20
> **Escopo:** Backend Supabase (PostgreSQL + 465 migrations, 107 Edge Functions Deno/TS), camada de acesso a dados do frontend, operação, segurança, performance e custos.
> **Método:** Análise estática evidenciada (file:line). Nenhum dado de produção foi alterado.

---

## 1. Sumário Executivo

O ZAPP-WEB v3 é uma plataforma omnichannel de atendimento (WhatsApp via Evolution API, WhatsApp Cloud, e-mail Gmail/Outlook/IMAP, voz/ElevenLabs, IA, CRM, tickets e SLA). O "backend" é o Supabase: **PostgreSQL com 465 migrations** e **107 Edge Functions** em Deno/TypeScript, consumido por um frontend React/Vite.

A engenharia tem **pontos fortes notáveis** para um produto desse porte: validação HMAC com comparação constante-no-tempo, arquitetura de fila/DLQ com backoff exponencial e idempotência, cobertura de testes real (106 unit + ~57 spec/e2e), logging estruturado com redação de segredos e observabilidade de cliente (Sentry + Web Vitals).

Entretanto, há **falhas sistêmicas críticas de segurança** que expõem dados e custos de forma direta:

| # | Achado | Severidade | Categoria |
|---|--------|------------|-----------|
| C1 | `external-db-proxy` é um proxy de leitura/escrita de banco **sem autenticação** + CORS `*` | **CRÍTICA** | Segurança |
| C2 | `mcp-server` totalmente aberto (sem auth) | **CRÍTICA** | Segurança |
| C3 | **Sem isolamento multi-tenant**; ~88 policies `USING (true)`; tabelas sensíveis sem RLS | **CRÍTICA** | Segurança/Dados |
| C4 | `send-email` é um **open relay** usando service-role key sem checar o chamador | **ALTA** | Segurança |
| C5 | `ai-proxy` decodifica JWT **sem verificar assinatura** → custo de IA disparável anonimamente | **ALTA** | Segurança/Custo |
| C6 | RPCs `SECURITY DEFINER` sem `SET search_path` (153 arquivos) + `get_team_profiles()` vaza `profiles` inteira | **ALTA** | Segurança/Dados |
| C7 | JWT anon hardcoded em código-fonte (2 arquivos); token de verificação de webhook com fallback previsível | **ALTA** | Segurança |
| C8 | `security.yml` malformado → **gitleaks provavelmente não roda**; `npm audit` e secret-grep não bloqueiam CI | **MÉDIA-ALTA** | Operação |
| C9 | Custo de IA/voz rastreado mas **sem teto/quota** → gasto ilimitado | **MÉDIA-ALTA** | Custo |
| C10 | Sem camada de acesso a dados: **1481 `.from()`** dispersos; duplicação `components/`↔`features/`; 2 dirs de migrations | **MÉDIA** | Manutenibilidade |

**Recomendação central:** congelar exposição pública das funções não autenticadas (C1, C2, C4) imediatamente, fechar o gap de RLS/multi-tenant (C3, C6) e restaurar o pipeline de segurança (C8) antes de qualquer crescimento de base de clientes.

---

## 2. Detalhamento por Categoria

### 2.1 Segurança

#### C1 — `external-db-proxy`: proxy de banco sem autenticação (CRÍTICA / Prioridade: Crítico)
**Problema:** A função aceita operações `select/update/rpc` contra os schemas `public` e `evo_api` usando uma chave do Supabase externo, mas **nunca exige autenticação** — apenas registra se o header existe.

**Evidência:**
```ts
// supabase/functions/external-db-proxy/index.ts:44
has_auth: !!req.headers.get('authorization'),   // apenas LOGA, nunca valida
// CORS aberto:
// external-db-proxy/lib/utils.ts:4-5  -> 'Access-Control-Allow-Origin': '*'
```
`grep -n "401|403|getUser|verify"` na função retorna **zero** enforcement.

**Impacto:** Qualquer pessoa na internet pode ler/alterar dados do banco externo (CRM/contatos) via browser (CORS `*`). Vazamento e adulteração de dados pessoais (violação LGPD).

**Correção:**
```ts
const jwt = req.headers.get('authorization')?.replace('Bearer ', '');
const { data: { user }, error } = await supabaseAuth.auth.getUser(jwt);
if (error || !user) return new Response('Unauthorized', { status: 401, headers: cors });
// + allowlist de tabelas/colunas e CORS por origem (usar _shared/validation.ts getCorsHeaders)
```

#### C2 — `mcp-server` aberto (CRÍTICA / Crítico)
**Evidência:** `supabase/functions/mcp-server/index.ts:15` lê `await req.json()` e executa ferramentas sem nenhuma checagem de token. Combinado com `verify_jwt = false` no `config.toml`.
**Impacto:** Superfície de execução de ferramentas exposta publicamente.
**Correção:** exigir API key dedicada com comparação constante-no-tempo + `verify_jwt = true` quando viável.

#### C4 — `send-email`: open relay com service-role (ALTA / Crítico)
**Evidência:** `send-email/index.ts:35` envia com `Authorization: Bearer ${serviceKey}` (e Resend em `:59`) **sem validar o chamador** (`verify_jwt=false`, sem `getUser`).
**Impacto:** Spam/phishing a partir do domínio da empresa; abuso de cota de e-mail.
**Correção:** exigir JWT válido + autorização de papel; rate-limit por usuário.

#### C5 — `ai-proxy`: JWT sem verificação (ALTA / Importante)
**Evidência:** `_shared/ai-usage.ts:35-45` decodifica o JWT com comentário *"no verification needed"*; `extractUserIdFromRequest` retorna `null` quando o header falta, mas a chamada de IA prossegue (`ai-proxy/index.ts:104` usa o id apenas para logging).
**Impacto:** Chamadas de IA pagas (`ai.gateway.lovable.dev`) disparáveis sem autenticação real → custo + exfiltração de capacidade.
**Correção:** `auth.getUser(jwt)` real antes de encaminhar; negar se inválido.

#### C7 — Credenciais hardcoded (ALTA / Importante)
**Evidência (verificada):**
```ts
// src/integrations/zappweb/supabaseClient.ts:25  (fallback)
'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...role":"anon"...exp:1872817200'  // expira em 2029
// src/pages/admin/Connections.tsx:38  -> MESMO token como fallback
// supabase/functions/whatsapp-webhook/index.ts:53
const verifyToken = Deno.env.get('WHATSAPP_VERIFY_TOKEN') || 'lovable_webhook_token';
```
**Impacto:** O JWT é de papel `anon` (raio de ação limitado pela RLS do host externo — porém C3 mostra que a RLS é fraca, ampliando o risco). O fallback `lovable_webhook_token` permite que um atacante passe a verificação de webhook da Meta se a env não estiver setada.
**Correção:** remover todos os fallbacks; falhar se a env não existir (padrão já usado no client interno, `src/integrations/supabase/client.ts:4-17`). Rotacionar os tokens expostos.

#### Pontos fortes de segurança (manter)
- **HMAC robusto:** `_shared/hmac-validation.ts:63-78` usa `timingSafeEqual` (constante-no-tempo), rotação de segredo e múltiplos headers.
- **CORS correto no padrão:** `_shared/validation.ts:239-251` reflete apenas origens em allowlist; **sem `Allow-Credentials`** com wildcard.
- **Funções bem feitas:** `create-user` (JWT + checagem de papel, `:20-46`), `secure-upload` (JWT + scan VirusTotal), `get-sip-password` (JWT + `is_active`).

**Atenção residual:** `public-api/index.ts:37` compara `x-api-key` com `!==` (não constante-no-tempo) → trocar por comparação segura. `WebhookSecurityService` tem `strictMode=false` por padrão (`:134`) e aceita requisição sem assinatura (`:179-188`) — o `evolution-webhook` força strict, mas qualquer novo consumidor herdará o default inseguro.

---

### 2.2 Banco de Dados (modelagem, RLS, performance)

#### C3 — Ausência de isolamento multi-tenant + RLS permissiva (CRÍTICA / Crítico)
- Apenas o subsistema `contacts` tem `workspace_id`, e **nenhuma policy filtra por ele**. Tabelas centrais (`messages`, `conversations`, `evolution_contacts`, `gmail_accounts`) não têm coluna de tenant.
- **88 arquivos** contêm policies `USING (true)` (verificado). Exemplo com comentário admitindo o bypass:
  ```sql
  -- 20260503232319_...sql:29
  ... USING (true); -- Controle real será via RPC
  ```
- Anti-padrão "autenticado = autorizado": `20260409020732_...sql:19` → `FOR ALL USING (auth.uid() IS NOT NULL)`.
- **Tabelas sem `ENABLE ROW LEVEL SECURITY`:** `conversation_summaries`, `message_queue`, `messages_whatsapp`, `salespeople`, `system_logs`, `email_templates` — várias contêm conteúdo de mensagens.

**Impacto:** Qualquer usuário autenticado lê dados de todos os clientes. Em SaaS multi-cliente isso é vazamento cross-tenant e violação LGPD.
**Correção:** introduzir `org_id/tenant_id` nas tabelas de domínio; policies do tipo `USING (org_id = (SELECT org_id FROM user_orgs WHERE user_id = auth.uid()))`; habilitar RLS em todas as tabelas com dado de usuário.

#### C6 — `SECURITY DEFINER` sem `search_path` + RPC vazando dados (ALTA / Crítico)
- **153 arquivos** com `SECURITY DEFINER`; ~30 funções **sem `SET search_path`** → escalonamento de privilégio via resolução de schema controlada pelo atacante.
- Vazamento direto:
  ```sql
  -- 20260502_create_rpc_functions.sql:14
  CREATE FUNCTION get_team_profiles() ... SECURITY DEFINER AS $$ SELECT * FROM profiles; $$;
  ```
  Retorna **toda** a tabela `profiles`, ignorando RLS. Idem `contacts_count_by_type()`, `rpc_contact_stats()` (agregações sem escopo de tenant).
**Correção:** `ALTER FUNCTION ... SET search_path = ''` (ou `pg_catalog, public`) em todas; reescrever RPCs para escopo do `auth.uid()`/tenant.

#### Performance e modelagem (MÉDIA / Importante)
- **Índices inconsistentes:** colunas quentes (`conversation_id`, `contact_id`, `created_at`) indexadas nos caminhos principais (`20260501_contacts_performance_indexes.sql`), mas FKs de tabelas secundárias (anexos, reações, membros de fila) não são indexadas sistematicamente → risco de seq-scan/N+1.
- **Enums subutilizados:** apenas 9 `CREATE TYPE ... AS ENUM`; status/estado em `text` livre (`lead_status text`, `'pending'/'retrying'`) → sem integridade de domínio no banco.
- **Higiene de migrations (ALTA):** **duas fontes de verdade** (`migrations/` e `migrations-from-lovable/`). `contacts`, `messages`, `email_messages`/`email_labels` são definidas 3–4× → risco de drift/conflito conforme ordem de aplicação. **192 arquivos** com `DROP`; vários sem `IF EXISTS` (`20260411111454_...:9 DROP COLUMN reset_token`; múltiplos `ALTER PUBLICATION ... DROP TABLE`) → migration não-idempotente aborta em re-run.

#### Storage (ALTA / Importante)
- Buckets públicos com conteúdo de usuário: `05_storage.sql:8-14` cria `audio-memes`, `avatars`, `custom-emojis`, `stickers` como `public, true` → enumeração não autenticada.
- O próprio arquivo admite (`05_storage.sql:4-5`) que **não cria policies em `storage.objects`** — buckets privados (`whatsapp-media`, `email-attachments`, `quarantine`) dependem de RLS definida em outro lugar. Auditar que cada bucket privado tem policy correspondente.

---

### 2.3 Performance e Escalabilidade

- **Rate limiting in-memory:** `_shared/validation.ts:356 checkRateLimit` usa `Map` por instância → reseta em cold start e não é compartilhado entre instâncias do Edge runtime. Insuficiente em escala; **funções não autenticadas não têm rate limit algum** (exposição a DoS/abuso). Recomenda-se rate limit baseado em Postgres/Redis (Upstash) com janela deslizante.
- **Over-fetching no cliente:** **221 `select('*')`** (ex.: `useUserRole.ts:26`), inclusive sob polling (`refetchInterval: 3000` em `TalkXLiveMonitor.tsx:34`). Amplifica banda e acopla o cliente ao schema. Selecionar colunas explicitamente.
- **React Query bem configurado:** `AppProviders.tsx:13-26` (`staleTime 5m`, `gcTime 30m`, retry com backoff, `refetchOnWindowFocus:false`).
- **Fila/DLQ (ponto forte):** `_shared/dlq-backoff.ts:10-27` backoff exponencial com cap (60min) e jitter ±15%, escopo por motivo; idempotência via SHA-256 (`:30-50`); `enqueue-failed-message.ts:22` só re-enfileira erros transitórios (5xx/429/timeout), `MAX_RETRIES=5`.

---

### 2.4 Manutenibilidade

#### C10 — Falta de camada de acesso a dados (MÉDIA / Importante)
- **1481 chamadas `.from()`** dispersas em hooks, componentes e páginas — sem repositório/DAL. Mudança de schema reverbera em centenas de call sites.
- **Duplicação estrutural:** arquivos idênticos em `src/components/**` e `src/features/**` (ex.: `useAdminData.ts` em ambos) → dupla manutenção.
- **Sprawl de clientes Supabase:** 3–4 clientes (`integrations/supabase/client.ts`, `external.ts` **e** `externalClient.ts` redundantes, `zappweb/supabaseClient.ts`); `externalClient.ts:58-79` permite mutação do client em runtime via `(externalSupabase as any)` (frágil/sem tipo).
- **Erros silenciados:** 23 queries destruturam só `{ data }` ignorando `error`; `useUserRole.ts:31` engole o erro (fail-closed, mas silencioso).

**Correção:** criar `src/data/<domínio>Repository.ts` encapsulando queries tipadas; consolidar clientes; unificar `components/`↔`features/`; lint que proíba `.from()` fora da DAL (já existe `check-domain-boundaries.ts`).

---

### 2.5 Operacionalidade (logs, monitoramento, CI/CD)

- **Observabilidade:** logging estruturado com redação de segredos (`_shared/validation.ts:146 class Logger`, `:178 redactSecrets`), mas **adoção parcial** — 58 arquivos usam `Logger` vs ~156 `console.*` crus. Sentry no frontend (`src/lib/sentry.ts`), porém **Edge Functions sem sink centralizado de erro**. Boa malha de health/alerta (`health-check`, `provider-healthcheck`, `sla-alert-*`, `*-secrets-status`).
- **C8 — Pipeline de segurança quebrado (MÉDIA-ALTA / Crítico):** `.github/workflows/security.yml` tem **25 linhas com `...` literal na linha 2** → o job do **gitleaks está ausente/quebrado**; só o relatório semanal de RLS está íntegro. No `ci.yml`, `npm audit` é `continue-on-error: true` (`:147`) e a checagem de segredo é um `grep` que só dá `echo` de aviso (`:149-152`) — **nada bloqueia o build**. **Não há pipeline de deploy** de Edge Functions/migrations no CI (deploy manual/externo via Lovable), e o **e2e Playwright não é gated**.
- **Secret scanning:** `.gitleaks.toml` só faz allowlisting (não adiciona regras) e seu runner está quebrado (C8). Positivo: **nenhum `.env` commitado** (só `.env.example`).

---

### 2.6 Custos

#### C9 — Custo de IA/voz sem teto (MÉDIA-ALTA / Importante)
- Concentração de custo: **9 funções `ai-*`** + **8 `elevenlabs-*`** + voice-agent/changer/copilot/transcribe, todas em APIs pagas externas.
- **Uso é rastreado** (`_shared/ai-usage.ts:82 logAiUsage` grava tokens/modelo/duração em `ai_usage_logs`; dashboard `useAIUsageDashboard.ts`), mas **não há cap/quota/budget** antes da chamada (grep de `cap|limit|budget|quota` só acha `.limit(1)`). O logging é fire-and-forget (falhas engolidas, `ai-usage.ts:95`).
**Impacto:** Combinado com C5 (ai-proxy disparável sem auth), exposição a gasto ilimitado.
**Correção:** checagem de orçamento por tenant **antes** de encaminhar ao provedor; alertas de limiar; circuit breaker por custo.

---

## 3. Lista de Prioridades (Roadmap)

### Fase 0 — Contenção imediata (Crítico, dias)
1. Fechar `external-db-proxy` (C1), `mcp-server` (C2), `send-email` (C4): exigir auth + restringir CORS; ou desabilitar até corrigir.
2. Corrigir `ai-proxy` para verificar JWT de verdade (C5).
3. Remover credenciais hardcoded e fallback de webhook (C7); rotacionar tokens expostos.
4. Restaurar `security.yml`/gitleaks e tornar `npm audit`+secret-scan bloqueantes (C8).

### Fase 1 — Fundamentos de dados (Crítico/Importante, semanas)
5. Habilitar RLS nas tabelas sem proteção; eliminar `USING (true)`; introduzir `org_id` e policies por tenant (C3).
6. `SET search_path` em todas as `SECURITY DEFINER`; reescrever `get_team_profiles()` e RPCs de agregação com escopo (C6).
7. Auditar policies de `storage.objects` por bucket privado; revisar buckets públicos (2.2).

### Fase 2 — Robustez e custo (Importante)
8. Rate limit distribuído; teto/quota de IA por tenant (C9, 2.3).
9. Consolidar as duas pastas de migrations; tornar DROPs idempotentes (`IF EXISTS`).

### Fase 3 — Manutenibilidade (Desejável)
10. Introduzir DAL/repositórios; unificar `components/`↔`features/`; consolidar clientes Supabase; migrar `console.*` → `Logger` e adicionar sink de erro nas Edge Functions (C10, 2.5).
11. Reduzir `select('*')`; gate de e2e no CI; pipeline de deploy de functions/migrations.

---

## 4. Benchmarking (vs. boas práticas de mercado)

| Dimensão | ZAPP-WEB v3 | Padrão de mercado (SaaS multi-tenant) | Gap |
|---|---|---|---|
| Isolamento de tenant | Ausente (RLS `USING(true)`) | RLS por `org_id` obrigatória | **Grande** |
| Auth de Edge Functions | Mista; várias abertas | Auth padrão; webhooks via HMAC | **Grande** |
| Secret management | Fallbacks hardcoded; scanner quebrado | Vault/secret manager + gitleaks bloqueante | Médio |
| Fila/retry | DLQ + backoff + idempotência | Idem | **No nível** |
| Observabilidade | Sentry (front) + health checks; logs mistos | Tracing distribuído + sink unificado | Médio |
| Testes | 106 unit + ~57 e2e | Cobertura significativa | **No nível** (falta gate e2e) |
| Governança de custo | Tracking sem cap | Quota + alerta + circuit breaker | Médio |
| Higiene de migrations | 2 fontes de verdade, DROPs não-idempotentes | Fonte única, idempotente, CI-gated | Médio |

**Conclusão:** A base de engenharia (fila, testes, HMAC, observabilidade de cliente) está em nível de mercado; o que destoa fortemente é a **postura de segurança de acesso a dados** (multi-tenancy/RLS e funções não autenticadas) e a **governança de pipeline/custo**. Esses são os vetores que devem ser priorizados.

---

## 5. Referências
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- `SECURITY DEFINER` e `search_path`: https://www.postgresql.org/docs/current/sql-createfunction.html
- OWASP Top 10 (A01 Broken Access Control, A07 Auth Failures): https://owasp.org/Top10/
- Supabase Edge Functions auth: https://supabase.com/docs/guides/functions/auth
- LGPD (Lei 13.709/2018) — tratamento e minimização de dados pessoais.
