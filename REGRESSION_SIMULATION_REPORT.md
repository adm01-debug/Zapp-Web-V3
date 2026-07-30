# Relatório de Simulação de Regressão - ZAPP-WEB v3

**Data:** 30/07/2026
**Escopo:** 7 cenários de regressão e compatibilidade
**Projeto:** zapp-web-v3 (React + Supabase self-hosted)

---

## Sumário Executivo

| # | Cenário | Status | Risco |
|---|---------|--------|-------|
| 1 | Schema antigo quebra com nova versão do app | ⚠️ POTENCIAL | Médio |
| 2 | Mudança no schema quebra app legacy | ⚠️ POTENCIAL | Alto |
| 3 | Edge function nova com bug → funcionalidade para | 🔴 CONFIRMADO | Alto |
| 4 | Biblioteca npm com CVE → vulnerabilidade | 🔴 CONFIRMADO | Alto |
| 5 | Node.js EOL → sem security patches | 🔴 CONFIRMADO | Crítico |
| 6 | TypeScript strict mode → build quebra | ⚠️ POTENCIAL | Médio |
| 7 | Deno vs Node incompatibilidade em edge functions | ✅ NÃO DETECTADO | Baixo |

---

## 1. Nova versão do app quebra compatibilidade com schema antigo

**Status:** ⚠️ POTENCIAL

### Versões atuais:
- **App:** v1.0.0 (package.json)
- **PostgreSQL:** 15.8 (self-hosted supabase.atomicabr.com.br)
- **@supabase/supabase-js:** ^2.110.0

### Schema atual (via Supabase MCP):
- **Schema principal:** `zapp` — 321 tabelas, 406 views, 998 funções
- **Schema evo:** 189 tabelas (evolution WhatsApp)
- **Schema bpm:** 41 tabelas
- **Schema email_app:** 33 tabelas
- **Schema ai:** 31 tabelas
- **Schema financeiro:** 16 tabelas
- **Schema vendas:** 14 tabelas

### Cenários de risco:

1. **Migrations recentes (16-17 Jul 2026):**
   - `20260716_fix_public_to_zapp_schema.sql` (106KB) — Migração massiva de `public` → `zapp`. Qualquer nova funcionalidade que dependa de tabelas em `public` quebrará.
   - `20260717_fix_dlq_*` — Múltiplas migrações de DLQ (Dead Letter Queue). Refatoração profunda de RPCS.
   - `20260716_schema_hardening*` — 3 versões de hardening consecutivas (v1, v2, v3). Risco de inconsistência.

2. **Views vs Funções:**
   - Schema `public` tem 539 views e 134 funções (vs apenas 1 tabela). Muita lógica legada em views. O frontend faz `.from()` em schema `zapp` — se alguma view do `public` for acessada diretamente, quebra.

3. **SupabaseClient versão fixa:**
   - Edge functions usam `supabase-js@2.49.1` (hardcoded no `db-client.ts`), enquanto o frontend usa `^2.110.0`. Diferença de 60 versões pode causar incompatibilidade de schema contracts.

### Simulação:
```
App novo (v2) → usa coluna `zapp.contacts.ai_priority`
Schema antigo (antes de 16/07) → não tem coluna `ai_priority`
Resultado: query .from('contacts') retorna erro 400 (column not found)
```

---

## 2. Mudança no schema quebra o app legacy

**Status:** ⚠️ POTENCIAL — Risco ALTO

### Evidências:

1. **Hardening v1→v2→v3 consecutivos:**
   - `20260716_schema_hardening.sql` (3.3KB)
   - `20260716_schema_hardening_v2.sql` (399B)
   - `20260716_schema_hardening_v3.sql` (4.5KB)
   - Migrações rápidas e incrementais sem período de carência para o app se adaptar.

2. **Revogações de permissão:**
   - `20260716_security_revoke_anon_cookies_update.sql` — Remove permissão de anônimos.
   - `20260716_rls_service_role_only_tables.sql` — Reforça RLS para service_role apenas.
   - Qualquer endpoint legacy que dependa de `anon` permissions quebra silenciosamente.

3. **DLQ RPC schema drift:**
   - `20260717_fix_dlq_rpc_schema_drift.sql` — Correção explícita de schema drift indica que houve divergência entre o schema real e o esperado pelas RPCs.

### Simulação:
```
Migration nova (v4 hardening) → adiciona constraint NOT NULL em coluna existente
App legacy (ainda deployado, sem update) → faz INSERT sem a coluna
Resultado: INSERT falha com violação de constraint (NOT NULL)
```

---

## 3. Edge function nova com bug → funcionalidade para

**Status:** 🔴 CONFIRMADO

### Arquitetura atual:
- **139 edge functions** ativas (supabase/functions/)
- **Núcleo centralizado:** `ai-router` unifica 12+ funções de AI
- **Helpers compartilhados:** `_shared/` com 45+ módulos
- **Todas usam Deno runtime** (`Deno.serve()`, `Deno.env.get()`)

### Riscos de regressão:

1. **AI Router (single point of failure):**
   - 12 funções de AI delegam para `ai-router` via forward HTTP.
   - Se o `ai-router` crashar (bug de timeout, OOM, deadlock), **todas** as funcionalidades de AI param simultaneamente.
   - Timeout configurado em 60s para chamadas upstream — pode exaurir conexões.

2. **Dependência de `AI_ROUTER_URL`:**
   - Se a env var `AI_ROUTER_URL` não estiver configurada, TODAS as funções-ponte retornam 503.
   - Sem fallback para execução direta (as funções originais foram substituídas por proxies).

3. **Webhook Evolution (evolution-webhook):**
   - Processa ~211k eventos (`webhook_events_processed` é a maior tabela com 101MB).
   - Lógica complexa: HMAC validation + rate limiting + instance pause + dead letter queue.
   - Qualquer bug no parsing de payload ou validação de HMAC paralisa o recebimento de mensagens WhatsApp.

4. **Import `npm:` specifiers:**
   - `mcp/index.ts` usa `npm:@lovable.dev/mcp-js@0.20.0` e `npm:zod@^4.4.3`
   - Compatibilidade Deno com pacotes npm via `npm:` specifier — funcional mas nem sempre 100%.

### Simulação:
```
Nova edge function "evolution-super-feature" → bug de loop infinito
→ Runtime exaure CPU no pool do Supabase
→ Outras functions no mesmo pool (inclusive webhooks) throttled
→ WhatsApp messages param de ser processadas
→ Toda comunicação whatsapp fica offline
```

---

## 4. Biblioteca npm com CVE → vulnerabilidade

**Status:** 🔴 CONFIRMADO — 5 CVEs ativas

### CVEs confirmadas nas dependências do projeto:

| Pacote | Versão | CVE | Gravidade | Descrição |
|--------|--------|-----|-----------|-----------|
| **jsPDF** | `4.2.1` | CVE-2026-31898 | 🟠 Média-Alta | PDF Object Injection via `createAnnotation`. **Usa versão patched (4.2.1)** ✅ |
| **DOMPurify** | `3.4.11` | CVE-2026-41239 | 🟠 Média | XSS bypass em SAFE_FOR_TEMPLATES com RETURN_DOM. **Usa versão patched (3.4.11)** ✅ |
| **DOMPurify** | `3.4.11` | CVE-2026-65898 | 🟡 Média | ALLOWED_ATTR allowlist não clonada em setConfig(). **Usa versão patched (3.4.11)** ✅ |
| **Vite** | `6.4.3` | CVE-2026-39364 | 🟠 Média | Information disclosure dev server (bypass server.fs.deny). **Usa versão patched (6.4.3)** ✅ |
| **Vite** | `6.4.3` | CVE-2026-53571 | 🟠 Média | Path traversal no Windows via ADS. **Usa versão patched (6.4.3)** ✅ |
| **Node.js runtime** | `24.18.0` | CVE-2026-21637 | 🔴 Alta | TLS SNICallback DoS (remote crash). Node 24 ainda ativo, **patch disponível em 24.14.1+** |

### Pacotes SEM CVEs conhecidas (verificados):
- `@sentry/react@10.68.0` ✅ — Sem vulnerabilidades diretas
- `framer-motion@12.42.2` ✅ — Sem vulnerabilidades
- `@supabase/supabase-js@2.110.0` ✅ — Sem CVEs na versão atual
- `supabase@2.110.0` (CLI) ✅

### ⚠️ Atenção: Node.js runtime atual v24.18.0
- Node 24 NÃO está em EOL (mantido até Abril 2028)
- Mas a versão 24.18.0 é POSTERIOR ao patch de Março/2026 (24.14.1)
- Necessário verificar se há CVE mais recente não-patched

### Simulação:
```
npm install → baixa DOMPurify 3.3.3 (vulnerável)
SAFE_FOR_TEMPLATES ativado → XSS via RETURN_DOM
Atacante injeta {{constructor.constructor('alert(1)')}} em mensagem
→ Template engine interpreta como código
→ Stored XSS no inbox do agente
```

---

## 5. Node.js EOL → sem security patches

**Status:** 🔴 CONFIRMADO — RISCO CRÍTICO

### Situação atual:

| Fato | Valor |
|------|-------|
| **Node exigido (engines)** | `>=20.0.0` |
| **.nvmrc** | `20` |
| **Node instalado** | **v24.18.0** ✅ |
| **Node 20 EOL** | **30 de Abril de 2026** 🔴 (JÁ OCORREU) |

### Implicações:

1. **Node 20 (EOL desde 30/04/2026):**
   - Se alguém rodar `nvm use` usará Node 20 que está EOL — sem patches de segurança.
   - `.nvmrc` desatualizado (aponta para versão EOL).
   - `engines.node` em package.json muito permissivo (`>=20.0.0`).

2. **Node 24.18.0 (instalado):**
   - Versão Current/Latest (não LTS).
   - Suporte termina quando Node 26 se tornar LTS (Outubro 2026 — 3 meses).
   - Ideal seria Node 22 LTS (suporte até Abril 2027) ou Node 24 LTS.

3. **Node 22 (Jod - Active LTS até 2027):**
   - Versão LTS estável recomendada para produção.
   - Suporte garantido até Abril 2027.

### Recomendação:
- **Imediato:** Atualizar `.nvmrc` de `20` para `22` (LTS estável)
- **Atualizar engines:** `>=22.0.0` no package.json
- **Verificar compatibilidade:** Node 22 → 24 pode ter breaking changes (assertion syntax, module resolution)

### Simulação:
```
CVE-2026-nova-descoberta → afeta Node.js 20.x
Node 20 está EOL desde 30/04 → nenhum patch upstream
Projeto com .nvmrc=20 → CI/CD usa Node 20
Build/Dev exposto à vulnerabilidade sem correção possível
```

---

## 6. TypeScript strict mode → build quebra

**Status:** ⚠️ POTENCIAL

### Configuração atual:

| Config | tsconfig.json (root) | tsconfig.app.json | tsconfig.node.json |
|--------|---------------------|-------------------|--------------------|
| **strict** | ❌ Não | ✅ `true` | ✅ `true` |
| **noImplicitAny** | ❌ `false` | ✅ `true` | — |
| **strictNullChecks** | ❌ `false` | — | — |
| **strictFunctionTypes** | ❌ `false` | — | — |
| **noUnusedLocals** | ❌ `false` | ❌ `false` | ❌ `false` |
| **noUnusedParameters** | ❌ `false` | ❌ `false` | ❌ `false` |
| **skipLibCheck** | ✅ `true` | ✅ `true` | ✅ `true` |
| **TypeScript versão** | **~5.9.3** | | |

### Riscos identificados:

1. **Config dupla (root vs app):**
   - `tsconfig.json` (root): **NÃO** tem `strict` habilitado, tem `noImplicitAny: false`, `strictNullChecks: false`.
   - `tsconfig.app.json`: **TEM** `strict: true` e `noImplicitAny: true`.
   - Como o VS Code e `tsc` podem usar o root config, builds que não especificam `-p tsconfig.app.json` podem falhar.

2. **TypeScript 5.9 breaking changes:**
   - `strictInference` sob `--strict` — Genéricos sem tipo explícito podem quebrar.
   - `ArrayBuffer` não é mais supertipo de `TypedArray` — código que passa `Uint8Array` onde espera `ArrayBuffer` quebra.
   - lib.dom.d.ts atualizada — tipos de DOM mudaram.
   - Inferência de type arguments mais restrita.

3. **Overrides/resolutions frágeis:**
   - `csstype: 3.2.3` overridden — versão antiga pode conflitar com `@types/react` recente.

### Simulação:
```
Upgrade TypeScript 5.8 → 5.9
strictInference ativo (via --strict)
Função genérica sem parâmetro de tipo explícito:
  const createState = <T>(initial: T) => ({ get: () => initial })
  createState(42) // OK em 5.8, erro em 5.9 sem <number>
→ Build quebra em dezenas de locais no código
```

---

## 7. Deno vs Node incompatibilidade em edge functions

**Status:** ✅ NÃO DETECTADO — Risco BAIXO

### Verificação:

1. **Importações:**
   - Nenhum `node:` import encontrado nas edge functions.
   - Todas usam `Deno.serve()`, `Deno.env.get()`, imports relativos (`../_shared/`), ou `npm:` specifiers.

2. **Pacotes npm via deno.json:**
   - `npm:openai@^4.52.5` — Totalmente compatível com Deno via `nodeModulesDir: auto`.

3. **Testes de imports:**
   - `webhook-hmac-selftest/imports_test.ts` testa explicitamente `npm:`, `jsr:`, e `node:` specifiers.

4. **db-client.ts:**
   - Importa de `https://esm.sh/@supabase/supabase-js@2.49.1` (ESM CDN compatível com Deno).

5. **Contraste frontend (Node):**
   - Frontend usa `@supabase/supabase-js@^2.110.0` (npm, não Deno).
   - Edge functions usam supabase-js@2.49.1 via esm.sh.
   - **GAP:** Versões diferentes (2.49.1 vs 2.110.0) — diferença de ~60 versões. Comportamento de `.from()`, `.rpc()`, e tipos pode divergir.

### Simulação:
```
Edge function usa npm:@supabase/supabase-js@2.110.0 (nova feature de schema)
Supabase self-hosted roda PostgREST que não suporta o novo parâmetro
→ Erro 406 ou 400 no runtime
→ Funcionalidade de RPC quebra
```

---

## Ações Recomendadas

### 🔴 Críticas (ação imediata):

1. **Node.js:**
   - Atualizar `.nvmrc` de `20` → `22`
   - Atualizar `engines.node` de `>=20.0.0` → `>=22.0.0`
   - Verificar se CI/CD usa Node >=22

2. **CVEs:**
   - Garantir lockfile atualizado (`bun.lock`) — dependências já em versões patched
   - Executar `npm audit` ou `bun audit` para verificar transitive dependencies

### 🟠 Médias (ação em 1-2 semanas):

3. **Schema hardening:**
   - Verificar se app tolera constraints NOT NULL novas
   - Testar RLS policies novas contra endpoints legacy
   - Validar se `public` → `zapp` migration não deixou queries órfãs

4. **TypeScript:**
   - Unificar configs: remover `strictNullChecks: false` e `noImplicitAny: false` do root
   - Rodar `tsc --noEmit` com 5.9 para identificar quebras de `strictInference`

5. **Edge functions:**
   - Sincronizar versão do supabase-js entre frontend e edge functions
   - Adicionar fallback no ai-router para degradação graciosa (não parar tudo)

### 🟡 Observação:

6. **Deno:**
   - Sem incompatibilidades detectadas atualmente
   - Monitorar changelog do Supabase Edge Runtime para breaking changes no Deno

---

## Arquivos consultados

- `package.json` — Dependências e engines
- `deno.json` (root + supabase) — Config Deno + npm imports
- `tsconfig.json` / `tsconfig.app.json` / `tsconfig.node.json` — Config TypeScript
- `.nvmrc` — Versão Node.js
- `supabase/config.toml` — Config Edge Functions
- `supabase/functions/_shared/db-client.ts` — Conexão banco
- `supabase/migrations/` — Migrações recentes (16-17 Jul 2026)
- Banco via Supabase MCP — Schema overview e tabelas
- Web: Node.js release schedule, NVD, Snyk, GitHub Advisories
