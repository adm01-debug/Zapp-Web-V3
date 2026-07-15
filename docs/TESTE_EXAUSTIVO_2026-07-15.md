# Teste Exaustivo — Auditoria de Schema/Docs (2026-07-15)

> Senior dev validation of all improvements from PRs #387, #388, #389.

## Resultado Geral: ✅ PASSOU (com 2 bugs pré-existentes documentados)

---

## 1. Verificação de Documentação (PR #387)

| Arquivo | Verificação | Status |
|---------|-------------|--------|
| `CLAUDE.md` | 315 zapp / 193 evo / regras de schema / links de referência | ✅ |
| `docs/SCHEMA_REFERENCE.md` | Contagem 315 (zapp) + 193 (evo), histórico de auditoria | ✅ |
| `docs/ER_DIAGRAM.md` | `evolution_messages_wpp2` correto, dois diagramas por schema | ✅ |
| `docs/ARCHITECTURE_AND_FLOW.md` | Sequência com `evo.evolution_messages_wpp2`, nota de schema | ✅ |
| `docs/AUDITORIA_COMPLETA_ZAPP_WEB.md` | "315 + 193" no cabeçalho, nota corrigindo "117 tabelas" | ✅ |

---

## 2. CI Gate: ts-nocheck (PR #388)

```
ℹ️  Baseline: 0 arquivo(s)
ℹ️  Atual:    0 arquivo(s)
→  Gate passa
```

Status: **✅ Gate passa** — baseline vazio reflete estado real (0 arquivos com `@ts-nocheck`).

---

## 3. Verificação do Cliente Supabase

**`src/integrations/supabase/client.ts`**:
```typescript
export const supabase = createClient<ExtendedDatabase>(url, key, {
  db: { schema: 'zapp' },  // ✅ schema canônico correto
  ...
});
```

---

## 4. Verificação de Edge Functions (schema: 'zapp')

Todas as Edge Functions com `createClient()` que acessam tabelas `zapp` usam `{ db: { schema: "zapp" } }`:

| Função | Schema config | Status |
|--------|--------------|--------|
| `public-api` | `{ db: { schema: "zapp" } }` | ✅ |
| `ai-proxy` | `{ db: { schema: "zapp" } }` + auth-only client | ✅ |
| `lgpd-scheduled-jobs` | `{ db: { schema: "zapp" } }` | ✅ |
| `gmail-health` | `{ db: { schema: "zapp" } }` | ✅ |
| `evolution-api` | `{ db: { schema: "zapp" } }` + auth-only client | ✅ |
| `evolution-sender` | `{ db: { schema: "zapp" } }` | ✅ |
| `external-db-bridge` | `{ db: { schema: "zapp" } }` | ✅ |
| `talkx-scheduler` | `{ db: { schema: "zapp" } }` | ✅ |
| `instance-pause-control` | `{ db: { schema: "zapp" } }` | ✅ |
| `contacts-import` | `{ db: { schema: "zapp" } }` (via env var pattern) | ✅ |

---

## 5. Verificação de Imports de Tipos TypeScript

Nenhum arquivo em `src/` importa diretamente de `types.ts` — todos usam o barrel `@/integrations/supabase/schema`.

Status: **✅ Correto**

---

## 6. Referências `evolution_messages` no Código (Esclarecimento)

O código usa `table: 'evolution_messages'` (sem sufixo `_wpp2`) em dois contextos:

**6a. Queries via `queryExternalProxy` (`evolutionFetchers.ts`):**
Roteadas pelo `external-db-bridge` Edge Function — não usam o cliente Supabase padrão. Corretamente apontam para o banco externo.

**6b. Realtime subscriptions (`schema: 'evo', table: 'evolution_messages'`):**
`evolution_messages` existe como **view** no schema `zapp` (bridge para `evo`), conforme documentado no audit PR #389. As subscriptions Realtime usam `schema: 'evo'` corretamente.

**6c. `zapp.evolution_messages`** é uma view bridge para `evo.evolution_messages`.
O código `.from('evolution_messages')` no cliente `zapp` funciona via essa view.

Status: **✅ Comportamento correto — documentado em `docs/SUPABASE_SCHEMA_AUDIT_2026-07-15.md`**

---

## 7. Bugs Pré-Existentes Encontrados (fora do escopo de docs)

### BUG-1: `queue_skills` — Tabela inexistente

- **Arquivo**: `src/features/admin/hooks/useAdminManagement.ts:552`
- **Código**: `supabase.from('queue_skills').select('*')`
- **Problema**: Tabela `queue_skills` não existe no schema `zapp`. Existe `queue_skill_requirements`.
- **Impacto**: Query silenciosa falha; lista de skills sempre vazia na UI de admin.
- **Fix sugerido**: Renomear para `queue_skill_requirements` ou criar a tabela ausente.

### BUG-2: Storage bucket `chat-media` inexistente

- **Arquivo**: `src/features/inbox/components/chat/useAudioVoiceChange.ts:12-18`
- **Código**: `supabase.storage.from('chat-media').upload(...)`
- **Problema**: Bucket `chat-media` não existe. Buckets disponíveis: `audio-memes`, `audio-messages`, `whatsapp-media`, etc.
- **Impacto**: Upload de áudio com voz alterada sempre falha.
- **Fix sugerido**: Criar bucket `chat-media` ou redirecionar para `audio-messages`.

> Estes bugs foram identificados durante o teste e documentados aqui para rastreamento.
> Não foram corrigidos nesta sessão pois requerem decisão de produto (nome do bucket/tabela).

---

## 8. `docs/TECHNICAL_DOCUMENTATION.md` — Aviso de Desatualização

O documento (Dezembro 2024) usava `schema: 'public'` e `CREATE TABLE public.*` (Lovable Cloud).
Foi adicionado um banner ⚠️ no topo explicando que os exemplos são pré-migração e indicando os docs corretos.

Status: **✅ Aviso adicionado**

---

## Resumo Final

| Área | Status |
|------|--------|
| Documentação de schema (CLAUDE.md, refs, ER, arch) | ✅ Correto |
| CI gate ts-nocheck | ✅ Passa (0/0) |
| Cliente Supabase (schema: zapp) | ✅ Correto |
| Edge Functions (schema: zapp) | ✅ Correto |
| Imports TypeScript (barrel schema.ts) | ✅ Correto |
| evolution_messages no código | ✅ Correto (view bridge) |
| TECHNICAL_DOCUMENTATION.md | ✅ Aviso adicionado |
| BUG-1 queue_skills | ⚠️ Documentado, não corrigido |
| BUG-2 chat-media bucket | ⚠️ Documentado, não corrigido |
