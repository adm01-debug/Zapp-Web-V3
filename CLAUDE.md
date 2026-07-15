# ZAPP-WEB — Contexto para Claude Code

## Projeto

**ZAPP-WEB (Pronto Talk Suite)** — plataforma omnichannel de atendimento ao cliente com WhatsApp, IA integrada, CRM e automações.

- **Produção**: https://zapp.atomicabr.com.br
- **Stack**: React 18 + TypeScript 5 + Vite + TailwindCSS + shadcn/ui + Supabase

---

## Banco de Dados — OBRIGATÓRIO LER

### Instância Supabase

| Atributo | Valor |
|----------|-------|
| **Tipo** | Self-Hosted (VPS AtomicaBR) |
| **URL** | `https://supabase.atomicabr.com.br` |
| **Schema principal** | `zapp` |
| **Schema Evolution API** | `evo` |
| **Schema public** | Zero tabelas (apenas views/proxies) |

### Schemas e Tabelas (auditado 2026-07-15)

| Schema | Tabelas | RLS | Descrição |
|--------|---------|-----|-----------|
| **`zapp`** | **315** | 100% | Todas as tabelas da aplicação |
| **`evo`** | **193** | 100% | Tabelas da Evolution API (WhatsApp) |
| `auth` | 21 | — | Auth GoTrue do Supabase |
| `bpm` | 41 | — | BPM/workflows |
| `email_app` | 33 | — | Integração Gmail |
| `ai` | 31 | — | IA e embeddings |
| `archive` | 25 | — | Dados arquivados |
| `financeiro` | 16 | — | Módulo financeiro |
| `vendas` | 13 | — | Módulo vendas |
| `ops` | 20 | — | Operações internas |
| `public` | **0** | — | NÃO usar diretamente |

### Regras Críticas de Schema

1. **SEMPRE usar `schema: 'zapp'`** — o cliente Supabase já está configurado com isso em `src/integrations/supabase/client.ts`. Não trocar para `public`.

2. **Para tabelas `evo.*`**: usar `.schema('evo').from('evolution_contacts')` ou criar cliente separado com `db: { schema: 'evo' }`.

3. **PostgREST**: sem o header `Accept-Profile: zapp`, queries falham com `PGRST205`.

4. **Realtime**: usar o schema da tabela base, nunca de views.
   - Mensagens do WhatsApp → `schema: 'evo'`, tabela `evolution_messages_wpp2`
   - Perfis/notificações → `schema: 'zapp'`

5. **Tipos TypeScript**: importar SEMPRE de `@/integrations/supabase/schema` (barrel canônico), nunca de `types.ts` diretamente.

### Tabelas Principais do Schema `zapp`

| Tabela | Função |
|--------|--------|
| `profiles` | Usuários da plataforma (17 registros) |
| `workspaces` | Workspaces/tenants |
| `workspace_members` | Membros por workspace (15) |
| `whatsapp_connections` | Conexões WA (3 ativas) |
| `instance_registry` | Registro de instâncias (23) |
| `empresas` | Empresas/clientes (51.688) |
| `contatos` | Contatos/leads |
| `departments` | Departamentos |
| `queues` | Filas de atendimento |
| `webhook_audit_log` | Log de webhooks (58.232 linhas, 19 MB) |
| `webhook_events_processed` | Eventos processados (58.076, 31 MB) |
| `app_notifications` | Notificações (14.283) |
| `audit_logs` | Logs de auditoria (4.356) |
| `user_roles` | Permissões (14) |

### Tabelas Principais do Schema `evo`

| Tabela | Função |
|--------|--------|
| `evolution_messages_wpp2` | Mensagens WhatsApp principal (41.045, 51 MB) |
| `evolution_contacts` | Contatos da Evolution API (20.563, 18 MB) |
| `evolution_webhook_events_v2_*` | Webhooks particionados por mês |
| `evolution_media` | Mídias (23.366, 10 MB) |
| `evolution_conversations_wpp2` | Conversas (12.525) |
| `evolution_whatsapp_status` | Status WA (14.789, 10 MB) |

> As tabelas `evolution_messages` e `evolution_conversations` são **views/tabelas-pai particionadas**.
> Os dados reais ficam nas partições por instância: `evolution_messages_wpp2`, `evolution_messages_comercial_01`, etc.

---

## Configuração do Cliente Supabase

```typescript
// src/integrations/supabase/client.ts (NÃO ALTERAR)
export const supabase = createClient<ExtendedDatabase>(url, key, {
  db: { schema: 'zapp' },  // ← schema canônico
  auth: { ... },
  realtime: { ... },
});
```

Para Edge Functions, usar `createZappAdminClient()` de `supabase/functions/_shared/db-client.ts`.

---

## Comandos Úteis

```bash
# Dev
bun run dev

# Testes
bun run test
bun run test:e2e

# Regenerar tipos TypeScript do banco
# (requer acesso à instância self-hosted)
curl -s "http://supabase_meta:8080/generators/typescript\
  ?included_schemas=public,zapp\
  &detect_one_to_one_relationships=true" \
  > src/integrations/supabase/types.ts
```

---

## Documentação de Referência

| Doc | Conteúdo |
|-----|----------|
| `docs/SCHEMA_REFERENCE.md` | **Documento canônico** de schemas e tabelas |
| `docs/ER_DIAGRAM.md` | Diagrama de entidade-relacionamento |
| `docs/ARCHITECTURE_AND_FLOW.md` | Arquitetura e fluxo de dados |
| `docs/API_CONTRACT.md` | Contratos de API |
| `docs/EVOLUTION_API_REFERENCE.md` | API Evolution (WhatsApp) |
| `docs/RUNBOOK_OBSERVABILITY.md` | Observabilidade e alertas |
| `SECURITY.md` | Políticas de segurança |

---

## Estrutura de Pastas Relevante

```
src/
├── integrations/supabase/   # Cliente Supabase, tipos, helpers
│   ├── client.ts            # createClient com schema: 'zapp'
│   ├── types.ts             # Auto-gerado (38K linhas, NÃO editar)
│   └── schema.ts            # Barrel canônico de tipos
├── hooks/                   # React hooks (useInbox, useMessages, etc.)
├── components/              # Componentes UI
└── lib/                     # Utilitários

supabase/
├── functions/               # 110+ Edge Functions (Deno)
│   └── _shared/
│       └── db-client.ts     # createZappAdminClient()
└── migrations/              # 800+ migrações SQL
```
