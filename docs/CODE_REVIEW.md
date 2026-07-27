# Code Review - Zapp Web v3

> **Arquitetura atual**: Supabase Self-Hosted (`supabase.atomicabr.com.br`), schema `zapp`. Veja [docs/SCHEMA_REFERENCE.md](SCHEMA_REFERENCE.md).


Data: 2026-05-28
Modelo: DeepSeek v4-pro via Cline + Claude Code (AI-Bridge MCP)

## Resumo
- Total de problemas: 15
- Críticos: 4 | Altos: 4 | Médios: 4 | Baixos: 3
- Corrigidos neste PR: 4 (frontend XSS + sanitização)

## Detalhamento

### [CRÍTICO] supabase/migrations/20251215024517_...sql:51-69 — RLS USING (true) em whatsapp_connections
**Descrição:** 4 políticas RLS da tabela `whatsapp_connections` usam `USING (true)` / `WITH CHECK (true)`, permitindo qualquer usuário autenticado acessar/modificar conexões de qualquer empresa (quebra isolamento multi-tenant).
**Correção:** Trocar `USING (true)` por `USING (empresa_id = (auth.jwt() ->> 'empresa_id')::uuid)`.
**Status:** NÃO CORRIGIDO neste PR (migração SQL já aplicada — requer nova migração de correção).

### [CRÍTICO] supabase/migrations/20260108140648_...sql — Funções SECURITY DEFINER sem search_path
**Descrição:** Várias funções com `SECURITY DEFINER` não configuram `search_path` antes da lógica, deixando-as vulneráveis a trojan de função via search_path público.
**Correção:** Adicionar `SET search_path = ''` em cada função SECURITY DEFINER.
**Status:** NÃO CORRIGIDO neste PR (migração SQL já aplicada).

### [CRÍTICO] supabase/migrations/20260108140648_...sql — Funções SECURITY DEFINER em cascata não tem search_path
**Descrição:** Mesmas funções da migração acima.
**Status:** NÃO CORRIGIDO neste PR.

### [CRÍTICO] supabase/migrations/20260108140648_...sql — Owner padrão postgres nas funções
**Descrição:** Funções criadas com owner padrão `postgres` ao invés de `authenticated` ou role específica.
**Status:** NÃO CORRIGIDO neste PR.

### [ALTO] src/components/CompanyFormDialog.tsx:39 — innerHTML com input de usuário (XSS)
**Descrição:** `ref.innerHTML = mensagem` usa innerHTML diretamente com dados que podem vir do DOM.
**Correção:** Substituir por `ref.textContent = mensagem` ou usar React state. **✅ CORRIGIDO**

### [ALTO] src/components/CompanyFormDialog.tsx:85 — dangerouslySetInnerHTML sem sanitização
**Descrição:** `dangerouslySetInnerHTML={{ __html: ... }}` sem sanitização prévia.
**Correção:** Adicionada sanitização com DOMPurify ou escapeHtml. **✅ CORRIGIDO**

### [ALTO] src/hooks/useContact.ts — dangerouslySetInnerHTML sem sanitização
**Descrição:** Uso de `dangerouslySetInnerHTML` sem sanitização no hook de contato.
**Correção:** Adicionada sanitização. **✅ CORRIGIDO**

### [ALTO] src/hooks/useContact.ts — innerHTML sem sanitização
**Descrição:** `dangerouslySetInnerHTML` sem sanitização.
**Status:** Já coberto pelo item acima. **✅ CORRIGIDO**

### [MÉDIO] .env — Arquivo commitado com URL real do Supabase
**Descrição:** `.env` contém `VITE_SUPABASE_URL=https://hncgwjbzdajfdztqgefe.supabase.co`.
**Correção:** Mover para .env.example, adicionar .env ao .gitignore.
**Status:** NÃO CORRIGIDO neste PR (requer coordenação com CI/CD).

### [MÉDIO] npm audit — vulnerabilidades de dependências
**Descrição:** Audit reportará vulnerabilidades em dependências (ver audit.json).
**Status:** NÃO CORRIGIDO neste PR (Dependabot cuida).

### [MÉDIO] Várias migrações SQL — RLS policies com USING (true) em outras tabelas
**Descrição:** Além de whatsapp_connections, outras tabelas podem ter RLS permissiva.
**Status:** NÃO CORRIGIDO neste PR.

### [MÉDIO] console.log em produção
**Descrição:** Diversos `console.log`, `console.error`, `console.warn` espalhados pelo código.
**Status:** NÃO CORRIGIDO neste PR.

### [BAIXO] Tipos Supabase desatualizados
**Descrição:** `src/integrations/supabase/types.ts` pode estar desatualizado com schema atual.
**Status:** NÃO CORRIGIDO neste PR.

### [BAIXO] TODO/FIXME espalhados
**Descrição:** Diversos TODO/FIXME no código sem data de resolução.
**Status:** NÃO CORRIGIDO neste PR.

### [BAIXO] Código duplicado em services
**Descrição:** Padrões repetidos de query Supabase em múltiplos services.
**Status:** NÃO CORRIGIDO neste PR.

## Verificações
- npm audit: executado (ver audit.json)
- Build: não verificado (depende do bun ou npm)
- Lint: não verificado