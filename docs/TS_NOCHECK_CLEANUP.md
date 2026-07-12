# Plano de saneamento `@ts-nocheck`

## Baseline atual
- **103 arquivos** com `// @ts-nocheck` (ver `scripts/ts-nocheck-baseline.txt`)
- Gate no CI (`scripts/check-ts-nocheck.mjs`) bloqueia novos arquivos fora do baseline
- Rodar após cada remoção: `node scripts/check-ts-nocheck.mjs --update`

## Verificação de sincronia types.ts × DB
`src/integrations/supabase/types.ts` **já está sincronizado** com o schema atual
(194 definições cobrindo as 146 tabelas de `public`). Tabelas mencionadas
como "faltantes" em backlogs anteriores (`outbound_delivery_audit`,
`sla_history`, `sla_alert_preferences`, `service_channels`, `workspaces`,
`hmac_selftest_audit`) **não existem no banco** — o código órfão é que as
referencia. Não há trabalho de regeneração pendente.

## Categorias de erro reais (bloqueiam remoção do `@ts-nocheck`)

### 1. Código órfão referenciando tabelas fantasma
Arquivos que fazem `.from('evolution_contacts')`, `.from('service_channels')`,
etc. Correção: remover o código ou trocar pela tabela real.

Amostra confirmada:
- `src/features/inbox/hooks/useChatMediaSending.ts` → `evolution_contacts`
- `src/hooks/admin/useAdminAutomations.ts` → `service_channels`, colunas
  `priority`/`department_id`/`channel_id`/`cooldown_seconds` ausentes em
  `automations`

### 2. Colunas ausentes na tabela real
Ex.: `team_messages` sem `status`, `departments` sem `department_id`.
Correção: migration para adicionar coluna OU remover o uso.

### 3. Widening `T | null` (o mais comum)
Interfaces locais declaram `T` onde Postgres devolve `T | null`.
Correção: `?? ''`/`?? undefined`/`?? 0` no call site.

## Ordem de ataque sugerida (por volume de chamadas Supabase)

Tentativa em lote nos top-5 confirmou que **cada arquivo exige refactor
semântico individual** — não há atalho mecânico.

| Prioridade | Arquivo | Chamadas | Causa raiz |
|-----------|---------|----------|------------|
| 1 | `features/inbox/hooks/useChatMediaSending.ts` | 13 | tabela fantasma `evolution_contacts` |
| 2 | `features/inbox/hooks/team-chat/useTeamChatMutations.ts` | 13 | coluna `status` em `team_messages` |
| 3 | `features/admin/hooks/monitoring/useFailedMessages.ts` | 12 | widening null |
| 4 | `features/inbox/hooks/realtime/externalMessageSender.ts` | 10 | widening null |
| 5 | `hooks/admin/useAdminAutomations.ts` | 8 | colunas ausentes em `automations` |

Consultar `docs/STRICT_MODE_BACKLOG.md` para lista completa.

## Fluxo por arquivo
1. Remover linha `// @ts-nocheck` do topo
2. `bunx tsc --noEmit -p tsconfig.app.json 2>&1 | grep <arquivo>`
3. Classificar erro (órfão / coluna / widening) e corrigir
4. Repetir até 0 erros no arquivo
5. `node scripts/check-ts-nocheck.mjs --update` e commit
