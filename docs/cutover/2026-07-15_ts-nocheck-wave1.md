# Onda de remoção de `@ts-nocheck` — CRM/Sales

**Data:** 2026-07-15  
**Status parcial:** bloqueado por dívida de schema

## Cluster analisado

| Arquivo | Erros TS reais |
|---------|----------------|
| `src/hooks/useCRMManagement.ts` | 8 erros — tabelas `contact_intelligence`, `contact_notes`, `contact_assignments`, `contact_custom_fields` **não existem** no `types.ts` gerado |
| `src/features/inbox/components/CRMAutoSync.tsx` | 5 erros — hook `useCRMSync` expõe API divergente (`syncConversation`, `isConfigured`, `syncConversationAsync`, `lastResult`) |

## Diagnóstico

O `types.ts` só reflete o snapshot de tabelas conhecidas. As tabelas de "Contact Intelligence" pertencem a um módulo em roadmap, referenciadas em código mas ausentes fisicamente no schema `zapp` da VPS.

## Ação decidida

Manter `@ts-nocheck` nesses 2 arquivos até que:

1. **DBA aplique migração** criando `zapp.contact_intelligence`, `zapp.contact_notes` (nova geração), `zapp.contact_assignments`, `zapp.contact_custom_fields` — ou
2. Refatoração para eliminar dependências (transformar em stubs `retornam null` até o backend existir).

## Cluster automatizado

O script `scripts/next-ts-nocheck-batch.mjs` (a criar) deve:

1. Ler lista de arquivos com `@ts-nocheck`
2. Para cada um, tentar remover a diretiva
3. Rodar `bunx tsgo --noEmit` e capturar erros **somente daquele arquivo**
4. Se 0 erros → commit lógico (manter removido)
5. Se >0 → restaurar diretiva e registrar em `docs/audit/ts-nocheck-blocked.md`

Rodada 1 (CRM/Sales) processou 2 arquivos, ambos bloqueados por schema.  
Próxima rodada sugerida: cluster `analytics/*` e `settings/*` (menor superfície de tabelas).
