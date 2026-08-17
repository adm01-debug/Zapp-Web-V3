# FASE 4 — INBOX NÚCLEO (hooks/serviços)

## Etapa 31 — Testar e corrigir o orquestrador useRealtimeMessages (1019 ln)
**Objetivo:** Leitura integral + suíte vitest completa do maior orquestrador do inbox, eliminando dead code exposto e dependências test-only.
**Base:** findings-03.md:233 (06:376, 06:693-696); pendencias-consolidadas.md:609 (getRealtimeDiscardedCount 06:698-701, _clear/_reset 06:703-706).
### Subetapas
- [ ] 31.1 Ler `src/features/inbox/hooks/useRealtimeMessages.ts` (1019 ln) integralmente em chunks de 300 ln e documentar fluxo: hydratação, HYDRATE_DEBOUNCE_MS=50, dedupe, merge de status, reordenação — anotar 1-2 parágrafos em `docs/plano-fase-04.md` com o mapa real (função→linha→efeito).
- [ ] 31.2 Escrever RED: criar `src/features/inbox/hooks/__tests__/useRealtimeMessages.test.tsx` com 6 cenários: hydratação com HYDRATE_DEBOUNCE_MS, dedupe por id, merge de UPDATE via `useMessageUpdateBatcher`, reordenação por `created_at`, limpeza ao desmontar, estado de reconciliação (RECONCILED_MAX=1000) — todos falhando (nenhum teste existente cobre o orquestrador).
- [ ] 31.3 GREEN: extrair/exportar funções puras de transformação (dedupe/merge/sort) para `realtimeUtils.ts` já testado e fazer o orquestrador consumi-las — eliminar lógica duplicada inline; rodar `bun run test useRealtimeMessages` até verde.
- [ ] 31.4 RED: escrever teste de `sendStatusBus` integrado ao orquestrador (evento de status transiente deve atualizar a mensagem via canal `useMessageStatus`) — falha hoje porque o orquestrador não assina o bus diretamente (contrato a definir).
- [ ] 31.5 GREEN: expor a assinatura `subscribeSendStatus` do `sendStatusBus.ts` (176 ln) como injeção de dependência no orquestrador (prop opcional) e conectar `useMessageStatus` (canal por contactId); manter `__resetSendStatusForTest` atrás de `if (import.meta.env.MODE === 'test')`.
- [ ] 31.6 Remover `getRealtimeDiscardedCount()` deprecated (retorna sempre 0) e seus consumidores; substituir por contador vivo via `reconciliationTelemetry` (MAX_RECENT=100) se houver consumidor real — grep `getRealtimeDiscardedCount` deve retornar 0 hits após o PR.
- [ ] 31.7 Mover `playerStateStore._clear()`/`audioPlaybackBus._reset()` para `__tests__/` ou gate `import.meta.env.MODE === 'test'` — garantir que o bundle de produção não exporta métodos test-only (grep no dist).
- [ ] 31.8 RED: teste de regressão do `useMessageUpdateBatcher` (149 ln): batch de UPDATEs em janela curta deve emitir UM evento consolidado e drenar no unmount (sem perda).
- [ ] 31.9 GREEN: corrigir `useMessageUpdateBatcher` para drenar pendências no cleanup do useEffect (padrão flush-on-unmount) e atualizar consumo no orquestrador; rodar suíte completa do módulo realtime.
- [ ] 31.10 Rodar `bun run check` (typecheck+lint) e `bun run test` no subconjunto `hooks/realtime` + `hooks/__tests__`; atualizar `docs/estado/06-*.md` status de `useRealtimeMessages`/`useMessageUpdateBatcher`/`sendStatusBus` para cobertura documentada.
### Critério de conclusão (checklist da etapa)
- [ ] `useRealtimeMessages.test.tsx` ≥ 6 casos verdes no CI (vitest), nenhum `it.skip`
- [ ] `grep -rn "getRealtimeDiscardedCount" src/` = 0 hits
- [ ] Nenhum `_clear`/`_reset`/`__resetSendStatusForTest` no bundle de produção (grep no dist ou gate de build)
- [ ] `bun run check` verde no PR da etapa
- [ ] PR único com código + testes + atualização do doc de estado (06-*)

## Etapa 32 — Testar e corrigir o orquestrador useRealtimeInbox (513 ln)
**Objetivo:** Leitura integral + suíte do orquestrador primário, incluindo presença/conexões e o tópico aleatório que acumula canais.
**Base:** findings-03.md:233 (06:376, 06:693-696); pendencias-consolidadas.md:24 (tópico aleatório acumula canais); findings-03.md:47 (FALLBACK_POLL=120s, agent_presence + whatsapp_connections).
### Subetapas
- [ ] 32.1 Ler `src/features/inbox/hooks/useRealtimeInbox.ts` (513 ln) integralmente; documentar orquestração: AVATAR_SEED_TTL_MS=30min, RECONCILED_MAX=1000, canais internos e ordem de inicialização (linha→efeito) em `docs/plano-fase-04.md`.
- [ ] 32.2 RED: criar `src/features/inbox/hooks/__tests__/useRealtimeInbox.test.tsx` com 6 cenários: boot da cadeia de canais, reconcile com RECONCILED_MAX=1000, fallback de refetch (5min, pausa em hidden), dedupe de eventos duplicados, erro de canal → status `realtimeContactsStatusStore`, limpeza de canais no unmount (sem vazamento).
- [ ] 32.3 GREEN: corrigir falhas de limpeza de canais no unmount encontradas pelo teste (unsubscribe explícito por canal); validar com `bun run test useRealtimeInbox` verde.
- [ ] 32.4 RED: teste de vazamento de canais com `Math.random()` no nome do tópico (padrão A8 findings-08:675): montar/desmontar 3× em StrictMode e assertar que `supabase.channel()` foi chamado com tópicos estáveis/determinísticos e removidos no cleanup.
- [ ] 32.5 GREEN: substituir tópico aleatório por tópico determinístico derivado do estado (ex.: `inbox-realtime:{userId}:{vista}`) com reuso seguro; o teste de vazamento deve passar.
- [ ] 32.6 RED: `useRealtimePresenceAndConnections` (142 ln): teste de FALLBACK_POLL=120s — presença `agent_presence` + `whatsapp_connections` devem atualizar estado via `useSyncExternalStore` e parar poll ao desmontar.
- [ ] 32.7 GREEN: corrigir ciclo de poll (clearInterval no cleanup, sem dupla subscrição em StrictMode) e integração com o orquestrador; rodar teste verde.
- [ ] 32.8 RED: teste de `useRealtimeFallbackRefetch`: refetch de 5min NÃO dispara quando `document.hidden` e throttle de 5s entre disparos.
- [ ] 32.9 GREEN: implementar/ajustar pausa em hidden e throttle conforme contrato do teste; `useInboxHeartbeat` (138 ln) deve permanecer independente (THROTTLE_MS=240s, tratado na Etapa 37).
- [ ] 32.10 Rodar `bun run check` + suíte realtime completa; registrar no doc de estado 06-* a cobertura nova de `useRealtimeInbox`, `useRealtimePresenceAndConnections`, `useRealtimeFallbackRefetch`.
### Critério de conclusão (checklist da etapa)
- [ ] `useRealtimeInbox.test.tsx` ≥ 6 casos verdes; teste de vazamento de canais presente e verde
- [ ] Nenhum `Math.random()` em nome de tópico de canal realtime no módulo inbox (grep)
- [ ] `useRealtimePresenceAndConnections.test.ts` verde com assert de cleanup do poll
- [ ] `bun run check` verde; PR único (código + testes + doc 06-*)

## Etapa 33 — Fila de retry useMessageQueue: concorrência e DLQ sob teste
**Objetivo:** Provar e corrigir a fila de retry (maxRetries=3, MAX_CONCURRENT=5) com testes de concorrência e persistência de falhas.
**Base:** pendencias-consolidadas.md:604 (06:621 fila retry maxRetries=3, MAX_CONCURRENT=5); findings-03.md:22 (06:621).
### Subetapas
- [ ] 33.1 Mapear `src/features/inbox/hooks/useMessageQueue.ts` (674 ln): fila em memória × persistência (max_retries, DLQ), `MAX_CONCURRENT_SENDS=5` (l.79), `config.maxRetries=3` (l.19), baseDelay=1s, maxDelay=30s, retryable (l.410); documentar contrato em `docs/plano-fase-04.md`.
- [ ] 33.2 RED: criar `src/features/inbox/hooks/__tests__/useMessageQueue.test.tsx` (substituir/ampliar `useMessageQueueE2E.spec.tsx`): enfileira 10 mensagens → no máximo 5 em voo simultâneo (spy no sender resolve com delay controlado).
- [ ] 33.3 RED: teste de retry: falha retryable → 3 tentativas com backoff (fake timers, baseDelay=1s) e depois status terminal na DLQ; falha não-retryable → 1 tentativa.
- [ ] 33.4 GREEN: corrigir a fila conforme os testes (estado `retrying`/`failed` no `sendStatusBus`, contagem de tentativas persistida); rodar suíte verde.
- [ ] 33.5 RED: teste de dedupe de enfileiramento — mesma mensagem enfileirada 2× antes de processar gera UM envio (idempotência por `idempotency_key`).
- [ ] 33.6 GREEN: implementar guard de dedupe na fila; verde.
- [ ] 33.7 RED: `useSendThrottle` (83 ln): teste de throttle com fake timers — minIntervalMs=500, burstLimit=5, burstWindowMs=3000: 6º envio dentro da janela é atrasado; envios espaçados passam imediatos.
- [ ] 33.8 GREEN: corrigir `useSendThrottle` para o contrato do teste (janela deslizante correta); verde.
- [ ] 33.9 RED: `useRetryFailedMessage`: teste de RATE_LIMIT_MS=30s (2º clique em <30s é ignorado ou enfileirado) e optimistic update via `rpc_dlq_retry_now`.
- [ ] 33.10 GREEN: ajustar rate-limit e optimistic update; rodar `bun run check` + suíte de envio completa (queue+throttle+retry); atualizar doc 06-* (06:621, 06:634, 06:637).
### Critério de conclusão (checklist da etapa)
- [ ] Teste de concorrência prova MAX_CONCURRENT=5 (nunca >5 em voo) e está verde
- [ ] Teste de retry prova 3 tentativas + DLQ com fake timers e está verde
- [ ] `useSendThrottle.test.ts` (existente) ampliado com burst window e verde
- [ ] `grep -rn "MAX_CONCURRENT_SENDS" src/` aponta para constante única (5) referenciada pelo teste
- [ ] `bun run check` verde; PR único

## Etapa 34 — messageSender.ts (503 ln): in-flight dedup e caminho legado zapp
**Objetivo:** Testar o caminho crítico `sendMessageToContact` e corrigir dedup in-flight, cache de perfil e erros de auth.
**Base:** pendencias-consolidadas.md:604 (06:649 messageSender 503 ln, PROFILE_CACHE_TTL=5min, in-flight dedup); findings-03.md:28.
### Subetapas
- [ ] 34.1 Ler `src/features/inbox/hooks/realtime/messageSender.ts` (503 ln) integralmente; documentar: fluxo de envio, PROFILE_CACHE_TTL=5min, in-flight dedup, classifyAuthError, resolveConnection (`messageSenderHelpers.ts`), rollback/limpeza de fila (linha→efeito) em `docs/plano-fase-04.md`.
- [ ] 34.2 RED: criar `src/features/inbox/hooks/realtime/__tests__/messageSender.test.ts`: envio feliz → retorna remoteJid/messageId e publica status `sent` no `sendStatusBus`.
- [ ] 34.3 RED: teste de in-flight dedup — 2 chamadas simultâneas para a mesma mensagem (mesmo idempotency) executam UM fetch à Evolution (spy) e ambas resolvem com o mesmo resultado.
- [ ] 34.4 GREEN: corrigir o dedup in-flight (promessa compartilhada por chave, sem dupla inserção no DB); suíte verde.
- [ ] 34.5 RED: teste de PROFILE_CACHE_TTL=5min — perfil resolvido não re-busca em <5min; após TTL, nova busca (fake timers).
- [ ] 34.6 GREEN: ajustar cache de perfil para TTL exato; verde.
- [ ] 34.7 RED: teste de `classifyAuthError` (9 padrões, `parseEvolutionError`): erro 401/403 → `auth_error` com mensagem humanizada; erro de rede → `network_error` retryable.
- [ ] 34.8 GREEN: alinhar `messageSender` ao `parseEvolutionError` já testado (06:651) eliminando duplicação de parsing; verde.
- [ ] 34.9 RED: teste de falha de envio → mensagem devolvida à fila (via `useMessageQueue`) com status `failed`/`abandoned` correto e sem duplicata no banco.
- [ ] 34.10 GREEN: corrigir caminho de falha (rollback/requeue idempotente); rodar `bun run check` + suíte; atualizar doc 06-* (06:649).
### Critério de conclusão (checklist da etapa)
- [ ] `messageSender.test.ts` ≥ 6 casos verdes (feliz, dedup, TTL, auth, rede, falha)
- [ ] Teste de dedup prova 1 único fetch para 2 chamadas simultâneas
- [ ] Nenhum novo `fetch` sem `AbortController`/timeout introduzido (review do PR)
- [ ] `bun run check` verde; PR único com testes no mesmo commit

## Etapa 35 — Caminho evo: externalMessageSender + externalAudioSender
**Objetivo:** Testar os senders externos (texto e PTT/voz) e o contrato de `makeOptimisticBubble`/`DEFAULT_INSTANCE`.
**Base:** findings-03.md:29-30 (06:647 sendExternalText, 06:646 sendExternalAudio PTT/voz, blobToBase64, makeOptimisticBubble); findings-03.md:31 (DEFAULT_INSTANCE, SendError, OptimisticMessage).
### Subetapas
- [ ] 35.1 Ler `src/features/inbox/hooks/realtime/externalMessageSender.ts` (303 ln) e `externalAudioSender.ts` (184 ln); documentar fluxo texto/PTT, uso de `DEFAULT_INSTANCE`, `blobToBase64`, `makeOptimisticBubble` e re-export cruzado (linha→efeito).
- [ ] 35.2 RED: criar `src/features/inbox/hooks/realtime/__tests__/externalMessageSender.test.ts`: `sendExternalText` feliz → chama Edge Fn `evolution-api` com payload correto (instance, number, text) e publica status no bus.
- [ ] 35.3 RED: teste de erro — `SendError` com tipo estável (auth/rate-limit/network) propagado ao chamador sem throw silencioso; mensagem otimista `makeOptimisticBubble` criada antes do envio e reconciliada depois.
- [ ] 35.4 GREEN: corrigir divergências do contrato (status `pending`→`sent` via bus, sem duplicata quando o evento realtime chega); suíte verde.
- [ ] 35.5 RED: `externalAudioSender`: teste de PTT — `blobToBase64` de AudioBlob produz base64 correto; envio de áudio usa `audio`/`ptt` no payload da Evolution; fallback quando `instance` ausente usa `DEFAULT_INSTANCE`.
- [ ] 35.6 GREEN: ajustar sender de áudio para o contrato do teste (incl. tamanho máximo de base64 validado); verde.
- [ ] 35.7 RED: teste de `externalSenderTypes.ts` — `makeOptimisticBubble` deve ser pura (mesmo input → mesmo output) e `OptimisticMessage` compatível com o tipo renderizado pelo `MessageBubble`.
- [ ] 35.8 GREEN: refatorar `makeOptimisticBubble` para função pura testável (sem acesso ao store) e consumir nos dois senders; verde.
- [ ] 35.9 RED: teste de integração texto+áudio: enviar 2 mensagens em sequência → 2 eventos no bus, ordem preservada, sem race no `sendStatusBus` (HISTORY_LIMIT_PER_MSG=50).
- [ ] 35.10 GREEN: corrigir races de ordem no bus se o teste falhar; rodar `bun run check` + suíte realtime; atualizar doc 06-* (06:646-648).
### Critério de conclusão (checklist da etapa)
- [ ] `externalMessageSender.test.ts` + `externalAudioSender.test.ts` verdes (≥ 4 casos cada)
- [ ] `makeOptimisticBubble` pura e importada pelos 2 senders (grep)
- [ ] Teste de ordem/race no bus verde
- [ ] `bun run check` verde; PR único

## Etapa 36 — Dual-path zapp×evo: contrato do useInboxSource e migração
**Objetivo:** Formalizar a fonte unificada `useInboxSource` e documentar/implementar fallback entre `zapp.messages` legado e `evo.evolution_messages`.
**Base:** pendencias-consolidadas.md:602-603 (06:688-691 dual-path, usoMessages PARCIAL 06:627); findings-03.md:51 (useInboxSource wraps useRealtimeMessages + useMessages), findings-03.md:60 (useMessages LEGADO zapp.messages sem cursor).
### Subetapas
- [ ] 36.1 Ler `src/features/inbox/hooks/useInboxSource.ts` (69 ln) e `useMessages.ts` (163 ln); documentar: interface unificada, quando cada fonte é usada, gaps de cursor (legado sem cursor) e critérios atuais de seleção de fonte (linha→efeito).
- [ ] 36.2 Escrever ADR curto (docs/adr/dual-path-inbox.md): fonte primária = evo cursor-based (`useMessagesCursor`, rpc_list_messages_lite, PAGE_SIZE=50); fallback = zapp legado somente se `evolution_messages` indisponível; gatilhos de troca e telemetria de evento `source_switch` — sem migração de dados nesta fase.
- [ ] 36.3 RED: criar `src/features/inbox/hooks/__tests__/useInboxSource.test.tsx`: quando fonte evo responde → dados cursor-based; quando falha → fallback legado com aviso em `reconciliationTelemetry` (counter `source_fallback`).
- [ ] 36.4 GREEN: implementar seleção de fonte com fallback explícito conforme ADR; teste verde.
- [ ] 36.5 RED: teste de `useMessages` (legado): paginação 1000/pág via `fetchMessagesByContact` e sem duplicação ao intercalar com realtime (mesmo contrato do `messageService.ts` 07:465).
- [ ] 36.6 GREEN: corrigir `useMessages` para dedupe idempotente com realtime (reutilizar `realtimeUtils.dedupeMessages` já testado); verde.
- [ ] 36.7 RED: teste de `useConversationMessagesData` (MESSAGES_CAP=1000, staleTime=30s): cap respeitado em conversa longa e staleTime não re-busca em <30s.
- [ ] 36.8 GREEN: ajustar cap/estaleza conforme teste; verde.
- [ ] 36.9 RED: teste de contrato de tipos — `useInboxSource` retorna interface única compatível com os consumidores atuais (grep dos 5+ consumidores e type-check estrito).
- [ ] 36.10 GREEN: resolver incompatibilidades de tipo encontradas; rodar `bun run check` + suíte; atualizar doc 06-* (06:614, 06:627, 06:688-691) com o ADR.
### Critério de conclusão (checklist da etapa)
- [ ] ADR `dual-path-inbox.md` criado com fonte primária/fallback/gatilhos
- [ ] `useInboxSource.test.tsx` verde provando fallback + counter `source_fallback`
- [ ] `bun run check` verde com consumo tipado (sem `as unknown` novos)
- [ ] Doc 06-* marcado com decisão de dual-path (não mais "sem mecanismo documentado")

## Etapa 37 — Mark-as-read (MARK_READ_FLUSH_MS=250) e heartbeat
**Objetivo:** Eliminar perda permanente de leitura no flush de 250ms e estabilizar o contrato de `touchLastSeen`/`useInboxHeartbeat`.
**Base:** pendencias-consolidadas.md:607 (06:723-726 MARK_READ_FLUSH_MS=250 deixa não-lidas); pendencias-consolidadas.md:608 (07:518-521 .eq('user_id') frágil); findings-03.md:85 (THROTTLE_MS=240s > HEARTBEAT 180s, A11 07:568).
### Subetapas
- [ ] 37.1 Ler `src/features/inbox/hooks/realtime/useConversationActions.ts` (153 ln) e mapear fluxo markAsRead: batch 250ms, quais mensagens entram no lote, condição de envio (linha→efeito).
- [ ] 37.2 RED: criar `src/features/inbox/hooks/realtime/__tests__/useConversationActions.markAsRead.test.tsx` com fake timers: 2 mensagens marcadas em <250ms → 1 UPDATE em lote (`.in()` com 2 ids).
- [ ] 37.3 RED: teste do bug crítico — marcar como lida e DESMONTAR o componente antes dos 250ms → UPDATE DEVE ainda ocorrer (flush no cleanup), nunca "permanentemente não lida".
- [ ] 37.4 GREEN: implementar flush-on-unmount no `useConversationActions` (drenar lote pendente no cleanup, com `ref` de lote); teste verde.
- [ ] 37.5 RED: teste de desduplicação — mesma mensagem marcada 2× no lote gera 1 UPDATE; mensagem já lida não entra no lote.
- [ ] 37.6 GREEN: dedupe por id no lote; verde.
- [ ] 37.7 RED: `touchLastSeen` (07:466): teste do contrato — UPDATE em `profiles` com `.eq('user_id', ...)`; escrever teste que falhe se o filtro mudar para `.eq('id', ...)` (travar contrato atual explicitamente, refatorar para constante `PROFILE_PK = 'user_id'` com comentário).
- [ ] 37.8 GREEN: centralizar filtro em constante nomeada + guard de runtime (log se `user_id` não existir no schema); verde.
- [ ] 37.9 RED: `useInboxHeartbeat` (138 ln): teste do A11 — THROTTLE_MS=240s vs HEARTBEAT 180s: com fake timers, 2 picos de atividade em 200s geram 1 UPDATE (throttle respeitado) e o primeiro disparo ocorre no tempo correto.
- [ ] 37.10 GREEN: ajustar throttle do heartbeat (debounce de 240s) e cleanup de timer no unmount; rodar `bun run check` + suíte; atualizar doc 06-* (06:660, 06:612) e 07-* (07:466).
### Critério de conclusão (checklist da etapa)
- [ ] Teste flush-on-unmount verde (componente desmontado <250ms ainda persiste leitura)
- [ ] Lote markAsRead deduplicado por id (teste verde)
- [ ] `touchLastSeen` com filtro centralizado em constante (grep `PROFILE_PK`)
- [ ] `useInboxHeartbeat` com teste de throttle 240s verde
- [ ] `bun run check` verde; PR único

## Etapa 38 — Alertas de retry: SOFT_CAP=500 sem toasts duplicados
**Objetivo:** Eliminar toasts duplicados por messageId em sessões longas e cobrir a cadeia de alertas de falha/automação.
**Base:** pendencias-consolidadas.md:606 (06:718-721 SOFT_CAP=500 toasts duplicados); findings-03.md:58 (canal failed_messages, status='abandoned', toast sonner); findings-03.md:57 (canal automation_executions).
### Subetapas
- [ ] 38.1 Ler `src/features/inbox/hooks/realtime/useRetryResolutionAlerts.ts` (199 ln): fluxo do bus + realtime, `SOFT_CAP=500` (l.35), eviction de 20% (l.49-51), quando um toast é emitido (linha→efeito).
- [ ] 38.2 RED: criar `src/features/inbox/hooks/realtime/__tests__/useRetryResolutionAlerts.test.tsx`: o MESMO messageId resolvido 2× em sessão longa → 1 toast (dedupe por messageId com janela).
- [ ] 38.3 RED: teste do SOFT_CAP — 600 resoluções distintas → o Set evicta 20% e NENHUM toast duplicado é emitido para ids já notificados (histórico de toasts separado do cap).
- [ ] 38.4 GREEN: separar "ids notificados" (dedupe) do "ids em voo" (cap); eviction só sobre o cap; teste verde.
- [ ] 38.5 RED: teste de status terminal — resolução `success` e `failed` terminais emitem toast correto (sonner) e removem o id do set em voo.
- [ ] 38.6 GREEN: corrigir transição de estado (remover do set em voo em status terminal, não em timeout); verde.
- [ ] 38.7 RED: `useFailedMessageAlerts`: teste de canal `failed_messages` com status='abandoned' → 1 toast por mensagem; eventos repetidos do mesmo id não acumulam toasts.
- [ ] 38.8 GREEN: dedupe por messageId no alerta de falha; verde.
- [ ] 38.9 RED: `useAutomationFailureAlerts`: teste de canal `automation_executions` — toast por execução falha com rate-limit de notificação (evitar spam em rajada).
- [ ] 38.10 GREEN: aplicar rate-limit/cooldown; rodar `bun run check` + suíte de alertas; atualizar doc 06-* (06:663, 06:658, 06:670).
### Critério de conclusão (checklist da etapa)
- [ ] Teste de dedupe por messageId verde (2 resoluções → 1 toast)
- [ ] Teste SOFT_CAP=500 verde (eviction 20% sem duplicar toasts)
- [ ] `useFailedMessageAlerts`/`useAutomationFailureAlerts` com testes verdes
- [ ] `bun run check` verde; PR único

## Etapa 39 — Mídia: AbortSignal no useMediaUrl e signed URL 7d
**Objetivo:** Eliminar invokes sem AbortSignal (anti-storm por mountedRef) e quebra de agendamentos longos pela expiração de signed URL em 7 dias.
**Base:** pendencias-consolidadas.md:605 (07:573-576 invoke SEM AbortSignal); findings-03.md:101-102 (06:618 auto-refresh, max 2 tentativas); findings-03.md:201 (Edge Fn get-media-base64 SEM AbortSignal); findings-04.md:154 (signed URL 7d useChatScheduleMessage.ts:43 quebra agendamentos >7d).
### Subetapas
- [ ] 39.1 Ler `src/features/inbox/hooks/useMediaUrl.ts` (603 ln): fluxo de signed URL, TTL 604800s, refresh de URL expirada (max 2 tentativas), toast anti-flood, guard mountedRef no invoke (l.340-363, 467) (linha→efeito).
- [ ] 39.2 RED: criar teste (ampliar `useMediaUrl.test.ts`): invoke da Edge Fn recebe `AbortSignal` (spy no 2º argumento) e o abort cancela o fetch pendente no unmount.
- [ ] 39.3 GREEN: passar `signal` (AbortController por request) ao `supabase.functions.invoke` e abortar no cleanup; manter o guard mountedRef como defesa secundária; teste verde.
- [ ] 39.4 RED: teste de anti-storm — N invokes em janela curta (mesma mensagem) → 1 invoke efetivo (rate-limit por mensagem + toast único, sem flood).
- [ ] 39.5 GREEN: consolidar rate-limit por `messageId` (janela fixa) no lugar do guard frágil; verde.
- [ ] 39.6 RED: teste de refresh — URL expirada (simular `expires_at` passado) → re-invoke até 2 tentativas; 3ª falha → `failed=true` sem toast repetido.
- [ ] 39.7 GREEN: ajustar contagem de tentativas para resetar só após sucesso (não por montagem); verde.
- [ ] 39.8 RED: `useChatScheduleMessage` (findings-04.md:74, useChatScheduleMessage.ts:43): teste que prova que agendamento com `scheduled_for` > 7d cria URL inválida — RED documentando o bug (assert de validação de prazo).
- [ ] 39.9 GREEN: validar prazo máximo no agendamento (rejeitar > 7d com erro claro OU gerar signed URL curta + re-upload na execução, decisão no PR); bloqueio de envio inválido; teste verde.
- [ ] 39.10 Verificar Edge Fn `evolution-api/get-media-base64` (07:319): garantir que o chamador (useMediaUrl) passa signal; rodar `bun run check` + suíte de mídia; atualizar doc 06-* (06:617-618) e 07-* (07:319).
### Critério de conclusão (checklist da etapa)
- [ ] Teste prova `AbortSignal` presente no invoke (spy) e abort no unmount
- [ ] Teste de anti-storm verde (1 invoke por janela/mensagem)
- [ ] Teste de refresh max 2 tentativas verde
- [ ] Agendamento >7d bloqueado/tratado com teste verde (findings-04 A5)
- [ ] `bun run check` verde; PR único

## Etapa 40 — Hooks de UX/presença: autoscroll, deep links, atalhos e typing
**Objetivo:** Cobrir e corrigir os hooks periféricos do inbox (autoscroll, deep links, atalhos, broadcast de digitação) que operam sem testes.
**Base:** findings-03.md:180 (useChatAutoScroll threshold=150px), 182 (useInboxShortcuts react-hotkeys-hook), 183 (useInboxDeepLinks ?contact=/?message=, window.__pendingOpenContactId); pendencias-consolidadas.md:17 (useContactTyping broadcast typing:{remoteJid}).
### Subetapas
- [ ] 40.1 Ler `useChatAutoScroll.ts` (68 ln), `useInboxDeepLinks.ts` (59 ln), `useInboxShortcuts.ts` (65 ln) e `src/features/contacts/hooks/useContactTyping.ts` (197 ln); documentar contratos e consumidores (grep de imports) em `docs/plano-fase-04.md`.
- [ ] 40.2 RED: `useChatAutoScroll` — teste com jsdom: usuário no topo (scrollTop < threshold 150px) → NOVO scroll automático NÃO ocorre; usuário no fundo → scroll segue novas mensagens.
- [ ] 40.3 GREEN: corrigir lógica de "near bottom" (distância relativa ao fim, não scrollTop absoluto) e guard de tamanho de mensagem; teste verde.
- [ ] 40.4 RED: `useInboxDeepLinks` — teste de `?contact=<uuid>`: ao montar, `window.__pendingOpenContactId` é consumido e limpo; `?message=<uuid>` rola até a mensagem após hydratação.
- [ ] 40.5 GREEN: corrigir consumo/limpeza do pending contact (evitar re-abertura em StrictMode); teste verde.
- [ ] 40.6 RED: `useInboxShortcuts` — teste de atalhos registrados via `react-hotkeys-hook`: tecla "C" abre nova conversa (handler chamado), atalho não dispara com foco em input/textarea (guard de composição).
- [ ] 40.7 GREEN: aplicar guards de foco e remover atalhos no unmount (useEffect cleanup); teste verde.
- [ ] 40.8 RED: `useContactTyping` — teste de broadcast: evento de digitação publica `typing:{remoteJid}` no canal correto e expira (timeout) sem publicar estado "parado" eterno; dedupe de broadcasts repetidos.
- [ ] 40.9 GREEN: corrigir broadcast (timeout de expiração, dedupe por contato, cleanup no unmount); teste verde.
- [ ] 40.10 Rodar `bun run check` + suíte completa do módulo inbox; atualizar doc 06-* (06:593, 06:610, 06:613) e findings-01 status de `useContactTyping`; garantir barrel `chat/index.ts` re-exporta hooks cobertos.
### Critério de conclusão (checklist da etapa)
- [ ] 4 suítes novas verdes: autoscroll, deep links, atalhos, typing (≥ 3 casos cada)
- [ ] Teste de cleanup no unmount para atalhos e typing (sem vazamento de listeners)
- [ ] `window.__pendingOpenContactId` consumido e limpo (assert no teste)
- [ ] `bun run check` verde; PR único


## Resumo (Fase 4 — INBOX NÚCLEO, etapas 31-40)
- 10 etapas × 10 subetapas = 100 subetapas, todas ancoradas em findings reais (findings-03/04 + pendencias-consolidadas), nenhuma pendência inventada.
- Cobre: orquestradores realtime (31-32), fila/throttle/retry (33), caminhos de envio zapp×evo (34-36), mark-as-read/heartbeat (37), alertas SOFT_CAP (38), mídia/AbortSignal/signed URL (39), hooks de UX/presença (40).
- Regra: cada fix de hook tem teste vitest no MESMO PR; ciclo TDD RED-GREEN explícito em cada etapa.
- Critérios verificáveis por `bun run test`/`bun run check`/grep (ex.: 0 hits de `getRealtimeDiscardedCount`, tópicos de canal sem `Math.random()`, `AbortSignal` presente no invoke).
- Próxima fase sugerida: componentes de chat (FASE 5 — ChatInputArea/ChatMessagesArea/MessageHoverToolbar, findings-04).


---
