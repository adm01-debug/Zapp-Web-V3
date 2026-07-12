# Auditoria Exaustiva — zapp-web-v3

**Data:** 2026-07-12  
**Escopo:** Auditoria completa do repositório (código, banco, edge functions, infra, CI, docs)  
**Método:** 20 agentes auditores especializados cobrindo 50 tarefas + verificação adversarial independente dos achados críticos/altos (89 agentes no total, ~8,5M tokens de análise).

## Sumário executivo

Foram identificados **255 achados**: **4 críticos**, **65 altos**, **130 médios** e **56 baixos**.

### Métricas do repositório

| Métrica | Valor |
|---|---|
| Linhas TS/TSX em `src/` | ~254.855 |
| Arquivos em `src/components/` | 529 (~57 subdomínios) |
| Arquivos em `src/features/` | 472 (apenas 6 features) |
| Hooks em `src/hooks/` | 272 |
| Edge functions | 125 |
| Migrations SQL (pasta principal) | 702 (+ 5 pastas paralelas) |
| Testes unitários | 143 arquivos (~10% de cobertura de arquivos) |
| Dependências | 80 prod + 49 dev |

### Temas transversais mais graves

1. **Segurança de edge functions** — webhooks *fail-open* (processam POST anônimo), CORS *fail-open*, `service_role` expondo tabelas sensíveis, chaves-mestras entregues a qualquer usuário autenticado.
2. **Segredos versionados** — anon key/URL de produção e JWT `service_role` hardcoded em código, docs e `vercel.json`.
3. **Cadeia de migrations quebrada** — `CREATE POLICY IF NOT EXISTS` (sintaxe inexistente no PostgreSQL), 6 pastas de migrations concorrentes, SQL aplicado direto em produção fora da cadeia.
4. **Gates de qualidade decorativos** — ESLint/tsc/audit/E2E não bloqueiam o PR; suíte E2E inteira não roda em nenhum pipeline.
5. **Arquitetura híbrida incompleta** — migração feature-based parou em 6 features; domínios duplicados em `components/` e `features/`; ciclo de dependência de 92 arquivos no inbox.

---

## Achados por severidade

## 🔴 CRÍTICA

### 6 migrations usam CREATE POLICY IF NOT EXISTS — sintaxe que nao existe no PostgreSQL; cadeia de migrations falha no replay
- **Área:** Banco de dados e migrations (Tarefas 27-29)
- **Local:** `supabase/migrations/20260711_g1_vendas_creditos_trocas_rls.sql:11`
- **Categoria:** migrations/sql-invalido · **Esforço:** baixo
- **Problema:** PostgreSQL (qualquer versao, incl. PG15/17 do Supabase) nao suporta IF NOT EXISTS em CREATE POLICY. Ha 25 ocorrencias em 6 arquivos: 20260502_create_10_extra_tables.sql, 20260703155000_evo_rls_partitions_cron_fix.sql (dentro de EXECUTE format — falha em runtime do DO block), 20260705000002_rls_channel_connections_scoped.sql, 20260709164600_create_system_connections.sql, 20260710_rls_trigger_fix_and_tables.sql e 20260711_g1_vendas_creditos_trocas_rls.sql:11 ('CREATE POLICY IF NOT EXISTS "service_role_full" ON vendas.creditos ...'). O G1 e justamente o fix de RLS de vendas.creditos/trocas commitado como correcao de seguranca (commit 76ca7cf) — como o arquivo nao executa, ou o que rodou em producao foi outro SQL (drift repo vs banco), ou o fix nunca foi aplicado. Qualquer 'supabase db reset'/rebuild de DR aborta nesses pontos.
- **Recomendação:** Substituir por DROP POLICY IF EXISTS + CREATE POLICY, ou DO $$ ... EXCEPTION WHEN duplicate_object $$. Validar a cadeia inteira com 'supabase db reset' em container limpo e adicionar um job de CI que aplica todas as migrations em um Postgres efemero.

### Master key da Evolution API commitada em texto plano em 3 arquivos rastreados
- **Área:** Build, CI/CD e infraestrutura (T36-T38)
- **Local:** `INFRA.md:149`
- **Categoria:** seguranca · **Esforço:** baixo
- **Problema:** A chave mestre real da Evolution API está em texto plano no repositório: INFRA.md:149 ('AUTHENTICATION_API_KEY=2D10188F28DD94ACD5D18DFDB01BFB07'), docs/infra/evolution-stack.reconciled.yml:76 ('- AUTHENTICATION_API_KEY=2D10188F28DD94ACD5D18DFDB01BFB07' no bloco environment do stack) e infra/migrations/20260711_P0_fix_planned_postburnin.md:17. Todos confirmados via git ls-files como rastreados. Essa chave dá controle total da Evolution API (criar/deletar instâncias WhatsApp, enviar mensagens em qualquer conexão). O QA_REPORT_2026-07-11 documenta que a edge function evolution-credentials já entrega essa mesma master key a qualquer usuário autenticado — o commit em texto plano amplia o vazamento a qualquer pessoa com acesso de leitura ao repo e ao histórico git.
- **Recomendação:** Rotacionar a AUTHENTICATION_API_KEY imediatamente na VPS (Docker secret novo), remover a chave dos 3 arquivos substituindo por placeholder, e considerar reescrita de histórico (git filter-repo) ou tratar a chave antiga como comprometida em definitivo. Adicionar regra no .gitleaks.toml que detecte esse padrão em vez de só allowlistar paths.

### JWT service_role commitado no repo como 'exemplo' de VITE_SUPABASE_ANON_KEY
- **Área:** Documentacao e DX (T48-T50)
- **Local:** `docs/ENV_SETUP.md:27`
- **Categoria:** seguranca-docs · **Esforço:** medio
- **Problema:** A tabela de variaveis obrigatorias apresenta como valor de VITE_SUPABASE_ANON_KEY o token 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogInNlcnZpY2Vfcm9sZSIsCiAgImlzcyI6ICJzdXBhYmFzZSIs...' cujo payload decodifica para {"role": "service_role", "iss": "supabase", "iat": 1715050800, "exp": 1872817200}. Verifiquei por HMAC que a assinatura NAO corresponde ao JWT_SECRET demo do Supabase self-hosted ('your-super-secret-jwt-token-...'), e o par iat/exp e IDENTICO ao da anon key real de producao hardcoded em src/integrations/supabase/client.ts:16 — forte indicio de que e a service_role key REAL do supabase.atomicabr.com.br. Alem do vazamento, o doc instrui o dev a colocar esse valor numa var VITE_* que vai para o bundle do browser. O .gitleaks.toml nao tem allowlist para esse arquivo, mas a regra base evidentemente nao detectou.
- **Recomendação:** 1) Remover o token do doc imediatamente e substituir por placeholder; 2) tratar como incidente: rotacionar o JWT_SECRET do Supabase self-hosted (invalida anon+service_role) ja que o valor esta no historico git; 3) adicionar regra gitleaks especifica para JWTs com payload role=service_role; 4) reescrever a linha deixando claro que a anon key vem do painel do VPS.

### external-db-proxy permite invocar QUALQUER RPC do banco externo com service_role
- **Área:** Segurança das Edge Functions Supabase (supabase/functions/ — Tarefas 22-24: autenticação, webhooks, service_role/CORS/rate-limit)
- **Local:** `supabase/functions/external-db-proxy/index.ts:351`
- **Categoria:** service-role-rls-bypass · **Esforço:** baixo
- **Problema:** O ramo de RPC só valida o formato do identificador (isSafeIdent), sem allowlist: `if (action === 'rpc' && rpc) { if (!isSafeIdent(rpc)) return ...; const { data, error } = await supabase.rpc(rpc, params) }` (linhas 351-358). O client é criado com SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY e a função só exige requireUser (linha 260) — ou seja, QUALQUER usuário autenticado (inclusive agent de baixo privilégio) pode chamar qualquer função do banco (incluindo SECURITY DEFINER e RPCs administrativas) com parâmetros arbitrários, contornando os GRANTs de EXECUTE e toda a RLS. É escalada de privilégio direta.
- **Recomendação:** Aplicar allowlist explícita de nomes de RPC permitidos (RPC_WHITELIST), análoga ao SCHEMA_TABLE_WHITELIST já existente para SELECT. Rejeitar qualquer rpc fora da lista com 403.

## 🟠 ALTA

### Ciclo de dependência de 92 arquivos em features/inbox via imports do próprio barrel
- **Área:** Arquitetura e organização do código (src/)
- **Local:** `src/features/inbox/index.ts:1`
- **Categoria:** dependencia-circular · **Esforço:** medio
- **Problema:** Análise do grafo de imports (Tarjan SCC sobre 1.415 módulos) encontrou um componente fortemente conexo de 92 arquivos abrangendo features/inbox (components, hooks, services), src/adapters/evolutionAdapter.ts e 6 hooks globais (useExternalEvolution.ts, useAudioPlayer.ts, etc.). Causa raiz: 61 arquivos DENTRO de features/inbox importam do próprio barrel — ex.: src/features/inbox/components/FailureCategoryFilter.tsx:12 `import type { FailureCategory } from '@/features/inbox'` e src/features/inbox/components/ai-tools/useAnalysisTts.ts:2 `import { playTtsAudio ... } from '@/features/inbox'`. O index.ts faz `export * from './components'` etc., fechando o ciclo barrel→components→barrel. Há mais 7 ciclos menores: features/auth (11 arquivos, via useWebAuthn.ts), features/admin (10 arquivos), features/connections/hooks/parts (3), onboarding (3), src/hooks/useMessages.ts↔src/lib/inbox/chatOptimizations.ts (2), shortcuts (2).
- **Recomendação:** Proibir import do próprio barrel dentro de cada feature (regra no-restricted-imports por feature apontando para '@/features/<nome>' dentro de src/features/<nome>/**) e converter os 61 imports para caminhos relativos. Quebrar o ciclo hooks globais↔inbox movendo useExternalEvolution/useAudioPlayer para dentro da feature ou extraindo os tipos compartilhados para src/features/inbox/types.

### Aliases @/admin, @/auth, @/connections, @/inbox, @/sla existem no tsconfig mas não no Vite — armadilha de build
- **Área:** Arquitetura e organização do código (src/)
- **Local:** `tsconfig.json:22`
- **Categoria:** configuracao-morta · **Esforço:** baixo
- **Problema:** tsconfig.json e tsconfig.app.json definem paths `"@/admin": ["./src/features/admin"]`, `"@/auth"`, `"@/connections"`, `"@/inbox"`, `"@/sla"`, mas vite.config.ts:126-128 só define `"@": path.resolve(__dirname, "./src")` (idem vitest.config.ts:56-58). Hoje há 0 imports usando esses aliases (grep em todo src/), então são código morto — porém se qualquer dev usar `from '@/inbox'` o TypeScript/IDE aceita e o build Vite quebra em runtime (resolveria para src/inbox, inexistente). A regra ESLint de boundary (eslint.config.js:58) até referencia esses aliases mortos ('@/admin/**', '@/inbox/**' etc.).
- **Recomendação:** Remover os 5 aliases de features dos dois tsconfigs e da regra ESLint, OU adicioná-los ao resolve.alias do vite.config.ts e vitest.config.ts para torná-los funcionais. Escolher um caminho e alinhar as três configurações.

### Regra 'INBOX READ CONTRACT' do ESLint aponta para diretórios inexistentes — contrato sem enforcement
- **Área:** Arquitetura e organização do código (src/)
- **Local:** `eslint.config.js:79`
- **Categoria:** enforcement-morto · **Esforço:** baixo
- **Problema:** O bloco em eslint.config.js:78-84 aplica a restrição de leitura via Evolution API aos globs `src/components/inbox/**`, `src/hooks/inbox/**` e `src/pages/Inbox*.{ts,tsx}`. Nenhum desses caminhos existe: src/components/inbox e src/hooks/inbox não existem (ls confirma), e as páginas reais estão em `src/pages/inbox/InboxPage.tsx` (diretório minúsculo, não casa com `src/pages/Inbox*`). O código do inbox migrou para src/features/inbox, que NÃO é coberto pela regra. Resultado: a proibição de `evolution-api/**/find*` para popular UI (docs/INBOX_READ_CONTRACT.md) não é verificada em lugar nenhum e violações podem ser reintroduzidas silenciosamente.
- **Recomendação:** Atualizar os globs para `src/features/inbox/**/*.{ts,tsx}` e `src/pages/inbox/**/*.{ts,tsx}` e rodar o lint para verificar se o contrato ainda é cumprido pelo código migrado.

### 80 migrations fora do padrao de timestamp geram versoes duplicadas que colidem na PK de schema_migrations
- **Área:** Banco de dados e migrations (Tarefas 27-29)
- **Local:** `supabase/migrations/20260711_400000_febesync_missing_stubs.sql`
- **Categoria:** migrations/versionamento · **Esforço:** medio
- **Problema:** 80 arquivos usam prefixo de 8 digitos (20260501_*, 20260502_*, 20260702_* ... 20260711_*): 26 arquivos compartilham a versao '20260711', 20 a '20260710', 15 a '20260502'. Alem disso ha 10 pares com timestamp de 14 digitos IDENTICO: 20260710250000 (hora 25 — invalida) usado por evo_401_glitchtip_feed e r13_adversarial_validation; 20260705000001 usado por add_instance_name_to_whatsapp_connections E security_revoke_anon_and_security_invoker; idem 20260704130000, 20260703210000, 20260702190000. O supabase CLI grava a versao (prefixo numerico) como chave em supabase_migrations.schema_migrations — versoes duplicadas quebram db push/reset e impedem rastrear o que foi aplicado.
- **Recomendação:** Renomear os 80 arquivos para timestamps unicos de 14 digitos preservando a ordem intencional (usar git log para datar), e adicionar check de CI que rejeita nomes fora de ^\d{14}_ e prefixos duplicados.

### Regressao: rls_auto_enable() redefinida SECURITY DEFINER sem SET search_path — e na ordem de replay ela sobrescreve o proprio fix
- **Área:** Banco de dados e migrations (Tarefas 27-29)
- **Local:** `supabase/migrations/20260710_rls_trigger_fix_and_tables.sql:34`
- **Categoria:** seguranca/search_path · **Esforço:** baixo
- **Problema:** 20260710_rls_trigger_fix_and_tables.sql:34-37 faz 'CREATE OR REPLACE FUNCTION rls_auto_enable() RETURNS event_trigger ... SECURITY DEFINER' SEM search_path. O fix existe em 20260710_rls_auto_enable_searchpath.sql ('versao definitiva v3', com SET search_path = public, pg_catalog), mas lexicograficamente 'rls_auto_enable_searchpath' < 'rls_trigger_fix_and_tables', entao no replay da cadeia o fix roda PRIMEIRO e a versao vulneravel roda DEPOIS, deixando como estado final uma funcao de event trigger (executa em todo CREATE TABLE) SECURITY DEFINER sem search_path fixado. CREATE OR REPLACE tambem reseta o proconfig aplicado pelo sweep 20260529120000. Problema conhecido do FALHAS_E_GAPS (item 2 do Top 10, dado como resolvido) — reaberto por esta migration: categoria regressao/pendente.
- **Recomendação:** Renomear os dois arquivos com timestamps completos que garantam a ordem correta (fix por ultimo) ou adicionar migration nova re-aplicando a v3 com search_path; incluir a query de verificacao 'prosecdef AND proconfig sem search_path' no CI.

### Nenhuma migration cria o EVENT TRIGGER que ativa rls_auto_enable — a protecao auto-RLS existe apenas no banco vivo
- **Área:** Banco de dados e migrations (Tarefas 27-29)
- **Local:** `supabase/migrations/20260710_rls_auto_enable_searchpath.sql:14`
- **Categoria:** drift/reproducibilidade · **Esforço:** baixo
- **Problema:** grep -ri 'CREATE EVENT TRIGGER' em supabase/, db/ e scripts/ retorna ZERO ocorrencias. As migrations definem a funcao rls_auto_enable() (3 versoes) e varios arquivos dependem dela (20260710_validation_round_fixes.sql:53 diz 'o trigger rls_auto_enable protege RLS'), mas o CREATE EVENT TRIGGER que a vincula ao DDL foi executado out-of-band direto em producao. Num rebuild a partir do repo, tabelas novas NAO ganham RLS automatico, invalidando a premissa de varios sentinels (20260711_security_surface_sentinel.sql conta rowsecurity=false como breach).
- **Recomendação:** Adicionar migration com CREATE EVENT TRIGGER trg_rls_auto_enable ON ddl_command_end WHEN TAG IN ('CREATE TABLE','CREATE TABLE AS','SELECT INTO') EXECUTE FUNCTION rls_auto_enable(); (idempotente via DROP EVENT TRIGGER IF EXISTS).

### Stubs de 2026-07-11 criam email_signatures, email_drafts e email_revalidation_jobs (PII de e-mail) sem ENABLE RLS e sem policies
- **Área:** Banco de dados e migrations (Tarefas 27-29)
- **Local:** `supabase/migrations/20260711_400000_febesync_missing_stubs.sql:21`
- **Categoria:** seguranca/rls · **Esforço:** baixo
- **Problema:** O arquivo cria public.email_signatures (linha 21), public.email_drafts (linha 40 — to_emails, cc_emails, subject, body_html: conteudo de rascunhos de e-mail) e public.email_revalidation_jobs (linha 60) com CREATE TABLE IF NOT EXISTS, mas nao contem nenhum ALTER TABLE ... ENABLE ROW LEVEL SECURITY nem CREATE POLICY (grep no arquivo acha apenas GRANT EXECUTE de funcoes). Nenhuma outra migration cobre essas tabelas (grep global: so 3 arquivos citam email_drafts, nenhum habilita RLS em public.*). O proprio cabecalho diz que o objetivo e 'permitir supabase db reset limpo' — mas o reset produz tabelas de PII sem RLS, contrariando a baseline '155/155 tabelas com RLS' do FALHAS_E_GAPS. Mesmo padrao em 20260502_create_missing_tables.sql (avatars, conversation_summaries, email_templates, salespeople) e 20260502_edge_function_tables.sql (message_queue, messages_whatsapp, system_logs).
- **Recomendação:** Adicionar ENABLE ROW LEVEL SECURITY + policies por account_id/user_id (email_drafts.account_id ja existe) na propria migration de stub; auditar as 8 tabelas de 20260502_* com a mesma lacuna.

### db/** contem SQL aplicado direto em producao fora da cadeia de migrations — estado do banco nao e reproduzivel pelo repo
- **Área:** Banco de dados e migrations (Tarefas 27-29)
- **Local:** `db/remediation/APPLIED_2026-07-03.sql:2`
- **Categoria:** drift/fonte-de-verdade · **Esforço:** medio
- **Problema:** db/remediation/APPLIED_2026-07-03.sql declara 'APLICADO EM PRODUCAO ... Executado via MCP (supabase_db_query) + psql no container' e contem ALTER DATABASE postgres SET effective_cache_size/work_mem, autovacuum por tabela e indices CONCURRENTLY; db/2026-07-04_s4-4_analytics_retention.sql cria funcao + job pg_cron como supabase_admin; db/parity/2026-07-04_parity_hardening.sql religa triggers de seguranca (sanitize_reset_request, rate-limit); db/security/2026-06-30_anon_hardening_FULL.sql revogou anon de 342 relacoes. NADA disso existe em supabase/migrations — sao 13 arquivos SQL de mudancas reais de producao vivendo em 4 subpastas paralelas (ci/, parity/, remediation/, security/). Quem reconstruir o banco pela pasta canonica perde tuning, cron jobs, triggers e hardening.
- **Recomendação:** Definir por escrito supabase/migrations como unica fonte de verdade; portar os efeitos permanentes de db/** para migrations numeradas (tuning via ALTER DATABASE e cron.schedule sao migraveis) e manter db/** apenas como registro historico read-only com aviso no README.

### Headers de segurança do nginx nunca são emitidos (herança de add_header) e não há CSP/HSTS em nenhum ambiente
- **Área:** Build, CI/CD e infraestrutura (T36-T38)
- **Local:** `nginx.conf:16`
- **Categoria:** infra/seguranca · **Esforço:** baixo
- **Problema:** Em nginx, add_header definido num bloco filho DESCARTA todos os add_header herdados do nível server. Em nginx.conf, os headers de segurança estão no nível server (linhas 16-19: X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy), mas TODOS os locations redefinem add_header (linha 24 /healthz, 29 /version.json, 36 /assets/, 41 '/'). Como toda request casa com algum desses locations, os headers de segurança nunca chegam ao cliente — inclusive o index.html servido pelo location '/'. O mesmo bug existe em nginx-prod.conf (headers nas linhas 30-32, sobrescritos nas linhas 37/44-45/52). Além disso, não existe Content-Security-Policy nem HSTS em nenhum dos dois nginx nem no vercel.json (que não tem bloco "headers").
- **Recomendação:** Repetir os headers de segurança dentro de cada location que define add_header (ou usar include security-headers.conf em cada bloco), adicionar CSP e HSTS (este pode ficar no Traefik, mas deve estar documentado), e adicionar bloco "headers" no vercel.json para o deploy Vercel.

### nginx-prod.conf cacheia sw.js/workbox por 1 ano immutable — quebra atualização do PWA no deploy VPS
- **Área:** Build, CI/CD e infraestrutura (T36-T38)
- **Local:** `nginx-prod.conf:35`
- **Categoria:** infra · **Esforço:** baixo
- **Problema:** nginx-prod.conf:35 aplica 'expires 1y' + 'Cache-Control: public, immutable' via regex 'location ~* \.(js|css|...)$', que casa com QUALQUER .js — incluindo /sw.js, /registerSW.js e workbox-*.js gerados pelo vite-plugin-pwa na raiz do dist (não são hasheados). Um service worker cacheado como immutable por 1 ano impede o navegador de descobrir novas versões do app, anulando o registerType 'autoUpdate' e o ServiceWorkerUpdateBanner citado em vite.config.ts:84. O nginx.conf (Docker) não tem esse bug: só cacheia /assets/ (linha 33) e o resto cai em no-cache. Divergência real entre os dois alvos de deploy.
- **Recomendação:** No nginx-prod.conf, restringir o cache 1y ao path /assets/ (como no nginx.conf) e adicionar location explícito para sw.js/registerSW.js com Cache-Control: no-cache. Idealmente unificar os dois confs num include comum para eliminar drift futuro.

### Build Docker provavelmente falha fora da Lovable: frozen-lockfile contra registry privado GAR (931 pacotes)
- **Área:** Build, CI/CD e infraestrutura (T36-T38)
- **Local:** `Dockerfile:7`
- **Categoria:** ci-cd · **Esforço:** medio
- **Problema:** Dockerfile:7 roda 'bun install --frozen-lockfile', mas o bun.lock aponta 931 pacotes para o registry privado da Lovable (europe-west1/west4-npm.pkg.dev/lovable-core-prod/sandbox-npm-cache/...), confirmado via grep no bun.lock. O próprio ci.yml:41-44 admite que "bun install --frozen-lockfile always fails on CI (registry credentials unavailable)". O deploy-vps.yml builda essa mesma imagem em runner GitHub (docker/build-push-action, linha 52) — ou seja, o caminho oficial de deploy para produção VPS tende a falhar no passo de install, ou só funciona se o GAR permitir leitura anônima (não documentado). Agrava: deploy-vps.yml:90 usa 'docker compose pull zapp-web || true', que mascara falha de pull e sobe silenciosamente a imagem antiga.
- **Recomendação:** Regenerar o bun.lock contra o registry público npm (bun install --registry https://registry.npmjs.org) ou commitar um lockfile secundário para CI/Docker; remover o '|| true' do docker compose pull (falhar alto se a imagem nova não existir); registrar em DEPLOYMENT.md qual caminho de deploy está de fato funcional hoje.

### Gates de qualidade decorativos: ESLint, tsc, design-system, bun audit e secret-grep nunca falham o CI
- **Área:** Build, CI/CD e infraestrutura (T36-T38)
- **Local:** `.github/workflows/ci.yml:81`
- **Categoria:** ci-cd · **Esforço:** medio
- **Problema:** Em ci.yml, os steps ESLint (linhas 81-89), design-system (91-99), TypeScript (101-115), bun audit (284-292) e o grep de secrets (294-301) terminam todos com 'exit 0' ou apenas ::warning — nenhum bloqueia PR. quality-gate.yml repete o padrão para lint (l.33-43) e tsc (l.55-69). O typecheck advisory é justificado pelo problema do registry GAR, mas o efeito líquido é que NENHUM lugar do pipeline (nem o pre-commit, ver finding do lint-staged) impede merge de código com erro de lint ou de tipo. Só bloqueiam: ts-nocheck gate, unit tests, E2E, a11y e os guards do branch-protection-sentinel.
- **Recomendação:** Restaurar o typecheck como bloqueante após corrigir o lockfile GAR (é a causa raiz declarada); para o ESLint, criar baseline (ex.: eslint --max-warnings) e tornar erros novos bloqueantes, como já foi feito com ts-nocheck; fazer o secret-grep sair com exit 1 quando encontrar match.

### Anon key do Supabase segue hardcoded no vercel.json, contradizendo a política declarada em vite.config.ts
- **Área:** Build, CI/CD e infraestrutura (T36-T38)
- **Local:** `vercel.json:8`
- **Categoria:** regressao/pendente · **Esforço:** baixo
- **Problema:** Já apontado no QA_REPORT_2026-07-11 e ainda presente: vercel.json:8 embute o JWT anon completo ('VITE_SUPABASE_ANON_KEY': 'eyJhbGciOiJIUzI1NiIs...') do Supabase self-hosted, enquanto vite.config.ts:10-12 declara explicitamente que "a public anon key still grants API access, so it must come from the environment, never from the repo" e mantém o fallback vazio. Com o RLS hardening descrito no FALHAS_E_GAPS.md o risco direto é reduzido, mas a chave assinada HS256 com exp em 2029 fica pública para qualquer leitor do repo, e o gitleaks (semanal, continue-on-error) nunca vai bloquear.
- **Recomendação:** Mover VITE_SUPABASE_ANON_KEY para as env vars do painel Vercel e remover o bloco env do vercel.json (ou deixar só as flags não sensíveis). Rotacionar o JWT secret do Supabase self-hosted se a política for tratar a anon key como não-versionável.

### Scroll infinito e detecção de fim do chat ligados a contêiner que nunca rola
- **Área:** Componentes de domínio em src/components/ (exceto ui/) — Tarefas 6-8
- **Local:** `src/components/team-chat/TeamChatPanel.tsx:210`
- **Categoria:** correcao · **Esforço:** medio
- **Problema:** O onScroll do div externo (linha 210-219: `if (el.scrollTop < 100 && s.hasNextPage ...) s.fetchNextPage()`) está no contêiner `absolute inset-0 overflow-auto`, mas o conteúdo dele é `<div className="h-full w-full flex flex-col">` (linha 253) com a List do react-window em `absolute inset-0` (linha 281) — a List tem scroll PRÓPRIO e eventos de scroll não fazem bubble. O div externo nunca excede a própria altura, logo o handler nunca dispara: fetchNextPage (mensagens antigas) nunca é chamado em scroll-up, checkNearBottom nunca atualiza isNearBottomRef, e scrollToBottom em useTeamChatPanel.ts:114-117 (`scrollRef.current.scrollTo({top: scrollHeight})`) é no-op. grep confirma que fetchNextPage não é chamado em nenhum outro ponto do painel.
- **Recomendação:** Mover a lógica de scroll para a API do react-window v2 (onRowsRendered / listRef.scrollToRow) e remover o overflow-auto do contêiner externo, ou usar o elemento de scroll real da List como fonte dos eventos.

### Popover de conexões com texto invisível: text-foreground sobre bg-foreground
- **Área:** Componentes de domínio em src/components/ (exceto ui/) — Tarefas 6-8
- **Local:** `src/components/layout/ConnectionStatusIndicator.tsx:380`
- **Categoria:** ui · **Esforço:** baixo
- **Problema:** PopoverContent usa `className="w-72 border-border bg-foreground p-0"` (linha 380) e o conteúdo interno usa o MESMO token: linha 384 `text-xs font-semibold text-foreground` (título "WhatsApp — Conexões"), linha 484 `text-xs font-medium text-foreground` (nome da instância) e linha 533 `text-foreground/80`. Texto e fundo com o mesmo token = ilegível em qualquer tema. Provável aplicação mecânica da sugestão do design-system-audit (que recomenda trocar bg-black por bg-foreground) sem inverter os tokens de texto.
- **Recomendação:** Trocar o fundo para bg-popover (com text-popover-foreground) ou, se a intenção era popover invertido, usar text-background nos textos internos.

### Voltar para a página 1 do catálogo não refaz o fetch — exibe dados da página anterior
- **Área:** Componentes de domínio em src/components/ (exceto ui/) — Tarefas 6-8
- **Local:** `src/components/catalog/ExternalProductCatalog.tsx:112`
- **Categoria:** correcao · **Esforço:** baixo
- **Problema:** O effect de paginação é `useEffect(() => { if (isOpen && page > 0) doFetch(); }, [page])` (linhas 111-113). Ao clicar em ChevronLeft da página 2 para a 1 (page 1→0), o guard `page > 0` impede o fetch e a grade continua mostrando os produtos do offset 24 sob o rótulo "Página 1". O mesmo padrão existe em ExternalProductManagement.tsx:87-89 (`if (page > 0) fetchProducts(buildFilters())`).
- **Recomendação:** Remover o guard `page > 0` e usar um ref/flag para pular apenas o primeiro mount (ou consolidar tudo num único effect com [page, filtros]). Aplicar nos dois arquivos.

### Suíte inteira tests/ na raiz nunca é executada por nenhum runner
- **Área:** Código morto e duplicação (T44-T45)
- **Local:** `tests/e2e/security.spec.ts:1`
- **Categoria:** teste-orfao · **Esforço:** medio
- **Problema:** A pasta tests/ contém 15 arquivos de teste (security.spec.ts, smoke.spec.ts, critical-flows.spec.ts, webhooks.spec.ts, reliability.spec.ts, resilience.spec.ts, boot-recovery.spec.ts, 3 de whatsapp-reactions, fuzz/, tests/integration/regression-suite.test.ts e supabase-integration.test.ts). O vitest.config.ts:44 exclui explicitamente 'tests/**'; nenhum dos 3 playwright configs aponta para lá (testDir = './e2e' ou './src/tests/e2e'); nenhum script do package.json nem workflow referencia a pasta. O único consumidor é tests/run-pipeline.sh (ele próprio órfão), que chama 'bunx playwright test tests/e2e/critical-flows.spec.ts' com o config default cujo testDir é './src/tests/e2e' — resultaria em 'no tests found'. Testes de segurança e smoke que aparentam existir dão falsa confiança de cobertura.
- **Recomendação:** Decidir o destino: migrar specs úteis para e2e/ (vários já têm equivalente lá, ex.: critical-flows.spec.ts existe nas duas pastas) e deletar tests/ e run-pipeline.sh; ou registrar um config que os execute de fato.

### xlsx instalado via tarball de CDN sem hash de integridade no lockfile
- **Área:** Dependências (T46-T47)
- **Local:** `package.json:128`
- **Categoria:** seguranca/supply-chain · **Esforço:** medio
- **Problema:** package.json:128 declara "xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz". No bun.lock:2340 a entrada é `"xlsx": ["xlsx@https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz", { "bin": ... }]` — é a única entrada do lockfile SEM hash sha512 de integridade. Se o CDN for comprometido ou trocar o conteúdo da URL, o build (Dockerfile roda `bun install --frozen-lockfile`) instala código arbitrário sem detecção. O QA_REPORT_2026-07-11.md:18 já documenta que esse fetch de CDN causa travamento intermitente do `bun install` no ambiente. Além disso, deps por URL são invisíveis para `bun audit`/Dependabot.
- **Recomendação:** Migrar para o registro npm oficial do SheetJS suportado pela empresa ou vendorizar o tarball no repo (ou em registry interno) e referenciar com integridade; alternativamente substituir por exceljs (já sugerido no FALHAS_E_GAPS.md). No mínimo, verificar e registrar o hash do tarball.

### Node 20 pinado está em EOL desde 30/04/2026 e diverge de @types/node ^26
- **Área:** Dependências (T46-T47)
- **Local:** `.nvmrc:1`
- **Categoria:** infraestrutura · **Esforço:** baixo
- **Problema:** .nvmrc contém "20" e .github/workflows/apply-types-patch.yml:23 usa node-version: '20' — Node 20 saiu de manutenção em 30/04/2026 (auditoria em 12/07/2026), sem mais patches de segurança. Ao mesmo tempo, package.json:148 declara "@types/node": "^26.1.0" (resolvido 26.1.0 no lock), ou seja, o typecheck valida contra APIs de Node 26 que não existem no runtime 20. Não há campo "engines" no package.json. O Dockerfile usa bun 1.3 (não Node), então há 3 runtimes distintos declarados: Node 20 local, Node 20 em um workflow, bun 1.3.x no build.
- **Recomendação:** Atualizar .nvmrc e o workflow apply-types-patch para Node 22 ou 24 (LTS ativos), alinhar @types/node à versão real do runtime e adicionar campo "engines" ao package.json.

### bun audit: 52 vulnerabilidades (21 high); cópias antigas de dompurify (3.3.1/3.4.2) na árvore com advisories de XSS
- **Área:** Dependências (T46-T47)
- **Local:** `bun.lock:2640`
- **Categoria:** seguranca · **Esforço:** medio
- **Problema:** `bun audit` (executado nesta auditoria) reporta 52 vulnerabilidades: 21 high, 25 moderate, 6 low. A exposição com potencial de runtime: dompurify direto está em 3.4.11, mas bun.lock:2640 resolve "jspdf/dompurify": dompurify@3.3.1 e bun.lock:2548 resolve "@types/dompurify/dompurify": dompurify@3.4.2 — ambas dentro do range vulnerável (<=3.4.6) com ~16 advisories moderate/low de XSS/mXSS (ex.: GHSA-v2wj-7wpq-c8vv, GHSA-h8r8-wccr-v5f2). Como jspdf é importado dinamicamente (AdminTelemetriaPage.tsx:95), sua cópia aninhada de dompurify pode ir ao bundle. Os demais highs (lodash via wait-on/workbox-build GHSA-r5fr-rjxr-66jc, fast-uri, picomatch ReDoS, vite 8.0.14 aninhado do vitest, glob CLI) são de build/dev-time. FALHAS_E_GAPS.md já pedia audit — parcialmente atendido (supabase CLI 2.109.0 ok), mas o estado atual regrediu com novas advisories.
- **Recomendação:** Remover @types/dompurify (deprecated; dompurify >=3.2 embute tipos), adicionar override para forçar dompurify >=3.4.7 em toda a árvore, remover wait-on (não usado, elimina lodash/joi vulneráveis) e rodar bun audit no CI (workflow security.yml) com gate para highs em deps de produção.

### jspdf 4.2.1 viola o peerDependency de jspdf-autotable 5.0.2 (exige ^2||^3), mascarado por legacy-peer-deps
- **Área:** Dependências (T46-T47)
- **Local:** `package.json:101`
- **Categoria:** bug-risco · **Esforço:** baixo
- **Problema:** package.json pina "jspdf": "4.2.1" (linha 100) e "jspdf-autotable": "^5.0.2" (linha 101). No bun.lock:1654, jspdf-autotable@5.0.2 declara peerDependencies { "jspdf": "^2 || ^3" } — a major 4 é combinação não suportada pelo autor. O conflito só não aborta a instalação porque .npmrc contém `legacy-peer-deps=true`. O único consumidor é o export de PDF em src/pages/AdminTelemetriaPage.tsx:95-96 (`await import("jspdf")` + `autoTable(doc, {...})`), cujo erro é engolido por `catch { toast.error("Erro ao gerar PDF") }` — uma quebra de API do jspdf 4 falharia silenciosamente em produção sem stack trace.
- **Recomendação:** Fixar jspdf em ^3.x (última major suportada pelo autotable 5) ou aguardar/verificar release do autotable com suporte a jspdf 4; adicionar teste E2E ou smoke do export PDF real (os testes atuais mockam ambas as libs) e logar o erro capturado no catch.

### Bloco de override global com !important anula partes do design system (glow, blur, translucidez) e apaga o Badge 'subtle' em dark mode
- **Área:** Design system e componentes UI base (src/components/ui, tokens CSS, tailwind.config.ts) — Tarefas 4-5
- **Local:** `src/styles/components.css:159`
- **Categoria:** tema/regressao-visual · **Esforço:** medio
- **Problema:** O bloco 'GLOBAL OVERRIDE — Eliminação total de neblina/transparência' (linhas 159-197) faz: (1) '[class*="shadow-glow"] { box-shadow: none !important; }' — anula os 14 usos de shadow-glow em button.tsx:13, input.tsx:12 (variant glow), card.tsx, GenericEmptyState.tsx, Sidebar.tsx etc., que continuam declarando efeitos hover que nunca renderizam; (2) '.dark .bg-muted\/10 ... .bg-muted\/90 { background-color: hsl(var(--background)) !important; opacity: 1 !important; }' — o variant 'subtle' do Badge (badge.tsx:15, 'bg-muted/30') vira a MESMA cor do fundo da página em dark mode, ou seja, o chip desaparece visualmente; qualquer hover 'bg-muted/50' também some; (3) 'opacity: 1 !important' em .bg-background\/95 quebra as animações fade do DialogOverlay (dialog.tsx:22 usa bg-background/95 com fade-in/fade-out — declaração !important vence animação CSS na cascata), fazendo o overlay aparecer/sumir abruptamente; (4) '.border-primary\/10 ... { border-color: hsl(var(--primary)) !important }' transforma bordas sutis de 10-50% em borda primary 100% em todo o app.
- **Recomendação:** Remover o bloco de overrides globais e aplicar a decisão 'sem translucidez' na fonte: ajustar os tokens/classes dos próprios componentes (ex.: Badge subtle usar bg-muted sólido, DialogOverlay usar bg-background/80 real). Se o modo OLED opaco for uma feature, escopá-lo a uma classe opt-in (.oled) em vez de reescrever utilitários Tailwind com !important. Remover também as classes shadow-glow dos componentes ou reativar o efeito conscientemente.

### success-foreground e warning-foreground brancos falham WCAG AA (~2:1) em botões e em todos os toasts Sonner
- **Área:** Design system e componentes UI base (src/components/ui, tokens CSS, tailwind.config.ts) — Tarefas 4-5
- **Local:** `src/styles/tokens.css:103`
- **Categoria:** acessibilidade/contraste · **Esforço:** baixo
- **Problema:** Light mode: '--success: 142 76% 45%' com '--success-foreground: 0 0% 100%' dá contraste ~2,2:1 e '--warning: 38 100% 50%' com foreground branco dá ~2,0:1 (AA exige 4,5:1; nem AA-large de 3:1 passa). '--info: 214 100% 50%' fica em ~4,4:1, no limite. Em dark mode '--success: 142 90% 50%' com branco é ainda pior; só o warning dark foi corrigido ('--warning-foreground: 0 0% 5%'). O --destructive foi explicitamente escurecido para AA (comentário na linha 91), mas success/warning/info não. Impacto direto: Button variant 'success' (button.tsx:24), Button 'whatsapp' (text-primary-foreground sobre verde, button.tsx:19) e os toasts success/warning do Sonner (sonner.tsx:31-38, cujo comentário 'garante contraste WCAG AA (>= 4.5:1)' está factualmente errado).
- **Recomendação:** Escurecer --success para ~142 72% 29% e --warning para ~35 92% 33% no light mode (ou trocar o foreground para escuro como no warning dark), replicando o tratamento já dado ao --destructive. Validar com ferramenta de contraste os pares success/warning/info em light e dark.

### URL e anon key de producao hardcoded como fallback silencioso — regressao do fix #9 do FALHAS_E_GAPS e armadilha de onboarding
- **Área:** Documentacao e DX (T48-T50)
- **Local:** `src/integrations/supabase/client.ts:14`
- **Categoria:** regressao/pendente · **Esforço:** baixo
- **Problema:** FALHAS_E_GAPS.md item 9 marca 'JWT anon Supabase hardcoded em supabaseClient.ts' como CORRIGIDO ('le apenas de env'), mas client.ts:14-16 define SELF_HOSTED_URL='https://supabase.atomicabr.com.br' e SELF_HOSTED_ANON_KEY='eyJ...' e as linhas 54-64 caem nesse fallback sempre que o env esta ausente/placeholder OU quando a URL contem '.supabase.co'. Consequencia de DX: um dev novo que segue o README ('cp .env.example .env.local' com 'sua-anon-key-aqui') roda `bun run dev` e conecta SILENCIOSAMENTE no banco de PRODUCAO — o console ate confirma '[Supabase] Conectado: self-hosted (AtomicaBR)'. Nao ha nenhum aviso no README/ONBOARDING de que o default e producao.
- **Recomendação:** Remover o fallback hardcoded (falhar explicitamente sem env, como o proprio codigo ja sabe fazer via SENTINEL_HOST) ou, no minimo, exigir opt-in explicito (ex.: VITE_ALLOW_PROD_FALLBACK=true) e documentar em letras garrafais no README que sem .env o app aponta para producao.

### ENV_SETUP.md inteiro descreve o fluxo Lovable Cloud descontinuado e omite as vars mais usadas do backend atual
- **Área:** Documentacao e DX (T48-T50)
- **Local:** `docs/ENV_SETUP.md:34`
- **Categoria:** doc-desatualizada · **Esforço:** medio
- **Problema:** O guia manda configurar secrets em 'Lovable Cloud (Connectors -> Secrets)' (linha 34), diz que SUPABASE_URL/SERVICE_ROLE_KEY/LOVABLE_API_KEY 'sao injetados automaticamente' (linhas 49-50) e valida com curls para 'https://<project-ref>.supabase.co/functions/v1/...' (linhas 74-75). Porem INFRA.md:6-7 declara: 'BANCO CANONICO: supabase.atomicabr.com.br (self-hosted VPS). O projeto Lovable Cloud allrjhkpuscmgbsnmjlv foi DESCONTINUADO em 30/06/2026'. O doc tambem NAO menciona SELFHOSTED_SUPABASE_URL (79 usos via Deno.env.get), SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY (66 usos) e SELFHOSTED_SUPABASE_ANON_KEY (26 usos) — exatamente as variaveis que as edge functions atuais leem primeiro.
- **Recomendação:** Reescrever ENV_SETUP.md para o cenario self-hosted: onde configurar secrets das edge functions no VPS, listar as vars SELFHOSTED_*, WEBHOOK_SECRET, EVOLUTION_WEBHOOK_SECRET(S), CRON_SECRET, RESEND_API_KEY, WHATSAPP_CLOUD_*, e trocar os curls de validacao para supabase.atomicabr.com.br.

### Secao Deploy do README e docs/DEPLOYMENT.md descrevem deploy Lovable inexistente, contradizendo o DEPLOYMENT.md da raiz e o proprio README
- **Área:** Documentacao e DX (T48-T50)
- **Local:** `README.md:319`
- **Categoria:** doc-desatualizada · **Esforço:** baixo
- **Problema:** README.md:319-326 afirma 'O deploy e gerenciado automaticamente pelo Lovable' com 'Producao: https://pronto-talk-suite.lovable.app', enquanto o proprio README.md:12 diz 'Deploy: zapp.atomicabr.com.br' e o DEPLOYMENT.md da raiz (atual, 2026-07) descreve o fluxo real: Docker Swarm/Portainer + Dockerfile + nginx-prod.conf + workflow deploy-vps.yml. docs/DEPLOYMENT.md (308 linhas, linkado como 'Guia completo de deploy' no indice docs/README.md) ainda lista 'Producao: pronto-talk-suite.lovable.app | branch main' e todo o processo Lovable. Um dev/ops que siga o doc linkado no indice oficial fara deploy no lugar errado.
- **Recomendação:** Apagar ou arquivar docs/DEPLOYMENT.md (ou substituir o conteudo por um ponteiro para o DEPLOYMENT.md da raiz), corrigir a secao Deploy do README para o fluxo Docker Swarm/VPS e atualizar o indice docs/README.md.

### Suíte E2E principal (e2e/, 60 specs) não roda em nenhum pipeline
- **Área:** E2E e testes de acessibilidade (Tarefas 34-35)
- **Local:** `.github/workflows/ci.yml:222`
- **Categoria:** cobertura-e2e · **Esforço:** medio
- **Problema:** O job "E2E tests" do ci.yml roda `bun run test:e2e`, que usa o playwright.config.ts default com testDir=./src/tests/e2e — contém apenas app-boot.spec.ts (3 smoke tests herméticos sem backend). A suíte real em e2e/ (login, envio de mensagem, inbox, admin, reações) só roda via playwright.e2e.config.ts, que não é referenciado em nenhum dos 13 workflows (grep por 'playwright.e2e.config' só encontra package.json). O comentário no quality-gate.yml:93-99 admite que a suíte "pertence ao smoke pre-deploy", mas deploy-vps.yml não tem nenhum passo Playwright. Resultado: os fluxos críticos de login e envio de mensagem têm cobertura apenas sob execução manual.
- **Recomendação:** Criar job (agendado ou pre-deploy contra staging) que rode `playwright test --config=playwright.e2e.config.ts` com E2E_USER_EMAIL/PASSWORD via secrets, ao menos para um subconjunto smoke (auth.spec, send-message-cycle.spec, whatsapp-connection.spec).

### 14 specs dependem de login com data-testids inexistentes e credenciais fake — nunca podem passar
- **Área:** E2E e testes de acessibilidade (Tarefas 34-35)
- **Local:** `e2e/helpers/testHelpers.ts:13`
- **Categoria:** teste-morto · **Esforço:** medio
- **Problema:** testHelpers.login() usa `page.fill('[data-testid=email-input]')`, `[data-testid=password-input]` e `[data-testid=login-button]` — nenhum desses testids existe em src/ (verificado por grep exaustivo; a página de auth expõe apenas data-testid="auth-page" e ids #login-email). Além disso usa credenciais hardcoded test@zappweb.com/test123 e loginAs() usa admin@zappweb.com/admin123 etc. Dependem disso: teams-departments, teams-performance, teams-reactions(-advanced), teams-extended, teams-audit, teams-whisper-mode, teams-security-integration, chat-media, chat-advanced, chat-accessibility, chat-resilience-responsive, pipeline, inbox-scope (14 arquivos). Toda a cobertura E2E de team-chat, chat avançado e pipeline é fictícia — falha por timeout na primeira linha se executada.
- **Recomendação:** Reescrever testHelpers.login() para reutilizar loginViaUI() de e2e/fixtures/auth.ts (getByLabel + storageState) e remover as credenciais hardcoded; ou deletar os specs mortos até que existam usuários seed reais.

### Zero cobertura E2E do fluxo de criação de campanha
- **Área:** E2E e testes de acessibilidade (Tarefas 34-35)
- **Local:** `e2e`
- **Categoria:** cobertura-e2e · **Esforço:** medio
- **Problema:** Grep por 'campanha|campaign' em e2e/**/*.spec.ts retorna vazio. O QA_REPORT_2026-07-11 (item 8, useCampaignEditor.ts:157) registrou bug real de campanha ficando 'scheduled' sem data — exatamente o tipo de regressão que um E2E de campanha pegaria. Dos 3 fluxos críticos (login, enviar mensagem, criar campanha), campanha é o único sem nenhum spec.
- **Recomendação:** Criar spec e2e/campaign-create.spec.ts cobrindo: criar campanha TalkX, agendar, desligar agendamento (regressão do bug #8 do QA report) e validar status resultante.

### 21 data-testids usados em e2e/ não existem no src — asserções miram elementos fantasma
- **Área:** E2E e testes de acessibilidade (Tarefas 34-35)
- **Local:** `e2e/stickers.spec.ts:20`
- **Categoria:** teste-morto · **Esforço:** medio
- **Problema:** Cross-reference completo entre testids do e2e/ e do src/ mostra 21 ausentes: add-reaction-button, chat-message(s), chat-panel, chat-input, email-input, inbox-search, login-button, media-bubble, message-input, message-error-status, password-input, pipeline-stage, reaction-badge, send-button, sticker-picker, sticker-drop-zone, toast, etc. Ex.: stickers.spec.ts:20 `[data-testid="sticker-picker"]`, waitForToast() em testHelpers.ts:54 `[data-testid=toast]`. Vários specs contornam com fallbacks ou .catch(), transformando as verificações em no-ops.
- **Recomendação:** Adicionar os data-testids nos componentes reais (MessageBubble, ChatInput, picker de stickers, toaster) ou migrar os seletores para roles/labels existentes; instituir verificação de paridade testid (script simples em CI).

### Import eager do barrel @/features/inbox funde toda a feature de inbox (e 4 vendors pesados) no chunk de entrada
- **Área:** Performance (T39 bundle, T40 listas/re-render, T41 realtime/polling/imagens)
- **Local:** `src/components/keyboard/GlobalKeyboardProvider.tsx:4`
- **Categoria:** bundle/tree-shaking · **Esforço:** baixo
- **Problema:** `import { audioPlaybackBus } from '@/features/inbox'` em componente montado eagerly pelo App.tsx puxa o barrel (src/features/inbox/index.ts: `export * from './components'|'./hooks'|'./services'|'./data-access'`). Evidência no build: o entry index-CZPRXC7c.js (2.484 KB / 700 KB gz) contém strings do ChatMessagesArea ('Criptografia de Ponta a Ponta') e ChatPanel, e faz imports ESTÁTICOS de vendor-charts (recharts, via src/features/inbox/components/monitoring/QueueMetricsDashboard.tsx:6 e chat/MessageStatusPanel.tsx:39), vendor-sip (sip.js, via hooks/sip/useSipConnection.ts:4 e useSipClient.ts:3), vendor-pdf e `import"./vendor-mapbox-*.js"` (side-effect sobrevive ao tree-shake do `export *` de LocationPicker). O index.html emite modulepreload para os 6 vendors: primeiro paint espera ~1,6 MB gzip / ~5,7 MB de JS parseado — 3,2x o budget de 500 KB. O lazy-loading cuidadoso de rotas/views (AppRoutes, lazyViews.ts) é anulado por esse único import.
- **Recomendação:** Trocar o import no GlobalKeyboardProvider pelo caminho profundo ('@/features/inbox/hooks/realtime/audioPlaybackBus'); adicionar regra no scripts/validate-barrels.ts proibindo import do barrel de features a partir de módulos do grafo eager (main/App/providers); converter os imports estáticos de recharts em QueueMetricsDashboard/MessageStatusPanel e de sip.js nos hooks para dynamic import; validar com `grep modulepreload dist/index.html` pós-build (só vendor-sentry/motion deveriam restar).

### Canal realtime re-assinado a cada mensagem nova, escutando UPDATE da tabela inteira evo.evolution_messages sem filtro
- **Área:** Performance (T39 bundle, T40 listas/re-render, T41 realtime/polling/imagens)
- **Local:** `src/features/inbox/components/chat/ChatMessagesArea.tsx:117`
- **Categoria:** realtime/supabase · **Esforço:** baixo
- **Problema:** O useEffect (linhas 117-135) tem dependência `[messages, queryClient]`: toda mudança no array de mensagens (cada mensagem recebida/enviada, poll de 5s com novidade) executa removeChannel + channel('chat-updates-shared') + subscribe — churn de join/leave no websocket por mensagem. A assinatura é `{ event: 'UPDATE', schema: 'evo', table: 'evolution_messages' }` SEM filtro: o servidor avalia e envia ao cliente todo UPDATE de toda mensagem da organização, e o handler roda `messages.some()` por evento e chama `queryClient.invalidateQueries({ queryKey: ['messages'] })` (invalidação ampla de todas as queries de mensagens).
- **Recomendação:** Assinar uma única vez por conversa com filtro (`filter: contact_id=eq.{id}` ou por remote_jid), manter os IDs visíveis em um ref (padrão já usado corretamente em useConversationReactionsRealtime.ts:21-51) e invalidar apenas a query da conversa afetada.

### Pipeline duplicado: useRealtimeMessages (fetch 500 contatos + 1000 mensagens + canal sem filtro) roda sempre, em paralelo ao polling de 5s do modo externo
- **Área:** Performance (T39 bundle, T40 listas/re-render, T41 realtime/polling/imagens)
- **Local:** `src/features/inbox/hooks/useInboxSource.ts:9`
- **Categoria:** realtime/polling-redundante · **Esforço:** medio
- **Problema:** `useRealtimeInbox.ts:23` fixa `USE_EXTERNAL_DB = true` (produção), mas `useInboxSource` chama `useRealtimeMessages()` incondicionalmente (linha 9) — só os setters de busca/filtro dele são usados (linha 24). Esse hook executa no mount: SELECT de 500 contatos + 1000 mensagens (useRealtimeMessages.ts:226-236) e assina INSERT/UPDATE/DELETE de evo.evolution_messages SEM filtro (linhas 273-300), mantendo um estado paralelo de conversas que a UI não exibe. Simultaneamente, useExternalEvolution polla conversas a cada 5s (linha 532) e mensagens da conversa aberta a cada 5s (linha 745). Resultado: cada cliente processa todo o tráfego realtime da organização + polling completo, dobrando carga no Postgres/Realtime e no main thread.
- **Recomendação:** Gate: `const localRealtime = useRealtimeMessages({ enabled: !useExternalDb })` (early-return interno sem fetch/subscribe); extrair o estado de busca/filtro para um hook leve separado. Alternativamente, usar o realtime filtrado como fonte e eliminar o poll de 5s.

### Dois módulos CORS compartilhados com allowlists contraditórias; validation.ts não inclui os domínios de produção
- **Área:** Qualidade das edge functions (T25: duplicação e tratamento de erro; T26: consistência, docs e funções mortas)
- **Local:** `supabase/functions/_shared/validation.ts:201`
- **Categoria:** consistencia/cors · **Esforço:** medio
- **Problema:** validation.ts (EXACT_ALLOWED_ORIGINS, linhas 201-215) só permite origens Lovable ('https://pronto-talk-suite.lovable.app', 'https://whats-your-line.lovable.app', previews) e localhost — nenhum domínio de produção (nexus.promobrindes.com.br, zapp.atomicabr.com.br). Para origem não permitida, getCorsHeaders (linha 248) devolve ACAO fixo 'https://pronto-talk-suite.lovable.app'. Já _shared/cors.ts tem allowlist com os domínios de produção promobrindes/atomicabr. validation.ts é usado por 26+ funções chamadas pelo browser (evolution-api, elevenlabs-tts, connection-test, webauthn, whatsapp-cloud-api, bitrix-api...). Com VITE_SUPABASE_URL=https://supabase.atomicabr.com.br (cross-origin real, confirmado em nginx-prod.conf:4), respostas dessas funções carregam ACAO de um domínio Lovable legado — se não houver rewrite no gateway (nenhum encontrado no repo), toda chamada browser de produção falharia em CORS.
- **Recomendação:** Unificar num único módulo CORS (manter cors.ts como fonte), adicionar os domínios de produção à allowlist única e fazer validation.ts reexportar de cors.ts. Remover o fallback hardcoded 'pronto-talk-suite.lovable.app'.

### _shared/cors.ts faz fail-open: origem não permitida recebe Access-Control-Allow-Origin: *
- **Área:** Qualidade das edge functions (T25: duplicação e tratamento de erro; T26: consistência, docs e funções mortas)
- **Local:** `supabase/functions/_shared/cors.ts:42`
- **Categoria:** seguranca/cors · **Esforço:** baixo
- **Problema:** getCorsHeaders: se a origem está na allowlist, ecoa a origem; senão retorna "'Access-Control-Allow-Origin': '*'" (linha 42). Ou seja, a allowlist é decorativa — qualquer origem consegue ler as respostas dos 6 consumidores (audio-transcribe, lgpd-scheduled-jobs, automation-suggest-reply, queue-rebalance, evolution-retry-metrics, nps-scheduler). O QA_REPORT já apontou CORS '*' pontual no ai-proxy (streaming); este é o mesmo padrão institucionalizado no helper compartilhado.
- **Recomendação:** No ramo de origem não permitida, omitir o header ACAO (ou devolver a primeira origem da allowlist), nunca '*'. Padrão fail-closed.

### 88 das 121 funções sem entrada em config.toml — webhooks públicos sem verify_jwt=false
- **Área:** Qualidade das edge functions (T25: duplicação e tratamento de erro; T26: consistência, docs e funções mortas)
- **Local:** `supabase/config.toml:6`
- **Categoria:** config/deploy · **Esforço:** medio
- **Problema:** config.toml declara verify_jwt para apenas 33 funções. Entre as 88 ausentes estão endpoints que PRECISAM ser públicos: gmail-webhook (push do Pub/Sub), elevenlabs-webhook, email-track-pixel e email-track-link (abertos por clientes de e-mail, sem JWT), sicoob-bridge, whatsapp-cloud-webhook-verify (challenge GET da Meta) e public-api. Como o default do deploy via Supabase CLI é verify_jwt=true, um deploy padrão dessas funções devolve 401 para os provedores externos e quebra silenciosamente os fluxos de tracking de e-mail e webhooks.
- **Recomendação:** Declarar explicitamente todas as funções no config.toml com o verify_jwt correto (falso para webhooks/tracking, true para o resto), e adicionar verificação em CI de que toda pasta em functions/ tem entrada correspondente.

### strict:true anulado por noImplicitAny:false — any implicito permitido em todo o src
- **Área:** Rigor TypeScript (Tarefas 30-31)
- **Local:** `tsconfig.app.json:30`
- **Categoria:** configuracao-typescript · **Esforço:** medio
- **Problema:** tsconfig.app.json declara "strict": true (linha 29) mas logo abaixo desliga as protecoes que importam: "noImplicitAny": false (30), "noImplicitReturns": false (31), "noUncheckedIndexedAccess": false (32). Com noImplicitAny off, qualquer parametro/variavel sem anotacao vira `any` silencioso — sem warning, sem cast visivel, sem contagem no grep de ': any'. O QA_REPORT_2026-07-11.md anuncia 'tsc --noEmit 0 erros' como selo de qualidade, mas esse 0 e obtido com a checagem mais importante desativada. O tsconfig.node.json, em contraste, usa strict puro sem excecoes — a fraqueza e exclusiva do codigo de aplicacao.
- **Recomendação:** Ligar noImplicitAny em tsconfig.app.json e corrigir os erros resultantes (nao foi possivel medir o volume neste ambiente por falta de node_modules; medir com `tsc --noEmit -p tsconfig.app.json --noImplicitAny` no CI). Em seguida avaliar noImplicitReturns e noUncheckedIndexedAccess como etapas separadas.

### safeClient (usado em 100 arquivos) apaga os types gerados do Supabase: tabela, RPC e retorno sem checagem
- **Área:** Rigor TypeScript (Tarefas 30-31)
- **Local:** `src/integrations/supabase/safeClient.ts:145`
- **Categoria:** type-safety-camada-dados · **Esforço:** medio
- **Problema:** executeQuery faz `supabase.from(table as any)` (linha 145) com `table: string` livre e devolve `result.data as T` (linha 154) com T generico nao verificado. executeRpc casta o client tipado para funcao de string: `(supabase.rpc as unknown as (name: string, params?: Record<string, unknown>) => ...)` (linha 189). Resultado: nas ~100 arquivos que usam safeClient, nome de tabela errado, RPC inexistente, coluna renomeada ou shape de retorno divergente compilam sem erro — o createClient<ExtendedDatabase> vira decoracao. O mesmo padrao existe em dbFrom (src/integrations/datasource/db.ts:63-66), que retorna builder sem generic de Database (`mapping.table as unknown as Parameters<SupabaseClient['from']>[0]`) e e usado em 70 arquivos — ali ao menos documentado no cabecalho como decisao consciente.
- **Recomendação:** Parametrizar safeClient por nome de tabela do ExtendedDatabase (`<T extends keyof ExtendedDatabase['public']['Tables']>`) e tipar executeRpc com `keyof Database['public']['Functions']` + fallback explicito para RPCs fora do gerado. Para o datasource, amarrar o retorno de dbList/dbGet aos shapes do rpcCatalog (que ja existem).

### 32 das 48 RPCs chamadas no codigo nao existem em types.ts nem em types-manual.ts — contrato so falha em runtime
- **Área:** Rigor TypeScript (Tarefas 30-31)
- **Local:** `src/hooks/evolution/v237Fallbacks.ts:70`
- **Categoria:** type-safety-camada-dados · **Esforço:** medio
- **Problema:** Comparando os 48 nomes distintos passados a rpc('...') no src com as 57 Functions do types.ts gerado, 32 nao sao tipadas em lugar nenhum: rpc_email_search_threads, rpc_email_token_status, rpc_list_messages, rpc_insert_message, rpc_get_contact, toda a familia rpc_dlq_* (7 RPCs), fn_safe_audit_log, reassign_overloaded_agents, etc. Elas so compilam porque passam por safeClient.rpc(string) ou por casts explicitos como em v237Fallbacks.ts:70-71: `'rpc_list_conversations' as unknown as Parameters<typeof client.rpc>[0], {...} as unknown as Parameters<typeof client.rpc>[1]` (padrao repetido nas linhas 80-81 e 90-91). types-manual.ts so estende Tables (linha 798 usa `GeneratedPublicSchema['Functions']` inalterado), entao o proprio workaround manual nao cobre Functions. Um rename de parametro (p_instance → p_instance_name) no banco passa despercebido ate produao.
- **Recomendação:** Regenerar types.ts garantindo que as functions do schema public sejam capturadas (verificar por que `supabase gen types` omitiu 32 RPCs em uso — provavel filtro de schema ou funcoes criadas fora de migrations), ou adicionar bloco Functions ao types-manual.ts com o mesmo processo documentado usado para Tables.

### SELECT via service_role expõe tabelas sensíveis (api_keys, profiles, channel_connections) contornando RLS
- **Área:** Segurança das Edge Functions Supabase (supabase/functions/ — Tarefas 22-24: autenticação, webhooks, service_role/CORS/rate-limit)
- **Local:** `supabase/functions/external-db-proxy/index.ts:203`
- **Categoria:** data-exposure · **Esforço:** medio
- **Problema:** O SCHEMA_TABLE_WHITELIST (linha 208, public = LOCAL_TABLES + EVOLUTION_TABLES) inclui tabelas sensíveis como 'api_keys' (linha 203), 'profiles', 'channel_connections', 'whatsapp_connections', 'gmail_accounts'. As leituras usam o client service_role (linha 394), então o filtro de RLS não se aplica: qualquer usuário autenticado consegue `{ schema:'public', table:'api_keys', select:'*' }` e dumpar TODAS as linhas, incluindo dados de outros usuários e possíveis chaves/segredos. A checagem de dono (created_by/user_id) nunca é aplicada.
- **Recomendação:** Remover tabelas sensíveis (api_keys, profiles, channel_connections, credential*) da whitelist de leitura; para as que precisam ser lidas pelo frontend, usar o client escopado no JWT do chamador (RLS-enforced) em vez do service_role, ou expor apenas via RPCs SECURITY DEFINER com filtro de dono.

### Master API key da Evolution entregue a qualquer usuário authenticated sem checagem de role
- **Área:** Segurança das Edge Functions Supabase (supabase/functions/ — Tarefas 22-24: autenticação, webhooks, service_role/CORS/rate-limit)
- **Local:** `supabase/functions/evolution-credentials/index.ts:83`
- **Categoria:** regressao/pendente · **Esforço:** baixo
- **Problema:** Após validar apenas que o JWT é de um usuário autenticado (auth.getUser, linha 83), a função retorna a api_key da Evolution no header X-Evolution-Key (linha 132) para QUALQUER authenticated — não há requireAdminOrSupervisor nem verificação de role. Um agent de baixo privilégio obtém a master key e pode falar direto com a Evolution API (criar/deletar instâncias, enviar em qualquer conexão). Achado já documentado em QA_REPORT_2026-07-11 (linha 71) e ainda não corrigido.
- **Recomendação:** Trocar a checagem por requireAdminOrSupervisor (ou role específico autorizado a operar a Evolution). Considerar não expor a key ao browser e sim proxiar as chamadas por edge function.

### Senha SIP compartilhada entregue a qualquer conta ativa
- **Área:** Segurança das Edge Functions Supabase (supabase/functions/ — Tarefas 22-24: autenticação, webhooks, service_role/CORS/rate-limit)
- **Local:** `supabase/functions/get-sip-password/index.ts:27`
- **Categoria:** regressao/pendente · **Esforço:** medio
- **Problema:** A função exige apenas requireUser + profile.is_active (linhas 17-25) e então retorna SIP_PASSWORD (linha 27-29) — uma senha compartilhada do PBX. Qualquer usuário ativo obtém a credencial e pode registrar-se no PBX / originar chamadas. Há rate limit (10/min) mas sem checagem de role/autorização granular. Achado já documentado em QA_REPORT_2026-07-11 (linha 73) e ainda presente.
- **Recomendação:** Restringir por role explícito de quem pode usar SIP; idealmente emitir credenciais SIP por-usuário em vez de uma senha compartilhada.

### evolution-webhook fail-open: processa POST anônimo quando nenhum secret está configurado
- **Área:** Segurança das Edge Functions Supabase (supabase/functions/ — Tarefas 22-24: autenticação, webhooks, service_role/CORS/rate-limit)
- **Local:** `supabase/functions/evolution-webhook/index.ts:119`
- **Categoria:** regressao/pendente · **Esforço:** baixo
- **Problema:** Quando WEBHOOK_SECRETS.length === 0 (nenhum EVOLUTION_WEBHOOK_SECRET(S)/WEBHOOK_SECRET setado), validateWebhook é null e o ramo else (linhas 119-122) apenas loga um warning e lê o body sem autenticar — aceitando qualquer POST. Como o gateway roda VERIFY_JWT=false, isso significa injeção de eventos forjados (mensagens/contatos falsos, drenagem de créditos de IA via chatbot). Note que STRICT_MODE (linha 38) só é aplicado DENTRO de validateWebhook, não cobre o caso de ausência total de secret. Já documentado em QA_REPORT_2026-07-11 (linha 72).
- **Recomendação:** Fail-closed: se WEBHOOK_SECRETS estiver vazio, retornar 503 (como faz o whatsapp-cloud-webhook em strict mode, linhas 168-178) em vez de processar anonimamente.

### Pipeline de envio de mensagens (nucleo do produto) tem zero teste que execute o codigo
- **Área:** Testes unitarios (T32-T33)
- **Local:** `src/features/inbox/hooks/realtime/messageSender.ts:1`
- **Categoria:** cobertura-critica · **Esforço:** medio
- **Problema:** messageSender.ts (491 linhas), externalMessageSender.ts, src/lib/sendIdempotency.ts (132 linhas), src/lib/sendFunctionRouter.ts (58), src/lib/evolutionSendRetry.ts (209) e src/lib/crossTabSendDedupe.ts (287) nao tem nenhum teste unitario. `grep -rn "messageSender|sendIdempotency|sendFunctionRouter|evolutionSendRetry"` nos testes retorna apenas TicketHistorySheet.audit-mapping.test.ts, que faz readFileSync do fonte e valida regex (`expect(src).toMatch(/audit_logs/)`) — nao executa uma linha do sender. useMessageQueueE2E.spec.tsx tem apenas 2 `it()` e cobre so a fila local. Bugs em idempotencia, retry ou dedupe cross-tab (mensagem duplicada/perdida para o cliente final) passam pelo gate de CI sem detecao.
- **Recomendação:** Criar testes unitarios reais para sendIdempotency, evolutionSendRetry, crossTabSendDedupe e sendFunctionRouter (logica pura, facil de testar) e um teste de integracao do messageSender com o client Supabase mockado cobrindo sucesso, erro de rede, retry e dedupe.

### 293 testes `expect(true).toBe(true)` que nunca falham inflam a suite (~13% placebo)
- **Área:** Testes unitarios (T32-T33)
- **Local:** `src/components/team-chat/__tests__/team-chat-comprehensive.test.ts:21`
- **Categoria:** teste-placebo · **Esforço:** medio
- **Problema:** team-chat-comprehensive.test.ts tem 219 casos com corpo `expect(true).toBe(true)` (ex.: linha 21 'SECURITY: team_messages INSERT requires authenticated user'), team-chat-security-gaps.test.ts tem 52, voip-security-gaps.test.ts tem 22. Sao comentarios disfarçados de teste — varios inclusive documentam gaps REAIS como passando: linha 40 'GAP: team_conversation_members INSERT allows any authenticated user to add anyone ... CRITICAL' e um assert verde. Somados aos 37 `it.skip`, 330 dos 2.539 casos (13%) nao verificam nada, e o numero '2.088 passed' do CI (ci.yml:145) e citado como evidencia de estabilidade em FALHAS_E_GAPS.md ('2.062 testes vitest passando').
- **Recomendação:** Converter os itens em issues/backlog e deletar os asserts triviais, ou transformar os casos verificaveis (politicas RLS, limites) em testes reais contra schema/fixtures. Adicionar regra de lint (ex.: eslint-plugin-vitest/no-standalone-expect + proibir expect(true)) para impedir regressao.

### Testes de seguranca (SSRF, path traversal, MIME injection) validam COPIAS inline, nao o codigo de producao
- **Área:** Testes unitarios (T32-T33)
- **Local:** `src/__tests__/security-simulations.test.ts:22`
- **Categoria:** drift-de-copia · **Esforço:** medio
- **Problema:** O arquivo (1.854 linhas, 237 its) declara na linha 22: 'Exact copy of the function in supabase/functions/_shared/schemas.ts' e reimplementa isSafeHttpsUrl, isSafeMediaCdnUrl, sanitizeStoragePath e buildMime dentro do proprio teste. Se alguem alterar a funcao real na edge function (ex.: afrouxar o bloqueio de IP privado em isSafeHttpsUrl), os 237 testes continuam verdes. O mesmo padrao ocorre em src/lib/__tests__/rateLimiter.test.ts, que reimplementa a classe RateLimiter 'extracted from evolution-webhook' com constantes proprias (RATE_LIMIT_MAX_EVENTS=300).
- **Recomendação:** Extrair essas funcoes para modulo compartilhado importavel pelos dois runtimes (ja existe supabase/functions/_shared e testes deno via deno-contract-tests.yml) e importar o codigo real nos testes; no minimo, adicionar um teste de paridade que compara o fonte da copia com o fonte de producao (como faz formatters.parity.test.ts).

### Boundary que cobre todas as views não reporta erro a lugar nenhum
- **Área:** Tratamento de erros e observabilidade (Tarefas 42-43)
- **Local:** `src/components/ui/error-boundary-retry.tsx:48`
- **Categoria:** observabilidade · **Esforço:** baixo
- **Problema:** componentDidCatch faz apenas `this.props.onError?.(error, errorInfo)` e agenda auto-retry — não chama log.error nem Sentry.captureException. O único uso é em ViewRouter.tsx:209-215, que NÃO passa onError (só moduleName e maxAutoRetries). Como esse boundary envolve todas as ~70 views do VIEW_MAP, um crash de render em qualquer view em produção é auto-retentado 2x e depois mostra fallback, sem nenhum registro: o SentryErrorBoundary raiz nunca é acionado (o erro é capturado antes) e React em build de produção não loga erros capturados por boundary.
- **Recomendação:** Em componentDidCatch, adicionar log.error(...) e Sentry.captureException(error, { extra: { componentStack, moduleName, retryCount } }) incondicionalmente; opcionalmente reportar também quando as tentativas se esgotam.

### Sourcemaps de produção gerados como 'hidden' mas nunca enviados ao Sentry/GlitchTip
- **Área:** Tratamento de erros e observabilidade (Tarefas 42-43)
- **Local:** `vite.config.ts:137`
- **Categoria:** observabilidade · **Esforço:** medio
- **Problema:** `sourcemap: mode === 'development' ? true : 'hidden'` gera os .map sem referência no bundle, mas não existe @sentry/vite-plugin no package.json (só @sentry/react 10.63.0) nem passo de sentry-cli/upload em nenhum dos 13 workflows (.github/workflows/deploy-vps.yml injeta VITE_SENTRY_DSN mas não faz upload). Resultado: todo stack trace que chega ao Sentry em produção é minificado (ex.: `t.render @ vendor-abc123.js:1:48291`), tornando o diagnóstico de erros de produção praticamente impossível.
- **Recomendação:** Adicionar @sentry/vite-plugin ao build de produção com SENTRY_AUTH_TOKEN via secret (GlitchTip suporta a API de upload de sourcemaps do sentry-cli), mantendo 'hidden' para não servir os .map publicamente.

### Session Replay com maskAllText:false num app de atendimento — conversas de clientes vazam para a ferramenta de erros
- **Área:** Tratamento de erros e observabilidade (Tarefas 42-43)
- **Local:** `src/lib/sentry.ts:47`
- **Categoria:** seguranca/privacidade · **Esforço:** baixo
- **Problema:** `replayIntegration({ maskAllText: false, blockAllMedia: false })` com `replaysOnErrorSampleRate: 1.0` significa que toda sessão com erro grava replay com TODO o texto visível: conversas de WhatsApp de clientes, telefones, e-mails, dados de contatos. O comentário na linha 49 diz "LGPD friendly" mas nenhum opt-out é implementado no beforeSend. Ironicamente o app tem módulo de compliance LGPD (LGPDComplianceView).
- **Recomendação:** Trocar para maskAllText: true e blockAllMedia: true (padrão do SDK), liberando seletivamente com a classe sentry-unmask apenas em elementos sem PII. Verificar também se o backend (GlitchTip, cf. docs/EVOLUTION_API_AUDIT_2026-07-05_sessao6) sequer processa envelopes de replay — se não, remover a integração elimina o risco e o overhead.

### Injeção de falha/latência de debug ativa no caminho de envio de produção
- **Área:** src/features/ (T9 estrutura de features, T10 auditoria das 3 maiores, T11 features abandonadas/incompletas)
- **Local:** `src/features/inbox/components/chat/useChatPanelHandlers.ts:146`
- **Categoria:** seguranca/robustez · **Esforço:** baixo
- **Problema:** Todo envio de mensagem executa `const { simulateLatency, shouldSimulateFailure } = await import('@/features/inbox/utils/simulateChatLatency'); await simulateLatency(); if (shouldSimulateFailure()) throw new Error('Falha simulada...')`. O utilitário lê as chaves localStorage 'debug_chat_latency' e 'debug_chat_failure_rate' sem nenhum guard de import.meta.env.DEV. Qualquer script/extensão/XSS que grave `debug_chat_failure_rate=1` faz 100% dos envios falharem em produção, e `debug_chat_latency` atrasa todos os envios silenciosamente — sem indicação na UI de que é modo debug.
- **Recomendação:** Envolver a simulação em `if (import.meta.env.DEV)` (ou remover do bundle de produção via define/tree-shake) e mover o utilitário para uma pasta de dev-tools.

### Pipeline legado local roda em paralelo mesmo com USE_EXTERNAL_DB hardcoded true
- **Área:** src/features/ (T9 estrutura de features, T10 auditoria das 3 maiores, T11 features abandonadas/incompletas)
- **Local:** `src/features/inbox/hooks/useInboxSource.ts:9`
- **Categoria:** eficiencia/codigo-morto · **Esforço:** alto
- **Problema:** `useRealtimeInbox.ts:23` define `const USE_EXTERNAL_DB: boolean = true` (hardcoded, sem env). Ainda assim, `useInboxSource` monta incondicionalmente `useRealtimeMessages()` (470 linhas): faz fetch de contatos + `dbFrom('messages').select('*').limit(RECENT_MESSAGES_LIMIT)` e assina 3 canais realtime (INSERT/UPDATE/DELETE) em cada mount do inbox, sendo que do resultado só se usam search/statusFilter/sendMessage/notificações. O modo externo (useExternalConversations) roda em paralelo, duplicando tráfego de rede e canais realtime na tela mais usada do app.
- **Recomendação:** Extrair search/filtros/notificações de useRealtimeMessages para hooks independentes e só montar a fonte de dados ativa; ou eliminar de vez o modo local se o FATOR X é definitivo (messageSender.ts legacy de 491 linhas, useMessages e messageService viram código morto).

### Login por Passkey continua quebrado (QA 2026-07-11 não corrigido)
- **Área:** src/features/ (T9 estrutura de features, T10 auditoria das 3 maiores, T11 features abandonadas/incompletas)
- **Local:** `src/features/auth/hooks/useAuthForm.ts:189`
- **Categoria:** regressao/pendente · **Esforço:** medio
- **Problema:** `handlePasskeyLogin` ainda usa `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })`, que apenas envia magic link e nunca cria sessão. Pior: o toast 'Autenticado com Passkey! Redirecionando...' está dentro de `if (error)` — sucesso é exibido somente quando há erro. Em seguida `navigate(nextPath)` leva a rota protegida sem sessão, que devolve o usuário ao /auth.
- **Recomendação:** Implementar fluxo real de sessão via WebAuthn (edge function que valida assinatura e retorna tokens) ou remover o botão de Passkey até isso existir; corrigir a inversão do toast.

### ProtectedRoute segue sem exigir AAL2 — 2FA cadastrado nunca é cobrado no login
- **Área:** src/features/ (T9 estrutura de features, T10 auditoria das 3 maiores, T11 features abandonadas/incompletas)
- **Local:** `src/features/auth/components/ProtectedRoute.tsx:29`
- **Categoria:** regressao/pendente · **Esforço:** medio
- **Problema:** O guard verifica apenas `user`, roles e `user_has_permission` via RPC; não há nenhuma chamada a `supabase.auth.mfa.getAuthenticatorAssuranceLevel()` no arquivo. Usuário com TOTP cadastrado entra com AAL1 (só senha) em todas as rotas — o fator extra é decorativo. Item documentado no QA_REPORT_2026-07-11 (seção Auth) e ainda presente.
- **Recomendação:** No ProtectedRoute (ou no AuthProvider), checar `currentLevel !== nextLevel` de getAuthenticatorAssuranceLevel e redirecionar para /2fa antes de liberar children.

### Race de troca rápida de conversa persiste em useMessages (features/inbox)
- **Área:** src/features/ (T9 estrutura de features, T10 auditoria das 3 maiores, T11 features abandonadas/incompletas)
- **Local:** `src/features/inbox/hooks/useMessages.ts:39`
- **Categoria:** regressao/pendente · **Esforço:** baixo
- **Problema:** `fetchMessages` faz `const mappedMessages = await messageService.getAllMessagesForContact(contactId); if (mountedRef.current) setMessages(...)` — o guard checa apenas se o componente está montado, não se `contactId` ainda é a conversa selecionada. Ao alternar conversas rapidamente, a resposta lenta da conversa anterior sobrescreve as mensagens da atual (agente pode responder o cliente errado). Flagrado no QA 2026-07-11 (linha 36) e não corrigido. Bônus: em `handleMessageDelete` (linha 83) a condição `deletedMessage.contact_id === contactId || deletedMessage.id` é sempre verdadeira — o `|| deletedMessage.id` anula o filtro por conversa.
- **Recomendação:** Capturar `const requestedId = contactId` antes do await e abortar o setMessages se `previousContactIdRef.current !== requestedId` (ou usar AbortController/React Query); remover o `|| deletedMessage.id`.

### Dashboard conta/filtra por contacts.queue_id, que é NULL::uuid hardcoded na view — métricas de fila eternamente 0
- **Área:** src/hooks/ — inventário, duplicação, padrões react-query e corretude (Tarefas 12-14)
- **Local:** `src/hooks/useDashboardQueries.ts:95`
- **Categoria:** correcao/dados · **Esforço:** medio
- **Problema:** useContactsPerQueueQuery (linha 95: `if (contact.queue_id && !contact.assigned_to)`) e useContactsQuery (linha 34: `.eq('queue_id', filters.queueId)`) leem contacts via dbFrom('contacts') → view public.contacts, cuja definição mais recente (supabase/migrations/20260703_critical_10_steps_fix.sql:207) expõe `NULL::uuid AS queue_id`. Resultado: waitingCount por fila e pendingConversations em useDashboardData (`!c.assigned_to && c.queue_id`) são sempre 0, e o filtro por fila retorna lista vazia. O próprio useQueues.ts:66-67 documenta o problema ('a contagem antiga era eternamente 0') e foi migrado para queue_positions, mas os hooks de dashboard não foram. Agrava: o INSTEAD OF trigger (20260705220000) grava NEW.queue_id em evo.evolution_contacts, ou seja, escrever funciona mas ler devolve sempre NULL.
- **Recomendação:** Migrar useContactsPerQueueQuery/useContactsQuery para queue_positions (mesma fonte do rpc_queue_sla_panel v2) ou expor ec.queue_id na view. De quebra, substituir o download da tabela contacts inteira a cada 15s por um RPC agregado.

### Race de troca rápida de conversa no initialFetch segue sem guard de jid (apontado no QA 2026-07-11, não corrigido)
- **Área:** src/hooks/ — inventário, duplicação, padrões react-query e corretude (Tarefas 12-14)
- **Local:** `src/hooks/useExternalEvolution.ts:584`
- **Categoria:** regressao/pendente · **Esforço:** baixo
- **Problema:** initialFetch (linhas 584-643) só checa mountedRef.current após o await do dedupedFetch; não verifica se remoteJid ainda é a conversa ativa. Ao trocar de contato com fetch em voo, a resposta atrasada da conversa anterior sobrescreve as mensagens da nova via applyReconciliation, e otimistas do contato anterior são preservadas (filtro por OPTIMISTIC_PREFIX, linha 626) — agente pode responder o cliente errado. Mesmo padrão persiste em src/features/inbox/hooks/useMessages.ts:36-52 (fetchMessages só checa mountedRef após await). Ambos listados no QA_REPORT_2026-07-11 (seção 'races de troca rápida de conversa') e ainda presentes.
- **Recomendação:** Capturar o jid no início do fetch e descartar a resposta se `jid !== previousJidRef.current` (ou usar AbortController por troca de jid, como já feito em loadOlder). Limpar otimistas ao trocar de jid.

### JWT anon hardcoded persiste como fallback (item #9 do FALHAS_E_GAPS marcado como corrigido)
- **Área:** src/lib, src/utils, src/services, src/adapters, src/shared (T15 duplicação / T16 qualidade dos módulos centrais)
- **Local:** `src/integrations/supabase/client.ts:15`
- **Categoria:** regressao/pendente · **Esforço:** baixo
- **Problema:** FALHAS_E_GAPS.md declara 'JWT anon hardcoded em supabaseClient.ts — CORRIGIDO — lê apenas de env', mas client.ts:15-16 contém SELF_HOSTED_ANON_KEY = 'eyJhbGciOiJIUzI1NiIs...' e a lógica das linhas 59-64 dá PRECEDÊNCIA ao valor hardcoded sobre VITE_SUPABASE_ANON_KEY sempre que a URL resolve para o self-hosted: `SUPABASE_URL === SELF_HOSTED_URL ? SELF_HOSTED_ANON_KEY : ...`. O mesmo JWT está duplicado em src/lib/selfHostedDiagnostics.ts:17 e vercel.json:8 (este último já apontado no QA_REPORT_2026-07-11). A chave é pública por design, mas contradiz a decisão registrada em vite.config.ts de nunca versionar a anon key e torna rotação da chave dependente de rebuild em 3 pontos.
- **Recomendação:** Remover o fallback hardcoded (ou movê-lo para build-time via env obrigatória com fail-fast), fazer selfHostedDiagnostics.ts importar SUPABASE_RESOLVED_ANON_KEY do client, e atualizar o status no FALHAS_E_GAPS.md que hoje afirma correção inexistente.

### Export CSV reimplementado sem a proteção anti formula-injection que lib/csvUtils já fornece
- **Área:** src/lib, src/utils, src/services, src/adapters, src/shared (T15 duplicação / T16 qualidade dos módulos centrais)
- **Local:** `src/hooks/useExportData.ts:43`
- **Categoria:** seguranca/duplicacao · **Esforço:** baixo
- **Problema:** lib/csvUtils.ts (v2.0) existe exatamente para isso: escapeCsvCell neutraliza prefixos de fórmula com `FORMULA_PREFIXES = /^[=+\-@\t\r]/` (linha 13). Porém useExportData.ts:43-50 reimplementa a montagem do CSV fazendo apenas `"${formatted.replace(/"/g, '""')}"` — sem neutralizar `=`, `+`, `-`, `@`. Dados controláveis pelo cliente final (push_name de contato WhatsApp, ex.: '=HYPERLINK(...)') viram fórmula executável no Excel de quem exporta. O mesmo padrão inline se repete em TalkXLiveMonitor.tsx, useAIUsageDashboard.ts e AdminTelemetriaPage.tsx (grep text/csv).
- **Recomendação:** Substituir a montagem inline por buildCsv/escapeCsvCell + downloadCsvFile de @/lib/csvUtils em todos os geradores de CSV; adicionar regra de lint proibindo `new Blob(...text/csv...)` fora de csvUtils.

### DEFAULT_INSTANCE='wpp2' roteia envios para instância LEGADA, contradizendo o registro central
- **Área:** src/lib, src/utils, src/services, src/adapters, src/shared (T15 duplicação / T16 qualidade dos módulos centrais)
- **Local:** `src/lib/whatsappAdapter.ts:57`
- **Categoria:** bug · **Esforço:** medio
- **Problema:** src/lib/constants/whatsappInstances.ts declara 'wpp2' como 'instância legada (1.8M msgs histórico até Maio 2026)' com DEFAULT_WHATSAPP_INSTANCE marcado @deprecated, e ACTIVE_WHATSAPP_INSTANCE = 'wpp_pink_test' (verificado 2026-07-03). Mesmo assim whatsappAdapter.ts:57 define `const DEFAULT_INSTANCE = 'wpp2'` e todos os sendText/sendMedia/sendAudio usam `params.instance ?? DEFAULT_INSTANCE` — envio sem instância explícita vai para a instância desativada. O literal 'wpp2' está hardcoded em 20+ arquivos fora do registro (useRealtimeInbox.ts:257 mark-as-read, RealtimeInboxView.tsx:187/202, externalMessageSender.ts:26, useSendProduct.ts:102, useDeliveryStats.ts:123, useIncomingCallBroadcast.ts:9...), anulando a 'fonte de verdade' documentada.
- **Recomendação:** Importar ACTIVE_WHATSAPP_INSTANCE (ou resolver dinamicamente via whatsapp_connections) em whatsappAdapter e nos demais call sites; banir o literal 'wpp2' via lint/grep no CI.

### Três módulos 'canônicos' concorrentes para telefone/JID em lib/ com semânticas divergentes
- **Área:** src/lib, src/utils, src/services, src/adapters, src/shared (T15 duplicação / T16 qualidade dos módulos centrais)
- **Local:** `src/lib/phoneUtils.ts:179`
- **Categoria:** duplicacao · **Esforço:** alto
- **Problema:** lib/ contém phoneUtils.ts (normalizePhone SEM DDI 55, valida DDD), jid.ts (toPhone COM DDI, sem validação de DDD) e formatters.ts (cleanPhone/formatBrazilianPhone, terceira variante). Divergências concretas: phoneUtils.toWhatsAppJID:182 gera sufixo `@c.us` enquanto jid.ts usa `@s.whatsapp.net` (formato Evolution v2) — payloads incompatíveis; toWhatsAppJID não tem NENHUM consumidor (dead code); formatBrazilianPhone('551187654321') → '(11) 8765-4321' mas phoneUtils.formatPhoneForDisplay do mesmo número → '(11) 98765-4321' (insere 9º dígito). Além disso, adapters/evolutionAdapter.ts:10 e lib/whatsappAdapter.ts:225 têm cada um seu próprio jidToPhone, e jid.ts — o módulo mais elaborado (branded types, 356 linhas) — é importado por exatamente 1 arquivo de produção (ContactTypeFilter.tsx), enquanto 37 call sites usam replace(/\D/g,'') ad hoc (useRealtimeInbox.ts:99, whatsappStatusService.ts:8, useChatMediaSending.ts:31, phone-input.tsx:50, ContactPhoneManager.tsx:44...).
- **Recomendação:** Eleger jid.ts+phoneUtils.ts como par canônico (JID/telefone), deletar toWhatsAppJID (@c.us) e formatBrazilianPhone, redirecionar os jidToPhone locais dos adapters para jid.toNumber, e migrar os call sites ad hoc gradualmente com regra de lint.

### Views admin acessiveis a qualquer usuario autenticado via ?view= — gate de role cobre so 6 de 74 views
- **Área:** src/pages/, App.tsx e roteamento (Tarefas 17-18)
- **Local:** `src/pages/ViewRouter.tsx:15`
- **Categoria:** seguranca/autorizacao · **Esforço:** medio
- **Problema:** VIEW_REQUIRED_ROLES (ViewRouter.tsx:15-24) gates apenas 6 views ('failed-messages','failed-auth-messages','search-insights','agents-ops','realtime-monitor','dispatch-errors-history'). Todas as demais views admin do VIEW_MAP sao renderizadas para qualquer usuario logado via /?view=<id>, enquanto as MESMAS paginas via rota de path exigem role: 'admin-connections' -> AdminConnectionsPage (rota /admin/connections exige ['admin'], AppRoutes.tsx:349), 'inbox-sync-status' (rota exige admin/supervisor), 'evo-api-health' (admin/dev), 'email-status' e 'email-audit' (admin/supervisor). O deep-link em useIndexNavigation.ts:57 aceita qualquer string sem validacao. O comentario 'Backend RPC/RLS remain the source of truth' mitiga vazamento de dados, mas a propria equipe tratou o caso analogo /debug/backend como FIX P0 (AppRoutes.tsx:213-216) — o mesmo criterio se aplica aqui.
- **Recomendação:** Expandir VIEW_REQUIRED_ROLES para espelhar os requiredRoles de sidebarNavConfig.ts (15 itens) e os guards das rotas de path equivalentes; idealmente derivar ambos de uma unica fonte (config compartilhada view-id -> roles) para impedir divergencia futura.

### Item de menu 'Pausas de Instancia' quebrado — pagina de 284 linhas existe mas nao esta mapeada no ViewRouter
- **Área:** src/pages/, App.tsx e roteamento (Tarefas 17-18)
- **Local:** `src/components/layout/sidebarNavConfig.ts:148`
- **Categoria:** bug/rota-orfa · **Esforço:** baixo
- **Problema:** sidebarNavConfig.ts:148 define { id: 'instance-pauses', label: 'Pausas de Instancia' } e o clique chama onViewChange('instance-pauses') (SidebarNavItem.tsx:59). Mas VIEW_MAP em ViewRouter.tsx (linhas 55-130) nao tem a chave 'instance-pauses', entao o usuario cai no FallbackView 'Este modulo esta em desenvolvimento' (ViewRouter.tsx:219-254). A pagina real src/pages/AdminInstancePausesPage.tsx (284 linhas) existe e esta exportada em lazyViews.ts:72, porem nunca e referenciada por nenhum roteador — codigo morto acessivel por um botao visivel.
- **Recomendação:** Adicionar 'instance-pauses': Views.AdminInstancePausesPage ao VIEW_MAP (e um gate de role adequado em VIEW_REQUIRED_ROLES), ou remover o item da sidebar e a pagina.

### Item de menu 'Bridge Status' cai em 'Em construcao' — view id nao existe no VIEW_MAP
- **Área:** src/pages/, App.tsx e roteamento (Tarefas 17-18)
- **Local:** `src/components/layout/sidebarNavConfig.ts:154`
- **Categoria:** bug/rota-orfa · **Esforço:** baixo
- **Problema:** sidebarNavConfig.ts:154 define { id: 'bridge-status', requiredRoles: ['admin','supervisor'] }, mas VIEW_MAP so tem 'bridge' (-> ConnectionsIntegrationsHub) e 'sicoob-bridge'. O clique chama setCurrentView('bridge-status') via AppShell.tsx:74 e renderiza o FallbackView 'Em construcao'. A pagina real AdminBridgeStatusPage existe apenas na rota /admin/bridge-status (AppRoutes.tsx:339), que o menu nunca aciona — o unico acesso funcional e o link hardcoded window.location.href em src/pages/admin/Connections.tsx:302.
- **Recomendação:** Mapear 'bridge-status' no VIEW_MAP para AdminBridgeStatusPage (adicionando o export em lazyViews.ts) ou fazer o item de menu navegar para /admin/bridge-status.

### Sidebar morta em 5 paginas standalone — cliques no menu nao navegam para lugar nenhum
- **Área:** src/pages/, App.tsx e roteamento (Tarefas 17-18)
- **Local:** `src/pages/SLADashboard.tsx:6`
- **Categoria:** bug/navegacao · **Esforço:** baixo
- **Problema:** SLADashboard.tsx, SLAHistory.tsx, SLAAlertHistory.tsx, SLAAlertPreferences.tsx e SendStatusBusDebug.tsx renderizam <Sidebar currentView={currentView} onViewChange={setCurrentView} /> onde setCurrentView e um useState local (ex.: SLADashboard.tsx:6 'const [currentView, setCurrentView] = useState(19'sla19')'). Como o <main> dessas paginas renderiza sempre o mesmo conteudo fixo, clicar em qualquer item da sidebar apenas muda o highlight local e NAO navega — o usuario fica preso em /sla, /sla/history etc. ate editar a URL manualmente. Contraste com AppShell.tsx que conecta a mesma Sidebar ao ViewRouter real.
- **Recomendação:** Nessas paginas, trocar onViewChange por navigate('/?view=' + viewId) (ou extrair um layout compartilhado StandalonePageShell que faca isso), eliminando o estado local falso.

### Rota /2fa continua inalcancavel e ProtectedRoute segue sem checar AAL2 (pendencia do QA_REPORT 2026-07-11)
- **Área:** src/pages/, App.tsx e roteamento (Tarefas 17-18)
- **Local:** `src/components/routing/AppRoutes.tsx:116`
- **Categoria:** regressao/pendente · **Esforço:** medio
- **Problema:** Ja apontado no QA_REPORT_2026-07-11.md linha 81 e ainda presente: a rota /2fa (AppRoutes.tsx:116) nao tem nenhum navigate/Link apontando para ela em todo o src (grep por '/2fa' retorna apenas a definicao da rota), e ProtectedRoute.tsx nao contem nenhuma verificacao de getAuthenticatorAssuranceLevel/AAL (grep por 'aal|assurance' sem resultados). Usuarios com MFA cadastrado nunca sao forcados a completar o segundo fator na navegacao.
- **Recomendação:** Implementar checagem de AAL no ProtectedRoute (supabase.auth.mfa.getAuthenticatorAssuranceLevel) redirecionando para /2fa quando nextLevel=aal2 e currentLevel=aal1, conforme ja recomendado no QA report.

## 🟡 MÉDIA

### Migração feature-based incompleta: domínios duplicados entre components/, hooks/ e features/
- **Área:** Arquitetura e organização do código (src/)
- **Local:** `src/components`
- **Categoria:** duplicacao-dominio · **Esforço:** alto
- **Problema:** Apenas 6 features foram migradas para src/features/ enquanto src/components/ mantém ~57 diretórios de domínio (agents, campaigns, catalog, chatbot, crm360, talkx, team-chat, whatsapp-flows...). Domínios existem nos dois lugares: connections (src/components/connections/ com 20 arquivos vs src/features/connections/), contacts (src/components/contacts/ com ~40 arquivos vs src/features/contacts/), e hooks de domínio duplicam a estrutura: src/hooks/admin/ (7 hooks) vs src/features/admin/hooks/ (13), src/hooks/sla/ vs src/features/sla/hooks/, src/hooks/connections/ vs src/features/connections/hooks/, src/hooks/team-chat/ vs src/features/inbox/hooks/team-chat/. Não há critério documentado de onde código novo de cada domínio deve entrar.
- **Recomendação:** Definir e documentar (CLAUDE.md/README de arquitetura) o destino canônico de cada domínio; migrar primeiro os pares já duplicados (connections, contacts, hooks de admin/sla) e congelar criação de novos diretórios de domínio em src/components/.

### Domínio team-chat fatiado em 3 lugares com componente acessando internals da feature inbox
- **Área:** Arquitetura e organização do código (src/)
- **Local:** `src/components/team-chat/TeamChatInputArea.tsx:7`
- **Categoria:** violacao-camadas · **Esforço:** medio
- **Problema:** O chat interno de equipe tem UI em src/components/team-chat/, hooks em src/features/inbox/hooks/team-chat/ e mais um hook em src/hooks/team-chat/. Os componentes furam o encapsulamento da feature: TeamChatPanel.tsx:23 importa `@/features/inbox/hooks/team-chat/useTeamMessageReactions` e :28 `@/features/inbox/components/MessageStatus` (deep imports). A regra ESLint de boundary só se aplica a arquivos em src/features/**, então components/ e pages/ podem fazer deep import livremente — no total há 13 deep imports de internals de features em src/pages/ (ex.: src/pages/failed-messages/FailedMessagesFilters.tsx:13-14 importando de @/features/admin/hooks/monitoring/) e vários em src/components/.
- **Recomendação:** Mover src/components/team-chat/ para src/features/inbox/components/team-chat/ (ou criar feature team-chat própria) e estender a regra no-restricted-imports de boundary para src/pages/** e src/components/** também.

### Duas implementações divergentes de useMessages coexistem
- **Área:** Arquitetura e organização do código (src/)
- **Local:** `src/hooks/useMessages.ts:85`
- **Categoria:** duplicacao-codigo · **Esforço:** medio
- **Problema:** src/hooks/useMessages.ts (295 linhas, assinatura posicional, lê evo.evolution_messages via RPC/dbList com realtime na tabela base, define sua própria interface Message) e src/features/inbox/hooks/useMessages.ts (158 linhas, assinatura por objeto {contactId, enabled}, usa messageService/messageRepository e Message de @/types/chat). Ambas estão em uso: a versão de src/hooks é importada por 2 arquivos e participa do ciclo com src/lib/inbox/chatOptimizations.ts; a da feature é exportada pelo barrel. Mesmo nome, contratos e fontes de dados diferentes — alto risco de um dev importar a errada e ler de fonte de dados divergente.
- **Recomendação:** Consolidar em uma única implementação (a da feature, que segue o read contract via repository) e deletar ou renomear a de src/hooks para deixar explícito o legado (ex.: useMessagesLegacyEvo) até a remoção.

### Feature importa página e camada hooks/ tem acoplamento bidirecional com features/
- **Área:** Arquitetura e organização do código (src/)
- **Local:** `src/features/admin/components/AdminView.tsx:14`
- **Categoria:** violacao-camadas · **Esforço:** medio
- **Problema:** Inversões de camada concretas: src/features/admin/components/AdminView.tsx:14 faz `import AdminQueuesPage from '@/pages/admin/AdminQueuesPage'` (feature→page, quando o fluxo deveria ser page→feature); src/components/layout/AppShell.tsx:7 importa ViewRouter de @/pages. Além disso a camada supostamente genérica src/hooks importa de features 69 vezes (ex.: src/hooks/useWebAuthn.ts entra no ciclo de features/auth) enquanto features/inbox importa de @/hooks 134 vezes — não existe direção definida entre hooks/ e features/.
- **Recomendação:** Mover AdminQueuesPage o conteúdo para dentro da feature admin (a página só monta a feature); estabelecer regra: src/hooks só pode conter hooks agnósticos de domínio (sem import de @/features), e hooks de domínio vivem na feature.

### God-files: 10 arquivos de produção entre 643 e 831 linhas concentrando lógica crítica
- **Área:** Arquitetura e organização do código (src/)
- **Local:** `src/hooks/useExternalEvolution.ts:1`
- **Categoria:** god-file · **Esforço:** alto
- **Problema:** Maiores arquivos não-teste/não-gerados: src/hooks/useExternalEvolution.ts (831 linhas, participa do ciclo de 92 arquivos), src/features/inbox/components/chat/ChatInputArea.tsx (820), src/pages/admin/Connections.tsx (757), src/hooks/useEmail.ts (723), src/pages/admin/AdminBridgeStatusPage.tsx (713), src/pages/AdminWebhookSecretStatusPage.tsx (696), src/pages/AdminWebhookEventsPage.tsx (673), src/lib/externalProxy.ts (673), src/pages/admin/AdminAutomationsPage.tsx (671), src/features/inbox/components/conversation-list/ConversationItem.tsx (643). Padrão recorrente: páginas admin monolíticas misturando fetch, estado e UI no mesmo arquivo, sem hooks/data-access extraídos.
- **Recomendação:** Priorizar quebra dos dois que cruzam camadas: useExternalEvolution.ts (dividir por operação: envio, mídia, presença) e ChatInputArea.tsx (já existe useChatPanelHandlers.ts como precedente de extração). Para páginas admin, extrair data-fetching para hooks em features/admin.

### Workflow schema-snapshot compara o banco vivo com snapshot congelado do Lovable (2026-05-02) e em formato diferente — guard de drift inoperante
- **Área:** Banco de dados e migrations (Tarefas 27-29)
- **Local:** `.github/workflows/schema-snapshot.yml:64`
- **Categoria:** ci/drift-guard · **Esforço:** medio
- **Problema:** O job usa como referencia supabase/migrations-snapshot/schema_public_full.sql (linha 64), um pg_dump do projeto Lovable Cloud allrjhkpuscmgbsnmjlv gerado em 2026-05-02 — projeto DESCONTINUADO em 30/06/2026 segundo supabase/config.toml. O lado 'live' e gerado por scripts/introspect-schema.sh (information_schema, formato proprio, sem pg_dump) — diff -u entre dois formatos distintos produz milhares de linhas mesmo com schemas identicos, e o step 'Falhar se houver divergencia' (linha 136-142) falharia sempre. Na pratica o guard so nao quebra porque pula quando PGHOST nao esta configurado (linha 35-37) — ou seja, protecao zero contra drift ha 2+ meses de atividade intensa (300+ migrations desde o snapshot).
- **Recomendação:** Regenerar a referencia a partir do VPS canonico com o MESMO gerador (introspect-schema.sh) e agendar refresh automatico; ou trocar por 'supabase db diff' contra a cadeia de migrations.

### Policies USING(true)/WITH CHECK(true) continuam sendo adicionadas em migrations novas de julho/2026
- **Área:** Banco de dados e migrations (Tarefas 27-29)
- **Local:** `supabase/migrations/20260711_g1_vendas_creditos_trocas_rls.sql:13`
- **Categoria:** regressao/pendente · **Esforço:** medio
- **Problema:** O FALHAS_E_GAPS lista '289 policies USING(true)' como pendencia conhecida, mas as migrations mais recentes continuam criando novas: 20260711_g1_vendas_creditos_trocas_rls.sql:13-18 cria 'auth_full_access ... FOR ALL TO authenticated USING (true) WITH CHECK (true)' em vendas.creditos e vendas.trocas (dados financeiros); 20260703120000_harden_vendas_financeiro_anon_leaks.sql:66 gera dinamicamente 'authenticated_all ... FOR ALL TO authenticated USING (true) WITH CHECK (true)' para todas as tabelas do schema vendas; 20260701120000_finalizacao_sync_zapp.sql:140 idem em zapp.inbox_custom_scopes. Total no historico: 274 USING(true) em 121 arquivos e 135 WITH CHECK(true) em 76 arquivos. O padrao 'single-org, anon revogado' mitiga, mas qualquer agente autenticado de baixo privilegio pode escrever em tabelas financeiras.
- **Recomendação:** Congelar o padrao: exigir role-check (has_role admin/manager) para INSERT/UPDATE/DELETE em schemas vendas/financeiro nas proximas migrations, e usar supabase/security/audit-rls-state.sql (ja existe e gera os ALTERs) como gate de release.

### Mesma migration commitada duas vezes com conteudo divergente (20260704130000 e 20260705000001), cada uma colidindo de versao com uma migration de seguranca
- **Área:** Banco de dados e migrations (Tarefas 27-29)
- **Local:** `supabase/migrations/20260705000001_add_instance_name_to_whatsapp_connections.sql:1`
- **Categoria:** migrations/duplicacao · **Esforço:** baixo
- **Problema:** 20260704130000_add_instance_name_to_whatsapp_connections.sql e 20260705000001_add_instance_name_to_whatsapp_connections.sql fazem o mesmo ALTER TABLE ADD COLUMN instance_name, mas divergem: a primeira usa DEFAULT NULL e nao cria indice; a segunda cria idx_whatsapp_connections_instance_name parcial. E cada uma compartilha o timestamp exato com outra migration nao relacionada (20260704130000_add_smart_assign_and_provider_rpcs.sql e 20260705000001_security_revoke_anon_and_security_invoker.sql), agravando a colisao de versoes do finding de versionamento.
- **Recomendação:** Remover uma das duas copias (manter a versao com indice), renumerar para timestamp unico e registrar no CHANGELOG qual foi de fato aplicada em producao.

### 24 funcoes SECURITY DEFINER cuja ULTIMA definicao no repo nao tem SET search_path — dependem do sweep dinamico de 20260529 para ficarem seguras
- **Área:** Banco de dados e migrations (Tarefas 27-29)
- **Local:** `supabase/migrations/20260502_create_rpc_functions.sql:1`
- **Categoria:** seguranca/search_path · **Esforço:** medio
- **Problema:** Analise da ultima definicao de cada funcao na ordem de replay: 24 funcoes SECURITY DEFINER (rpc_dlq_*, rpc_gmail_token_status, get_team_profiles, fn_safe_audit_log, on_role_change, search_knowledge_base, cleanup_old_data etc.) terminam sem search_path no texto. Elas so ficam protegidas porque 20260529120000_harden_security_definer_search_path.sql varre pg_proc e aplica ALTER FUNCTION dinamicamente — mas isso e fragil: qualquer CREATE OR REPLACE posterior reseta o proconfig (exatamente o que aconteceu com rls_auto_enable). Problema raiz conhecido do FALHAS_E_GAPS (Top 10 item 2, marcado como resolvido no banco vivo): categoria regressao/pendente no nivel do repo.
- **Recomendação:** Adicionar SET search_path = '' (ou public, pg_catalog) inline na definicao das 24 funcoes em uma migration de normalizacao, para que o texto canonico seja seguro sem depender do sweep; adicionar lint de migrations que rejeita SECURITY DEFINER sem search_path.

### quality-gate.yml duplica ci.yml quase por inteiro e usa bun-version: latest (não reproduzível)
- **Área:** Build, CI/CD e infraestrutura (T36-T38)
- **Local:** `.github/workflows/quality-gate.yml:26`
- **Categoria:** ci-cd · **Esforço:** medio
- **Problema:** quality-gate.yml e ci.yml disparam ambos em push/PR para main e rodam em duplicidade: bun install, lint advisory, tsc advisory, suíte unit completa (2.088 testes, 2x), playwright install --with-deps (~1GB, 2x) e E2E (2x). Além do custo de billing/tempo de fila, quality-gate.yml:26 usa 'bun-version: latest' enquanto ci.yml pina 1.3.3 — um bump do Bun pode quebrar um workflow e não o outro. O step 'Refactor guards' (l.45-52) ainda tem bug: 'status=$?' captura só o exit do check-data-layer.mjs, o texto do warning é copy-paste errado ('ESLint debt') e o 'exit 0' final torna o ratchet de data-layer não-bloqueante, contrariando o propósito de ratchet.
- **Recomendação:** Consolidar quality-gate.yml dentro de ci.yml (ou reduzi-lo a jobs exclusivos como fuzz/perf-budget), pinar bun-version 1.3.3 e decidir se os ratchets de dead-code/data-layer são bloqueantes — se sim, remover o exit 0.

### Scripts órfãos persistem: smoke:pre-deploy aponta para arquivo inexistente e workflow apply-chatpanel-fixes referencia script inexistente
- **Área:** Build, CI/CD e infraestrutura (T36-T38)
- **Local:** `package.json:31`
- **Categoria:** regressao/pendente · **Esforço:** baixo
- **Problema:** Já apontado no QA_REPORT_2026-07-11 e ainda presente: package.json:31 define 'smoke:pre-deploy': 'bash scripts/smoke-pre-deploy.sh', mas o arquivo não existe (ls confirma), e é citado como etapa oficial no DR_RUNBOOK. O workflow .github/workflows/apply-chatpanel-fixes.yml:15 roda 'node scripts/migrate-chatpanel.mjs', que também não existe — e é um workflow com 'permissions: contents: write' que faria commit+push direto na main se disparado. apply-types-patch.yml é outro one-shot já aplicado que permanece ativo com push direto na branch.
- **Recomendação:** Criar o smoke-pre-deploy.sh (há suíte e2e/ raiz que ele deveria orquestrar) ou remover o script e as referências; deletar apply-chatpanel-fixes.yml e apply-types-patch.yml (one-shots concluídos com permissão de escrita são superfície de risco desnecessária).

### Sourcemaps 'hidden' são publicados no dist e servidos publicamente pelo nginx
- **Área:** Build, CI/CD e infraestrutura (T36-T38)
- **Local:** `vite.config.ts:137`
- **Categoria:** seguranca · **Esforço:** baixo
- **Problema:** vite.config.ts:137 usa sourcemap: 'hidden' em produção — os .map são gerados em dist/assets/ sem referência nos .js (intenção declarada: consumo pelo Sentry). Porém o Dockerfile copia o dist inteiro para a imagem nginx ('COPY --from=builder /app/dist /usr/share/nginx/html') e o nginx.conf serve /assets/ com 'try_files $uri =404' — qualquer um que derive a URL (nome do .js + '.map', padrão previsível) baixa o código-fonte completo da aplicação. Não há step de upload para Sentry nem de limpeza dos .map em nenhum workflow (deploy-vps.yml não menciona sentry-cli), então os maps hoje só servem como vazamento.
- **Recomendação:** Deletar dist/**/*.map após o build no Dockerfile (RUN find dist -name '*.map' -delete no estágio builder) ou bloquear 'location ~ \.map$ { deny all; }' no nginx; quando o upload ao Sentry for implementado, fazê-lo no CI antes da limpeza.

### Gitleaks roda só 1x/semana com continue-on-error: true — scan de secrets nunca falha nem roda em PR
- **Área:** Build, CI/CD e infraestrutura (T36-T38)
- **Local:** `.github/workflows/security.yml:22`
- **Categoria:** ci-cd · **Esforço:** baixo
- **Problema:** security.yml dispara apenas em schedule semanal (segunda 06:00 UTC) e workflow_dispatch — comentário explícito: 'so this never gates pull requests'. O único step (gitleaks) tem 'continue-on-error: true' (linha 22), então mesmo quando encontra secrets o workflow fica verde. O grep de secrets do ci.yml também só emite ::warning (ci.yml:294-301). Resultado concreto: a master key da Evolution API está commitada em 3 arquivos (ver finding crítico) e nenhum gate acusou. O codeql.yml tem o mesmo padrão: 'continue-on-error: true' no nível do job (linha 20), mascarando qualquer falha de análise.
- **Recomendação:** Adicionar gitleaks como job de PR bloqueante (a action suporta modo diff-only, rápido), remover continue-on-error do security.yml e do codeql.yml, e usar o .gitleaks.toml existente para baseline de falsos positivos em vez de neutralizar o gate inteiro.

### Pre-commit aceita exit code 1 do ESLint — erros de lint passam no commit e em todo o pipeline
- **Área:** Build, CI/CD e infraestrutura (T36-T38)
- **Local:** `.lintstagedrc:3`
- **Categoria:** qualidade · **Esforço:** baixo
- **Problema:** .lintstagedrc envolve o eslint em "bash -c 'eslint --fix \"$@\"; code=$?; [ \"$code\" -le 1 ] && exit 0 || exit $code'". ESLint retorna 1 quando há ERROS de lint remanescentes após --fix (2 = falha fatal) — ou seja, o hook só bloqueia crash do próprio ESLint, nunca violações de regra (incluindo no-console e no-restricted-imports dos domain boundaries, que são 'error' no eslint.config.js). Como o ESLint no CI também é advisory (ci.yml:81-89, quality-gate.yml:33-43), não existe NENHUM ponto do fluxo em que um erro de lint impeça código de chegar à main — as regras 'error' do eslint.config.js são efetivamente warnings.
- **Recomendação:** Trocar o wrapper para aceitar apenas exit 0 do eslint nos arquivos staged (débito antigo não é tocado pelo lint-staged, que só roda nos arquivos modificados — o argumento de 'débito pré-existente' não se aplica aqui).

### 124 edge functions excluídas de qualquer lint: ESLint ignora supabase/functions/** e CI Deno não roda deno lint
- **Área:** Build, CI/CD e infraestrutura (T36-T38)
- **Local:** `eslint.config.js:16`
- **Categoria:** qualidade · **Esforço:** medio
- **Problema:** eslint.config.js:16 ignora 'supabase/functions/**' por completo. O workflow deno-contract-tests.yml roda apenas 'deno test' (contratos), nunca 'deno lint' ou 'deno check' — e seu terceiro step ainda mascara falhas com '|| echo ::warning (non-blocking)' (linha 79). Dado que o QA_REPORT lista as vulnerabilidades mais graves do produto justamente nas edge functions (evolution-credentials, evolution-webhook fail-open, get-sip-password), essa é a camada com menos verificação estática de todo o repo: sem lint, sem typecheck no CI, testes parcialmente non-blocking.
- **Recomendação:** Adicionar step 'deno lint supabase/functions' e 'deno check' dos entrypoints no deno-contract-tests.yml, e tornar o terceiro step de testes bloqueante ou quarentenar explicitamente os testes flaky em lista separada.

### Overlay de diagnóstico ativável em produção por qualquer visitante via ?debug=true
- **Área:** Componentes de domínio em src/components/ (exceto ui/) — Tarefas 6-8
- **Local:** `src/components/debug/BuildValidationOverlay.tsx:17`
- **Categoria:** seguranca · **Esforço:** baixo
- **Problema:** `const isDev = import.meta.env.DEV || window.location.search.includes('debug=true')` (linha 17). O componente é montado incondicionalmente em App.tsx:140, inclusive na tela /auth sem login. Qualquer visitante anônimo que acesse `https://app/?debug=true` vê o log interno de eventos (erros, mensagens de rede do validationLogger) e o botão "Download Evidence Report" (linha 109). Contrasta com HardResetButton (linha 15: só DEV) e ThemeDebugger (role 'dev' exata).
- **Recomendação:** Remover o bypass por query string ou condicioná-lo a role dev/admin autenticada, como já feito no ThemeDebugger.

### Rotas /debug/send-status-bus e /debug/realtime-fanout sem restrição de role
- **Área:** Componentes de domínio em src/components/ (exceto ui/) — Tarefas 6-8
- **Local:** `src/components/routing/AppRoutes.tsx:198`
- **Categoria:** seguranca · **Esforço:** baixo
- **Problema:** As rotas /debug/send-status-bus (linhas 197-204) e /debug/realtime-fanout (linhas 205-212) usam `<ProtectedRoute>` sem requiredRoles — qualquer agente autenticado acessa painéis internos de diagnóstico. Inconsistente com o fix P0 aplicado logo abaixo em /debug/backend (linhas 213-224, restrito a admin/dev) e com /admin/dev-diagnostics (só dev). O QA_REPORT_2026-07-11 apontou apenas /debug/backend; estas duas ficaram de fora.
- **Recomendação:** Adicionar requiredRoles={['admin','dev']} às duas rotas, alinhando com /debug/backend.

### EasterEggsProvider global re-registra listener de teclado e faz 2 setState a cada tecla digitada no app inteiro
- **Área:** Componentes de domínio em src/components/ (exceto ui/) — Tarefas 6-8
- **Local:** `src/components/effects/EasterEggs.tsx:70`
- **Categoria:** performance · **Esforço:** baixo
- **Problema:** Montado para todos os usuários em produção via App.tsx (DeferredProviders, linha 50). O useEffect de detecção do Konami code tem deps `[konamiProgress, typedText]` (linha 70) e o handler chama `setKonamiProgress` em TODA tecla e `setTypedText` em toda letra — ou seja, cada keystroke em qualquer tela (inclusive digitação no inbox) causa re-render do provider + removeEventListener/addEventListener do listener global. Não há gate por env/flag para os easter eggs (modo festa, matrix, disco) em app de produção.
- **Recomendação:** Guardar o progresso do Konami/typedText em refs (sem setState) e registrar o listener uma única vez; opcionalmente condicionar o provider a uma feature flag.

### Lista de destinatários é remontada inteira a cada evento realtime durante a campanha
- **Área:** Componentes de domínio em src/components/ (exceto ui/) — Tarefas 6-8
- **Local:** `src/components/talkx/TalkXLiveMonitor.tsx:309`
- **Categoria:** performance · **Esforço:** medio
- **Problema:** O canal realtime incrementa `setRecipientsKey((k) => k + 1)` em QUALQUER evento de zapp.talkx_recipients (linhas 77-79) e a chave é usada como key do componente: `<TalkXRecipientsList campaignId={campaignId} key={recipientsKey} />` (linha 309). Em campanha ativa, cada mensagem enviada gera um UPDATE → remount completo da lista (novo fetch, perda de scroll, flicker), somando-se ao polling de 3s da própria campanha (linha 46, refetchInterval: 3000).
- **Recomendação:** Passar um sinal de invalidação (queryClient.invalidateQueries com debounce) para o TalkXRecipientsList em vez de forçar remount via key.

### Fragment sem key dentro de rows.map — key colocada no filho, não no elemento retornado
- **Área:** Componentes de domínio em src/components/ (exceto ui/) — Tarefas 6-8
- **Local:** `src/components/monitoring/RetryMetricsPanel.tsx:297`
- **Categoria:** correcao · **Esforço:** baixo
- **Problema:** `rows.map((row) => { ... return ( <> <TableRow key={row.id}> ... {isOpen && <TableRow key={`${row.id}-details`}>} </> ); })` (linhas 294-365). A key precisa estar no elemento mais externo retornado pelo map; o shorthand `<>` não aceita key, então o React reconcilia por índice e emite warning de key ausente. Em tabela com linhas expansíveis e filtros que reordenam (status/ação/janela), o estado visual de expansão pode ser associado à linha errada durante a reconciliação.
- **Recomendação:** Trocar `<>` por `<Fragment key={row.id}>` (import { Fragment } from 'react') e remover as keys internas redundantes.

### Busca de transcrições sem .limit() — carrega todas as mensagens de áudio da base e filtra client-side
- **Área:** Componentes de domínio em src/components/ (exceto ui/) — Tarefas 6-8
- **Local:** `src/components/transcriptions/TranscriptionsHistoryView.tsx:47`
- **Categoria:** performance · **Esforço:** medio
- **Problema:** `dbFrom('messages').select(...).eq('message_type','audio').not('transcription','is',null).order('created_at', {ascending:false})` (linhas 47-53) não tem limit nem paginação; todos os filtros (data, busca, agrupamento por contato) são feitos em memória (linhas 92-137). Em base com histórico grande (messages é particionada em 24 partições segundo FALHAS_E_GAPS.md), isso transfere milhares de linhas com o texto completo de cada transcrição a cada abertura da view e a cada clique em "Atualizar".
- **Recomendação:** Adicionar .limit() com paginação (range) e mover os filtros de data/busca para a query (ilike/gte).

### Export CSV de auditoria sem escaping — nomes com vírgula quebram as colunas
- **Área:** Componentes de domínio em src/components/ (exceto ui/) — Tarefas 6-8
- **Local:** `src/components/team-chat/DepartmentManagementDialog.tsx:80`
- **Categoria:** correcao · **Esforço:** baixo
- **Problema:** `const csvContent = [headers, ...rows].map((r) => r.join(',')).join('\n')` (linha 80) concatena os valores crus. `l.details.profile_name` (linha 77) é nome de usuário livre — qualquer vírgula ou quebra de linha desloca as colunas do CSV. O blob de `URL.createObjectURL` (linha 83) nunca é revogado. O próprio repo já tem a implementação correta em TalkXLiveMonitor.tsx:112-127 (aspas + escape de `"` + revokeObjectURL).
- **Recomendação:** Reusar o padrão de escaping do TalkXLiveMonitor (envolver campos em aspas duplas com replace(/"/g,'""')) e chamar URL.revokeObjectURL após o click.

### Effect de marcar-como-lida depende só de filteredMessages.length e dispara uma mutation por mensagem
- **Área:** Componentes de domínio em src/components/ (exceto ui/) — Tarefas 6-8
- **Local:** `src/components/team-chat/TeamChatPanel.tsx:130`
- **Categoria:** correcao · **Esforço:** medio
- **Problema:** O useEffect (linhas 115-130) tem deps `[s.filteredMessages.length, conversation.id]`: se um lote de mensagens chega enquanto a busca está ativa, só as mensagens que casam com o filtro são marcadas como lidas; e mudanças que não alteram o length (ex.: troca do conjunto filtrado com mesmo tamanho ao editar a busca) não re-executam o effect. Além disso dispara `updateStatusMutation.mutate` individualmente por mensagem não lida (linhas 124-126) — N requests por lote em vez de um update em batch.
- **Recomendação:** Basear a marcação em s.messages (não no resultado da busca), usar deps corretas e criar uma mutation em batch (update ... in (ids)).

### npm run test:e2e executa apenas 1 spec; a suíte real de 60+ specs exige config alternativa
- **Área:** Código morto e duplicação (T44-T45)
- **Local:** `playwright.config.ts:4`
- **Categoria:** config-teste · **Esforço:** baixo
- **Problema:** playwright.config.ts:4 define testDir: './src/tests/e2e', pasta que contém um único arquivo (app-boot.spec.ts). Os scripts test:e2e/test:e2e:ui/test:e2e:debug (package.json:21-23) usam esse config default, então 'npm run test:e2e' roda 1 spec. A suíte real com 60+ specs em e2e/ só roda via '--config=playwright.e2e.config.ts', usado apenas pelos scripts test:e2e:reactions e test:a11y (parcial). Quem roda 'test:e2e' acredita ter validado o E2E completo.
- **Recomendação:** Fazer o config default apontar para e2e/ (ou criar script test:e2e:full explícito) e renomear o atual para test:boot.

### 5 hooks (642 linhas) importados apenas pelos próprios testes — testes zumbis
- **Área:** Código morto e duplicação (T44-T45)
- **Local:** `src/hooks/useImportData.ts:1`
- **Categoria:** codigo-morto · **Esforço:** baixo
- **Problema:** Varredura de importadores em src (excluindo testes) encontrou 0 consumidores para: useImportData.ts (238 L, testado por hooks/__tests__/useImportData.test.ts), useBulkActions.ts (189 L), useExportData.ts (80 L, testado também por components/__tests__/ExportDropdownPermission.test.tsx), useExternalCargos.ts (68 L) e useExternalEmpresas.ts (67 L, ambos referenciados só por contacts/__tests__/ExternalDataIntegration.test.tsx). Os testes passam e inflam a contagem da suíte sem proteger nenhum fluxo real.
- **Recomendação:** Remover os 5 hooks e seus testes, ou religá-los à UI se a funcionalidade (import/export/bulk actions) for desejada — hoje é peso morto com custo de CI.

### Dois useMessages com implementações distintas; o de 295 linhas está morto exceto por um tipo
- **Área:** Código morto e duplicação (T44-T45)
- **Local:** `src/hooks/useMessages.ts:1`
- **Categoria:** duplicacao · **Esforço:** baixo
- **Problema:** src/hooks/useMessages.ts (295 L, com lógica própria de RPC/Realtime sobre evo.evolution_messages) e src/features/inbox/hooks/useMessages.ts (158 L, via messageService/messageRepository) são implementações independentes do mesmo hook. O único importador do primeiro é src/lib/inbox/chatOptimizations.ts:1, que importa apenas o tipo Message ('import { Message } from "@/hooks/useMessages"'). Diferente dos outros 18 casos de colisão (que são shims de re-export de 1-7 linhas, ex.: src/hooks/useRealtimeMessages.ts), aqui o hook antigo inteiro segue vivo no bundle e é armadilha de import errado.
- **Recomendação:** Extrair o tipo Message para @/types e deletar src/hooks/useMessages.ts, ou reduzi-lo a shim de re-export como os demais.

### 5 sistemas de EmptyState em components/ui; 2 arquivos (386 linhas) completamente mortos
- **Área:** Código morto e duplicação (T44-T45)
- **Local:** `src/components/ui/EmptyState.tsx:1`
- **Categoria:** duplicacao · **Esforço:** medio
- **Problema:** Existem 9 arquivos de empty-state (1.045 linhas): ui/EmptyState.tsx (195 L) e ui/empty-states.tsx (191 L) têm ZERO importadores em todo o src (grep por 'ui/EmptyState' e 'ui/empty-states' sem resultado) — ambos mortos. Os vivos: ui/empty-state.tsx (151 L, 8 importadores como VirtualizedMessageList e ConnectionsView), ui/GenericEmptyState.tsx (73 L, 8+ importadores em monitoring/dashboard) e ui/empty-states/ContextualEmptyState.tsx (86 L, via re-export ui/contextual-empty-states.tsx usado por AgentsView e TagsView). Três APIs vivas para o mesmo conceito + dois cadáveres com nomes quase idênticos ao vivo (EmptyState.tsx vs empty-state.tsx no mesmo diretório).
- **Recomendação:** Deletar EmptyState.tsx e empty-states.tsx imediatamente (zero risco); consolidar os 3 vivos em um único componente com variantes num segundo passo.

### Três sistemas de toast montados em produção; AccessibleToastProvider não tem nenhum consumidor
- **Área:** Código morto e duplicação (T44-T45)
- **Local:** `src/components/providers/AppProviders.tsx:88`
- **Categoria:** duplicacao · **Esforço:** medio
- **Problema:** App.tsx monta <Toaster /> (shadcn, linha 134, alimentado por src/hooks/use-toast.ts com 118 arquivos importadores) e <Sonner /> (linha 135, sonner importado diretamente por 218 arquivos). Além disso, AppProviders.tsx:88 monta AccessibleToastProvider (src/components/ui/accessible-toast.tsx, 199 L com framer-motion), mas grep por useAccessibleToast não encontra NENHUM consumidor fora do próprio arquivo — é um terceiro sistema de toast rodando no runtime sem uso. src/components/ui/use-toast.ts é um re-export com 0 importadores.
- **Recomendação:** Remover AccessibleToastProvider da árvore e deletar accessible-toast.tsx e ui/use-toast.ts; definir sonner como padrão único e migrar os 118 usos de use-toast gradualmente.

### Dois ConversationHeatmap vivos com queries diferentes — números divergentes entre Dashboard e Relatórios
- **Área:** Código morto e duplicação (T44-T45)
- **Local:** `src/components/reports/ConversationHeatmap.tsx:1`
- **Categoria:** duplicacao · **Esforço:** medio
- **Problema:** src/components/dashboard/ConversationHeatmap.tsx (312 L, queryKey ['conversation-heatmap'], renderizado em DashboardView.tsx) e src/components/reports/ConversationHeatmap.tsx (150 L, query direta em .from('messages'), renderizado em AdvancedReportsView.tsx) implementam o mesmo heatmap 24h×7d com fontes de dados e lógicas independentes. Usuário vê 'o mesmo' gráfico com números potencialmente diferentes em duas telas. O QA_REPORT já apontou bug na versão do dashboard (linha 64) — o fix não alcança a cópia de reports.
- **Recomendação:** Unificar em um componente único parametrizado por fonte de dados/período e usar nas duas telas.

### Teste valida uma CÓPIA local da lógica do webhook, não o código de produção
- **Área:** Código morto e duplicação (T44-T45)
- **Local:** `src/lib/__tests__/phoneNormalization.test.ts:5`
- **Categoria:** duplicacao · **Esforço:** medio
- **Problema:** phoneNormalization.test.ts:5-12 define localmente normalizePhone e normalizeEventName com o comentário 'Test the phone normalization logic from evolution-webhook' — o teste exercita uma transcrição manual, não importa nem a edge function nem src/lib/phoneUtils.ts. Se a lógica real do webhook mudar, o teste continua verde (drift silencioso). Além disso, src/components/contacts/useContactDuplicateDetector.ts:41 tem outra normalizePhone local paralela à canônica de src/lib/phoneUtils.ts:52.
- **Recomendação:** Extrair a normalização do webhook para módulo compartilhado testável (ou testar a função importada de supabase/functions/_shared) e trocar a cópia do useContactDuplicateDetector pelo phoneUtils.

### contactsDB.ts (332 linhas) — bridge para CRM externo sem nenhum importador
- **Área:** Código morto e duplicação (T44-T45)
- **Local:** `src/lib/contactsDB.ts:115`
- **Categoria:** codigo-morto · **Esforço:** baixo
- **Problema:** src/lib/contactsDB.ts exporta o objeto contactsDB (linha 115) com camada completa de CRUD para o banco CRM externo, mas grep em todo src encontra referências apenas dentro do próprio arquivo (inclusive o exemplo de uso no docstring das linhas 15-17). Nenhum componente, hook ou serviço o importa.
- **Recomendação:** Deletar o arquivo; se a integração com CRM externo for retomada, recuperar do git history.

### 13 dependências de produção sem nenhum import no código (incl. serialize-javascript e performance-now)
- **Área:** Dependências (T46-T47)
- **Local:** `package.json:118`
- **Categoria:** dead-deps · **Esforço:** baixo
- **Problema:** Grep por import/require em src/, scripts/, e2e/, infra/, db/, docs/ e configs não encontra NENHUM uso de: performance-now (l.105), serialize-javascript (l.118), glob (l.97), csstype (l.92, só existe como pin de overrides), baseline-browser-mapping (l.87), caniuse-lite (l.88), @floating-ui/dom (l.50), @lovable.dev/cloud-auth-js (l.53), embla-carousel-react (l.95), input-otp (l.99), vaul (l.124), react-virtualized-auto-sizer (l.115) e web-vitals (l.127 — src/lib/web-vitals.ts reimplementa as métricas manualmente com PerformanceObserver e não importa o pacote). Nota: serialize-javascript foi bumpado para 7.0.7 para atender o item de CVE do FALHAS_E_GAPS.md:73, mas a correção correta é remoção — o pacote nunca é importado. embla/input-otp/vaul são resíduos de componentes shadcn que nem existem mais em src/components/ui/.
- **Recomendação:** Remover as 13 deps do bloco dependencies (manter csstype apenas em overrides se o pin ainda for necessário). Isso elimina de graça o advisory high do glob CLI (GHSA-5j98-mcp5-4vw2) apontado pelo bun audit.

### 5 devDependencies sem uso, duas delas puxando pacotes vulneráveis
- **Área:** Dependências (T46-T47)
- **Local:** `package.json:180`
- **Categoria:** dead-deps · **Esforço:** baixo
- **Problema:** Sem nenhuma referência no repo: wait-on (l.180 — não aparece em scripts npm, workflows, playwright configs nem .husky; puxa lodash com advisory high GHSA-r5fr-rjxr-66jc e joi vulnerável), @types/dompurify (l.147 — deprecated, dompurify 3.x embute tipos; puxa uma segunda cópia dompurify@3.4.2 vulnerável, bun.lock:2548), @vitejs/plugin-react (l.151 — vite.config.ts e vitest.config.ts usam apenas @vitejs/plugin-react-swc), jsdom (l.165 — vitest.config.ts:8 usa environment 'happy-dom' e não há pragma @vitest-environment jsdom em nenhum teste) e prop-types (l.172 — zero imports).
- **Recomendação:** Remover as 5 devDeps. wait-on e @types/dompurify primeiro, pois reduzem diretamente a contagem do bun audit.

### Duas bibliotecas de virtualização em uso simultâneo: react-window e @tanstack/react-virtual
- **Área:** Dependências (T46-T47)
- **Local:** `package.json:116`
- **Categoria:** duplicacao · **Esforço:** medio
- **Problema:** react-window (^2.2.7, l.116) é usado em 3 arquivos (src/components/team-chat/TeamChatPanel.tsx, src/components/team-chat/useTeamChatPanel.ts, src/pages/admin/AuditEvidenceDashboard.tsx) enquanto @tanstack/react-virtual (^3.14.5, l.86) é usado em 6 arquivos do inbox e contatos (src/features/inbox/components/VirtualizedMessageList.tsx, VirtualizedConversationList.tsx, ConversationList.tsx, chat/ChatMessagesArea.tsx, VirtualizedRealtimeList.tsx, src/components/contacts/ContactsTableVirtual.tsx). Duas APIs, dois comportamentos de scroll e dois custos de bundle para o mesmo problema. O companheiro react-virtualized-auto-sizer (l.115) nem sequer é importado.
- **Recomendação:** Padronizar em @tanstack/react-virtual (maioria dos usos e nas telas mais críticas) e migrar os 3 arquivos de react-window; remover react-window e react-virtualized-auto-sizer.

### Dois sistemas de toast ativos: sonner (223 imports) e Radix toast/use-toast (99 arquivos)
- **Área:** Dependências (T46-T47)
- **Local:** `package.json:120`
- **Categoria:** duplicacao · **Esforço:** alto
- **Problema:** sonner (l.120) é importado em 223 pontos, enquanto o stack @radix-ui/react-toast (l.78) + src/components/ui/toast.tsx + hook use-toast é importado em 99 arquivos. Dois estilos visuais, duas filas de notificação e possibilidade de toasts sobrepostos na mesma tela. Não consta no design-system-audit.md nem nos QA reports (verificado por grep).
- **Recomendação:** Padronizar em sonner (uso majoritário), migrar os 99 consumidores de use-toast (pode ser um shim de use-toast delegando para sonner para reduzir o churn) e remover @radix-ui/react-toast + ui/toast.tsx.

### Dependências exclusivamente de build/dev declaradas em dependencies
- **Área:** Dependências (T46-T47)
- **Local:** `package.json:126`
- **Categoria:** organizacao-deps · **Esforço:** baixo
- **Problema:** Estão no bloco de produção mas só rodam em build ou dev: vite-plugin-pwa 0.19.8 (l.126) e vite-plugin-compression2 1.4.0 (l.125) — usados apenas em vite.config.ts:5-6; baseline-browser-mapping e caniuse-lite (l.87-88) — dados de browserslist consumidos pelo autoprefixer no build (não há .browserslistrc nem chave browserslist); @axe-core/react (l.48) — importado apenas em src/main.tsx:62 dentro de `if (import.meta.env.DEV)`. Em pipelines que instalam com --production ou auditam apenas prod deps, isso distorce o resultado (vite-plugin-pwa, por exemplo, é a origem de várias advisories via workbox-build no bun audit).
- **Recomendação:** Mover os 5 pacotes para devDependencies (o Dockerfile instala tudo com `bun install --frozen-lockfile`, então o build não quebra).

### Toolchain não determinística: bun 'latest' no quality-gate vs 1.3.3 pinado no CI, e tag flutuante no Dockerfile
- **Área:** Dependências (T46-T47)
- **Local:** `.github/workflows/quality-gate.yml:26`
- **Categoria:** infraestrutura · **Esforço:** baixo
- **Problema:** ci.yml pina bun-version: 1.3.3 em 6 jobs (linhas 76, 138, 172, 213, 246, 279), mas quality-gate.yml:26 usa `bun-version: latest` — o gate de qualidade pode rodar com uma versão de bun diferente (e mais nova) do que o CI e o build, produzindo resultados divergentes ou quebras espontâneas quando o bun lança release. O Dockerfile usa `FROM oven/bun:1.3-alpine` (tag de minor flutuante) e o vercel.json usa `"installCommand": "bun install"` sem --frozen-lockfile, permitindo resolução diferente do bun.lock no deploy Vercel.
- **Recomendação:** Pinar bun-version: 1.3.3 no quality-gate.yml, usar tag imutável (ex.: oven/bun:1.3.3-alpine) no Dockerfile e trocar o installCommand do vercel.json para `bun install --frozen-lockfile`.

### Sintaxe hsla() inválida em 10 tokens --shadow-glow-* e em :focus-visible/::selection do index.css
- **Área:** Design system e componentes UI base (src/components/ui, tokens CSS, tailwind.config.ts) — Tarefas 4-5
- **Local:** `src/styles/tokens.css:182`
- **Categoria:** css-invalido · **Esforço:** baixo
- **Problema:** '--shadow-glow-primary: 0 0 20px -2px hsla(var(--primary), 0.3)' expande para 'hsla(221 83% 53%, 0.3)' — mistura componentes separados por espaço com alfa por vírgula, o que é CSS inválido; a propriedade box-shadow que consome o var() é descartada (invalid at computed-value time). Afeta as 10 definições em tokens.css:182-186 e 310-314. Pior: o mesmo padrão em src/index.css:53 (':focus-visible { box-shadow: 0 0 0 4px hsla(var(--primary), 0.25); }' — o halo de foco nunca renderiza, sobra só o outline) e index.css:78 ('::selection { background-color: hsla(var(--primary), 0.25); }' — a cor de seleção customizada é descartada e o texto selecionado usa o highlight default do navegador com foreground forçado, prejudicando contraste em dark mode).
- **Recomendação:** Trocar para a sintaxe moderna com barra: 'hsl(var(--primary) / 0.25)' em todos os 12 pontos (tokens.css e index.css). Notar que os glow continuarão mortos enquanto o override global de components.css existir (ver finding 1).

### Confirmado: 5 implementações de empty state coexistem; EmptyState.tsx (195 linhas) e empty-states.tsx (191 linhas) são código morto com zero imports
- **Área:** Design system e componentes UI base (src/components/ui, tokens CSS, tailwind.config.ts) — Tarefas 4-5
- **Local:** `src/components/ui/EmptyState.tsx:1`
- **Categoria:** duplicacao/codigo-morto · **Esforço:** medio
- **Problema:** Verificado por grep em todo src/: (1) EmptyState.tsx exporta 'EmptyState' com sistema de variants por módulo — 0 imports; (2) empty-state.tsx exporta OUTRO 'EmptyState' (API diferente: icon obrigatório, sizes xs-lg, illustrations) — 8 imports; (3) empty-states.tsx exporta um TERCEIRO 'EmptyState' + 8 convenience components — 0 imports (superseded pela pasta empty-states/); (4) GenericEmptyState.tsx — 22 imports (dominante); (5) empty-states/ (ContextualEmptyState + ConvenienceExports) via contextual-empty-states.tsx — 2 imports. Não há colisão case-insensitive de filesystem (nomes diferem pelo hífen), mas dois exports homônimos 'EmptyState' com APIs incompatíveis no mesmo diretório induzem import errado por autocomplete, e ~390 linhas mortas seguem no bundle de manutenção.
- **Recomendação:** Deletar EmptyState.tsx e empty-states.tsx (zero consumidores). Consolidar GenericEmptyState e empty-state.tsx numa única API (GenericEmptyState é praticamente um subconjunto sem 'size' e 'illustration') e manter empty-states/ apenas como camada de conveniência contextual sobre ela.

### CommandDialog e mais 4 dialogs sem DialogTitle — dialog sem nome acessível e erro do Radix no console
- **Área:** Design system e componentes UI base (src/components/ui, tokens CSS, tailwind.config.ts) — Tarefas 4-5
- **Local:** `src/components/ui/command.tsx:26`
- **Categoria:** acessibilidade · **Esforço:** baixo
- **Problema:** CommandDialog (command.tsx:26-36) renderiza DialogContent sem DialogTitle/DialogDescription — Radix Dialog >=1.1 loga erro de acessibilidade no console e leitores de tela anunciam um dialog sem nome. Mesmo problema em src/components/ui/command-palette.tsx (~linha 103, o Cmd+K global), src/components/calls/CallDialog.tsx, src/features/inbox/components/GlobalSearch.tsx e src/features/inbox/components/contact-details/StoryViewer.tsx (verificado: 105 arquivos usam DialogContent, esses 5 não contêm DialogTitle). A CommandPalette também implementa listbox custom (setas/Enter via window keydown) sem role=listbox/option nem aria-activedescendant, então a navegação não é anunciada por leitores de tela.
- **Recomendação:** Adicionar DialogTitle com VisuallyHidden (o projeto já tem src/components/ui/visually-hidden.tsx) nos 5 dialogs. Na CommandPalette, aplicar role=listbox/role=option com aria-selected e aria-activedescendant no input.

### MobileDrawer declara role=dialog aria-modal=true sem focus trap, sem tecla Escape e sem restauração de foco
- **Área:** Design system e componentes UI base (src/components/ui, tokens CSS, tailwind.config.ts) — Tarefas 4-5
- **Local:** `src/components/ui/mobile-components.tsx:69`
- **Categoria:** acessibilidade · **Esforço:** medio
- **Problema:** O painel do MobileDrawer (mobile-components.tsx:53-83) é um motion.div com role="dialog" aria-modal="true" mas nenhuma gestão de foco: o foco permanece no conteúdo atrás do drawer (que o aria-modal promete estar inerte), Escape não fecha, e ao fechar o foco não retorna ao gatilho. O mesmo padrão se repete em src/components/mobile/MobileDrawerMenu.tsx:146-147 (usado de verdade pelo MobileShell). Usuários de teclado/leitor de tela conseguem tabular para conteúdo 'coberto' e não conseguem sair do menu sem mouse/gesto.
- **Recomendação:** Reimplementar ambos sobre o Sheet (Radix) já existente em ui/sheet.tsx, que fornece focus trap, Escape e restauração de foco de graça — mantendo o drag-to-close como camada por cima; ou adicionar manualmente trap de foco + handler de Escape + inert no fundo.

### Dois sistemas de toast ativos simultaneamente (radix Toaster + Sonner) na mesma posição bottom-right
- **Área:** Design system e componentes UI base (src/components/ui, tokens CSS, tailwind.config.ts) — Tarefas 4-5
- **Local:** `src/App.tsx:134`
- **Categoria:** duplicacao/inconsistencia · **Esforço:** medio
- **Problema:** App.tsx:134-135 renderiza '<Toaster />' (radix, ui/toaster.tsx via use-toast, viewport 'sm:bottom-0 sm:right-0' em toast.tsx:17) e '<Sonner />' (ui/sonner.tsx, position="bottom-right"). 218 arquivos usam sonner e 46 arquivos ainda usam useToast — quando os dois disparam, as pilhas se sobrepõem no mesmo canto com estilos diferentes (radix sem closeButton estilizado igual, animações distintas), e o usuário vê dois visuais de notificação diferentes no mesmo app.
- **Recomendação:** Migrar os 46 usos remanescentes de useToast para sonner (codemod simples: toast({title, description, variant}) → toast[level](title, {description})), remover toaster.tsx/toast.tsx/use-toast.ts e o <Toaster /> do App.

### prefers-reduced-motion não afeta animações framer-motion (JS), usadas em praticamente todos os componentes de UI
- **Área:** Design system e componentes UI base (src/components/ui, tokens CSS, tailwind.config.ts) — Tarefas 4-5
- **Local:** `src/styles/accessibility.css:63`
- **Categoria:** acessibilidade · **Esforço:** baixo
- **Problema:** accessibility.css cobre apenas animações/transições CSS ('animation-duration: 0.01ms !important' na media query, linhas 63-70). Porém EmptyState/GenericEmptyState, micro-interactions/, motion/, MobileDrawer, QuickPeek, MotionButton etc. animam via framer-motion, que aplica estilos inline por JS e ignora essas regras. Não existe nenhum '<MotionConfig reducedMotion="user">' no app (grep confirma: useReducedMotion só é usado em src/components/transitions/useReducedMotion.ts, não nos componentes de ui/). Usuários com vestibular disorders que ativam reduced motion continuam recebendo floats infinitos (EmptyState.tsx floatAnimation), springs e stagger em cascata.
- **Recomendação:** Envolver a árvore no App com <MotionConfig reducedMotion="user"> (framer-motion respeita a preferência do SO automaticamente para animações de transform/opacity) e usar o hook useReducedMotion existente nos loops infinitos (animate={floatAnimation}).

### Itens do design-system-audit.md continuam abertos: paletas hex hardcoded em CreateQueueDialog, TagsView, ConversationHeatmap, TalkXAnalytics e âmbar em WhisperMode
- **Área:** Design system e componentes UI base (src/components/ui, tokens CSS, tailwind.config.ts) — Tarefas 4-5
- **Local:** `src/components/queues/CreateQueueDialog.tsx:21`
- **Categoria:** regressao/pendente · **Esforço:** medio
- **Problema:** Verificação item a item do design-system-audit.md da raiz: AINDA ABERTOS — CreateQueueDialog.tsx:21-28 (8 hex '#3B82F6'...'#84CC16'), TagsView.tsx:38-46 (9 hex), ConversationHeatmap.tsx:67 (colorScale ['#f0fdf4',...,'#14532d']), TalkXAnalytics.tsx:75-76 ('#f59e0b', '#6366f1'), WhisperMode.tsx:139+ (dezenas de classes amber-* em vez de tokens warning), Connections.tsx e PerformanceDashboard.tsx (classes emerald/purple/yellow). JÁ CORRIGIDOS desde o audit — ConversationItem.tsx:236 (agora bg-primary-foreground) e components.css:167 (#000 forçado foi escopado a .dark com comentário justificando). As paletas de cor de fila/tag são cores de dados persistidas (defensável), mas deveriam vir de uma constante compartilhada única — hoje a MESMA paleta está copiada em CreateQueueDialog.tsx, useAdminChannels.ts:101, useAdminQueues.ts:98, useQueues.ts:105 e AdminQueuesPage.tsx.
- **Recomendação:** Extrair uma constante única DATA_PALETTE em src/lib (ou tokens de chart no tailwind.config) e importar nos 5+ pontos; migrar WhisperMode para tokens warning/warning-soft/warning-border que já existem no tema; marcar no design-system-audit.md os itens já resolvidos para o documento não apontar falsos positivos.

### .env.example com 11 vars mortas, nomes errados (GMAIL_ vs GOOGLE_) e sem as vars exigidas pelo build
- **Área:** Documentacao e DX (T48-T50)
- **Local:** `.env.example:47`
- **Categoria:** env-vars · **Esforço:** medio
- **Problema:** Sobrando (0 referencias em src/, supabase/functions/, scripts/ e vite.config.ts): VITE_APP_NAME, VITE_SENTRY_ENVIRONMENT, VITE_ENABLE_ANALYTICS, VITE_ENABLE_DEBUG, VITE_ENABLE_GAMIFICATION, VITE_ENABLE_GMAIL_INTEGRATION, VITE_BITRIX_WEBHOOK_URL, R2_ACCOUNT_ID/ACCESS_KEY/SECRET/BUCKET, ANTHROPIC_API_KEY, GROQ_API_KEY — as 4 feature flags VITE_ENABLE_* sugerem funcionalidade de flags que nao existe. Nome errado: linhas 47-48 documentam GMAIL_CLIENT_ID/GMAIL_CLIENT_SECRET, mas o codigo le GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET (6 refs em supabase/functions) — quem configurar pelo exemplo quebra o OAuth Gmail. Faltando: VITE_SUPABASE_PUBLISHABLE_KEY (usada em 15 arquivos de src/ e exigida como build-arg no Dockerfile e no CI, cf. DEPLOYMENT.md:34), VITE_SUPABASE_PROJECT_ID (que ENV_SETUP.md:28 marca como obrigatoria), VITE_EVOLUTION_API_URL/KEY, VITE_ZAPPWEB_INSTANCE, VITE_DEV/STAGING_EXTERNAL_SUPABASE_*, e todo o bloco SELFHOSTED_* das edge functions.
- **Recomendação:** Regenerar o .env.example a partir de grep real (import.meta.env + Deno.env.get), remover vars mortas, corrigir GMAIL_->GOOGLE_ e separar em secoes 'frontend (VITE_)' e 'edge functions (secrets do VPS)'. Adicionar um check de CI que diffa .env.example contra as vars usadas.

### Setup do README aponta para o repositorio errado e cita CONTRIBUTING.md/LICENSE inexistentes
- **Área:** Documentacao e DX (T48-T50)
- **Local:** `README.md:67`
- **Categoria:** doc-desatualizada · **Esforço:** baixo
- **Problema:** README.md:67 manda 'git clone git@github.com:adm01-debug/zapp-web.git' e 'cd zapp-web', mas o remote real e https://github.com/adm01-debug/zapp-web-v3 (verificado via git remote -v) — o passo 1 do onboarding clona outro repositorio. O badge de CI (linha 3) tambem aponta para adm01-debug/zapp-web. README.md:345 referencia CONTRIBUTING.md e README.md:353 referencia LICENSE ('MIT License' + badge) — nenhum dos dois arquivos existe no repo (verificado com ls). Um projeto privado com badge 'license MIT' e link quebrado e contraditorio.
- **Recomendação:** Corrigir URL de clone e badge para zapp-web-v3; criar CONTRIBUTING.md minimo (ou remover o link) e decidir a licenca: adicionar o arquivo LICENSE ou remover badge/secao de licenca.

### Comandos de teste do README usam `bun test` (runner nativo do Bun), que ignora o vitest.config.ts do projeto
- **Área:** Documentacao e DX (T48-T50)
- **Local:** `README.md:299`
- **Categoria:** doc-contradiz-codigo · **Esforço:** baixo
- **Problema:** README.md:297-309 instrui 'bun test', 'bun test --coverage', 'bun test --watch', 'bun test src/hooks/'. O script real e "test": "NODE_OPTIONS=--max-old-space-size=6144 vitest run" (package.json:19). `bun test` NAO executa esse script (isso seria `bun run test`): invoca o test runner nativo do Bun, que nao le vitest.config.ts (setupFiles, happy-dom, includes de src/__tests__ etc.) nem o bump de memoria — comportamento divergente da suite oficial de 141+ arquivos. Alem disso o README declara '~72 arquivos de teste' (real: 141 so em src/), 'Vite 5' (real: vite ^6.4.3), '106 Edge Functions' (real: 123 + _shared) e '453 Migrations' (real: 702).
- **Recomendação:** Trocar os comandos para `bun run test` / `bun run test:watch` / `npm test`, e substituir contadores absolutos por numeros gerados ou aproximados ('120+ edge functions', '700+ migrations') para reduzir decay.

### Scripts fantasmas persistem: smoke:pre-deploy e workflow apply-chatpanel-fixes apontam para arquivos inexistentes
- **Área:** Documentacao e DX (T48-T50)
- **Local:** `package.json:31`
- **Categoria:** regressao/pendente · **Esforço:** baixo
- **Problema:** Ja apontado no QA_REPORT_2026-07-11 (secao 'Gaps de infra / scripts') e continua: package.json:31 define "smoke:pre-deploy": "bash scripts/smoke-pre-deploy.sh" mas o arquivo nao existe em scripts/ (verificado — 39 arquivos listados, nenhum smoke-pre-deploy.sh); o DR_RUNBOOK tambem o referencia. .github/workflows/apply-chatpanel-fixes.yml:15 executa `node scripts/migrate-chatpanel.mjs`, tambem inexistente — o workflow manual falha na primeira execucao, potencialmente durante um incidente (pior hora para descobrir).
- **Recomendação:** Criar os dois scripts ou remover o script npm, a referencia no DR_RUNBOOK e o workflow orfao. Adicionar um check simples de CI que valida que todo `scripts/*.{sh,mjs,ts}` referenciado em package.json e workflows existe.

### ONBOARDING.md ensina arquitetura 'Backend Duplo' extinta e manda usar diretorio src/schemas/ que nao existe
- **Área:** Documentacao e DX (T48-T50)
- **Local:** `docs/ONBOARDING.md:19`
- **Categoria:** doc-desatualizada · **Esforço:** baixo
- **Problema:** Linhas 19-22 descrevem 'Backend Duplo: Lovable Cloud (Auth e perfis) + FATOR X (via externalClient)', mas o proprio .env.example (linhas 1-8, 'FATOR X v6.1 — single-database') e o INFRA.md documentam que tudo vive num unico Supabase self-hosted desde a consolidacao — um dev novo vai procurar dois backends que nao existem. Linha 26 instrui 'Use schemas Zod em src/schemas/': o diretorio nao existe (verificado com find; os schemas zod estao espalhados, ex. src/shared/webhookEventSchemas.ts, src/features/auth/hooks/useAuthForm.ts). E o unico guia de onboarding do repo e esta errado nos dois pontos centrais.
- **Recomendação:** Atualizar ONBOARDING.md para a arquitetura single-database, corrigir o caminho dos schemas (ou criar src/schemas/ de fato) e acrescentar a informacao critica hoje ausente: sem .env valido o app conecta em producao.

### Nao existe ambiente de desenvolvimento local: zero seeds, zero instrucoes de banco local — o unico caminho documentado e producao
- **Área:** Documentacao e DX (T48-T50)
- **Local:** `supabase/config.toml:1`
- **Categoria:** onboarding · **Esforço:** alto
- **Problema:** Nao ha nenhum arquivo de seed no repo (verificado: nenhum supabase/seed*, db/seed*), o supabase/config.toml contem apenas blocos [functions.*] verify_jwt (sem config de stack local), e nenhum doc (README, ONBOARDING, ENV_SETUP) descreve `supabase start`, docker-compose local de banco, ou mocks para rodar sem backend. Combinado com o fallback de producao do client.ts, o fluxo de fato de um dev novo e: clonar, rodar `bun run dev` e operar sobre o banco de producao com dados reais de clientes (LGPD relevante — o repo ate tem docs/LGPD-RETENTION-POLICY.md). O QA_REPORT ja notou tambem que `bun install --frozen-lockfile` trava pelo tarball do xlsx via CDN (package.json:128 'https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz'), quebrando install em redes restritas.
- **Recomendação:** Criar um caminho local minimo: seed.sql com dados sinteticos (contatos/conversas fake), doc de `supabase start` ou compose local, e um modo mock do frontend (o codigo ja tem SENTINEL_HOST/modo degradado — documenta-lo). Avaliar trocar xlsx por pacote do registry (exceljs, ja sugerido no FALHAS_E_GAPS) para destravar installs.

### Docs duplicados conflitantes: dois runbooks de incidente, dois guias de deploy e ADRs com numeracao colidida
- **Área:** Documentacao e DX (T48-T50)
- **Local:** `docs/INCIDENT_RUNBOOK.md:1`
- **Categoria:** organizacao-docs · **Esforço:** baixo
- **Problema:** docs/INCIDENT-RUNBOOK.md (294 linhas) e docs/INCIDENT_RUNBOOK.md (29 linhas) coexistem com conteudos diferentes — o segundo ainda manda verificar 'LOVABLE_API_KEY' num cenario de erro de auth (fluxo extinto); durante um incidente real, achar o runbook errado custa tempo. DEPLOYMENT.md (raiz, 67 linhas, atual) vs docs/DEPLOYMENT.md (308 linhas, Lovable, obsoleto). Em docs/decisions/ ha dois ADR-003 (css-modularization e lazy-loading-architecture) e ADR-005/ADR-007 com o mesmo titulo 'audit-recovery-model' — o README lista ADR-005 como 'Audit & Recovery (FATOR X)' e pula o 007, evidenciando a confusao.
- **Recomendação:** Deletar docs/INCIDENT_RUNBOOK.md (manter o hifenizado, que o indice ja linka), arquivar docs/DEPLOYMENT.md, renumerar ADR-003-lazy-loading para ADR-009 (ou proximo livre) e consolidar 005/007 num unico ADR com historico.

### Poluicao documental: 13 .md na raiz e 93 arquivos soltos em docs/, sendo 33 logs de sessao de auditoria datados
- **Área:** Documentacao e DX (T48-T50)
- **Local:** `docs/README.md:1`
- **Categoria:** organizacao-docs · **Esforço:** medio
- **Problema:** A raiz contem 13 .md, dos quais pelo menos 6 sao relatorios pontuais datados (QA_REPORT_2026-06-14.md, QA_REPORT_2026-07-11.md, FALHAS_E_GAPS.md, design-system-audit.md, SECURITY_AUDIT_LEGADOS.md, CODE_REVIEW.md, LEVANTA_FUNCIONALIDADES.md). docs/ tem 93 arquivos no nivel superior + 11 subpastas; 33 arquivos casam com padroes AUDIT/AUDITORIA/HARDENING/EXECUCAO/SESSAO (12 so da serie EVOLUTION_API_AUDIT_2026-07-*). O indice docs/README.md nao cobre a maioria deles nem os .md da raiz. Resultado: impossivel distinguir documentacao viva (ENV_SETUP, ONBOARDING — ambas erradas) de fotografias historicas, o que explica por que docs obsoletos continuam sendo encontrados e seguidos.
- **Recomendação:** Reorganizar: (1) raiz fica so com README, CHANGELOG, SECURITY, DEPLOYMENT, INFRA, CONTRIBUTING, LICENSE; (2) criar docs/audits/AAAA-MM/ e mover os 33+ logs de sessao/auditoria (incluindo os QA_REPORT e FALHAS_E_GAPS da raiz, preservando historico via git mv); (3) agrupar EVOLUTION_API_* em docs/evolution/; (4) atualizar docs/README.md como indice canonico com selo 'vivo' vs 'historico' e data de validade.

### Terceiro diretório tests/e2e/ (13 arquivos) é órfão — nenhum config o coleta
- **Área:** E2E e testes de acessibilidade (Tarefas 34-35)
- **Local:** `tests/e2e/smoke.spec.ts`
- **Categoria:** teste-morto · **Esforço:** baixo
- **Problema:** tests/e2e/ contém boot-recovery, chat-messaging, critical-flows, reliability, resilience, security, smoke, webhooks + 3 *.test.ts de reações. Nenhum dos 3 playwright configs aponta para ele (testDirs: src/tests/e2e, e2e/, e2e/) e o Vitest está escopado a src/** (QA_REPORT_2026-06-14:54-57). O próprio quality-gate.yml:93-97 documenta que o passo antigo que o executava coletava ZERO testes e foi removido. É código morto que passa falsa impressão de cobertura (ex.: security.spec.ts, resilience.spec.ts).
- **Recomendação:** Deletar tests/e2e/ ou migrar os specs úteis (boot-recovery é bom) para e2e/ ou src/tests/e2e e cobri-los por um config real.

### 43 waitForTimeout em 24 specs — espera fixa em vez de condição
- **Área:** E2E e testes de acessibilidade (Tarefas 34-35)
- **Local:** `e2e/stickers.spec.ts:39`
- **Categoria:** flaky · **Esforço:** medio
- **Problema:** Padrão sistêmico: stickers.spec.ts tem 11 waitForTimeout (100–500ms), dlq-idempotency.spec.ts:266 dorme 5s, evolution-retry-failure.spec.ts:122 e evolution-media-retry-failure.spec.ts:189 dormem 4s aguardando backoff, auth-extended.spec.ts:11 2s, admin-failed-messages-filters.spec.ts 3x450ms para debounce. Em máquina lenta de CI essas margens estouram; em máquina rápida desperdiçam tempo. Combinado com retries:2 no CI, mascara flakiness real.
- **Recomendação:** Substituir por expect.poll()/toPass(), waitForResponse ou seletores de estado (ex.: aguardar contagem de linhas da tabela mudar após filtro em vez de dormir 450ms).

### Asserções engolidas por .catch() tornam testes incapazes de falhar
- **Área:** E2E e testes de acessibilidade (Tarefas 34-35)
- **Local:** `e2e/critical-flows.spec.ts:25`
- **Categoria:** teste-decorativo · **Esforço:** baixo
- **Problema:** critical-flows.spec.ts:25 faz `await expect(locator).toBeVisible({timeout:5000}).catch(() => console.log('Error message not found...'))` — a asserção nunca reprova. Mesmo padrão em stickers.spec.ts (linhas 20-24, 41-43: expect().catch() vira annotation) e chat-advanced.spec.ts. 7 ocorrências no total. O teste 'should show error message on invalid login attempt' também é todo condicionado a `if (await emailInput.isVisible())`, passando verde se o form nem renderizar.
- **Recomendação:** Remover os .catch() das asserções; se o comportamento é incerto, usar test.fixme() explícito em vez de asserção que não asserta.

### Teste 'envio com Evolution offline gera feedback de falha' não testa feedback nenhum
- **Área:** E2E e testes de acessibilidade (Tarefas 34-35)
- **Local:** `e2e/send-message.spec.ts:42`
- **Categoria:** teste-decorativo · **Esforço:** baixo
- **Problema:** O teste mocka a edge function com 503, mas a única asserção é `await expect(page.locator('body')).toBeVisible()` (linha 49) — não envia mensagem nem verifica toast/estado de erro. O nome promete validar o feedback de falha do fluxo de envio (fluxo crítico), mas qualquer página em branco com <body> passa. Padrão `expect(body).toBeVisible()` como asserção final aparece em 8 specs (admin-queues, navigation, admin-channels, error-handling...).
- **Recomendação:** Completar o teste: abrir conversa, enviar mensagem com o mock 503 ativo e assertar o indicador de falha/retry na bolha (data-testid=failed-message-* já existe no src).

### Visual regression sem baselines commitadas e com masks para testid inexistente
- **Área:** E2E e testes de acessibilidade (Tarefas 34-35)
- **Local:** `e2e/visual-regression.spec.ts:12`
- **Categoria:** flaky · **Esforço:** medio
- **Problema:** toHaveScreenshot('typography-validation.png') e 'team-chat-typography.png' não têm nenhum snapshot .png no repositório (find por *snapshots*/*.png em e2e/ retorna vazio) — em CI a primeira execução falha com 'snapshot doesn't exist'. A mask usa `[data-testid="dynamic-content"]`, que não existe no src (mask no-op → screenshot de /team-chat com conteúdo dinâmico = diff garantido). Duplicatas órfãs em tests/visual-regression.spec.ts e tests/visual-oled.spec.ts agravam a confusão.
- **Recomendação:** Commitar baselines geradas em ambiente determinístico (mesma versão de browser do CI), adicionar o testid da mask ao componente, ou remover a suíte até haver processo de atualização de snapshots.

### Gate de a11y cobre apenas 3 rotas públicas de auth; nenhuma rota autenticada tem regressão axe
- **Área:** E2E e testes de acessibilidade (Tarefas 34-35)
- **Local:** `playwright.a11y.config.ts:18`
- **Categoria:** cobertura-a11y · **Esforço:** medio
- **Problema:** O testMatch é restrito a auth-accessibility.spec.ts e auth-keyboard-navigation.spec.ts. O axe roda (wcag2a/2aa/21a/21aa, serious/critical) em /auth, /forgot-password e /reset-password nos temas claro/escuro — isso funciona e roda no CI (ci.yml job a11y). Porém inbox, chat, dashboard, admin e contacts — onde vive 95% do uso do app — não têm nenhuma verificação axe. O único spec de a11y do chat (chat-accessibility.spec.ts) está fora do testMatch E depende do login morto de testHelpers (finding acima), sendo duplamente inexecutável.
- **Recomendação:** Após consertar o login por fixture, adicionar um spec axe autenticado (inbox + chat aberto + um admin) ao playwright.e2e.config.ts, reaproveitando o runAxe() de auth-accessibility.spec.ts.

### 40+ test.skip condicionais silenciosos fazem a suíte passar verde sem testar nada
- **Área:** E2E e testes de acessibilidade (Tarefas 34-35)
- **Local:** `e2e/navigation.spec.ts:53`
- **Categoria:** teste-decorativo · **Esforço:** medio
- **Problema:** Padrão 'defensivo' generalizado: admin-queues.spec.ts pula se não há permissão/botão/submit (4 skips em 44 linhas), connection-to-inbox-inbound pula sem conexão/inbox/conversas, send-message-cycle pula sem conversas/input/upload, navigation.spec.ts:53 pula se a sidebar não expõe links. Se o seed falhar ou o usuário E2E perder permissão de admin, dezenas de testes viram skip e o relatório fica verde — exatamente o cenário em que uma regressão passaria despercebida. Não há asserção de quantidade mínima de testes executados.
- **Recomendação:** Converter pré-condições de ambiente em setup obrigatório (seed via e2e/utils/seed.ts) que falha alto; reservar test.skip só para variações legítimas de perfil, e monitorar taxa de skip no relatório (falhar se >N%).

### Cada mensagem de áudio montada abre 2 canais realtime incondicionalmente (+1 fetch de voice_conversion_queue)
- **Área:** Performance (T39 bundle, T40 listas/re-render, T41 realtime/polling/imagens)
- **Local:** `src/features/inbox/components/AudioMessagePlayer.tsx:95`
- **Categoria:** realtime/supabase · **Esforço:** baixo
- **Problema:** useEffect nas linhas 89-121 cria canal `transcription-${messageId}` e nas 124-153 canal `voice-conversion-${messageId}` para TODO áudio renderizado, mesmo com transcrição já concluída (`existingTranscription` disponível) e sem conversão de voz solicitada, além de um SELECT em voice_conversion_queue por áudio (linha 156). Numa conversa com muitos áudios, o scroll na lista virtualizada monta/desmonta bolhas continuamente → tempestade de join/leave de canais no websocket e queries repetidas.
- **Recomendação:** Assinar `transcription-*` apenas quando `transcriptionStatus` for pending/processing, e `voice-conversion-*` apenas após o usuário solicitar conversão (ou reutilizar um canal único por conversa com filtro, como o de reações).

### Query individual de reações por bolha de mensagem (N+1) — hook batch existe mas nunca é usado
- **Área:** Performance (T39 bundle, T40 listas/re-render, T41 realtime/polling/imagens)
- **Local:** `src/features/inbox/hooks/useMessageReactions.ts:66`
- **Categoria:** queries/N+1 · **Esforço:** medio
- **Problema:** Cada MessageBubble renderiza MessageReactions → useQuery(['message-reactions', messageId]) com queryFn que faz 2 round-trips (message_reactions + profiles) por mensagem (linhas 66-93). Com staleTime de 30s, rolar uma conversa de 1000 mensagens dispara centenas de requisições individuais ao PostgREST. O hook `useMessagesReactions` (reactions/useBatchReactions, re-exportado na linha 11) foi criado para buscar em lote mas não tem nenhum consumidor no app (verificado por grep).
- **Recomendação:** Buscar reações em lote por página de mensagens (`.in('message_id', ids)`) no nível da conversa usando o useBatchReactions existente e distribuir via select/props; manter a invalidação granular do canal por conversa.

### memo(MessageBubble) anulado por props inline recriadas a cada render no caminho mais quente (scroll do chat)
- **Área:** Performance (T39 bundle, T40 listas/re-render, T41 realtime/polling/imagens)
- **Local:** `src/features/inbox/components/chat/ChatMessagesArea.tsx:279`
- **Categoria:** re-render/memo · **Esforço:** baixo
- **Problema:** MessageBubble é memoizado (MessageBubble.tsx:68), mas ChatMessagesArea passa `registerRef={() => {}}` (linha 279) e `onMessageDeleted={handleMessageDeleted}` onde handleMessageDeleted é função plana recriada a cada render (linha 194). Como useVirtualizer re-renderiza o componente a cada frame de scroll e `setShowScrollBottom` (linha 169) dispara em cada onScroll, todas as bolhas visíveis re-renderizam integralmente durante o scroll — exatamente o que o memo deveria evitar.
- **Recomendação:** Envolver handleMessageDeleted em useCallback e hoistear `registerRef` para constante estável (ou remover, já que registerMessageRef é placeholder); auditar as demais props de função vindas do ChatPanel.

### Virtualizer do chat sem measureElement (alturas só estimadas) + imagens sem dimensões/lazy causam sobreposição e saltos de scroll
- **Área:** Performance (T39 bundle, T40 listas/re-render, T41 realtime/polling/imagens)
- **Local:** `src/features/inbox/components/chat/ChatMessagesArea.tsx:156`
- **Categoria:** virtualizacao/CLS · **Esforço:** medio
- **Problema:** useVirtualizer (linhas 156-161) posiciona cada mensagem por `translateY(virtualRow.start)` usando apenas getItemSize estimado (texto = content.length/60 linhas; imagem/vídeo = 300px fixos) — não há nenhum `measureElement` no repositório (grep global = 0). Imagens reais chegam a max-h-[400px] + legenda: offsets errados geram bolhas sobrepostas/gaps e saltos ao rolar. Agrava: MessageImage (ImagePreview.tsx:173-182) renderiza `<motion.img>` sem width/height e sem loading=lazy, então cada imagem carregada muda a altura real sem o virtualizer saber.
- **Recomendação:** Passar `measureElement` (ref={virtualizer.measureElement} + data-index) para medir alturas reais; reservar dimensões conhecidas da mídia (aspect-ratio) no MessageImage e adicionar loading=lazy/decoding=async.

### Service worker pré-baixa o app inteiro (281 assets, 9,9 MB, incluindo mapbox/charts/pdf/sip e todas as páginas admin) em cada deploy
- **Área:** Performance (T39 bundle, T40 listas/re-render, T41 realtime/polling/imagens)
- **Local:** `vite.config.ts:103`
- **Categoria:** pwa/bandwidth · **Esforço:** baixo
- **Problema:** `globPatterns: ['**/*.{js,css,html,ico,png,svg}']` com `maximumFileSizeToCacheInBytes: 8MB` (aumentado no FIX F4 explicitamente para incluir vendor-mapbox) faz o precache do Workbox baixar todos os 261 chunks JS + css/imagens no install do SW — medido no build: 281 entradas / 9,9 MB. Todo usuário (incl. mobile) baixa dashboards admin, mapbox, jspdf e sip.js que talvez nunca use, e re-baixa cada chunk alterado a cada deploy, anulando o benefício de banda do code-splitting.
- **Recomendação:** Restringir globPatterns ao shell crítico (entry + vendors core + css) via globIgnores para vendor-mapbox/pdf/sip/charts e páginas admin, deixando o resto para cache runtime (StaleWhileRevalidate em /assets/).

### Gate de performance budget usa métricas hardcoded — sempre passa e mascara o estouro real de 3x do budget
- **Área:** Performance (T39 bundle, T40 listas/re-render, T41 realtime/polling/imagens)
- **Local:** `scripts/check-performance-budget.mjs:29`
- **Categoria:** observabilidade/gate-fake · **Esforço:** baixo
- **Problema:** O script referenciado por `npm run perf:budget` define `currentMetrics = { LCP: 1200, FID: 25, CLS: 0.02, TTFB: 150, bundleSize: 450*1024 }` fixos (comentário admite: 'Simulate/Get current metrics'). O budget de bundleSize é 500 KB gzip, mas o entry real medido é 700 KB gz (payload inicial estático total ~1.610 KB gz). Qualquer CI que rode perf:budget aprova sempre, dando falsa confiança enquanto a regressão do finding #1 passou despercebida.
- **Recomendação:** Calcular bundleSize real a partir de dist/ (somar entry + imports estáticos, há .gz já emitidos pelo vite-plugin-compression2) e falhar o build; integrar Lighthouse CI para LCP/CLS ou remover o script até ser real.

### 36 funções redefinem corsHeaders local (39 ocorrências de ACAO '*') ignorando o _shared
- **Área:** Qualidade das edge functions (T25: duplicação e tratamento de erro; T26: consistência, docs e funções mortas)
- **Local:** `supabase/functions/gmail-health/index.ts:4`
- **Categoria:** duplicacao · **Esforço:** medio
- **Problema:** Apesar de existirem dois helpers CORS em _shared, 36 funções mantêm cópia local, quase todas wildcard: gmail-health/index.ts:4-7, send-email/index.ts:14-17, provider-router/index.ts:8-13, email-imap-bridge/index.ts:20-23, whatsapp-cloud-webhook/index.ts:31-36, external-db-proxy/lib/utils.ts:4-8, e2e-fixtures/index.ts:19-24 etc. Cada correção de CORS/headers precisa ser replicada em 36 lugares e a política de origem diverge função a função (três regimes distintos convivendo).
- **Recomendação:** Migrar as 36 funções para o módulo CORS unificado (ver finding 1) e proibir 'const corsHeaders' local via lint/grep em CI.

### Imports com versões divergentes: 5 versões de deno std e 11 especificadores de supabase-js, 62 arquivos sem pin
- **Área:** Qualidade das edge functions (T25: duplicação e tratamento de erro; T26: consistência, docs e funções mortas)
- **Local:** `supabase/functions/_shared/auth.ts:17`
- **Categoria:** consistencia/versoes · **Esforço:** medio
- **Problema:** deno std aparece em 0.168.0 (25 arquivos), 0.177.0/0.177.1 (5), 0.208.0 (2) e 0.224.0 (33). supabase-js via esm.sh aparece em 11 formas: @2 sem pin em 62 arquivos (incluindo _shared/auth.ts:17, usado por dezenas de funções), @2.39.0, @2.42.0, @2.45.0, @2.49.1 (26 arquivos), @2.57.4, @2.87.1, @2.95.0... Sem pin, o esm.sh resolve a última 2.x a cada deploy/cold start — duas funções deployadas em dias diferentes rodam versões diferentes do client, e um release quebrado do supabase-js entra em produção sem mudança de código. Não há import_map centralizando versões (o deno.json só mapeia 'openai').
- **Recomendação:** Centralizar versões num import map (deno.json 'imports': supabase-js pinado, std pinado) e trocar os imports por especificadores do map; um único lugar para upgrade.

### EDGE_FUNCTIONS.md completamente desatualizado frente às 121 funções reais
- **Área:** Qualidade das edge functions (T25: duplicação e tratamento de erro; T26: consistência, docs e funções mortas)
- **Local:** `supabase/EDGE_FUNCTIONS.md:14`
- **Categoria:** documentacao · **Esforço:** medio
- **Problema:** O documento (45 linhas) explica apenas por que existe o deno.json na raiz e mostra uma estrutura com uma única função ('external-db-proxy ... outros...'). Não há inventário das 121 funções, nada sobre _shared/ (37 módulos), nada sobre config.toml/verify_jwt, nada sobre o roteador self-hosted (main/index.ts) nem sobre os três padrões de auth de _shared/auth.ts. Para um sistema com 121 funções, a doc oficial de edge functions é inútil como referência.
- **Recomendação:** Regenerar o documento com inventário (nome, auth, trigger: browser/webhook/cron), convenções de _shared e o fluxo de deploy hosted vs self-hosted; idealmente gerado por script a partir das pastas.

### Funções mortas em produção: hello (sample do template) e audio-transcribe (substituída)
- **Área:** Qualidade das edge functions (T25: duplicação e tratamento de erro; T26: consistência, docs e funções mortas)
- **Local:** `supabase/functions/hello/index.ts:1`
- **Categoria:** codigo-morto · **Esforço:** baixo
- **Problema:** hello/index.ts é o exemplo intocado do template Supabase (std@0.177.1, comentário 'Follow this setup guide...'), sem auth, sem CORS, sem referência em src/ nem config.toml — endpoint público inútil ampliando superfície. audio-transcribe não tem nenhuma invocação no frontend (única referência é um comentário em src/__tests__/security-simulations.test.ts:1693); coexistem 3 funções de transcrição: audio-transcribe (morta), speech-to-text (usada em useAudioRecorder.ts:102) e ai-transcribe-audio (usada em AudioMessagePlayer.tsx:181). Há ainda dupla implementação de MCP: mcp/ (auto-gerada pelo plugin Lovable) e mcp-server/ (manual, std@0.168.0).
- **Recomendação:** Remover hello/ e audio-transcribe/ do repo e do projeto deployado; decidir entre mcp e mcp-server e eliminar a outra.

### Função de compliance LGPD engole falhas da trilha de auditoria com .catch(() => {})
- **Área:** Qualidade das edge functions (T25: duplicação e tratamento de erro; T26: consistência, docs e funções mortas)
- **Local:** `supabase/functions/lgpd-scheduled-jobs/index.ts:95`
- **Categoria:** tratamento-de-erro · **Esforço:** baixo
- **Problema:** Após anonimizar um contato, o insert em contact_audit_log ('pii_anonymized') é feito com '.catch(() => {})' (linha 95) — se o insert falhar, o contato é anonimizado sem registro de auditoria e ninguém fica sabendo. O mesmo padrão na linha 231: o relatório final do job em migration_audit também é '.catch(() => {})'. Em contexto LGPD, a trilha de auditoria é justamente a evidência de conformidade; falha silenciosa aqui anula o propósito.
- **Recomendação:** No mínimo logar o erro (console.error com contact_id) e incluir contador de falhas de auditoria no relatório do job; idealmente marcar o job como parcial quando a auditoria falhar.

### Fallback de erro redireciona usuário para domínio Lovable legado hardcoded
- **Área:** Qualidade das edge functions (T25: duplicação e tratamento de erro; T26: consistência, docs e funções mortas)
- **Local:** `supabase/functions/email-track-link/index.ts:94`
- **Categoria:** regressao/pendente · **Esforço:** baixo
- **Problema:** No catch geral, qualquer erro (token inválido, DB fora) responde 302 com "Location: 'https://pronto-talk-suite.lovable.app'" — o domínio do antigo preview Lovable, não o app de produção. Destinatário de e-mail que clica num link rastreado com problema cai num app abandonado/de preview (mesmo domínio legado usado como fallback em _shared/validation.ts:248). Relacionado à migração Lovable→self-hosted já mapeada nas auditorias anteriores, mas este ponto específico não consta no QA_REPORT_2026-07-11.
- **Recomendação:** Usar env var (ex.: PUBLIC_APP_URL) para o destino de fallback e remover todas as referências hardcoded a *.lovable.app das funções.

### Interface manual EmailThread contradiz o Row gerado de email_threads e nao tem fonte de verdade
- **Área:** Rigor TypeScript (Tarefas 30-31)
- **Local:** `src/types/gmail.ts:35`
- **Categoria:** divergencia-schema · **Esforço:** medio
- **Problema:** EmailThread (gmail.ts:35-57) declara account_id, email_thread_id, from_email, from_name, unread_count, sla_status e first_reply_at — nenhum desses campos existe no Row gerado de email_threads em types.ts, que tem gmail_account_id, gmail_thread_id, is_unread (boolean real), priority e status. A interface presumivelmente espelha o retorno do RPC rpc_email_search_threads, mas esse RPC nao e tipado em types.ts nem types-manual (ver finding das 32 RPCs), entao nao ha nenhuma fonte de verdade verificavel. A interface ainda contem `contact?: any` (linha 55). O comentario na linha 59 ('Duplicate identifier EmailThread removed') indica que ja houve duplicacao dessa interface no passado.
- **Recomendação:** Tipar o retorno de rpc_email_search_threads (via types-manual Functions ou zod schema com `satisfies`) e derivar EmailThread desse tipo em vez de manter interface solta; remover o `contact?: any`.

### Todos os 6 mappers de email recebem data: any e mascaram divergencia de schema com defaults silenciosos
- **Área:** Rigor TypeScript (Tarefas 30-31)
- **Local:** `src/utils/emailMappers.ts:20`
- **Categoria:** any-em-dados-de-api · **Esforço:** baixo
- **Problema:** emailMappers.ts e o pior arquivo do src em ': any' (12 ocorrencias): account (linha 20), tokenInfo (35), thread (49), metric (76), label (88), unifiedAccount (102) e os 6 helpers de array (119-124) recebem `data: any` vindo de tabelas/RPCs do Supabase. Combinado com defaults (`data.unread_count || 0`, `data.is_active ?? true`, `data.label_ids || []`), qualquer campo renomeado ou removido no banco vira 0/true/[] silenciosamente em vez de erro — exatamente o cenario do finding EmailThread, onde unread_count nao existe na tabela gerada. O comentario do proprio arquivo ('Elimina a necessidade de casts as any') apenas centralizou o any.
- **Recomendação:** Tipar o parametro de cada mapper com o Row gerado correspondente (Tables<'email_accounts'> etc.) ou com schema zod para os retornos de RPC, deixando o compilador acusar drift de schema.

### types-manual.ts marca todas as colunas como nullable (466 '| null' vs 58 nao-nulos), inclusive primary keys
- **Área:** Rigor TypeScript (Tarefas 30-31)
- **Local:** `src/integrations/supabase/types-manual.ts:29`
- **Categoria:** divergencia-schema · **Esforço:** baixo
- **Problema:** O arquivo (802 linhas, gerado manualmente de information_schema em 2026-07-11 e mergeado no client via ExtendedDatabase — client.ts:105) declara praticamente todo campo como nullable: 466 ocorrencias de '| null' contra 58 campos nao-nulos. Exemplo: ai_providers.Row tem `id: string | null`, `name: string | null`, `created_at: string | null` (linhas 29-44) — um PK uuid NOT NULL tipado como nullable. O cabecalho do arquivo diz que a origem foi information_schema.columns com is_nullable, mas a nulabilidade real nao foi transposta. Consequencia pratica: todo consumidor dessas 20+ tabelas precisa de optional chaining ou non-null assertion desnecessarios, empurrando o codigo para casts.
- **Recomendação:** Regerar as entradas do ManualPublicTables respeitando is_nullable='NO' (id, created_at, etc. sem '| null'), ou priorizar capturar essas tabelas no fluxo gerado oficial para aposentar o arquivo manual.

### Repositorio de conexoes WhatsApp escreve no banco e chama Evolution API inteiramente com any
- **Área:** Rigor TypeScript (Tarefas 30-31)
- **Local:** `src/features/connections/data-access/whatsappConnectionRepository.ts:21`
- **Categoria:** any-em-dados-de-api · **Esforço:** baixo
- **Problema:** A camada data-access de conexoes tem todas as operacoes sem tipo: `updateConnection(id: string, updates: any)` (linha 21), `insertConnection(data: any)` (30), `logQrAttempt(data: any)` (36), `updateQrAttempt(id, updates: any)` (40), `callEvolutionApi(body: any)` (44) e `callEvolutionApiV2(path, options: any)` (48). E o unico lugar que valida shape de escrita dessas tabelas, e nao valida nada — coluna errada num update so falha em runtime. O consumidor useConnectionsActions.ts agrava: `connections: any[]`, `setNewConnection: (v: any)`, `handleShowQrCode: (conn: any)`, `newConnection: any` (linhas 11-19), ou seja, todo o estado de conexoes flui como any pela feature.
- **Recomendação:** Tipar updates/data com TablesUpdate<'whatsapp_connections'>/TablesInsert<...> dos types gerados e criar um tipo para o body da Evolution API (ja existem tipos em src/types/evolutionExternal.ts para o dominio).

### tsconfig.json raiz carrega compilerOptions morta e contraditoria (strictNullChecks:false, noImplicitAny:false)
- **Área:** Rigor TypeScript (Tarefas 30-31)
- **Local:** `tsconfig.json:18`
- **Categoria:** configuracao-typescript · **Esforço:** baixo
- **Problema:** O tsconfig.json raiz e um solution file ("files": [] + references), entao suas compilerOptions nao se aplicam ao build — mas declara `"noImplicitAny": false` (linha 4), `"strictNullChecks": false` (linha 18) e `"allowJs": true` (linha 3), contradizendo o tsconfig.app.json (strict:true). Editores e ferramentas que resolvem o tsconfig mais proximo para arquivos fora do include dos projetos referenciados (scripts/, e2e/, arquivos novos) aplicam essas opcoes frouxas silenciosamente, e qualquer dev que leia o arquivo raiz conclui erroneamente que o projeto roda sem strictNullChecks. Nao ha nenhum .js/.jsx em src que justifique allowJs.
- **Recomendação:** Remover as compilerOptions de checagem do solution file raiz (manter apenas paths se necessario para tooling), deixando tsconfig.app.json/tsconfig.node.json como unicas fontes de verdade.

### ~200 no-explicit-any conhecidos persistem, concentrados em cache do React Query e handlers de webhook/OAuth
- **Área:** Rigor TypeScript (Tarefas 30-31)
- **Local:** `src/features/inbox/hooks/team-chat/useTeamChatMutations.ts:29`
- **Categoria:** regressao/pendente · **Esforço:** medio
- **Problema:** FALHAS_E_GAPS.md (linha 54) ja registra '~200 no-explicit-any restantes' como limpeza incremental — o numero confere (173 ': any' + 54 'as any' medidos hoje) e persiste. Os pontos mais perigosos entre eles: (1) useTeamChatMutations.ts atualiza cache do React Query com `(oldData: any)`, `(page: any)`, `(m: any)` em 11 pontos (linhas 29-175) e `metadata?: any` (316), todos anotados com `// ignore-audit` (41 marcadores desse tipo no src — supressao informal de auditoria); (2) useGmailOAuthFlow.ts le resposta de edge function OAuth com `(result as any).token_expiry` (linhas 116, 122) e `(result as any).expiration` (168, 172); (3) useExternalEvolution.ts le mensagens do WhatsApp com `(m as any).media_meta?.ptt` e `(m as any).audio_meme_id` (linhas 147-148, 187-188) apesar de media_meta existir tipado em src/types/evolutionExternal.ts:42; (4) useEvolutionApiIntegration.ts filtra instancias da Evolution API com `(i: any) => i.connectionStatus` (linha 108).
- **Recomendação:** Priorizar na limpeza incremental os anys que tocam dados externos (OAuth, Evolution API, cache de mensagens) em vez de ordem arbitraria; tipar oldData dos setQueryData com o tipo real das paginas do infinite query; formalizar ou eliminar a convencao '// ignore-audit'.

### whatsapp-webhook (legacy) processa POST sem validar X-Hub-Signature-256
- **Área:** Segurança das Edge Functions Supabase (supabase/functions/ — Tarefas 22-24: autenticação, webhooks, service_role/CORS/rate-limit)
- **Local:** `supabase/functions/whatsapp-webhook/index.ts:72`
- **Categoria:** webhook-signature · **Esforço:** baixo
- **Problema:** O handler GET valida o hub.verify_token (linhas 47-68), mas o handler POST (linhas 72-124) NÃO valida a assinatura X-Hub-Signature-256 da Meta — aceita qualquer POST e atualiza messages.status por external_id via service_role (linhas 100-107). Um atacante pode forjar status updates (sent/delivered/read/failed) de mensagens arbitrárias. Diferente do whatsapp-cloud-webhook, que valida HMAC corretamente. Com o gateway em VERIFY_JWT=false, o endpoint é totalmente público.
- **Recomendação:** Validar X-Hub-Signature-256 com HMAC-SHA256 usando o app secret (reutilizar verifyHmacSignature de _shared/hmac-validation.ts), fail-closed. Ou descontinuar este endpoint legacy em favor do whatsapp-cloud-webhook.

### sicoob-outbox-consumer sem qualquer autenticação inbound
- **Área:** Segurança das Edge Functions Supabase (supabase/functions/ — Tarefas 22-24: autenticação, webhooks, service_role/CORS/rate-limit)
- **Local:** `supabase/functions/sicoob-outbox-consumer/index.ts:9`
- **Categoria:** autenticacao · **Esforço:** baixo
- **Problema:** A função não faz NENHUMA checagem do request (grep por req.headers/Authorization/CRON_SECRET não retorna nada) — apenas trata OPTIONS e segue direto ao processamento (linhas 9-40). Ela drena a outbox e dispara chamadas HTTP externas ao bridge Sicoob usando o SICOOB_GIFTS_BRIDGE_SECRET. Como o gateway está VERIFY_JWT=false, qualquer um pode invocar o endpoint repetidamente para forçar processamento/reenvio. Todas as outras funções de cron do projeto (nps-scheduler, auto-close-conversations, lgpd-scheduled-jobs, queue-rebalance etc.) usam requireServiceRoleOrCron/requireServiceRoleOnly — esta é a exceção.
- **Recomendação:** Adicionar requireServiceRoleOrCron(req) no início do handler, como nas demais funções de cron.

### bitrix-api sem JWT — proteção apenas por Origin (forjável server-to-server)
- **Área:** Segurança das Edge Functions Supabase (supabase/functions/ — Tarefas 22-24: autenticação, webhooks, service_role/CORS/rate-limit)
- **Local:** `supabase/functions/bitrix-api/index.ts:31`
- **Categoria:** autenticacao · **Esforço:** baixo
- **Problema:** config.toml define verify_jwt=false para bitrix-api e a função não checa JWT/role; a única barreira é validateBitrixOrigin + isAppOrigin (linhas 31-43), baseada no header Origin. O próprio comentário admite tentar 'fechar o vetor server-to-server', mas o header Origin é trivialmente forjável por qualquer cliente não-browser (curl). Um atacante externo pode invocar ações CRM (create/update/delete de lead/contact/deal, register_call) que são proxiadas ao BITRIX_WEBHOOK_URL configurado.
- **Recomendação:** Exigir autenticação real (requireUser/requireAdminOrSupervisor) em vez de confiar no header Origin, que não é uma fronteira de segurança para clientes não-browser.

### elevenlabs-webhook fail-open + comparação não timing-safe + injeção em audit_logs
- **Área:** Segurança das Edge Functions Supabase (supabase/functions/ — Tarefas 22-24: autenticação, webhooks, service_role/CORS/rate-limit)
- **Local:** `supabase/functions/elevenlabs-webhook/index.ts:17`
- **Categoria:** webhook-signature · **Esforço:** baixo
- **Problema:** A validação do token é opcional: `if (expectedToken && token !== expectedToken)` (linha 17) — se ELEVENLABS_WEBHOOK_SECRET não estiver setado, qualquer POST é aceito. A comparação usa `!==` (não timing-safe) sobre um query param, ignorando o header de assinatura HMAC real do ElevenLabs. O body inteiro é gravado em audit_logs.details (linha 41), permitindo poluição/injeção de registros de auditoria por um atacante anônimo.
- **Recomendação:** Fail-closed quando o secret não estiver configurado; validar a assinatura HMAC oficial do ElevenLabs com comparação timing-safe (timingSafeEqual já existe em _shared).

### Rate-limiter in-memory (por isolate) é ineficaz em endpoints públicos de segurança
- **Área:** Segurança das Edge Functions Supabase (supabase/functions/ — Tarefas 22-24: autenticação, webhooks, service_role/CORS/rate-limit)
- **Local:** `supabase/functions/_shared/validation.ts:377`
- **Categoria:** rate-limiting · **Esforço:** medio
- **Problema:** checkRateLimit usa um Map em memória do isolate (linha 377-407, comentário: 'per-isolate, resets on cold start'). Edge functions escalam horizontalmente e sofrem cold starts frequentes, então cada isolate tem seu próprio contador. Isso enfraquece severamente os limites em endpoints sensíveis que dependem dele: login-attempts (brute force / lockout), public-api, get-sip-password, create-user, approve-password-reset. Um atacante distribuído (ou simplesmente atingindo isolates diferentes) contorna os limites. O webhook do Evolution, em contraste, usa o rate-limiter baseado em banco (_shared/rate-limiter.ts), que é robusto.
- **Recomendação:** Migrar os limites de endpoints de segurança para o rate-limiter atômico baseado em banco (RPC INSERT ON CONFLICT) já existente em _shared/rate-limiter.ts.

### public-api compara API token com !== (não timing-safe) e token em plaintext
- **Área:** Segurança das Edge Functions Supabase (supabase/functions/ — Tarefas 22-24: autenticação, webhooks, service_role/CORS/rate-limit)
- **Local:** `supabase/functions/public-api/index.ts:37`
- **Categoria:** timing-attack · **Esforço:** baixo
- **Problema:** O token do header x-api-key é comparado com `setting.value !== apiKey` (linha 37), comparação não constante no tempo, permitindo enumeração por timing. O token fica em global_settings.value em plaintext (linha 31-35). O endpoint permite envio de mensagens WhatsApp via service_role para qualquer contato.
- **Recomendação:** Usar timingSafeStringEqual (já disponível em _shared/auth.ts) para comparar o token; armazenar apenas hash do token no banco.

### contacts-import: upsert por remote_jid (chave global) via service_role sobrescreve contatos alheios
- **Área:** Segurança das Edge Functions Supabase (supabase/functions/ — Tarefas 22-24: autenticação, webhooks, service_role/CORS/rate-limit)
- **Local:** `supabase/functions/contacts-import/index.ts:122`
- **Categoria:** regressao/pendente · **Esforço:** medio
- **Problema:** O upsert usa `onConflict: 'remote_jid'` com ignoreDuplicates:false (linha 122) via service_role. Embora exista verificação de dono da CONEXÃO (linhas 76-90), não há verificação de dono do CONTATO: qualquer usuário que possua uma conexão pode, ao importar um número que colida com remote_jid existente, sobrescrever full_name/email/company/notes/tags do contato de outro usuário/tenant. Achado já documentado em QA_REPORT_2026-07-11 (linha 74).
- **Recomendação:** Escopar o conflito por (instance_name, remote_jid) do dono, ou verificar propriedade do contato antes de sobrescrever; usar client RLS-enforced em vez de service_role para o upsert.

### Permissão de download (can_download) é controle puramente cosmético
- **Área:** Segurança do frontend (T19 XSS, T20 Segredos/dados sensíveis, T21 Autorização no cliente)
- **Local:** `src/hooks/useDownloadPermission.ts:8`
- **Categoria:** autorizacao-client-only · **Esforço:** alto
- **Problema:** useDownloadPermission lê profiles.can_download e é usado em useExportData.ts:38 e ImagePreview.tsx:23 apenas para esconder/bloquear botões. O CSV é gerado 100% no cliente a partir de dados já em memória (useExportData.ts:37-58: monta o blob localmente com `data` já carregado), e as imagens já estão renderizadas via <img src=media_url>. Um usuário com can_download=false tem os dados e as URLs de mídia no DOM/estado e pode extraí-los via DevTools, right-click ou acessando media_url direto — o bloqueio não protege a ação, só a esconde (T21: esconder botão != proteger acao).
- **Recomendação:** Reconhecer que DLP não é possível puramente no cliente. Se o requisito for real, aplicar no servidor: servir mídia por URLs assinadas de curta duração emitidas por edge function que cheque can_download, e gerar exports (CSV/PDF) em edge function server-side que também valide a permissão, em vez de montar o arquivo no browser.

### Token de sessão Supabase persistido em localStorage (roubável via XSS)
- **Área:** Segurança do frontend (T19 XSS, T20 Segredos/dados sensíveis, T21 Autorização no cliente)
- **Local:** `src/integrations/supabase/client.ts:110`
- **Categoria:** regressao/pendente · **Esforço:** alto
- **Problema:** getSupabaseStorage() retorna window.localStorage e é passado como storage do createClient (persistSession:true, linhas 93-115). O access_token/refresh_token ficam em localStorage, legíveis por qualquer script no mesmo origin. Já listado como pendente em FALHAS_E_GAPS.md (linhas 48/63/75) e depende de migração para httpOnly cookies. Embora a superfície de XSS esteja bem mitigada hoje, qualquer XSS futuro resulta em roubo de sessão completo.
- **Recomendação:** Planejar migração do armazenamento de sessão para cookies httpOnly + SameSite (requer coordenação com o backend/edge). Enquanto isso, manter o rigor atual de sanitização e adicionar CSP restritiva como defesa em profundidade.

### VITE_EVOLUTION_API_KEY, se configurada, vaza a chave da Evolution no bundle público
- **Área:** Segurança do frontend (T19 XSS, T20 Segredos/dados sensíveis, T21 Autorização no cliente)
- **Local:** `src/integrations/zappweb/evolutionClient.ts:49`
- **Categoria:** segredos · **Esforço:** medio
- **Problema:** ENV_KEY_OVERRIDE = import.meta.env.VITE_EVOLUTION_API_KEY. Variáveis VITE_* são inlined em texto claro no bundle servido ao browser. O código documenta isso como 'override de emergência' e o fluxo padrão busca a key em runtime via edge fn evolution-credentials (correto), mas basta um deploy definir essa env no Vercel para que a chave da Evolution API (que dá controle total sobre o WhatsApp) fique exposta a todos os visitantes. É um footgun latente sem guarda que impeça o uso em produção.
- **Recomendação:** Remover o caminho de override baseado em VITE_ ou trocá-lo por um mecanismo que nunca use import.meta.env (ex.: exigir sempre a edge fn). No mínimo, adicionar um aviso/guard que falhe o build de produção se VITE_EVOLUTION_API_KEY estiver presente.

### src/features/ (arquitetura alvo do app) tem 1,7% de cobertura de arquivos; pages 1,0%; services 0%
- **Área:** Testes unitarios (T32-T33)
- **Local:** `src/features`
- **Categoria:** cobertura-critica · **Esforço:** alto
- **Problema:** Contagem direta: features = 464 arquivos de codigo e 8 arquivos de teste (auth/mfa 1, inbox 6, sla 1); pages = 104 arquivos e 1 teste (AdminGmailStatusPage.test.ts); services = 5 arquivos e 0 testes; components = 501 vs 26. Hooks criticos do inbox como useTransferConversation.ts, useTicketStatus.ts, useMessagesCursor.ts, useRealtimeInbox.ts e useChatMediaSending.ts nao tem teste. O modulo de pagamentos (src/components/payments/PaymentLinksView.tsx) tambem tem zero teste.
- **Recomendação:** Definir cobertura minima por diretorio no vitest (coverage.thresholds por glob) e priorizar features/inbox/hooks e components/payments nas proximas sprints de teste.

### Convencao de testes (criada ontem) ja diverge do vitest.config.ts real e os diretorios deprecados seguem ativos
- **Área:** Testes unitarios (T32-T33)
- **Local:** `TESTING_CONVENTION.md:25`
- **Categoria:** regressao/pendente · **Esforço:** baixo
- **Problema:** TESTING_CONVENTION.md:25-34 documenta um include com 4 globs (co-located, src/__tests__, e os deprecados src/tests e src/test), mas vitest.config.ts usa um unico glob `src/**/*.{test,spec}.{ts,tsx}` com exclude de src/tests/e2e. Os diretorios 'deprecados' (linha 18-19: 'migrar gradualmente... Nao criar novos arquivos') ainda contem 5 testes ativos (src/test/realtimeFanout*.test.ts, stress-test.test.ts, src/tests/e2e/app-boot.spec.ts). A convencao manda co-locar, mas 136 dos 142 testes estao em pastas __tests__.
- **Recomendação:** Atualizar o bloco de codigo do TESTING_CONVENTION.md para refletir o config real (ou vice-versa) e concluir a migracao dos 5 arquivos de src/test|src/tests, removendo os diretorios.

### Testes duplicados com conteudo divergente: useDebounce e utils testados em dois lugares
- **Área:** Testes unitarios (T32-T33)
- **Local:** `src/hooks/useDebounce.test.ts:1`
- **Categoria:** duplicacao · **Esforço:** baixo
- **Problema:** Existem src/hooks/useDebounce.test.ts (57 linhas) E src/hooks/__tests__/useDebounce.test.ts (108 linhas) — diff confirma conteudo diferente; idem src/lib/utils.test.ts (21 linhas) vs src/lib/__tests__/utils.test.ts (51 linhas). Ambos os pares rodam na suite (o glob unico pega os dois), duplicando execucao e criando ambiguidade sobre qual arquivo manter/atualizar.
- **Recomendação:** Mesclar cada par no arquivo mais completo seguindo a convencao escolhida (co-located ou __tests__) e deletar o outro.

### Teste de regressao da migracao audit_logs valida texto-fonte via regex, nao comportamento
- **Área:** Testes unitarios (T32-T33)
- **Local:** `src/features/inbox/components/__tests__/TicketHistorySheet.audit-mapping.test.ts:26`
- **Categoria:** teste-de-implementacao · **Esforço:** medio
- **Problema:** O teste faz readFileSync de 3 arquivos de producao e aplica regex: `expect(src).not.toMatch(/\.from\(['"]conversation_audit_logs['"]\)/)` e `expect(src).toMatch(/entity_type:\s*'conversation'/)` (linhas 26-38). Passa se o codigo contiver a string mesmo em codigo morto/comentado, e quebra em refactors legitimos (ex.: extrair o insert para helper em outro arquivo faria o toMatch de audit_logs falhar ou, pior, o not.toMatch continuar passando enquanto o helper regride). E a UNICA 'cobertura' do messageSender.
- **Recomendação:** Substituir (ou complementar) por teste comportamental: mockar o client e assertar que o insert e feito na tabela audit_logs com entity_type/entity_id/details corretos.

### Teste do hook central de autenticacao cobre apenas 3 caminhos felizes
- **Área:** Testes unitarios (T32-T33)
- **Local:** `src/hooks/__tests__/useAuth.test.tsx:42`
- **Categoria:** cobertura-rasa · **Esforço:** baixo
- **Problema:** useAuth.test.tsx tem 82 linhas e 3 casos: estado inicial, signIn com sucesso e signOut. Nao ha teste de erro de credencial, signUp, expiracao/refresh de sessao, nem do fluxo onAuthStateChange (o mock da linha 13 devolve subscription inerte e nunca dispara callback). Os asserts principais verificam apenas que o mock foi chamado (`expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith(...)`, linha 63). auth-flows.test.tsx em src/__tests__ complementa parcialmente, mas o caminho de erro do provider segue sem cobertura.
- **Recomendação:** Adicionar casos: signIn com error retornado, signUp, disparo do callback de onAuthStateChange (login/logout) e carregamento de profile com erro.

### logger.error envia erro sintético ao Sentry — perde stack original e destrói agrupamento
- **Área:** Tratamento de erros e observabilidade (Tarefas 42-43)
- **Local:** `src/lib/logger.ts:88`
- **Categoria:** observabilidade · **Esforço:** baixo
- **Problema:** `Sentry.captureException(new Error(`${this.module}: ${message}`), { extra: { args } })` cria um Error novo cujo stack aponta para logger.ts, não para o ponto do erro real; o erro original vira string em extra.args. Como praticamente TODO reporte de erro do app passa por log.error (não há nenhum captureException direto fora de logger.ts/sentry.ts), todos os issues no Sentry agrupam por mensagem com stack inútil. Além disso, erros que também disparam window.onerror são reportados em duplicata (uma vez pelo instrumento nativo do SDK, outra pela sintética do logger).
- **Recomendação:** Se o primeiro arg de log.error for instanceof Error, passar o próprio objeto para captureException (preservando stack) e usar a mensagem como context/tag; caso contrário usar captureMessage.

### JSON.stringify sem try/catch no breadcrumb — logar objeto circular faz o próprio logger lançar exceção em produção
- **Área:** Tratamento de erros e observabilidade (Tarefas 42-43)
- **Local:** `src/lib/logger.ts:58`
- **Categoria:** bug · **Esforço:** baixo
- **Problema:** addToSentryBreadcrumb executa `data: args.length > 0 ? { args: JSON.stringify(args) } : undefined` apenas em PROD (linha 53 retorna cedo em dev). Se qualquer chamada log.info/warn/error passar um objeto com referência circular (SyntheticEvent do React, RealtimeChannel do Supabase, nó DOM), JSON.stringify lança TypeError "Converting circular structure to JSON" — e a exceção propaga para o caller, que assume que logar nunca falha. O bug só se manifesta em produção, exatamente onde não seria visto em dev.
- **Recomendação:** Envolver a serialização em try/catch com fallback (ex.: String(args) ou safe-stringify), ou usar Sentry normalization passando args direto em data sem stringify manual.

### Supressão global de TODA unhandledrejection com name TimeoutError engole timeouts reais silenciosamente
- **Área:** Tratamento de erros e observabilidade (Tarefas 42-43)
- **Local:** `src/main.tsx:44`
- **Categoria:** observabilidade · **Esforço:** baixo
- **Problema:** O handler consolidado faz `if (name === 'TimeoutError' || name === 'InvalidStateError') { event.preventDefault(); return; }` sem inspecionar origem ou mensagem. O comentário justifica como "expected browser timeout from storage/IDB", mas AbortSignal.timeout de qualquer fetch/query também produz DOMException com name TimeoutError — o próprio ErrorBoundary trata TimeoutError como falha de query real (ErrorBoundary.tsx:51). Um timeout de rede/RPC que escape de um catch some sem console, sem Sentry e sem telemetria.
- **Recomendação:** Restringir a supressão por mensagem/stack (ex.: só suprimir quando a stack referencia IDB/service worker) ou ao menos registrar breadcrumb/contador antes do preventDefault.

### ~30 de 109 useMutation sem onError e sem MutationCache global — falhas silenciosas para o usuário
- **Área:** Tratamento de erros e observabilidade (Tarefas 42-43)
- **Local:** `src/components/providers/AppProviders.tsx:23`
- **Categoria:** tratamento-de-erros · **Esforço:** medio
- **Problema:** O QueryClient (linhas 23-43) define retry/staleTime mas nenhum queryCache/mutationCache com onError global. ~30 useMutation não têm onError próprio: ex. usePersonalStickers.ts:58 (toggleFavorite — falha não gera toast nem log), useTags.ts:191 (addTagMutation de contact_tags, exposta como mutateAsync em useTags.ts:228 — rejeição vira unhandledrejection no caller sem feedback), useTalkX.ts:104/119/130, gamification/mutations.ts:12/29/92/119. O usuário clica, nada acontece e nada é registrado.
- **Recomendação:** Adicionar MutationCache({ onError }) global no QueryClient com toast genérico + log.error, mantendo onError locais para mensagens específicas.

### incrementUseCount nunca executa a query — builder do supabase-js sem await/.then
- **Área:** Tratamento de erros e observabilidade (Tarefas 42-43)
- **Local:** `src/hooks/usePersonalStickers.ts:79`
- **Categoria:** bug · **Esforço:** baixo
- **Problema:** `supabase.from('stickers').update({ use_count: sticker.use_count + 1 }).eq('id', sticker.id);` — o PostgrestBuilder é lazy e só dispara a requisição quando await/then é chamado. Sem await, sem .then e sem void, a query NUNCA é executada: o contador de uso de figurinhas jamais incrementa (chamado em PersonalStickers.tsx:26 a cada envio). É o caso extremo de "promise sem catch": nem promise vira.
- **Recomendação:** `void supabase.from('stickers').update(...).eq(...).then(({ error }) => { if (error) log.warn(...) })`. Vale um grep por outros builders órfãos (padrão: linha iniciando com supabase.from sem await/void/.then).

### Metade das edge functions ignora o Logger estruturado com redação — 173 console.* crus em 53 arquivos
- **Área:** Tratamento de erros e observabilidade (Tarefas 42-43)
- **Local:** `supabase/functions/_shared/validation.ts:148`
- **Categoria:** observabilidade · **Esforço:** alto
- **Problema:** O Logger compartilhado (validation.ts:148-199) emite JSON estruturado com level/fn/rid/ms, honra x-request-id inbound para tracing fim-a-fim e aplica redactSecrets/redactDeep em toda saída. Mas 53 arquivos de função usam console.log/error/warn direto (173 ocorrências; ex. evolution-webhook/index.ts:230, evolution-followup/index.ts:34-54, gmail-token-refresh/index.ts:87-217, lgpd-scheduled-jobs/index.ts:67-236). Esses logs saem sem request-id (quebram a correlação com o cliente), sem duração e sem garantia de redação — a disciplina de logar só err.message é convenção manual, não mecanismo.
- **Recomendação:** Migrar gradualmente para o Logger compartilhado (prioridade: webhooks e funções que tocam PII) e adicionar regra de lint Deno proibindo console.* fora de _shared.

### Telemetria de queries do cliente é só em memória — erros de query somem no reload
- **Área:** Tratamento de erros e observabilidade (Tarefas 42-43)
- **Local:** `src/lib/clientTelemetry.ts:128`
- **Categoria:** observabilidade · **Esforço:** medio
- **Problema:** recordQueryEvent alimenta apenas estado em memória espelhado em window.__queryTelemetry (RECENT_LIMIT=50) e logs locais; nada é persistido server-side. O único fluxo cliente→query_telemetry é o de web-vitals (src/lib/web-vitals.ts → edge client-observability). Ou seja: os eventos de erro/timeout de query registrados inclusive pelo ErrorBoundary (ErrorBoundary.tsx:143 recordQueryEvent) nunca chegam ao painel AdminTelemetriaPage se o usuário recarregar a página — que é exatamente o que usuários fazem após um erro.
- **Recomendação:** Reaproveitar o batching do web-vitals para flushar eventos de severidade error/timeout ao client-observability (a tabela query_telemetry e o contrato já existem).

### Ingestão do GlitchTip (backend do Sentry DSN) já caiu em loop de DNS e o teste de confirmação nunca foi feito
- **Área:** Tratamento de erros e observabilidade (Tarefas 42-43)
- **Local:** `docs/EVOLUTION_API_AUDIT_2026-07-05_sessao6_webhook-eventos-glitchtip.md:35`
- **Categoria:** regressao/pendente · **Esforço:** medio
- **Problema:** A auditoria da sessão 6 registrou o GlitchTip rejeitando eventos em loop ('glitchtip-db: Name or service not known') — mesmo achado WS-1 do FMEA da sessão 5 — e a própria doc recomenda '1 evento sintético de teste para confirmar persistência no Postgres do GlitchTip (não feito nesta sessão)'. Como toda a observabilidade de erros do front (e o SENTRY_DSN da Evolution API) depende desse único ponto, uma recaída silenciosa significa zero visibilidade de erros de produção sem nenhum alerta.
- **Recomendação:** Executar o evento sintético pendente, adicionar healthcheck com restart automático no container glitchtip-web e um canário periódico (cron que envia captureMessage e alerta se não aparecer).

### Team chat: INSERT realtime sem dedupe continua duplicando mensagem própria
- **Área:** src/features/ (T9 estrutura de features, T10 auditoria das 3 maiores, T11 features abandonadas/incompletas)
- **Local:** `src/features/inbox/hooks/team-chat/useTeamMessages.ts:78`
- **Categoria:** regressao/pendente · **Esforço:** baixo
- **Problema:** O handler de `postgres_changes` INSERT faz `newPages[0] = { ...newPages[0], messages: [...newPages[0].messages, newMessage] }` sem verificar se `newMessage.id` já existe na página (mensagem própria já inserida pelo onSuccess da mutation). O `invalidateQueries` logo depois corrige após o refetch, mas o usuário vê a própria mensagem duplicada por um instante a cada envio. Item do QA 2026-07-11 ainda presente.
- **Recomendação:** Antes do append, checar `if (newPages[0].messages.some(m => m.id === newMessage.id)) return oldData;`.

### Fila restaurada do localStorage ainda pode reenviar áudio como texto placeholder
- **Área:** src/features/ (T9 estrutura de features, T10 auditoria das 3 maiores, T11 features abandonadas/incompletas)
- **Local:** `src/features/inbox/hooks/useMessageQueue.ts:90`
- **Categoria:** regressao/pendente · **Esforço:** baixo
- **Problema:** A persistência grava a fila com `attachments: undefined` (não serializável) e o restore mantém itens `type: 'audio'` com status 'pending' e content 'Mensagem de áudio' (adicionado por useRealtimeInbox.ts:312). Após reload, o processamento reenvia o item sem o blob de áudio — o cliente recebe o texto literal "Mensagem de áudio". Item do QA 2026-07-11 sem correção (o restore atual só zera progress/attachments, não descarta nem marca como falha itens de mídia órfãos).
- **Recomendação:** No restore, marcar itens de tipo 'audio'/'attachment' sem attachments como 'failed' (com aviso ao agente) em vez de 'pending'.

### Dois hooks useMessages distintos e divergentes coexistem (src/hooks vs features/inbox)
- **Área:** src/features/ (T9 estrutura de features, T10 auditoria das 3 maiores, T11 features abandonadas/incompletas)
- **Local:** `src/hooks/useMessages.ts:1`
- **Categoria:** duplicacao · **Esforço:** medio
- **Problema:** Dos 20 hooks homônimos entre src/hooks e features/*/hooks, 19 são shims de re-export corretos (ex.: hooks/useAuth.ts com 3 linhas), mas useMessages é duplicação real: src/hooks/useMessages.ts (295 linhas, evo.evolution_messages via RPC, interface Message própria com is_starred/sentiment) e src/features/inbox/hooks/useMessages.ts (158 linhas, messageService/messageRepository, Message de @/types/chat). Ambos usados: o primeiro por lib/inbox/chatOptimizations.ts e testes; o segundo por useInboxSource. Dois contratos de 'Message' diferentes sob o mesmo nome confundem manutenção e imports automáticos.
- **Recomendação:** Renomear um deles (ex.: useEvoMessages) ou consolidar; no mínimo documentar no topo de cada um qual pipeline atende.

### T9: adoção parcial da arquitetura de features — domínios fatiados entre árvores
- **Área:** src/features/ (T9 estrutura de features, T10 auditoria das 3 maiores, T11 features abandonadas/incompletas)
- **Local:** `src/features/contacts/index.ts:1`
- **Categoria:** arquitetura · **Esforço:** alto
- **Problema:** Só 6 features existem e a estrutura interna é inconsistente: contacts tem apenas 8 hooks (todos os 40+ componentes e os hooks de CRUD como useContactsCRUD.ts, useContactsViewState.ts vivem em src/components/contacts — hooks dentro de pasta de componentes); team-chat tem UI em src/components/team-chat e hooks em features/inbox/hooks/team-chat (o tipo AggregatedReaction é importado cruzando as duas árvores); sla não tem services/data-access; admin tem services/data-access só para 'agents'. Em paralelo, src/components mantém 61 diretórios de domínio (529 arquivos: pipeline, campaigns, crm360, omnichannel, tags, talkx...) e src/hooks 203 arquivos. Não há regra de lint (eslint boundaries) impedindo novas violações.
- **Recomendação:** Definir e documentar o alvo (feature-first) e migrar por domínio começando por contacts e team-chat, que já estão metade dentro/metade fora; adicionar eslint-plugin-boundaries para congelar o estado atual.

### Camada services/data-access do inbox quase inexistente — lógica de negócio em componentes
- **Área:** src/features/ (T9 estrutura de features, T10 auditoria das 3 maiores, T11 features abandonadas/incompletas)
- **Local:** `src/features/inbox/components/TicketTabs.tsx:1`
- **Categoria:** arquitetura · **Esforço:** alto
- **Problema:** O inbox tem 81 hooks e 248 componentes, mas só 3 services (messageService, whatsappStatusService) e 3 repositórios. 45 arquivos de features/ chamam supabase.from()/supabase.rpc() diretamente, sendo 20 componentes .tsx (TicketTabs, TicketActionsBar, InternalNotesPanel, MentionInput, StickerManager, RemindersPanel, ContactPurchasesPanel, ConversationTasksPanel...). Queries, mapeamento e regras de negócio ficam acoplados à UI, sem reuso nem testabilidade — o padrão repository/service existente é a exceção, não a regra.
- **Recomendação:** Ao tocar nesses componentes, extrair o acesso a dados para hooks React Query ou para a camada data-access existente; proibir import de '@/integrations/supabase/client' em *.tsx de components/ via lint.

### Barrel gigante com 115 `export *` e 44 imports circulares internos ao próprio barrel
- **Área:** src/features/ (T9 estrutura de features, T10 auditoria das 3 maiores, T11 features abandonadas/incompletas)
- **Local:** `src/features/inbox/index.ts:1`
- **Categoria:** manutenibilidade · **Esforço:** medio
- **Problema:** features/inbox/components/index.ts re-exporta 115 módulos com `export *` e o index raiz agrega components+hooks+services+data-access. 44 arquivos DENTRO de features/inbox importam do próprio barrel '@/features/inbox' (ex.: hooks/realtime/externalMessageSender.ts:20 importa parseEvolutionError de '@/features/inbox' em vez de './parseEvolutionError'), criando ciclos módulo→barrel→módulo que dependem de hoisting para funcionar, degradam tree-shaking e podem gerar 'Cannot access before initialization' conforme o chunking do Vite mudar. Além disso 103 componentes ficam flat na raiz de components/.
- **Recomendação:** Dentro da feature, importar sempre por caminho relativo direto; reservar o barrel para consumo externo; adicionar regra import/no-cycle. Organizar os 103 arquivos flat nas subpastas temáticas já existentes.

### useAdminData engole erros de fetch e faz upsert de role com workspace_id vazio
- **Área:** src/features/ (T9 estrutura de features, T10 auditoria das 3 maiores, T11 features abandonadas/incompletas)
- **Local:** `src/features/admin/hooks/useAdminData.ts:62`
- **Categoria:** correcao · **Esforço:** baixo
- **Problema:** Em fetchData, `error`, `rolesErr` e `logsErr` são destruturados e nunca verificados — se o SELECT em profiles/user_roles/audit_logs falhar (RLS, rede), o admin vê lista vazia sem nenhum aviso e `loading` termina como se tivesse dado certo. Em handleRoleChange, se a busca do workspace falhar, o upsert usa `workspace_id: ws?.id ?? ''` — string vazia numa coluna uuid NOT NULL gera erro de banco mascarado pelo toast genérico 'Erro ao atualizar role'.
- **Recomendação:** Tratar os três erros com toast/estado de erro; abortar handleRoleChange com mensagem clara quando o workspace não puder ser resolvido.

### getAllMessagesForContact pagina sem teto — carrega o histórico inteiro em memória
- **Área:** src/features/ (T9 estrutura de features, T10 auditoria das 3 maiores, T11 features abandonadas/incompletas)
- **Local:** `src/features/inbox/services/messageService.ts:45`
- **Categoria:** eficiencia · **Esforço:** medio
- **Problema:** O loop `while (hasMore)` busca páginas de 1000 mensagens via messageRepository até esgotar o histórico do contato, concatenando tudo em `allData`. Para conversas longas (dezenas de milhares de mensagens em atendimento WhatsApp) isso significa várias requisições sequenciais e todo o histórico em memória a cada seleção de conversa no modo local — sem limite, sem cursor reverso.
- **Recomendação:** Buscar apenas a última janela (ex.: 100 mensagens, order desc) e paginar sob demanda no scroll, como o modo externo já faz com loadOlder.

### createCampaign busca `profiles.single()` sem filtrar pelo usuário logado — created_by arbitrário ou null
- **Área:** src/hooks/ — inventário, duplicação, padrões react-query e corretude (Tarefas 12-14)
- **Local:** `src/hooks/useTalkX.ts:88`
- **Categoria:** correcao · **Esforço:** baixo
- **Problema:** Linha 88: `const { data: profile } = await supabase.from('profiles').select('id').single();` — sem `.eq('user_id', ...)`. Em base multi-agente (o normal neste app), .single() com >1 linha retorna erro PGRST116; como o erro é descartado (só `data` é destruturado), profile fica null e a campanha é criada com created_by null. Se RLS restringir a 1 linha por acaso, pega um profile arbitrário. Auditoria de quem criou campanhas de disparo em massa fica quebrada.
- **Recomendação:** Usar o user.id do useAuth e filtrar `.eq('user_id', user.id).single()`, tratando o erro explicitamente.

### pauseCampaign/cancelCampaign ignoram o `error` de functions.invoke — toast de sucesso em falha
- **Área:** src/hooks/ — inventário, duplicação, padrões react-query e corretude (Tarefas 12-14)
- **Local:** `src/hooks/useTalkX.ts:180`
- **Categoria:** correcao · **Esforço:** baixo
- **Problema:** Linhas 180-189 e 198-207: `await supabase.functions.invoke('talkx-send', ...)` sem destruturar/checar `error` (supabase-js não lança; retorna { error }). O catch só captura exceções de rede raras. Se a edge function falhar (4xx/5xx), o usuário vê 'Campanha pausada'/'Campanha cancelada' mas a campanha continua enviando mensagens. startCampaign (linha 160) faz o check corretamente — inconsistência dentro do mesmo arquivo.
- **Recomendação:** Destruturar `{ error }` e lançar antes do toast, como em startCampaign.

### useUserSettings e useNotificationSettings gravam as mesmas colunas de user_settings com caches independentes — last-writer-wins sobrescreve config
- **Área:** src/hooks/ — inventário, duplicação, padrões react-query e corretude (Tarefas 12-14)
- **Local:** `src/hooks/useUserSettings.ts:188`
- **Categoria:** duplicacao/arquitetura · **Esforço:** medio
- **Problema:** useNotificationSettings (react-query, key ['notification-settings', user.id], staleTime 5min) e useUserSettings (useState manual, fetch único no mount) leem/escrevem as MESMAS colunas: sound_enabled, quiet_hours_enabled/start/end, browser_notifications_enabled. saveSettings (linhas 188-219) regrava TODAS as 25 colunas com o snapshot local: se o usuário alterou som na tela de notificações (via useNotificationSettings) e depois salva a tela de configurações gerais (aberta antes), o valor antigo sobrescreve o novo. E nenhum dos dois invalida o cache do outro — a outra tela mostra dado stale por até 5min.
- **Recomendação:** Unificar em um único hook react-query para user_settings (ou payload parcial só com campos alterados) e invalidar ['notification-settings'] após saveSettings.

### Invalidações órfãs: ['profile'] e ['messages'] não correspondem a nenhuma query — UI não atualiza após mutação
- **Área:** src/hooks/ — inventário, duplicação, padrões react-query e corretude (Tarefas 12-14)
- **Local:** `src/features/auth/hooks/useSecureProfile.ts:35`
- **Categoria:** react-query/invalidacao · **Esforço:** medio
- **Problema:** useSecureProfileUpdate invalida `queryKey: ['profile']` (linha 35), mas nenhuma query no repo usa essa chave — os dados de perfil usam ['my-profile', user?.id] (useGoalsDashboard.ts:93, GoalsConfigDialog.tsx:61, useContactNotes.ts:28). Após salvar o perfil, nome/avatar exibidos não atualizam. Mesma classe: ChatMessagesArea.tsx:127 invalida ['messages'], chave que nenhuma query define (as mensagens são useState manual). Causa raiz: 163 invalidateQueries com strings literais e zero catálogo central de queryKeys — colisões e órfãs não são detectáveis pelo compilador.
- **Recomendação:** Criar módulo central de queryKeys tipado (padrão query key factory) e corrigir ['profile']→['my-profile'] imediatamente; remover a invalidação morta de ['messages'].

### resetSettings não checa o error do upsert — falha silenciosa e estado divergente do banco
- **Área:** src/hooks/ — inventário, duplicação, padrões react-query e corretude (Tarefas 12-14)
- **Local:** `src/hooks/useNotificationSettings.ts:160`
- **Categoria:** correcao · **Esforço:** baixo
- **Problema:** Linhas 160-179: `await supabase.from('user_settings').upsert({...})` sem destruturar `{ error }` nem `if (error) throw`. supabase-js não lança em erro de query, então o catch (linha 180) nunca dispara para falhas de RLS/validação: o cache otimista mostra defaults (setQueryData na linha 157) mas o banco mantém os valores antigos — ao recarregar, as configurações 'voltam'. updateSettings no mesmo arquivo faz o check correto (linha 145). Bônus: `isSaving` é hardcoded `false` (linha 107) e exportado na API pública — qualquer spinner de salvamento baseado nele nunca aparece.
- **Recomendação:** Destruturar `{ error }` e lançar; em erro, invalidar a query como updateSettings faz. Implementar ou remover isSaving.

### placeholderData global `(prev) => prev` aplica keepPreviousData a TODAS as queries — dados da entidade anterior exibidos sob a nova chave
- **Área:** src/hooks/ — inventário, duplicação, padrões react-query e corretude (Tarefas 12-14)
- **Local:** `src/components/providers/AppProviders.tsx:37`
- **Categoria:** react-query/ux · **Esforço:** medio
- **Problema:** AppProviders.tsx:37 define `placeholderData: (previousData) => previousData` nos defaults do QueryClient. Efeito: ao trocar a parte variável da queryKey, a query reporta status success com os dados da chave ANTERIOR enquanto busca. Exemplo concreto: useTalkX recipientsQuery (['talkx-recipients', selectedCampaignId], useTalkX.ts:72) — ao selecionar outra campanha, a lista mostra os destinatários da campanha anterior com recipientsLoading=false até a resposta chegar. Mesmo padrão afeta ['business-hours', connectionId], ['contact-tags', contactId], ['dept-*', id] etc., pois quase nenhum consumidor usa isPlaceholderData para sinalizar.
- **Recomendação:** Remover o placeholderData global e aplicá-lo apenas em queries de paginação/filtro onde a semântica é desejada, ou passar a exibir isPlaceholderData/isFetching nos consumidores críticos.

### Três implementações paralelas de carregamento de mensagens; a de src/hooks (295 linhas) é código morto
- **Área:** src/hooks/ — inventário, duplicação, padrões react-query e corretude (Tarefas 12-14)
- **Local:** `src/hooks/useMessages.ts:85`
- **Categoria:** duplicacao/dead-code · **Esforço:** medio
- **Problema:** Coexistem: (1) src/hooks/useMessages.ts — 295 linhas, RPC listMessagesLite + realtime em evo.evolution_messages, cujo hook NINGUÉM importa (único import é o type Message em src/lib/inbox/chatOptimizations.ts:1); (2) src/features/inbox/hooks/useMessages.ts — 158 linhas, messageService + messageRepository, usado por useInboxSource/ChatPopup; (3) useExternalMessages dentro de useExternalEvolution.ts (linhas 553-831) — polling + dedupedFetch cross-aba, usado no inbox principal. Três modelos de Message, três lógicas de dedupe/otimistas divergentes — qualquer fix de race precisa ser aplicado 3 vezes (e de fato o guard de jid existe parcialmente em uma e falta nas outras).
- **Recomendação:** Excluir o hook morto de src/hooks/useMessages.ts (movendo o type Message para types/) e planejar consolidação das duas implementações vivas.

### 60 hooks de dados fora do react-query: estado e canal realtime duplicados por consumidor
- **Área:** src/hooks/ — inventário, duplicação, padrões react-query e corretude (Tarefas 12-14)
- **Local:** `src/hooks/useQueues.ts:39`
- **Categoria:** arquitetura/react-query · **Esforço:** alto
- **Problema:** 60 dos hooks de src/hooks que acessam supabase usam useState+useEffect manual em vez de react-query (useQueues, useUserSettings, useEmailSLA, useQueueAnalytics, useLeaderboard, useSalesPipeline, admin/*, etc. — lista completa levantada por grep). Custo concreto: useQueues tem 8 importadores; cada montagem executa 3 queries (queues, queue_members, queue_positions inteira sem limit, linha 68-69) e abre um canal realtime próprio (linha 270-278) cujo callback refaz as 3 queries — N componentes montados = N canais + 3N queries por evento em zapp.queues. Sem cache, dedupe ou compartilhamento entre consumidores, ao contrário dos 43 hooks já em react-query.
- **Recomendação:** Migrar os hooks de leitura mais usados (useQueues primeiro, 8 importadores) para useQuery com invalidação disparada por UM canal realtime singleton (padrão já usado em useQueueGoals).

### Dashboard baixa a tabela contacts inteira a cada 15s para contar no cliente
- **Área:** src/hooks/ — inventário, duplicação, padrões react-query e corretude (Tarefas 12-14)
- **Local:** `src/hooks/useDashboardQueries.ts:86`
- **Categoria:** eficiencia · **Esforço:** medio
- **Problema:** useContactsPerQueueQuery (linhas 86-102): `dbFrom('contacts').select('id, queue_id, assigned_to', { count: 'exact' })` sem limit, com refetchInterval 15000, apenas para montar um Record de contagens no JS. useContactsQuery (linhas 27-43) idem: select sem limit + refetchInterval 15s, e o `{ count: 'exact' }` solicitado nunca é lido. Com dezenas de milhares de contatos (app WhatsApp em produção), são payloads integrais da tabela 4x por minuto por aba de dashboard aberta.
- **Recomendação:** Substituir por RPC agregado (GROUP BY queue_id) ou head:true + count, e remover counts não utilizados.

### jid.ts referencia suíte de testes inexistente; phoneNormalization.test.ts testa uma cópia local em vez do código de produção
- **Área:** src/lib, src/utils, src/services, src/adapters, src/shared (T15 duplicação / T16 qualidade dos módulos centrais)
- **Local:** `src/lib/jid.ts:41`
- **Categoria:** teste-enganoso · **Esforço:** medio
- **Problema:** O cabeçalho de jid.ts afirma 'Cobertura validada em src/lib/__tests__/jid.test.ts (129 casos)' — esse arquivo NÃO existe (find retorna apenas src/__tests__/resolve-jid-exhaustive.test.ts, que também não importa lib/jid). Pior: src/lib/__tests__/phoneNormalization.test.ts:5-8 define localmente `function normalizePhone(rawJid){ return rawJid.replace('@s.whatsapp.net','')... }` e testa essa cópia — zero import de phoneUtils ou jid. Resultado: os módulos de normalização de telefone mais críticos do sistema têm cobertura real nula, com documentação e nomes de teste que sugerem o contrário.
- **Recomendação:** Criar teste real importando de @/lib/jid e @/lib/phoneUtils (os 129 casos prometidos), deletar ou reescrever phoneNormalization.test.ts para exercitar o código de produção, e corrigir o comentário do cabeçalho.

### Dois módulos de som de notificação vivos em paralelo com exports homônimos e assinaturas incompatíveis
- **Área:** src/lib, src/utils, src/services, src/adapters, src/shared (T15 duplicação / T16 qualidade dos módulos centrais)
- **Local:** `src/utils/notificationSounds.ts:15`
- **Categoria:** duplicacao · **Esforço:** baixo
- **Problema:** utils/notificationSound.ts e utils/notificationSounds.ts exportam ambos playNotificationSound, requestNotificationPermission e showBrowserNotification com assinaturas diferentes (singular: `(type)`; plural: `(notificationType, soundType, volume)`) e cada um mantém seu próprio singleton de AudioContext. Ambos têm consumidores ativos: singular em 6 arquivos de produção (useWebhookHealthAlerts, useSentimentAlerts, useTranscriptionNotifications, useRealtimeNotifications...), plural em 5 (useSLANotifications, useGoalNotifications, ChatInputArea...). O som configurado pelo usuário (soundType/volume do plural) é ignorado por metade das notificações do app, e o import errado por nome quase idêntico é um erro fácil.
- **Recomendação:** Consolidar no módulo plural (que respeita SOUND_CONFIGS/volume), reexportar shim com assinatura antiga durante a migração e deletar notificationSound.ts.

### evolutionToRealtimeMessage constrói/muta mediaMeta mas nunca o inclui no retorno — flag ptt perdida
- **Área:** src/lib, src/utils, src/services, src/adapters, src/shared (T15 duplicação / T16 qualidade dos módulos centrais)
- **Local:** `src/adapters/evolutionAdapter.ts:23`
- **Categoria:** bug · **Esforço:** baixo
- **Problema:** Linhas 23-26: `const mediaMeta = (Array.isArray(evo.media_meta) ? {} : (evo.media_meta || {})); if ((evo.message_type === 'audioMessage' ...) && mediaMeta.ptt === undefined && evo.ptt !== undefined) { mediaMeta.ptt = evo.ptt; }`. O objeto retornado (linhas 28-49) não contém campo media_meta — a interface RealtimeMessage (useRealtimeMessages.ts:32) nem o define. Quando evo.media_meta é null, a atribuição vai para um objeto descartado (a flag PTT some); quando é objeto, o código MUTA o input por referência (efeito colateral silencioso no dado de origem). Consequência: áudio gravado (voice note) e arquivo de áudio ficam indistinguíveis no consumo do adapter.
- **Recomendação:** Ou adicionar media_meta ao RealtimeMessage e incluí-lo no retorno, ou remover o bloco morto; em qualquer caso eliminar a mutação do input (clonar antes).

### Dois ContractErrorCode conflitantes em src/shared/ e schemas com tipagem enfraquecida
- **Área:** src/lib, src/utils, src/services, src/adapters, src/shared (T15 duplicação / T16 qualidade dos módulos centrais)
- **Local:** `src/shared/webhookEventSchemas.ts:5`
- **Categoria:** duplicacao · **Esforço:** baixo
- **Problema:** shared/criticalPayloadSchemas.ts:1-8 declara `const ContractErrorCode = { INVALID_PAYLOAD, INVALID_PHONE_NUMBER, EMPTY_MESSAGE, INVALID_INSTANCE }` (const object) e shared/webhookEventSchemas.ts:5-8 declara `enum ContractErrorCode { INVALID_PAYLOAD, INVALID_EVENT_SHAPE }` — mesmo nome, conjuntos de valores diferentes, no mesmo diretório; o import errado compila e muda o contrato de erro. Além disso criticalPayloadSchemas.ts:11 usa `type ZodLike = any` para injetar o zod, perdendo toda a inferência de tipos dos schemas críticos de envio (sendTextPayloadSchema/publicApiSendSchema). Os row schemas cobrem bem realtime, mas o whatsappCloudWebhookSchema só valida o ramo `statuses` (mensagens recebidas passam sem validação).
- **Recomendação:** Unificar ContractErrorCode em um módulo único (shared/contractErrors.ts) com união dos códigos; importar `z` diretamente em criticalPayloadSchemas (o arquivo já vive no bundle com zod) e tipar os retornos com z.infer.

### Bloqueio 'system-wide' de exportação (LGPD) é contornado por 9+ geradores de CSV paralelos
- **Área:** src/lib, src/utils, src/services, src/adapters, src/shared (T15 duplicação / T16 qualidade dos módulos centrais)
- **Local:** `src/utils/exportReport.ts:18`
- **Categoria:** inconsistencia-politica · **Esforço:** medio
- **Problema:** exportReport.ts declara 'All export operations are disabled system-wide' e lança erro em exportToPDF/Excel/CSV. Mas a política só se aplica a quem importa esse módulo (SLADashboard, ExportButton, SLAHistoryDashboard). Em paralelo, lib/csvUtils.downloadCsvFile funciona livremente, useExportData.ts exporta CSV condicionado apenas a useDownloadPermission, e TalkXLiveMonitor.tsx, useAIUsageDashboard.ts, AdminTelemetriaPage.tsx, useContactsViewState.ts, crm360TabsConfig.ts geram Blobs text/csv diretamente sem nenhuma checagem — 36 arquivos no total usam URL.createObjectURL/createElement('a'). A 'política de segurança' anunciada no toast não corresponde à realidade do código.
- **Recomendação:** Decidir a política real: se exportação é permitida com permissão, aposentar exportReport.ts e canalizar TODOS os exports por um único gateway (useExportData + csvUtils) que aplica useDownloadPermission; se é proibida, remover os canais paralelos.

### Logger em produção: JSON.stringify sem guard pode fazer o próprio log.error lançar; captureException com Error sintético
- **Área:** src/lib, src/utils, src/services, src/adapters, src/shared (T15 duplicação / T16 qualidade dos módulos centrais)
- **Local:** `src/lib/logger.ts:58`
- **Categoria:** correctness · **Esforço:** baixo
- **Problema:** addToSentryBreadcrumb (só executa em PROD) faz `data: { args: JSON.stringify(args) }` sem try/catch — se qualquer arg tiver referência circular (elemento DOM, evento React, objeto de canal do supabase-js), JSON.stringify lança TypeError e a exceção propaga para o caller do log.error/warn, transformando uma linha de log em crash que não ocorre em DEV. Além disso, error() (linha 88) cria `Sentry.captureException(new Error(`${module}: ${message}`))` — stack trace sintético apontando para o logger, agrupando issues distintas e descartando o erro original que geralmente está em args.
- **Recomendação:** Envolver a serialização em try/catch (ou usar um safeStringify com WeakSet), e em error() capturar o primeiro arg instanceof Error como exceção real, usando a message como contexto.

### Formatadores reimplementados em massa fora de lib/formatters (duração 9x, moeda 3x, iniciais 3x em lib + inline)
- **Área:** src/lib, src/utils, src/services, src/adapters, src/shared (T15 duplicação / T16 qualidade dos módulos centrais)
- **Local:** `src/lib/formatters.ts:175`
- **Categoria:** duplicacao · **Esforço:** medio
- **Problema:** Apesar do cabeçalho 'Eliminates duplication... across components', formatDuration existe em 9 lugares com contratos divergentes (formatters.ts recebe SEGUNDOS; telemetryUtils.tsx:3, callCorrelation.ts:170, AdminEvolutionApiLogsPage.tsx:62, InboxKpiBar.tsx:19, useSLAAlerts.ts:28 e sla-timeline/types.ts:49 recebem MS; useAudioMemes.ts:332 e CallDialog.tsx:137 outras variantes). formatBRL é ignorado por formatCurrency locais em CrmBadges.tsx:29 e Contact360Helpers.tsx:98/135 (com formatos diferentes: 'R$ 1.234,56' vs toLocaleString). getInitials existe em lib/formatters.ts:94, lib/formatters.ts:108 (getInitialsFromNameOrEmail) e lib/avatar-colors.ts:30 — três no próprio lib/ — mais IncomingCallAlert.tsx:87 e ~14 inline. 16 usos de toLocaleDateString('pt-BR') ignoram formatShortDate.
- **Recomendação:** Adicionar formatDurationMs ao formatters.ts (resolvendo a ambiguidade s/ms no nome), deletar getInitials de avatar-colors reexportando do formatters, e migrar os call sites por codemod; documentar no CLAUDE.md que novos formatadores vão em lib/formatters.

### 167 acessos diretos a localStorage seguem ignorando o wrapper safeStorage
- **Área:** src/lib, src/utils, src/services, src/adapters, src/shared (T15 duplicação / T16 qualidade dos módulos centrais)
- **Local:** `src/lib/safeStorage.ts:8`
- **Categoria:** regressao/pendente · **Esforço:** medio
- **Problema:** O QA_REPORT_2026-07-11 (#1) corrigiu pontualmente o crash de boot do i18n em modo privado usando safeStorage, mas o padrão inseguro persiste: 167 ocorrências de `localStorage.` fora de safeStorage/testes/mocks em src/. Em Safari modo privado/webviews com storage bloqueado, qualquer uma dessas linhas em caminho de render lança SecurityError — a mesma classe de bug já reconhecida como P0 no relatório anterior, só que corrigida em um único arquivo.
- **Recomendação:** Regra ESLint no-restricted-globals/no-restricted-properties para localStorage/sessionStorage fora de lib/safeStorage.ts, com migração incremental priorizando código executado no boot e em rotas públicas.

### /debug/send-status-bus e /debug/realtime-fanout sem requiredRoles — inconsistente com o fix P0 de /debug/backend
- **Área:** src/pages/, App.tsx e roteamento (Tarefas 17-18)
- **Local:** `src/components/routing/AppRoutes.tsx:198`
- **Categoria:** seguranca/autorizacao · **Esforço:** baixo
- **Problema:** As rotas /debug/send-status-bus (AppRoutes.tsx:197-204) e /debug/realtime-fanout (205-212) usam <ProtectedRoute> sem requiredRoles, ou seja, qualquer agente autenticado acessa paineis internos de debug de infraestrutura. O comentario em AppRoutes.tsx:213-216 documenta que /debug/backend foi restringido a admin/dev exatamente por esse motivo ('FIX P0'), mas as duas rotas irmas ficaram de fora.
- **Recomendação:** Aplicar requiredRoles={['admin','dev']} as duas rotas de debug, igual a /debug/backend.

### Rotas /sla/preferences e /sla/alerts sem nenhum link de entrada no app
- **Área:** src/pages/, App.tsx e roteamento (Tarefas 17-18)
- **Local:** `src/components/routing/AppRoutes.tsx:181`
- **Categoria:** rota-orfa · **Esforço:** baixo
- **Problema:** As rotas /sla/preferences (AppRoutes.tsx:181-188) e /sla/alerts (189-196) existem e carregam paginas de 220 e 241 linhas, mas grep por 'sla/preferences' e 'sla/alerts' em todo o src nao encontra nenhum navigate(), <Link> ou href — os unicos acessos a SLA linkados sao /sla e /sla/history (components/queues/SLADashboard.tsx:50,156 e QueuesView.tsx:68). Funcionalidade de preferencias de alerta SLA e historico de alertas e inatingivel por navegacao normal.
- **Recomendação:** Adicionar botoes/links no SLADashboard (ex.: 'Preferencias de alertas' e 'Historico de alertas') ou remover as rotas e paginas se a funcionalidade foi substituida.

### Deep-link ?view= processado uma unica vez e sem searchParams nas deps do useEffect
- **Área:** src/pages/, App.tsx e roteamento (Tarefas 17-18)
- **Local:** `src/hooks/useIndexNavigation.ts:72`
- **Categoria:** bug/navegacao · **Esforço:** baixo
- **Problema:** O useEffect de deep-link (useIndexNavigation.ts:55-72) le searchParams.get('view') mas declara deps [loading, user, currentView, setCurrentView] — searchParams fica de fora — e o deepLinkViewHandledRef bloqueia qualquer processamento subsequente. Consequencia: com o app ja montado em '/', navegar para /connections ou /integrations (redirects de AppRoutes.tsx:442-449 para /?view=connections...) nao troca a view, pois o ref one-shot ja foi consumido no mount.
- **Recomendação:** Incluir searchParams nas deps e substituir o ref one-shot por comparacao com o ultimo valor processado (processar sempre que ?view mudar de fato).

### 4 paginas admin com 428-696 linhas misturando fetch, agregacao e UI no mesmo arquivo
- **Área:** src/pages/, App.tsx e roteamento (Tarefas 17-18)
- **Local:** `src/pages/AdminWebhookSecretStatusPage.tsx:1`
- **Categoria:** manutenibilidade/pagina-gigante · **Esforço:** medio
- **Problema:** AdminWebhookSecretStatusPage.tsx (696 linhas, 11 hooks useState/useEffect/useQuery), AdminWebhookEventsPage.tsx (673 linhas, 13 hooks), AdminWebhookOverviewPage.tsx (503 linhas) e AdminAlertHistoryPage.tsx (428 linhas, 12 hooks) concentram busca de dados, estado de filtros, agregacoes e renderizacao no proprio arquivo de pagina, mesmo ja existindo subpastas de componentes (src/pages/admin-webhook-secret-status/ tem 10 arquivos de apoio). O padrao do repo (features/*) nao e seguido nessas paginas.
- **Recomendação:** Extrair os hooks de dados (useWebhookSecretStatus, useWebhookEvents...) e as secoes de UI para as subpastas ja existentes ou para features/, deixando a pagina como composicao fina (<150 linhas).

### supabase.rpc('log_security_event') chamado no corpo do render do ProtectedRoute
- **Área:** src/pages/, App.tsx e roteamento (Tarefas 17-18)
- **Local:** `src/features/auth/components/ProtectedRoute.tsx:125`
- **Categoria:** bug/efeito-em-render · **Esforço:** baixo
- **Problema:** Em ProtectedRoute.tsx:125-131 e 146-152, o RPC de auditoria log_security_event e disparado diretamente durante o render (antes do return <Navigate/>). Em React 18 StrictMode (render duplo) e em qualquer re-render enquanto o estado de roles resolve, o evento de 'unauthorized_access' e gravado multiplas vezes, poluindo a trilha de auditoria com falsos positivos duplicados.
- **Recomendação:** Mover o log para um useEffect condicionado ao estado 'negado' (ou para o componente AccessDenied de destino), garantindo disparo unico por tentativa.

## 🔵 BAIXA

### Seis componentes com mesmo nome em diretórios diferentes, alguns com implementações divergentes
- **Área:** Arquitetura e organização do código (src/)
- **Local:** `src/components/dashboard/FloatingParticles.tsx`
- **Categoria:** duplicacao-codigo · **Esforço:** baixo
- **Problema:** Nomes duplicados em src/: FloatingParticles.tsx (components/voice 156 linhas vs components/dashboard 110 linhas — implementações diferentes, e src/features/admin/components/AdminView.tsx:3 importa a de dashboard), ConversationHeatmap.tsx (components/reports vs components/dashboard), MessageReactions.tsx (components/team-chat vs features/inbox/components), SLADashboard.tsx (components/queues vs pages), HistoryTab.tsx e MessagePreview.tsx. Confunde busca/refactor e favorece divergência silenciosa entre cópias.
- **Recomendação:** Unificar os pares que são variações do mesmo conceito (FloatingParticles, ConversationHeatmap) em um componente parametrizado em local único; renomear os que são conceitos distintos (ex.: TeamMessageReactions).

### Organização de pages/ inconsistente: 11 páginas Admin* na raiz vs 27 em pages/admin/, e dirs kebab-case paralelos
- **Área:** Arquitetura e organização do código (src/)
- **Local:** `src/pages`
- **Categoria:** convencao-nomes · **Esforço:** baixo
- **Problema:** Páginas administrativas estão divididas sem critério: 11 arquivos Admin*.tsx na raiz de src/pages/ (AdminWebhookEventsPage.tsx, AdminRealtimeMonitorPage.tsx, AdminTelemetriaPage.tsx...) e 27 em src/pages/admin/. Além disso coexistem subdiretórios kebab-case de subcomponentes de página (admin-realtime-monitor/, admin-search-insights/, admin-webhook-overview/) ao lado do diretório admin/, misturando duas convenções de agrupamento. Nomenclatura de arquivos em geral é consistente (631 .tsx PascalCase; os 81 lowercase são quase todos shadcn em components/ui e *.stories, o que é convenção aceita), e em hooks só use-mobile.tsx/use-toast.ts fogem do padrão useXxx.
- **Recomendação:** Mover as 11 páginas Admin* da raiz para src/pages/admin/ e realocar os diretórios admin-*/ como subpastas da página correspondente (ex.: pages/admin/realtime-monitor/).

### fatorx-migrations pertence a OUTRO projeto Supabase (tdprnylgyrogbbhgdoik) e pastas de cutover Lovable seguem sem marcacao de obsoletas
- **Área:** Banco de dados e migrations (Tarefas 27-29)
- **Local:** `supabase/fatorx-migrations/2026-04-24_rpc_list_messages_lite.sql:2`
- **Categoria:** organizacao/higiene · **Esforço:** baixo
- **Problema:** supabase/fatorx-migrations/2026-04-24_rpc_list_messages_lite.sql declara 'APPLY THIS IN THE EXTERNAL FATOR X PROJECT (tdprnylgyrogbbhgdoik)' — SQL de outro banco dentro do repo do ZAPP, sem README, com risco de aplicacao acidental no banco errado. migrations-from-lovable/ (delta de cutover 2026-05-02) e migrations-snapshot/ (pg_dump Lovable, 146 tabelas vs 155+ atuais) sao artefatos historicos do cutover concluido em 30/06 mas nao tem aviso de descontinuado — o README de ambos ainda instrui 'como aplicar no destino' via psql/ALL_IN_ONE.sql, que hoje regrediria o schema. manual-rollbacks/ esta correto (1 DOWN intencional, documentado).
- **Recomendação:** Mover fatorx-migrations para o repo do projeto Fator X (ou docs/external/); adicionar DEPRECATED.md em migrations-from-lovable e migrations-snapshot deixando claro que sao registros historicos e que a fonte de verdade e supabase/migrations + banco VPS.

### Cobertura de indices esta boa; residual: FKs de tabelas <32KB deliberadamente sem indice e criacao sem CONCURRENTLY
- **Área:** Banco de dados e migrations (Tarefas 27-29)
- **Local:** `supabase/migrations/20260711_fk_backing_indexes_wave2.sql:7`
- **Categoria:** indexes · **Esforço:** baixo
- **Problema:** T29 auditada: as waves 20260711_fk_backing_indexes.sql (8 indices) e _wave2.sql (12 indices) cobriram os FKs sem indice, e 20260710_drop_unused_indexes.sql/20260711_drop_duplicate_user_settings_idx.sql limparam duplicados — coerente com o claim '0 FKs sem indice' do FALHAS_E_GAPS. As colunas mais filtradas no front (.eq user_id 51x, contact_id 49x, profile_id 20x, entity_type 7x) tem indice correspondente (idx_messages_contact_created, idx_audit_logs_entity, idx_agent_stats_profile etc.). Residual: wave2 exclui conscientemente FKs de tabelas <32KB ('Not indexed (not worth it)') — aceitavel, mas sem re-checagem automatica quando as tabelas crescerem; e os CREATE INDEX das waves nao usam CONCURRENTLY (ok para tabelas de 11MB, arriscado se re-aplicado em tabelas grandes).
- **Recomendação:** Agendar re-execucao periodica do scan de FKs sem indice (a query ja existe nos comentarios da wave 1) via pg_cron ou CI, e padronizar CONCURRENTLY para indices futuros em tabelas quentes.

### Job 'Verify Lockfile' é heurística de git-diff, não valida consistência real; dependência xlsx via tarball CDN agrava
- **Área:** Build, CI/CD e infraestrutura (T36-T38)
- **Local:** `.github/workflows/ci.yml:40`
- **Categoria:** ci-cd · **Esforço:** medio
- **Problema:** ci.yml:40-61 substitui 'bun install --frozen-lockfile' por um diff do git: só falha se package.json mudou sem bun.lock mudar. Não detecta lockfile dessincronizado no conteúdo (ex.: editar versão em package.json e tocar bun.lock trivialmente passa), nem lockfile corrompido. Some-se a isso xlsx instalado por URL de tarball externo (package.json:126, 'https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz') — o QA_REPORT já registrou que o install trava intermitentemente esperando esse fetch; um outage do cdn.sheetjs.com quebra todos os builds.
- **Recomendação:** Após resolver o lockfile GAR (finding do Dockerfile), voltar a usar 'bun install --frozen-lockfile' no job lockfile; avaliar migrar xlsx→exceljs (já recomendado no FALHAS_E_GAPS.md por CVE sem fix) o que também elimina a dependência do CDN.

### Instrução de deploy VPS inválida ('nginx -c' com arquivo de server block) e step morto no schema-snapshot.yml
- **Área:** Build, CI/CD e infraestrutura (T36-T38)
- **Local:** `DEPLOYMENT.md:43`
- **Categoria:** documentacao · **Esforço:** baixo
- **Problema:** DEPLOYMENT.md (seção 3) e o cabeçalho do nginx-prod.conf instruem 'nginx -c /etc/nginx/sites-enabled/zapp-web-v3' apontando para o nginx-prod.conf — mas '-c' exige um nginx.conf completo (com events{} e http{}); passar um arquivo que só contém server{} falha com erro de sintaxe. O correto é symlink em sites-enabled ou include dentro do http{}. Em schema-snapshot.yml, o step 'Comment no PR' (linha ~130) tem condição "github.event_name == 'pull_request'", mas o workflow só dispara em push e workflow_dispatch — o step é inalcançável (código morto). deno-contract-tests.yml:63 tem condição find duplicada ('-name contract.test.ts -o -name contract.test.ts').
- **Recomendação:** Corrigir a instrução no DEPLOYMENT.md e no cabeçalho do nginx-prod.conf para o fluxo include/symlink real; remover o step de comentário de PR do schema-snapshot.yml ou adicionar trigger pull_request; limpar o find duplicado.

### ratchet-tighten commita direto na main via bot a cada push, sem tratar falha de push nem branch protection
- **Área:** Build, CI/CD e infraestrutura (T36-T38)
- **Local:** `.github/workflows/ratchet-tighten.yml:9`
- **Categoria:** ci-cd · **Esforço:** baixo
- **Problema:** ratchet-tighten.yml roda em todo push na main e, quando o baseline aperta, faz commit+push direto na main com GITHUB_TOKEN ('git push', linha ~29). Se a main tiver branch protection exigindo PR/status checks, o push falha e o job fica vermelho em todo push (ruído); se não tiver, é mais um dos 4 workflows com escrita direta na main (junto com apply-chatpanel-fixes, apply-types-patch e schema-snapshot), o que enfraquece a rastreabilidade via PR. Também há corrida teórica: dois pushes em sequência disparam dois jobs concorrentes sem concurrency group, podendo gerar push rejeitado por non-fast-forward.
- **Recomendação:** Adicionar 'concurrency: ratchet-tighten' e trocar o push direto por criação de PR automático (peter-evans/create-pull-request) ou pelo menos tolerar rejeição de push com retry/rebase.

### Estado searchTimeout redundante gera re-render extra por keystroke
- **Área:** Componentes de domínio em src/components/ (exceto ui/) — Tarefas 6-8
- **Local:** `src/components/catalog/ExternalProductCatalog.tsx:68`
- **Categoria:** manutenibilidade · **Esforço:** baixo
- **Problema:** `const [searchTimeout, setSearchTimeout] = useState<...>(null)` (linha 68) é gravado a cada mudança de filtro (linha 106 `setSearchTimeout(t)`), causando um re-render adicional por tecla, e o `clearTimeout(searchTimeout)` da linha 101 é redundante — o cleanup do próprio effect (linha 107 `return () => clearTimeout(t)`) já cancela o timer anterior.
- **Recomendação:** Remover o estado searchTimeout e confiar apenas no cleanup do useEffect (como já faz ExternalProductManagement.tsx:79-85).

### Toasts e lista de conexões exibem instance_id técnico em vez do nome amigável
- **Área:** Componentes de domínio em src/components/ (exceto ui/) — Tarefas 6-8
- **Local:** `src/components/layout/ConnectionStatusIndicator.tsx:192`
- **Categoria:** ui · **Esforço:** baixo
- **Problema:** O toast de queda usa `toast.warning(`Conexão "${id}" caiu`)` onde id é instance_id (linha 192), o toast de reconexão usa `Reconectando ${conn.instance_id}…` (linha 283) e a lista renderiza `{c.instance_id}` como título do item (linha 485), embora a row carregue `name` e `instance_name`. O usuário vê UUIDs/slugs técnicos em vez do nome cadastrado da conexão.
- **Recomendação:** Exibir `c.name ?? c.instance_name ?? c.instance_id` nos toasts, no histórico de quedas e na lista.

### T8 — effects/ e debug/ não são código morto; todos os componentes têm uso em produção
- **Área:** Componentes de domínio em src/components/ (exceto ui/) — Tarefas 6-8
- **Local:** `src/components/effects/AuroraBorealis.tsx:1`
- **Categoria:** codigo-morto · **Esforço:** baixo
- **Problema:** Verificação por grep de imports: AuroraBorealis é usado em 14 arquivos de produção (TranscriptionsHistoryView, AgentsView, QueuesView, ConnectionsView, DashboardView, GroupsView, TagsView, AdminView, SLAHistory, QueueDetails etc.), FloatingParticles em 17, ParallaxContainer no DashboardView, Confetti em gamification/AchievementsSystem, TrainingMiniGames e GoalsDashboard, e EasterEggsProvider é montado globalmente em App.tsx:50. Em debug/, os 3 componentes são montados em App.tsx (linhas 124, 140, 141): HardResetButton gated por import.meta.env.DEV e ThemeDebugger por role 'dev' (corretos); BuildValidationOverlay tem o bypass ?debug=true (ver finding próprio). Não há componente órfão para remover nesses diretórios.
- **Recomendação:** Nenhuma remoção necessária; avaliar apenas o custo de render das camadas decorativas (Aurora/Particles em 15 views) em máquinas fracas e o gate do BuildValidationOverlay.

### src/lib/stressTest (393 linhas) e src/lib/mcp (24K) órfãos após remoção das telas que os usavam
- **Área:** Código morto e duplicação (T44-T45)
- **Local:** `src/lib/stressTest/runner.ts:1`
- **Categoria:** codigo-morto · **Esforço:** baixo
- **Problema:** src/lib/stressTest/ (4 arquivos: runner.ts 137 L, mediaSamplers.ts 146 L, accessibilityChecker.ts 62 L, types.ts 48 L) não tem nenhum importador — o próprio AppRoutes.tsx:42 documenta 'AdminStressTestPage removido (P3 orphan cleanup — tabelas stress_test_* não existem no schema)', mas a lib ficou. src/lib/mcp/ (index.ts + tools/list-connections.ts, list-contacts.ts, whoami.ts) também tem zero importadores fora de si mesmo.
- **Recomendação:** Deletar as duas pastas junto com o comentário residual em AppRoutes.

### SkeletonList.tsx (149 linhas) sem nenhum importador; sistema paralelo ao skeleton.tsx canônico
- **Área:** Código morto e duplicação (T44-T45)
- **Local:** `src/components/ui/SkeletonList.tsx:1`
- **Categoria:** codigo-morto · **Esforço:** baixo
- **Problema:** src/components/ui/SkeletonList.tsx (com variantes list/card/table e animação framer-motion, incluindo um SkeletonPulse interno próprio) tem zero importadores. O componente canônico ui/skeleton.tsx é usado por 87 arquivos. Há ainda ui/micro-interactions/skeletons.tsx (106 L, com outro SkeletonPulse/ContentSkeleton) acessível somente via barrel ui/micro-interactions.tsx cujo único consumidor é src/pages/Auth.tsx.
- **Recomendação:** Deletar SkeletonList.tsx; avaliar se Auth.tsx pode usar skeleton.tsx padrão para eliminar também micro-interactions/skeletons.tsx.

### Helpers duplicados com comportamentos divergentes: getInitials 2x exportado e formatBrazilianPhone morto
- **Área:** Código morto e duplicação (T44-T45)
- **Local:** `src/lib/formatters.ts:56`
- **Categoria:** duplicacao · **Esforço:** baixo
- **Problema:** getInitials é exportado duas vezes com implementações diferentes: src/lib/formatters.ts:94 (slice de palavras antes do map) e src/lib/avatar-colors.ts:30 (map antes do slice), mais uma cópia local em src/components/calls/IncomingCallAlert.tsx:87 — três fontes para as mesmas iniciais de avatar. formatBrazilianPhone (formatters.ts:56) tem 0 importadores externos e duplica formatPhoneForDisplay (phoneUtils.ts:157, 2 importadores) com regras de código de país diferentes; cleanPhone (formatters.ts:49) tem 5 usos paralelos ao normalizePhone canônico.
- **Recomendação:** Manter getInitials apenas em formatters.ts (avatar-colors re-exporta), apagar formatBrazilianPhone e migrar cleanPhone para phoneUtils.

### Boilerplate demo do Storybook (812K) versionado e incluído no glob de stories
- **Área:** Código morto e duplicação (T44-T45)
- **Local:** `src/stories/Page.tsx:1`
- **Categoria:** codigo-morto · **Esforço:** baixo
- **Problema:** src/stories/ contém exatamente o scaffolding padrão do Storybook init (Button.tsx/Button.stories.ts, Header, Page, 3 CSS e pasta assets, total 812K) sem nenhum import do produto ('@/stories' não aparece em src). O .storybook/main.ts:4 usa glob '../src/**/*.stories.*', então esses componentes demo aparecem no Storybook do projeto junto com os componentes reais.
- **Recomendação:** Deletar src/stories/ inteira; as stories reais (*.stories.tsx junto dos componentes) continuam cobertas pelo glob.

### migrations-snapshot (1,7 MB) desconectado das 702 migrations reais e propenso a drift
- **Área:** Código morto e duplicação (T44-T45)
- **Local:** `supabase/migrations-snapshot/ALL_IN_ONE.sql:1`
- **Categoria:** codigo-morto · **Esforço:** baixo
- **Problema:** supabase/migrations-snapshot/ (7 arquivos: 00_extensions, 01_enums, 02_schema_full, 03_storage_buckets, ALL_IN_ONE.sql, schema_public_full.sql, README) não compartilha nenhum arquivo com supabase/migrations/ (702 arquivos; comm -12 = 0). Sem processo automatizado que o regenere, o snapshot congela um estado de schema que divergiu/divergirá do real — quem restaurar um ambiente a partir do ALL_IN_ONE obtém schema desatualizado.
- **Recomendação:** Ou documentar/automatizar a regeneração (script + data no README), ou remover a pasta e apontar para supabase db dump.

### Fragmentação em 5 pastas de teste + snapshot órfão sem teste correspondente
- **Área:** Código morto e duplicação (T44-T45)
- **Local:** `src/test/__tests__/__snapshots__/trilhaMensagensFixture.test.ts.snap:1`
- **Categoria:** codigo-morto · **Esforço:** medio
- **Problema:** Convivem src/test/ (setup vitest, mocks, testes de realtime), src/tests/e2e/ (1 spec do playwright.config default), src/__tests__/ (9 arquivos vitest), tests/ na raiz (órfã, ver finding próprio) e e2e/ na raiz (suíte principal). Dentro de src/test/__tests__/ resta apenas __snapshots__/trilhaMensagensFixture.test.ts.snap — o teste trilhaMensagensFixture.test.ts não existe em lugar nenhum do repo (grep sem resultados), snapshot órfão. A TESTING_CONVENTION.md existe na raiz mas a estrutura real não a reflete.
- **Recomendação:** Apagar o snapshot órfão; consolidar src/tests/e2e dentro de e2e/ (ajustando playwright.config) e padronizar unit tests em __tests__ colocalizados, atualizando TESTING_CONVENTION.md.

### Itens de dependências do FALHAS_E_GAPS.md fechados de forma incompleta ou com documentação desatualizada
- **Área:** Dependências (T46-T47)
- **Local:** `FALHAS_E_GAPS.md:73`
- **Categoria:** regressao/pendente · **Esforço:** baixo
- **Problema:** Dos 3 itens de audit do FALHAS_E_GAPS.md:113-116: (1) supabase CLI — resolvido (2.109.0 > 2.101.0 exigido); (2) serialize-javascript — bumpado para 7.0.7 (l.118 do package.json) mas o pacote não é usado em lugar nenhum, a pendência real era remoção; (3) xlsx — o doc ainda afirma 'Prototype Pollution SEM FIX DISPONÍVEL', mas a versão instalada 0.20.3 já contém os fixes (CVE-2023-30533 corrigido em 0.19.3, CVE-2024-22363 em 0.20.2) — a informação está desatualizada e mascara o risco real remanescente (integridade do tarball, ver finding específico). O QA_REPORT_2026-07-11.md:18 também afirma que o vercel.json usa `npm install --legacy-peer-deps`, mas o arquivo atual usa `bun install`.
- **Recomendação:** Atualizar a seção 2 do FALHAS_E_GAPS.md com o estado real (jul/2026), remover serialize-javascript em vez de mantê-lo bumpado e corrigir a nota do QA report.

### legacy-peer-deps=true global silencia todos os conflitos de peer dependencies
- **Área:** Dependências (T46-T47)
- **Local:** `.npmrc:1`
- **Categoria:** manutenibilidade · **Esforço:** baixo
- **Problema:** .npmrc contém apenas `legacy-peer-deps=true`, aplicado a qualquer npm install no repo. Isso foi o que permitiu a combinação não suportada jspdf 4 + jspdf-autotable 5 (ver finding próprio) passar sem erro, e continuará escondendo futuros conflitos de peer em upgrades. Com bun como gerenciador primário (bun.lock, Dockerfile, vercel.json), a flag só afeta quem instala com npm — criando ainda outra diferença de comportamento entre gerenciadores.
- **Recomendação:** Remover a flag após resolver o conflito do jspdf-autotable; se algum conflito legítimo restar, tratá-lo com "overrides" pontual em vez de desligar a checagem globalmente.

### Pin triplo de csstype, incluindo bloco 'resolutions' (sintaxe Yarn) inócuo para bun/npm
- **Área:** Dependências (T46-T47)
- **Local:** `package.json:185`
- **Categoria:** manutenibilidade · **Esforço:** baixo
- **Problema:** csstype 3.2.3 aparece três vezes: como dependência direta (l.92) sem nenhum import no código, em "overrides" (l.183, respeitado por npm/bun) e em "resolutions" (l.185-187, sintaxe do Yarn clássico — ignorada por npm e bun, que são os gerenciadores usados no repo). O bloco resolutions é peso morto e sugere que o pin foi copiado de outro projeto sem revisar.
- **Recomendação:** Manter apenas o pin em "overrides" e remover a dependência direta e o bloco "resolutions".

### Classe shadow-glow-destructive não existe no tailwind.config.ts — hover do botão destructive referencia utilitário que nunca é gerado
- **Área:** Design system e componentes UI base (src/components/ui, tokens CSS, tailwind.config.ts) — Tarefas 4-5
- **Local:** `src/components/ui/button.tsx:14`
- **Categoria:** token-inexistente · **Esforço:** baixo
- **Problema:** button.tsx:14 usa 'hover:shadow-glow-destructive', mas tailwind.config.ts:203-214 só define glow-primary, glow-secondary e glow-success em boxShadow (e tokens.css também não define --shadow-glow-destructive). O Tailwind simplesmente não gera a classe, então o hover do variant destructive silenciosamente não tem o efeito pretendido — único variant com token quebrado na definição (os demais são anulados pelo override global, finding 1).
- **Recomendação:** Adicionar 'glow-destructive: var(--shadow-glow-destructive)' ao boxShadow do tailwind.config e o token correspondente em tokens.css, ou remover a classe do variant para não documentar um efeito inexistente.

### Badge: conflito border-transparent vs border-success/30 no mesmo variant e whatsapp com foreground diferente do Button
- **Área:** Design system e componentes UI base (src/components/ui, tokens CSS, tailwind.config.ts) — Tarefas 4-5
- **Local:** `src/components/ui/badge.tsx:16`
- **Categoria:** variantes-inconsistentes · **Esforço:** baixo
- **Problema:** badge.tsx:16-18 — variants success/warning/info declaram 'border-transparent bg-success/15 ... border border-success/30': duas utilities de border-color competindo no mesmo cva; qual vence depende da ordem do stylesheet gerado (tailwind-merge no cn() não deduplica dentro da string do cva), tornando a borda imprevisível entre builds. badge.tsx:19 — variant whatsapp usa 'text-foreground' sobre bg-whatsapp enquanto button.tsx:19 usa 'text-primary-foreground' sobre o mesmo bg-whatsapp: o mesmo verde de marca tem texto escuro num componente e claro no outro (e em dark mode 'text-foreground' branco sobre whatsapp 142 85% 52% falha contraste). badge.tsx:20 — glowPurple hardcoda 'shadow-[0_0_12px_rgba(139,92,246,0.3)]' em vez de token, único hex/rgba de um componente base.
- **Recomendação:** Remover o 'border-transparent' dos variants success/warning/info; unificar o foreground do whatsapp (definir --whatsapp-foreground em tokens.css e usar nos dois componentes); trocar o rgba do glowPurple por hsl(var(--secondary)/0.3).

### Gerador do registry.json parseia estados hover/active como variantes — página /design-system exibe dados corrompidos
- **Área:** Design system e componentes UI base (src/components/ui, tokens CSS, tailwind.config.ts) — Tarefas 4-5
- **Local:** `scripts/generate-component-registry.ts:19`
- **Categoria:** tooling/docs · **Esforço:** baixo
- **Problema:** O regex '[a-zA-Z0-9]+(?=:)' (linha 19) captura qualquer palavra antes de ':' dentro das strings de classe do cva, então prefixos Tailwind viram 'variantes': src/components/ui/registry.json lista para button 'variant: [default, hover, hover, active, destructive, hover, ...]'. Esse JSON é importado por src/pages/DesignSystem.tsx:11 e renderizado como documentação oficial do design system, exibindo listas de variantes falsas e duplicadas.
- **Recomendação:** Corrigir a extração para capturar apenas as chaves do objeto variants (ex.: parsear com regex por linha 'chave:' no nível de indentação correto, ou importar os *Variants via ts-morph/AST) e regenerar o registry.json.

### Dois MotionButton e dois SkeletonPulse exportados de ui/ com implementações diferentes; nomenclatura de arquivos mista (PascalCase vs kebab-case)
- **Área:** Design system e componentes UI base (src/components/ui, tokens CSS, tailwind.config.ts) — Tarefas 4-5
- **Local:** `src/components/ui/motion/components.tsx:70`
- **Categoria:** duplicacao/nomenclatura · **Esforço:** medio
- **Problema:** ui/button.tsx:85 exporta 'MotionButton' (com buttonVariants) e ui/motion/components.tsx:70 exporta OUTRO 'MotionButton' (motion.button puro, sem variants) — o barrel motion.tsx reexporta o segundo, criando ambiguidade real de import no mesmo namespace ui/. Idem 'SkeletonPulse': definido em SkeletonList.tsx:28 e em micro-interactions/skeletons.tsx (reexportado por micro-interactions.tsx). Além disso há três sistemas de skeleton (skeleton.tsx, SkeletonList.tsx, micro-interactions/skeletons.tsx) e a convenção de nomes do diretório é mista: EmptyState.tsx, GenericEmptyState.tsx e SkeletonList.tsx em PascalCase contra ~58 arquivos kebab-case.
- **Recomendação:** Renomear ou fundir os homônimos (ex.: MotionButton do motion/ vira PlainMotionButton ou é removido em favor do de button.tsx), consolidar skeletons num módulo único e padronizar kebab-case, aproveitando que EmptyState.tsx será deletado (finding 4).

### CLAUDE.md ausente num repo mantido majoritariamente por agentes de IA
- **Área:** Documentacao e DX (T48-T50)
- **Local:** `README.md:1`
- **Categoria:** dx · **Esforço:** baixo
- **Problema:** Nao existe CLAUDE.md (nem AGENTS.md) na raiz (verificado com ls), embora o repo seja intensamente trabalhado por agentes (FALHAS_E_GAPS.md:3 cita 'DeepSeek v4-pro via Cline + Claude Code', ha .mcp.json, .lovable/plan.md e dezenas de relatorios gerados por IA). Sem um arquivo de instrucoes, cada sessao de agente redescobre do zero as convencoes criticas e nao-obvias: bun como package manager canonico (bun.lock; package-lock.json e ignorado), `bun run test` vs `bun test`, proibicao de console.log (usar @/lib/logger), TESTING_CONVENTION.md, npm run check como gate, e o fato de o fallback do client apontar para producao — justamente os pontos onde as docs humanas estao erradas.
- **Recomendação:** Criar CLAUDE.md conciso (30-50 linhas) com: package manager, comandos canonicos (dev/test/check/typecheck), convencao de testes, aviso 'sem .env conecta em producao', e ponteiros para DEPLOYMENT.md e TESTING_CONVENTION.md.

### Afirmação 'Suíte E2E Playwright operacional' no FALHAS_E_GAPS.md não se sustenta
- **Área:** E2E e testes de acessibilidade (Tarefas 34-35)
- **Local:** `FALHAS_E_GAPS.md:35`
- **Categoria:** regressao/pendente · **Esforço:** baixo
- **Problema:** O documento lista como 'JÁ CORRIGIDO' que a suíte E2E está operacional, mas: 14 specs jamais executaram com sucesso (testids/credenciais inexistentes), a suíte e2e/ não roda em CI algum, tests/e2e/ é órfão e a visual-regression não tem baselines. O status reportado mascara o débito real de cobertura.
- **Recomendação:** Atualizar o documento distinguindo 'suíte compila/config funciona' de 'suíte executa e passa em CI', e listar os 14 specs mortos como pendência.

### checkA11y() é decorativo: só console.warn, nunca falha
- **Área:** E2E e testes de acessibilidade (Tarefas 34-35)
- **Local:** `e2e/helpers/testHelpers.ts:100`
- **Categoria:** manutenibilidade · **Esforço:** baixo
- **Problema:** O helper checkA11y() faz dois querySelectors ($$('img:not([alt])') e um seletor inválido 'button:not(:has(text))') e apenas emite console.warn — nenhuma asserção. Qualquer spec que o chame acredita ter verificação de acessibilidade sem ter. O projeto já tem @axe-core/playwright instalado e um runAxe() completo em auth-accessibility.spec.ts:36-67.
- **Recomendação:** Deletar checkA11y() e exportar o runAxe() de auth-accessibility.spec.ts como helper compartilhado em e2e/helpers/.

### Seletores frágeis acoplados a implementação visual
- **Área:** E2E e testes de acessibilidade (Tarefas 34-35)
- **Local:** `e2e/auth-flow.spec.ts:52`
- **Categoria:** flaky · **Esforço:** baixo
- **Problema:** auth-flow.spec.ts:52 asserta `page.locator('svg.text-primary-foreground')` (classe Tailwind do ícone Smartphone) — qualquer troca de token de cor quebra o teste sem regressão funcional. navigation.legacy.spec.ts duplica cenários de navigation.spec.ts usando `text=Plataforma omnichannel` / `text=ZAPP Web` (copy hardcoded), e chat-accessibility.spec.ts:12 usa `input[placeholder*="Buscar na conversa"]` — placeholders são strings de UI voláteis.
- **Recomendação:** Migrar para getByRole/getByLabel ou data-testid estáveis; deletar navigation.legacy.spec.ts (redundante com navigation.spec.ts).

### T35 (status positivo): pendências de a11y de auth foram resolvidas e travadas por regressão, com ressalvas pontuais
- **Área:** E2E e testes de acessibilidade (Tarefas 34-35)
- **Local:** `e2e/auth-accessibility.spec.ts:109`
- **Categoria:** cobertura-a11y · **Esforço:** baixo
- **Problema:** As violações históricas documentadas no header do spec (color-contrast, aria-prohibited-attr no toaster, button-name do PasswordInput, landmark-one-main, skip-link) estão corrigidas e o CI (ci.yml job a11y) falha se regredirem — nem QA_REPORT_2026-07-11 nem design-system-audit.md listam pendências de a11y em aberto para essas telas. Ressalvas: waitForTimeout(800) fixo na linha 109 antes do axe (flaky em CI lento), a regra 'page-has-heading-one' está permanentemente desabilitada (IGNORED_RULES linha 17-20) sob justificativa de spinner, e o waitForSelector com .catch() silencioso (linha 106-108) permite que o axe rode sobre uma página de redirect errada sem acusar.
- **Recomendação:** Trocar o timeout fixo por espera do readySelector obrigatória (falhar se a rota não renderizar o esperado) e revisar se page-has-heading-one ainda precisa ser ignorada após o mount.

### conversationSendState recalculado sem memo a cada render, iterando todas as conversas x mensagens
- **Área:** Performance (T39 bundle, T40 listas/re-render, T41 realtime/polling/imagens)
- **Local:** `src/features/inbox/hooks/useRealtimeMessages.ts:383`
- **Categoria:** re-render/cpu · **Esforço:** baixo
- **Problema:** O bloco das linhas 383-405 roda no corpo do hook (sem useMemo): para cada uma das até 500 conversas filtra `c.messages` por sender e consulta getSendStatus por mensagem outbound a cada render do consumidor (que re-renderiza a cada evento realtime/tick do bus). Com o seed de 1000 mensagens, são milhares de iterações por render no thread principal do inbox.
- **Recomendação:** Envolver em useMemo com deps [conversations, sendStateTick]; considerar indexar mensagens outbound por conversa uma única vez.

### Componentes de lista de mensagens duplicados e mortos ainda exportados pelo barrel (ChatMessageBubble, VirtualizedMessageList, useMessagesCursor)
- **Área:** Performance (T39 bundle, T40 listas/re-render, T41 realtime/polling/imagens)
- **Local:** `src/features/inbox/components/chat/ChatMessageBubble.tsx:348`
- **Categoria:** bundle/dead-code · **Esforço:** baixo
- **Problema:** ChatMessageBubble.tsx (que na linha 348 renderiza MessageReactions SEM disableRealtime — 1 canal realtime por bolha se algum dia for reutilizado), VirtualizedMessageList.tsx e useMessagesCursor.ts não têm nenhum consumidor no app (verificado por grep; apenas re-export nos barrels). Como o barrel da feature vaza para o entry (finding #1), esse código morto e suas dependências entram no bundle inicial e criam risco de reativação do anti-padrão canal-por-bolha.
- **Recomendação:** Remover os três módulos (ou movê-los para fora do barrel) e adicionar check de dead-code do próprio repo (scripts/check-dead-code.mjs) cobrindo exports de barrel.

### Resposta 503 de configuração sem headers CORS — browser não consegue ler a mensagem de erro
- **Área:** Qualidade das edge functions (T25: duplicação e tratamento de erro; T26: consistência, docs e funções mortas)
- **Local:** `supabase/functions/connection-health-check/index.ts:192`
- **Categoria:** tratamento-de-erro · **Esforço:** baixo
- **Problema:** O retorno 503 ('evolution_api_not_configured', com instrução 'Configure os secrets EVOLUTION_API_URL...') usa apenas "headers: { 'Content-Type': 'application/json' }", sem CORS. A função é invocada pelo browser (src/components/connections/ConnectionCard.tsx:107 via supabase.functions.invoke); sem ACAO a resposta é bloqueada pelo browser e o usuário vê erro genérico em vez da instrução de configuração.
- **Recomendação:** Incluir os corsHeaders nessa resposta (como as demais respostas da função já fazem).

### Micro-helpers duplicados apesar do _shared: json() em 7 funções, timingSafeEqual local, 82 createClient por request
- **Área:** Qualidade das edge functions (T25: duplicação e tratamento de erro; T26: consistência, docs e funções mortas)
- **Local:** `supabase/functions/recheck-webhook-signature/index.ts:46`
- **Categoria:** duplicacao · **Esforço:** medio
- **Problema:** function json() reimplementada em 7 funções (instance-pause-control, whatsapp-cloud-webhook-verify, e2e-fixtures, nps-scheduler, sicoob-outbox-consumer, reprocess-failed-messages, e2e-webhook-fixture); jsonResponse local em 4; envOrThrow em 2; recheck-webhook-signature/index.ts:46 reimplementa timingSafeEqual (comparação byte a byte) duplicando _shared/hmac-validation.ts e _shared/auth.ts (timingSafeStringEqual). Além disso 82 funções chamam createClient dentro do handler a cada request (custo de cold path repetido para clients service-role, que poderiam viver em escopo de módulo) e 19 ainda usam serve() do deno std deprecated vs 101 com Deno.serve.
- **Recomendação:** Consolidar json/jsonResponse/envOrThrow/timingSafeEqual no _shared (já existem equivalentes), mover createClient service-role para escopo de módulo nas funções quentes e padronizar Deno.serve.

### Schemas zod de eventos realtime sao escritos a mao, sem vinculo de tipo com os Rows gerados
- **Área:** Rigor TypeScript (Tarefas 30-31)
- **Local:** `src/shared/webhookEventSchemas.ts:54`
- **Categoria:** validacao-runtime · **Esforço:** baixo
- **Problema:** webhookEventSchemas.ts (19 z.object) e criticalPayloadSchemas.ts validam payloads realtime/webhook em runtime — boa pratica, usada em 11+ hooks (useWarRoomAlerts, useSLANotifications, useZappMessages etc.). Porem nenhum schema tem amarra de compile-time com os types gerados (nao ha `satisfies z.ZodType<Tables<'...'>>` nem z.infer comparado ao Row). Hoje conferem (ex.: notificationRowSchema espelha corretamente notifications.Row, incluindo is_read nullable), mas um ALTER TABLE que adicione NOT NULL ou renomeie coluna nao gera erro de compilacao — o schema so comeca a rejeitar eventos em producao. messageRowSchema usa .passthrough() (linha 68), o que atenua para campos novos mas nao para renames.
- **Recomendação:** Adicionar teste de tipo por schema no padrao `type _Check = Expect<Extends<Tables<'notifications'>, z.infer<typeof notificationRowSchema>>>` (ou satisfies) para que drift de schema quebre o typecheck.

### Teste resolve-jid-exhaustive.test.ts excluido do typecheck silenciosamente
- **Área:** Rigor TypeScript (Tarefas 30-31)
- **Local:** `tsconfig.app.json:42`
- **Categoria:** configuracao-typescript · **Esforço:** baixo
- **Problema:** tsconfig.app.json exclui explicitamente `src/__tests__/resolve-jid-exhaustive.test.ts` (linha 42) do programa. O vitest ainda executa o arquivo (transpilacao esbuild sem checagem de tipos), entao esse teste roda permanentemente sem nunca ser typecheckado — erros de tipo nele nao aparecem em `npm run typecheck` nem no CI. Nao ha comentario justificando a exclusao.
- **Recomendação:** Remover a exclusao e corrigir os erros de tipo do arquivo, ou documentar no proprio tsconfig por que ele precisa ficar fora (ex.: estouro de memoria do checker em teste exaustivo gerado).

### record_failed permite lockout DoS de qualquer email conhecido
- **Área:** Segurança das Edge Functions Supabase (supabase/functions/ — Tarefas 22-24: autenticação, webhooks, service_role/CORS/rate-limit)
- **Local:** `supabase/functions/login-attempts/index.ts:118`
- **Categoria:** dos · **Esforço:** medio
- **Problema:** A ação record_failed (linhas 118-140) incrementa attempt_count por EMAIL para qualquer chamador anônimo, e nextLockUntil bloqueia após 5 tentativas. Combinado com o rate-limit por-IP fraco (in-memory) e rotação de IP, um atacante pode travar (lockout) contas-alvo conhecidas repetidamente. É um tradeoff comum de designs de lockout por email, mas vale mitigar.
- **Recomendação:** Considerar lockout por (email+IP) ou usar tarpit/captcha em vez de lockout hard por email; endurecer o rate-limit (ver achado do rate-limiter in-memory).

### email-track-pixel/link: endpoints públicos sem rate-limit gravam no DB via service_role a cada GET
- **Área:** Segurança das Edge Functions Supabase (supabase/functions/ — Tarefas 22-24: autenticação, webhooks, service_role/CORS/rate-limit)
- **Local:** `supabase/functions/email-track-pixel/index.ts:87`
- **Categoria:** resource-abuse · **Esforço:** medio
- **Problema:** email-track-pixel (linha 87) e email-track-link executam RPCs (rpc_email_register_open / rpc_email_register_click) com service_role a cada requisição GET, sem qualquer rate-limit e sem autenticação (necessariamente públicos por serem pixel/redirect de email). Um atacante pode disparar milhares de GETs com tracking_id/link_id arbitrários para poluir métricas de abertura/clique e gerar carga no banco. email-track-link também faz redirect 302 para original_url vindo do banco (baixo risco de open-redirect, pois a URL é definida na criação do link).
- **Recomendação:** Adicionar rate-limit por IP (baseado em banco), validar existência do tracking_id antes de escrever, e ignorar user-agents de bots (já detectados) para não inflar métricas.

### ai-proxy usa CORS '*' hardcoded no ramo de streaming
- **Área:** Segurança das Edge Functions Supabase (supabase/functions/ — Tarefas 22-24: autenticação, webhooks, service_role/CORS/rate-limit)
- **Local:** `supabase/functions/ai-proxy/index.ts:197`
- **Categoria:** cors · **Esforço:** baixo
- **Problema:** No retorno de streaming (linhas 194-201) os headers são fixados manualmente com 'Access-Control-Allow-Origin': '*' em vez de usar getCorsHeaders(req) como no resto da função. Inconsistente com a política de allowlist de origens (cors.ts). Risco baixo pois a auth é via bearer header (não cookies), mas contraria o padrão. Já mencionado em QA_REPORT_2026-07-11 (linha 75).
- **Recomendação:** Reutilizar getCorsHeaders(req) também no ramo de streaming.

### Anon key JWT hardcoded no código-fonte e em vercel.json
- **Área:** Segurança do frontend (T19 XSS, T20 Segredos/dados sensíveis, T21 Autorização no cliente)
- **Local:** `src/integrations/supabase/client.ts:16`
- **Categoria:** regressao/pendente · **Esforço:** baixo
- **Problema:** SELF_HOSTED_ANON_KEY está hardcoded (o mesmo JWT também em src/lib/selfHostedDiagnostics.ts:17 e em vercel.json:8). É uma chave anon PÚBLICA protegida por RLS — não é uma vulnerabilidade direta — mas contradiz a política declarada em .env.example/vite.config.ts de nunca versionar a anon key e dificulta rotação (precisa de recompilação/redeploy em 3 lugares). Já apontado em QA_REPORT_2026-07-11.md:124.
- **Recomendação:** Centralizar a anon key em uma única fonte (env var no build) e remover as cópias hardcoded, ou documentar formalmente a exceção. Garantir processo de rotação que cubra os 3 locais.

### Assinatura de email sanitizada com config default do DOMPurify (sem allowlist)
- **Área:** Segurança do frontend (T19 XSS, T20 Segredos/dados sensíveis, T21 Autorização no cliente)
- **Local:** `src/components/email/EmailChatReplyBar.tsx:236`
- **Categoria:** xss-defesa-em-profundidade · **Esforço:** baixo
- **Problema:** DOMPurify.sanitize(selectedSignature.html_content) usa a configuração padrão, que permite um conjunto amplo de tags/atributos (incluindo style e imagens data:), ao contrário de todos os outros sinks do projeto que usam ALLOWED_TAGS/ALLOWED_ATTR explícitos (ver MarkdownPreview.tsx:41-44, sanitize.ts:38-42). O risco é baixo porque a assinatura é definida pelo próprio usuário, mas é uma inconsistência com o padrão de allowlist adotado no resto do código.
- **Recomendação:** Aplicar uma allowlist explícita coerente com src/lib/sanitize.ts (tags de formatação + <a>/<img> controlados, sem style/eventos) também na renderização da assinatura.

### Snapshot orfao sem arquivo de teste correspondente
- **Área:** Testes unitarios (T32-T33)
- **Local:** `src/test/__tests__/__snapshots__/trilhaMensagensFixture.test.ts.snap:1`
- **Categoria:** lixo-de-repo · **Esforço:** baixo
- **Problema:** src/test/__tests__/ contem apenas __snapshots__/trilhaMensagensFixture.test.ts.snap (941 bytes, 41 linhas); o teste trilhaMensagensFixture.test.ts nao existe em lugar nenhum do repo. O snapshot nunca sera validado nem atualizado. (Nao ha problema de snapshots gigantes: este e o unico .snap do repo.)
- **Recomendação:** Deletar o diretorio src/test/__tests__/ ou restaurar o teste que o gerava.

### 36 it.skip acumulados num unico arquivo, varios marcando bugs conhecidos
- **Área:** Testes unitarios (T32-T33)
- **Local:** `src/components/team-chat/__tests__/team-chat-exhaustive-audit.test.ts:29`
- **Categoria:** skips-acumulados · **Esforço:** baixo
- **Problema:** team-chat-exhaustive-audit.test.ts tem 36 `it.skip`, incluindo titulos que registram defeitos reais nunca validados: linha 150 "BUG: audio recording uses webm which may not play on Safari" e linha 197 "TODO: re-validar apos refactor do painel". Skips sem prazo viram cobertura fantasma — aparecem no arquivo mas nao protegem nada.
- **Recomendação:** Triar os 36 skips: reativar os que compilam, converter bugs documentados em issues e deletar os obsoletos.

### Asserts acoplados a classes Tailwind especificas em vez de semantica
- **Área:** Testes unitarios (T32-T33)
- **Local:** `src/components/ui/__tests__/button.test.tsx:11`
- **Categoria:** teste-de-implementacao · **Esforço:** baixo
- **Problema:** button.test.tsx:11-12 verifica `expect(button.className).toContain('bg-primary')` e linha 17 `toContain('bg-destructive')` — qualquer renomeacao de token do design system quebra o teste sem mudanca de comportamento. Os demais casos (disabled, click, loading) sao bons exemplos de teste comportamental.
- **Recomendação:** Trocar asserts de className por verificacao de variante via atributo/data-attribute ou aceitar como custo consciente e documentar; manter os asserts comportamentais.

### Fallbacks de boundary exibem error.message cru ao usuário final
- **Área:** Tratamento de erros e observabilidade (Tarefas 42-43)
- **Local:** `src/components/ui/section-error-boundary.tsx:53`
- **Categoria:** ux/vazamento-de-informacao · **Esforço:** baixo
- **Problema:** SectionErrorBoundary (linha 53) e ErrorBoundaryWithRetry (error-boundary-retry.tsx:102) renderizam `this.state.error?.message` direto na UI — mensagens técnicas em inglês tipo "TypeError: Cannot read properties of undefined (reading 'map')" ou detalhes de PostgREST aparecem para o atendente, em contraste com o ErrorBoundary global que só mostra detalhes em NODE_ENV=development (ErrorBoundary.tsx:212).
- **Recomendação:** Exibir mensagem genérica amigável e mostrar error.message apenas em import.meta.env.DEV, como já faz o boundary global.

### Função morta processQueueForContact com corpo só de comentários
- **Área:** src/features/ (T9 estrutura de features, T10 auditoria das 3 maiores, T11 features abandonadas/incompletas)
- **Local:** `src/features/inbox/hooks/useMessageQueue.ts:119`
- **Categoria:** codigo-morto · **Esforço:** baixo
- **Problema:** `processQueueForContact` (linhas ~119-136) tem o corpo inteiro composto de comentários explicando uma abordagem abandonada ('Abordagem: processQueueForContact será disparado...') e não executa nada; a versão real é `processNextInQueue` logo abaixo, anotada como 'Versão corrigida e simplificada'. A função morta permanece no useCallback com dependência de processMessage.
- **Recomendação:** Remover a função e seus comentários; manter apenas processNextInQueue.

### Ferramentas internas de QA embarcadas no bundle do inbox (checklist visual e simulador)
- **Área:** src/features/ (T9 estrutura de features, T10 auditoria das 3 maiores, T11 features abandonadas/incompletas)
- **Local:** `src/features/inbox/components/VisualValidationChecklist.tsx:19`
- **Categoria:** codigo-morto · **Esforço:** baixo
- **Problema:** VisualValidationChecklist é um checklist interno de auditoria visual ('Fonte Inter', 'Preto OLED Puro'...) com um item de DEFAULT_ITEMS com `id: ''` (linha 19 — colide com dedupe por id), montado em produção via ChatPanelOverlays quando `dialogs.visualValidation` é aberto no ChatPanel. Junto com simulateChatLatency (ver finding de severidade alta), são tooling de desenvolvimento acessível/embarcado no fluxo de produção do inbox.
- **Recomendação:** Gatear ambos por import.meta.env.DEV ou por role dev, e corrigir o id vazio do primeiro item do checklist.

### Alerta de sentimento notificado em dobro: useSentimentAlerts e useRealtimeSentimentAlerts disparam notificação para o mesmo evento
- **Área:** src/hooks/ — inventário, duplicação, padrões react-query e corretude (Tarefas 12-14)
- **Local:** `src/hooks/useRealtimeSentimentAlerts.ts:34`
- **Categoria:** duplicacao · **Esforço:** baixo
- **Problema:** useSentimentAlerts.checkAndTriggerAlert (invocado por AIConversationAssistant.tsx:72) chama a edge fn sentiment-alert e, quando `alertResult.alerted`, exibe notificação local (linha 60+). Em paralelo, useRealtimeSentimentAlerts (montado globalmente via RealtimeSentimentAlertProvider.tsx:7) escuta o canal 'sentiment-alerts-realtime' (linha 95) e, para o mesmo registro de alerta inserido pela edge fn, mostra toast + som + browser notification (linhas 46-80). O usuário cuja análise disparou o alerta recebe tudo em duplicata.
- **Recomendação:** Remover a notificação local de useSentimentAlerts (deixar só o fluxo realtime, que cobre todos os usuários) ou deduplicar por analysisId.

### opts.timeoutMs é silenciosamente ignorado — timeout hardcoded em 45s
- **Área:** src/hooks/ — inventário, duplicação, padrões react-query e corretude (Tarefas 12-14)
- **Local:** `src/hooks/evolution/useEvolutionApiCore.ts:91`
- **Categoria:** correcao/contrato · **Esforço:** baixo
- **Problema:** A interface CallApiOptions documenta `timeoutMs` ('Overall per-request timeout. Default: 30s') mas o corpo de callApi faz `const timeoutMs = 45000;` com o comentário 'Critical fix: force a much larger timeout (45s)', descartando o valor passado pelo caller. Como useEvolutionApi (16 importadores) compõe este core, nenhum consumidor consegue configurar timeout menor (ex. checks rápidos de status de instância travam a UI por até 45s).
- **Recomendação:** Respeitar `opts.timeoutMs ?? 45000` e atualizar o JSDoc para o novo default.

### 20 shims de re-export em src/hooks — migração para src/features inacabada infla a contagem de hooks
- **Área:** src/hooks/ — inventário, duplicação, padrões react-query e corretude (Tarefas 12-14)
- **Local:** `src/hooks/useContactsSearch.ts:1`
- **Categoria:** manutenibilidade · **Esforço:** medio
- **Problema:** 20 arquivos de src/hooks com ≤15 linhas são apenas `export * from '@/features/...'` (useContactsSearch, useContactEnrichedData, useContactNotes, useContactTyping, useContactStats, useContactIntelligence, useContactAssignment, useContactCustomFields, useRealtimeMessages, useMessageReactions, useTeamChat, useAuth, etc.). O padrão em si é seguro (não há código duplicado — verificado por diff), mas mantém dois caminhos de import válidos para o mesmo hook, o que dificulta grep/refactor e mascara o inventário real (199 arquivos ≠ 199 hooks).
- **Recomendação:** Codemod para reescrever imports '@/hooks/useX' → '@/features/.../useX' e deletar os shims; adicionar regra ESLint no-restricted-imports para os caminhos antigos.

### queryKeys genéricas de 1 segmento ('tags', 'campaigns', 'automations') sem namespace — risco de colisão e invalidação excessiva
- **Área:** src/hooks/ — inventário, duplicação, padrões react-query e corretude (Tarefas 12-14)
- **Local:** `src/hooks/useTags.ts:29`
- **Categoria:** react-query/higiene · **Esforço:** medio
- **Problema:** Chaves de primeiro nível de uma palavra são usadas como raiz por múltiplos domínios: ['tags'] (useTags.ts:29, 6 usos), ['campaigns'] (useCampaigns.ts:18), ['automations'] (4 usos), ['personal-stickers'] com e sem profile?.id (usePersonalStickers). Sem factory central, qualquer novo hook que use a mesma string raiz (ex. tags de contato — já existe ['contact-tags', contactId]) colide ou é invalidado por engano via prefix-matching do invalidateQueries. Hoje não há colisão ATIVA comprovada (verifiquei 'tags' e 'campaigns': cada raiz tem um único queryFn), mas o padrão é frágil em um repo com 165 chaves distintas.
- **Recomendação:** Adotar query key factory por domínio (ex. keys.tags.list(), keys.tags.byContact(id)) junto com o catálogo central recomendado no finding das invalidações órfãs.

### generateCorrelationId exportado por dois módulos com semânticas diferentes; retry.ts usa a versão errada
- **Área:** src/lib, src/utils, src/services, src/adapters, src/shared (T15 duplicação / T16 qualidade dos módulos centrais)
- **Local:** `src/lib/correlationId.ts:16`
- **Categoria:** duplicacao · **Esforço:** baixo
- **Problema:** lib/correlationId.ts:16 exporta generateCorrelationId (crypto.randomUUID, 8 hex) e lib/logger.ts:34 exporta OUTRO generateCorrelationId como alias deprecated de generateRequestTag (contador previsível `req_N_timestamp`). lib/retry.ts:1 importa `generateCorrelationId` de '@/lib/logger' e ainda o chama com argumento ('retry') — assinatura da versão contador, mostrando que o alias deprecated continua sendo o caminho quente. Confusão idêntica de nomes com UUID: regex RFC4122 duplicada em utils/uuid.ts:20, lib/evolutionInstance.ts (UUID_RE), lib/audit.ts, useRealtimeInbox.ts e WhisperMode.tsx.
- **Recomendação:** Remover o alias deprecated do logger (migrando os importadores), e centralizar a regex UUID em utils/uuid.ts exportando também isUuidLike.

### Escapes de tipagem nos módulos de acesso a dados: fromTable→any, emailMappers 100% any, externalClient com let mutável
- **Área:** src/lib, src/utils, src/services, src/adapters, src/shared (T15 duplicação / T16 qualidade dos módulos centrais)
- **Local:** `src/lib/supabaseHelpers.ts:11`
- **Categoria:** tipagem · **Esforço:** medio
- **Problema:** lib/supabaseHelpers.fromTable retorna `any` por design (DynamicClient), anulando o generic Database do client — qualquer typo de coluna/tabela compila (5 consumidores). utils/emailMappers.ts recebe `(data: any)` em todos os 6 mappers, ou seja, o 'mapeamento tipado' valida nada em runtime nem em compile-time (um zod schema por linha seria o correto, e src/shared já tem o padrão). services/email/emailApi.ts:27-28 usa `from('email_revalidation_jobs' as any)`. integrations/supabase/externalClient.ts exporta `export let externalSupabase` mutável via updateRuntimeExternalConfig — consumidores que capturaram a referência antiga (ex.: BridgeService importa o binding, ok, mas closures não) podem falar com o client errado; o próprio arquivo admite preferir os getters.
- **Recomendação:** Tipar fromTable com keyof ExtendedDatabase['public']['Tables'] | string overload, converter emailMappers para schemas zod (reaproveitando o padrão de shared/webhookEventSchemas), e depreciar os exports let de externalClient em favor de getExternalSupabase().

### BridgeService: guard morto e retorno health sempre null
- **Área:** src/lib, src/utils, src/services, src/adapters, src/shared (T15 duplicação / T16 qualidade dos módulos centrais)
- **Local:** `src/services/connections/BridgeService.ts:10`
- **Categoria:** codigo-morto · **Esforço:** baixo
- **Problema:** `if (!externalSupabase)` (linha 10) é inalcançável — externalClient.ts garante que externalSupabase nunca é null/undefined (fallback para o client principal na linha 68-82 do externalClient). O método promete `health: HealthRow | null` mas TODOS os caminhos retornam health:null (linhas 24, 28-32) — o tipo HealthRow e o comentário sobre v_webhook_health são vestigiais; consumidores que renderizam health nunca mostrarão nada. utils/normalizeMediaUrl.ts:7 também carrega hack vestigial (`.replace(/\.supabase\.co"\//...)`) corrigindo aspas embutidas em URLs que deveria ser tratado na origem do dado.
- **Recomendação:** Remover o guard morto e o campo health do contrato (ou implementar de fato a leitura de v_webhook_health); documentar na origem por que URLs chegam com aspas ou remover o hack após corrigir o produtor.

### Guard de autenticacao duplicado dentro de paginas ja envolvidas por ProtectedRoute
- **Área:** src/pages/, App.tsx e roteamento (Tarefas 17-18)
- **Local:** `src/pages/QueuesComparison.tsx:13`
- **Categoria:** duplicacao · **Esforço:** baixo
- **Problema:** QueuesComparison.tsx:13-17 e Index.tsx:17-21 reimplementam 'if (!loading && !user) navigate(19/auth19)' com splash/skeleton proprios, mesmo estando ambas as rotas envolvidas por <ProtectedRoute> em AppRoutes.tsx (linhas 133-140 e 157-164), que ja faz exatamente esse redirect com estado 'from'. Sao dois caminhos de redirect concorrentes (o da pagina perde o state.from usado pos-login).
- **Recomendação:** Remover o guard interno das paginas e confiar no ProtectedRoute; se o splash custom for desejado, passa-lo como fallback do guard.

### Id 'campaigns' duplicado na sidebar — dois itens de menu com o mesmo id
- **Área:** src/pages/, App.tsx e roteamento (Tarefas 17-18)
- **Local:** `src/components/layout/sidebarNavConfig.ts:68`
- **Categoria:** bug/config · **Esforço:** baixo
- **Problema:** sidebarNavConfig.ts:68 ({ id: 'campaigns', label: 'Campanhas' }) e :92 ({ id: 'campaigns', label: 'Campanhas Classicas' }) usam o mesmo id. Ambos apontam para a mesma view (VIEW_MAP 'campaigns') e ficam com estado ativo simultaneamente quando selecionados (currentView === item.id), alem de gerar key duplicada em listas que iteram itens por id.
- **Recomendação:** Renomear um dos itens para um id proprio (com view correspondente) ou remover o item redundante.

### Teste orfao: AdminGmailStatusPage.test.ts testa apenas um objeto mock local e a pagina nao existe
- **Área:** src/pages/, App.tsx e roteamento (Tarefas 17-18)
- **Local:** `src/pages/admin/AdminGmailStatusPage.test.ts:1`
- **Categoria:** codigo-morto · **Esforço:** baixo
- **Problema:** O arquivo testa um mockResponse hardcoded ('should maintain the expected contract from edge function' apenas faz expect sobre o proprio literal declarado 5 linhas acima) — nao importa nem exercita nenhum codigo de producao. Nao existe AdminGmailStatusPage.tsx em src/pages/admin/ (so o .test.ts). E um teste que sempre passa e nao protege contrato nenhum.
- **Recomendação:** Remover o arquivo ou converte-lo em teste real do consumidor da edge function (ex.: hook de status de email usado em AdminEmailStatusPage).

### Dupla superficie de navegacao (rota de path + view interna) para ~10 paginas admin com guards divergentes
- **Área:** src/pages/, App.tsx e roteamento (Tarefas 17-18)
- **Local:** `src/pages/lazyViews.ts:50`
- **Categoria:** manutenibilidade · **Esforço:** alto
- **Problema:** Paginas como AdminConnectionsPage, AdminInboxSyncStatusPage, AdminEvoApiHealthPage, AdminEmailStatusPage, AdminEmailAuditPage, AdminFailedAuthMessagesPage e SLAHistory sao registradas duas vezes: em AppRoutes.tsx (com ProtectedRoute + roles) e em lazyViews.ts/VIEW_MAP (via ?view=, quase sempre sem gate). Essa duplicacao e a causa estrutural da inconsistencia de autorizacao do finding 1 e obriga manter dois pontos de registro por pagina.
- **Recomendação:** Definir uma unica fonte de verdade (registro por pagina com path, viewId e roles) da qual AppRoutes, VIEW_MAP, VIEW_REQUIRED_ROLES e sidebarNavConfig derivem; ou eliminar uma das superficies por pagina.
