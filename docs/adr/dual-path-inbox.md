# ADR — Dual-path do inbox: `useInboxSource` (zapp×evo) e migração gradual

- **Data:** 2026-08-18
- **Etapa:** E36 (PLANO-100-ETAPAS)
- **Status:** Implementado (testes de contrato verdes em wt-e36)

## Contexto

O `useInboxSource` unifica conversas + mensagens do inbox. Antes desta etapa,
ele lia mensagens APENAS do path legado (`useMessages` → `zapp.messages` via
`messageService.getAllMessagesForContact`), sem cursor — enquanto o path
moderno `useMessagesCursor` (`rpc_list_messages_lite`, Evolution DB) já existia
no codebase, sem ser usado pelo hook. Isso deixava o inbox sem paginação de
histórico (`loadOlderMessages` sempre `undefined`) e sem o mecanismo de troca
entre as fontes documentado (achado 06:688-691 "dual-path").

## Decisão

**Seleção de fonte por CONFIGURAÇÃO** (`VITE_INBOX_SOURCE_MODE`), com
fallback automático e telemetria:

| Modo | Comportamento |
|---|---|
| `evo` (forçado) | `useMessagesCursor` apenas (cursor-based, `rpc_list_messages_lite`, PAGE_SIZE=50). Sem fallback. |
| `zapp` (forçado) | `useMessages` apenas (legado `zapp.messages`). Sem fallback. |
| `auto` (DEFAULT) | evo quando disponível; se o path evo FALHAR → cai para o legado e registra telemetria `source_fallback` (evento `source_switch` em `reconciliationTelemetry`). |

- Fonte primária: **evo cursor-based** (`useMessagesCursor`,
  `rpc_list_messages_lite`, `INBOX_SOURCE_PAGE_SIZE=50`), com realtime em
  `zapp.realtime_message_fanout` (espelho não-particionado).
- Fallback: **zapp legado** SOMENTE quando `evolution_messages` (via RPC do
  path evo) está indisponível — nunca em modo forçado.
- Gatilho de troca: erro do path evo (`cursor.error`) em modo `auto`. A troca
  engaja UMA única vez por mount (idempotente sob re-renders) e emite
  `recordSourceFallback(reason)` — counter `source_fallback` +
  evento `{ from: 'evo', to: 'zapp', reason, at }`.
- **Sem migração de dados nesta fase** — apenas seleção de leitura. A
  migração gradual é: default `auto` (nada muda para quem não configura) →
  observação via telemetria → flip para `evo` forçado quando a base evo
  estiver estável.

## Implementação

- `src/features/inbox/hooks/inboxSourceConfig.ts` — modo + tabela de decisão
  pura `selectInboxSourcePaths(mode, evoAvailable)` + constantes
  (`INBOX_SOURCE_PAGE_SIZE=50`, `SOURCE_FALLBACK_COUNTER='source_fallback'`,
  `SOURCE_SWITCH_EVENT='source_switch'`, `INBOX_SOURCE_MODE_ENV`).
- `src/features/inbox/hooks/realtime/reconciliationTelemetry.ts` — counter
  `sourceFallback` + `recordSourceFallback` + `getSourceSwitchEvents`
  (ring buffer cap 100) + reset.
- `src/features/inbox/hooks/useInboxSource.ts` — dual-path: ambos os hooks
  montados (rules of hooks), ativados via `enabled` (exatamente um path ativo
  por vez); remoteJid derivado de JID direto ou UUID via `conversations`;
  mapper `mapEvolutionLiteToChatMessage` (evo-lite → `Message`, shape
  unificado); campo de observabilidade `sourcePath: 'evo' | 'zapp'`.
- Interface de retorno ÚNICA para os dois paths — `useRealtimeInbox`
  (consumidor atual) não muda (36.9).

## Testes (TDD RED → GREEN)

- `__tests__/inboxSourceSelection.test.ts` — contrato puro de seleção por
  configuração (14 testes).
- `__tests__/inboxSourceMapper.test.ts` — contrato do mapper evo-lite → Message
  (9 testes).
- `__tests__/reconciliationTelemetry.sourceFallback.test.ts` — telemetria
  `source_fallback`/`source_switch` (6 testes).
- `__tests__/useInboxSource.test.tsx` — wiring do hook: evo OK → cursor-based;
  zapp → legado; auto+erro → fallback com telemetria; remoteJid derivado;
  contrato de tipos 36.9 (9 testes).
- Resultado: 69/69 verdes (incl. `reconciliationTelemetry.test.ts` vizinho,
  sem regressão).

## Rollback

- Remover o bloco E36 do `useInboxSource` (voltar ao body de 69 ln lendo só
  `useMessages`) e reverter `reconciliationTelemetry` (contador
  `sourceFallback` é aditivo; remoção não quebra consumidores existentes).
- Config: `VITE_INBOX_SOURCE_MODE` ausente/inválido → `auto` (degradação
  segura, nunca quebra o inbox).

## Pendências da etapa E36 (fora deste escopo)

- 36.5/36.6 — dedupe idempotente do `useMessages` legado com realtime
  (`realtimeUtils.dedupeMessages`).
- 36.7/36.8 — cap/estaleza do `useConversationMessagesData`
  (MESSAGES_CAP=1000, staleTime=30s).
