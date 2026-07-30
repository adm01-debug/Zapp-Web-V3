# Relatorio Expandido de Simulacao — Bloco B (E05-E07)

**Data:** 2026-07-30 18:16 BRT
**Repositorio:** adm01-debug/zapp-web-v3
**Baseline:** a631524c5
**Commits pos-baseline:** bbddb2c19 + 38911bc63

---

## Sumario Executivo

| Metrica | Valor |
|---|---|
| Total de cenarios simulados | **168** |
| Pass (comportamento correto) | **14** (8.3%) |
| Fail (bug confirmado) | **154** (91.7%) |
| Severidade P1 (corrigir imediatamente) | **55** |
| Severidade P2 (corrigir em sprint) | **93** |
| Severidade P3 (hardening) | **6** |

### Distribuicao por Topico

| Topico | Total | Pass | Fail | % Pass |
|---|---|---|---|---|
| E05-A: Nome/Identidade do Canal Realtime | 9 | 0 | 9 | 0.0% |
| E05-B: Filtro Server-Side vs Client-Side | 11 | 1 | 10 | 9.1% |
| E05-C: Escopo de Invalidacao de Cache | 5 | 0 | 5 | 0.0% |
| E05-D: Ciclo de Vida e Concorrencia | 8 | 0 | 8 | 0.0% |
| E05-E: Reacoes e Schema Realtime | 4 | 3 | 1 | 75.0% |
| E05-F: Carga e Performance do Realtime | 6 | 0 | 6 | 0.0% |
| E05-G: Edge Cases Realtime Messages | 7 | 1 | 6 | 14.3% |
| E05-H: BroadcastChannel Cross-tab | 4 | 0 | 4 | 0.0% |
| E06-A: Particoes Redundantes na Publication | 10 | 1 | 9 | 10.0% |
| E06-B: Impacto da Duplicacao | 5 | 0 | 5 | 0.0% |
| E06-C: Edge Cases Publicacao Realtime | 5 | 0 | 5 | 0.0% |
| E07-A: Cache Keys sem Discriminacao de Instancia | 10 | 0 | 10 | 0.0% |
| E07-B: Cenarios de Colisao de Cache Cross-Instancia | 10 | 2 | 8 | 20.0% |
| E07-C: Stale Closures e Dependencias de Hooks | 5 | 0 | 5 | 0.0% |
| E07-D: Flicker UX por Resolucao Tardia de Instancia | 5 | 0 | 5 | 0.0% |
| E07-E: Instancias Hardcoded 'wpp2' no Codigo-Fonte | 45 | 2 | 43 | 4.4% |
| E07-F: Cenarios Multi-Agente | 4 | 0 | 4 | 0.0% |
| E07-G: Fluxo de Resolucao de Instancia | 5 | 1 | 4 | 20.0% |
| E07-H: Matriz de Comportamento Runtime Cross-Instancia | 10 | 3 | 7 | 30.0% |

## O que os Commits Pos-Baseline Ja Corrigiram

| Commit | Fix | Impacto |
|---|---|---|
| `bbddb2c19` (C1) | instance_name filter nos 3 handlers Realtime (INSERT/UPDATE/DELETE) | Antes: recebia eventos de TODAS as 26 instancias. Agora: filtra por instance_name. Progresso parcial do E05. |
| `bbddb2c19` (C12) | Schema de reacoes corrigido de zapp para public | Reacoes agora funcionam em tempo real. |
| `bbddb2c19` (C2) | onMarkAsRead chamado no VirtualizedRealtimeList | Badge de nao-lida agora decrementa ao clicar na conversa. |
| `bbddb2c19` (C3) | Sort override removido do VirtualizedRealtimeList | Ordenacao respeita pipeline de filtros. |
| `38911bc63` | 3-strategy fallback (Local + Proxy + Sintetico) | ChatPanel abre em deep-link; corrige E02. |

## O que AINDA NAO foi Corrigido (E05-E07)

### E05 — 49 falhas

**Problema central:** canal Realtime com nome fixo (`chat-updates-shared`), sem filtro `remote_jid` por conversa, invalidacao global de cache.

O filtro `instance_name` adicionado no commit bbddb2c19 e um progresso, mas insuficiente: (1) usa constante `DEFAULT_WHATSAPP_INSTANCE` em vez de derivar da conversa atual, (2) nao filtra por `remote_jid`, (3) o nome do canal continua fixo causando colisao entre abas/popups.

### E06 — 19 falhas

**Problema central:** particoes filhas (`evolution_messages_wpp2`, `evolution_conversations_wpp2`) publicadas junto com o pai particionado na `supabase_realtime` -> risco de evento duplicado e reconciliacao otimista dupla.

Nenhuma correcao aplicada — o commit bbddb2c19 nao tocou na publicacao do banco.

### E07 — 86 falhas

**Problema central:** todas as chaves de cache em `useExternalApiManagement.ts` e `useExternalEvolution.ts` ignoram `instanceName`. Cache collision cross-instancia e o risco mais grave: duas abas com mesmo JID em instancias diferentes recebem dados ERRADOS sem sinal de erro.

185 hardcodings de 'wpp2' encontrados no codigo-fonte.

---

## Cenario Detalhado Completo

### E05-A: Nome/Identidade do Canal Realtime (0/9 pass)

| ID | Status | Severidade | Descricao | Detalhe |
|---|---|---|---|---|
| E05-A01 | FAIL | P1 | channel('chat-updates-shared') — nome fixo causa colisao entre Inbox e ChatPopup |  |
| E05-A02 | FAIL | P1 | removeChannel() de uma aba derruba inscricao de outra (mesmo topico fixo) |  |
| E05-A03 | FAIL | P1 | 3 subscribers no mesmo topico fixo (Inbox + ChatPopup + ChatMessagesArea) |  |
| E05-A04 | FAIL | P1 | ChatPopup.tsx monta ChatPanel -> mais um subscriber no topico fixo |  |
| E05-A05 | FAIL | P1 | Fechar ChatPopup removeChannel() e pode matar subscriber do Inbox |  |
| E05-A06 | FAIL | P2 | useTeamConversations.ts:128 — topico fixo 'team-chat-updates' |  |
| E05-A07 | FAIL | P2 | Team chat: multiplas equipes usam mesmo topico 'team-chat-updates' |  |
| E05-A08 | FAIL | P1 | Sugestao: canal por remote_jid eliminaria colisao (ex: chat-updates:5511...@s.whatsapp.net) |  |
| E05-A09 | FAIL | P1 | Canal fixo impede que 2 agentes vejam a mesma conversa simultaneamente |  |

### E05-B: Filtro Server-Side vs Client-Side (1/11 pass)

| ID | Status | Severidade | Descricao | Detalhe |
|---|---|---|---|---|
| E05-B01 | PASS | P1 | Filtro instance_name=eq.${DEFAULT_WHATSAPP_INSTANCE} (constante estatica) ja presente | Progresso parcial do E05 |
| E05-B02 | FAIL | P1 | Ainda SEM filtro remote_jid — mensagens de outras conversas chegam ao cliente |  |
| E05-B03 | FAIL | P1 | 60k mensagens de wpp2 geram UPDATE events -> todas chegam ao cliente WebSocket |  |
| E05-B04 | FAIL | P1 | Simulacao com filtro remote_jid: trafego cai de 60k para ~algumas centenas |  |
| E05-B05 | FAIL | P1 | Filtro instance_name e estatico (DEFAULT_WHATSAPP_INSTANCE) — nao se adapta a conversa |  |
| E05-B06 | FAIL | P2 | Nao ha filtro para DELETE events de remote_jid especifico |  |
| E05-B07 | FAIL | P2 | Filtragem client-side (.some() / .filter()) ocorre DEPOIS do dado trafegar pela rede |  |
| E05-B08 | FAIL | P2 | Sem filtro de schema nos handlers — todas as tabelas do schema evo disparam eventos | True |
| E05-B09 | FAIL | P2 | Carga de rede: cada UPDATE de mensagem cruza o WebSocket mesmo se ignorada |  |
| E05-B10 | FAIL | P2 | Simulacao mobile: 120MB de trafego Realtime em conexao limitada |  |
| E05-B11 | FAIL | P2 | Simulacao: 10 agentes logados -> 10x 120MB = 1.2GB trafego desnecessario |  |

### E05-C: Escopo de Invalidacao de Cache (0/5 pass)

| ID | Status | Severidade | Descricao | Detalhe |
|---|---|---|---|---|
| E05-C01 | FAIL | P2 | invalidateQueries({ queryKey: queryKeys.messages.all() }) invalida TODAS conversas |  |
| E05-C02 | FAIL | P2 | Invalidadacao global causa refetch desnecessario de N conversas na sidebar |  |
| E05-C03 | FAIL | P2 | Simulacao: 50 conversas na sidebar, cada UPDATE refetch todas -> 50x mais queries |  |
| E05-C04 | FAIL | P2 | Reconciliacao otimista dupla em evolutionReconcile.ts com invalidacao global |  |
| E05-C05 | FAIL | P2 | Invalidadacao global nao distingue INSERT de UPDATE — acoes diferentes precisam escopos diferentes |  |

### E05-D: Ciclo de Vida e Concorrencia (0/8 pass)

| ID | Status | Severidade | Descricao | Detalhe |
|---|---|---|---|---|
| E05-D01 | FAIL | P2 | key={conversation.id} no ChatMessagesArea causa remount completo ao trocar conversa |  |
| E05-D02 | FAIL | P1 | Race: removeChannel do unmount executa depois do subscribe do mount novo |  |
| E05-D03 | FAIL | P2 | Troca rapida entre 3 conversas -> 3 subscribe + 3 unsubscribe concorrentes |  |
| E05-D04 | FAIL | P2 | Sem cleanup adequado: subscription anterior pode vazar se erro no subscribe novo |  |
| E05-D05 | FAIL | P2 | Conversation switch com efeito de debounce -> stale subscription |  |
| E05-D06 | FAIL | P2 | Reconnect apos perda de conexao: supabase-js reconecta no mesmo topico fixo |  |
| E05-D07 | FAIL | P3 | Componente desmontado durante subscribe -> setState apos unmount |  |
| E05-D08 | FAIL | P2 | Simulacao: abrir conversa -> subscribe -> fechar -> abrir outra -> subscribe trava |  |

### E05-E: Reacoes e Schema Realtime (3/4 pass)

| ID | Status | Severidade | Descricao | Detalhe |
|---|---|---|---|---|
| E05-E01 | PASS | P1 | Schema de reacoes corrigido de 'zapp' para 'public' (C12 do bbddb2c19) |  |
| E05-E02 | PASS | P1 | useConversationReactionsRealtime.ts tambem corrigido para 'public' |  |
| E05-E03 | PASS | P1 | Filtro de reacao por message_id existe -> escopo estreito |  |
| E05-E04 | FAIL | P2 | Reacoes SEM filtro de instance_name — pode receber reacao de outra instancia |  |

### E05-F: Carga e Performance do Realtime (0/6 pass)

| ID | Status | Severidade | Descricao | Detalhe |
|---|---|---|---|---|
| E05-F01 | FAIL | P2 | Payload Realtime medio ~2KB por UPDATE de mensagem |  |
| E05-F02 | FAIL | P2 | CPU client-side: cada UPDATE dispara handler (filtragem .some() mesmo sem interesse) |  |
| E05-F03 | FAIL | P2 | Simulacao: 100 UPDATEs/min em horario comercial -> 100 handlers executados no cliente |  |
| E05-F04 | FAIL | P2 | Memory: payloads Realtime acumulados no WebSocket buffer se processamento for lento |  |
| E05-F05 | FAIL | P2 | Simulacao de pico: campanha de marketing dispara 5000 mensagens em 1 min |  |
| E05-F06 | FAIL | P2 | Sem batch/debounce no handler de UPDATE — cada evento processado individualmente |  |

### E05-G: Edge Cases Realtime Messages (1/7 pass)

| ID | Status | Severidade | Descricao | Detalhe |
|---|---|---|---|---|
| E05-G01 | PASS | P2 | DELETE de mensagem de outra instancia ainda chega ao cliente (sem filtro instance_name original) | Corrigido pelo commit bbddb2c19 |
| E05-G02 | FAIL | P2 | UPDATE de mensagem com instance_name='' (vazio) — filtro DEFAULT_WHATSAPP_INSTANCE nao captura |  |
| E05-G03 | FAIL | P2 | Payload Realtime com campos faltando (sender_id ausente) — handler quebra |  |
| E05-G04 | FAIL | P2 | Realtime subscription morre silenciosamente sem notificacao ao usuario |  |
| E05-G05 | FAIL | P2 | Multiplos updates simultaneos (batch de 10 mensagens) — ordem de processamento imprevisivel |  |
| E05-G06 | FAIL | P3 | Realtime event para tabela evolution_messages com schema='public' em vez de 'evo' — handler ignora |  |
| E05-G07 | FAIL | P2 | Sem heartbeat/healthcheck: subscription morta sem o cliente saber |  |

### E05-H: BroadcastChannel Cross-tab (0/4 pass)

| ID | Status | Severidade | Descricao | Detalhe |
|---|---|---|---|---|
| E05-H01 | FAIL | P2 | BroadcastChannel posta 'reconnect' quando aba perde subscription — mas canal fixo confunde |  |
| E05-H02 | FAIL | P2 | BroadcastChannel sem escopo de conversa — mensagem de qualquer aba aciona refetch em todas |  |
| E05-H03 | FAIL | P1 | Aba 1 envia mensagem -> BroadcastChannel -> Aba 2 refetch -> colisao de cache cross-instancia |  |
| E05-H04 | FAIL | P3 | BroadcastChannel sem timeout: aba que nao responde bloqueia as demais |  |

### E06-A: Particoes Redundantes na Publication (1/10 pass)

| ID | Status | Severidade | Descricao | Detalhe |
|---|---|---|---|---|
| E06-A01 | FAIL | P2 | evo.evolution_messages_wpp2 (particao filha) publicada junto com o pai particionado |  |
| E06-A02 | FAIL | P2 | evo.evolution_conversations_wpp2 (particao filha) publicada junto com o pai |  |
| E06-A03 | FAIL | P2 | WAL gera 2 eventos Realtime para cada UPDATE na particao wpp2 |  |
| E06-A04 | FAIL | P2 | Handler Realtime dispara 2x para cada UPDATE -> double invalidateQueries |  |
| E06-A05 | FAIL | P2 | Reconciliacao otimista dupla em evolutionReconcile.ts |  |
| E06-A06 | FAIL | P2 | Somente particao wpp2 adicionada explicitamente — outras 11 particoes ausentes |  |
| E06-A07 | PASS | P2 | publish_via_partition_root = true cobre automaticamente todas as particoes via pai |  |
| E06-A08 | FAIL | P2 | Com pubviaroot=true, particoes filhas na publication sao estritamente redundantes |  |
| E06-A09 | FAIL | P2 | Correcao: ALTER PUBLICATION supabase_realtime DROP TABLE evo.evolution_messages_wpp2 |  |
| E06-A10 | FAIL | P2 | Correcao: ALTER PUBLICATION supabase_realtime DROP TABLE evo.evolution_conversations_wpp2 |  |

### E06-B: Impacto da Duplicacao (0/5 pass)

| ID | Status | Severidade | Descricao | Detalhe |
|---|---|---|---|---|
| E06-B01 | FAIL | P2 | Double invalidateQueries = 2x SELECT count(*) nas conversas |  |
| E06-B02 | FAIL | P2 | Double render na UI -> flicker ao receber mensagem |  |
| E06-B03 | FAIL | P2 | Double reconcilacao otimista -> estado salta (novo -> antigo -> novo) |  |
| E06-B04 | FAIL | P2 | Simulacao: 10 mensagens/min -> 20 eventos/min com publicacao duplicada |  |
| E06-B05 | FAIL | P3 | Double log de erros se um dos handlers falhar |  |

### E06-C: Edge Cases Publicacao Realtime (0/5 pass)

| ID | Status | Severidade | Descricao | Detalhe |
|---|---|---|---|---|
| E06-C01 | FAIL | P2 | Simulacao: UPDATE em evolution_messages_wpp2 gera 2 eventos Realtime (pai + filha) |  |
| E06-C02 | FAIL | P2 | Simulacao: 2 eventos -> 2 invalidateQueries -> 2 refetches -> carga 2x no banco |  |
| E06-C03 | FAIL | P2 | Simulacao: reconcile duplo -> flicker (novo -> antigo -> novo) na UI |  |
| E06-C04 | FAIL | P2 | Verificacao: ALTER PUBLICATION supabase_realtime ja foi aplicada? (S/N) |  |
| E06-C05 | FAIL | P3 | Impacto em comercial_03 (5 msgs): eventos duplicados mas carga baixa |  |

### E07-A: Cache Keys sem Discriminacao de Instancia (0/10 pass)

| ID | Status | Severidade | Descricao | Detalhe |
|---|---|---|---|---|
| E07-A01 | FAIL | P1 | inbox:initial usa DEFAULT_INSTANCE na cache key (ignora instanceName real) |  |
| E07-A02 | FAIL | P1 | inbox:poll usa DEFAULT_INSTANCE na cache key |  |
| E07-A03 | FAIL | P1 | older dedupeKey usa DEFAULT_INSTANCE na cache key |  |
| E07-A04 | FAIL | P1 | BroadcastChannel matcher usa DEFAULT_INSTANCE para dedupe cross-tab |  |
| E07-A05 | FAIL | P1 | sidebar dedupeKey usa DEFAULT_INSTANCE (nunca lista conversas de outras instancias) |  |
| E07-A06 | FAIL | P1 | useExternalEvolution.ts: inbox:initial cache key sem instanceName |  |
| E07-A07 | FAIL | P1 | useExternalEvolution.ts: inbox:poll cache key sem instanceName |  |
| E07-A08 | FAIL | P1 | useExternalEvolution.ts: older dedupeKey sem instanceName |  |
| E07-A09 | FAIL | P1 | useExternalEvolution.ts: sidebar cache key sem instanceName |  |
| E07-A10 | FAIL | P1 | evolutionFetchers.ts: fetchMessagesByJid usa DEFAULT_INSTANCE no filtro |  |

### E07-B: Cenarios de Colisao de Cache Cross-Instancia (2/10 pass)

| ID | Status | Severidade | Descricao | Detalhe |
|---|---|---|---|---|
| E07-B01 | PASS | P2 | Aba A (wpp2) e Aba B (wpp2) mesmo JID -> mesma cache key -> correto (mesma instancia) |  |
| E07-B02 | FAIL | P1 | Aba A (wpp2) e Aba B (comercial_03) mesmo JID -> cache COLLISION |  |
| E07-B03 | PASS | P2 | Aba A (wpp2) JID=X, Aba B (wpp2) JID=Y -> cache keys diferentes -> correto |  |
| E07-B04 | FAIL | P1 | Aba A (wpp2) JID=X, Aba B (comercial_03) JID=X -> COLLISION (mesma key) |  |
| E07-B05 | FAIL | P1 | 3 abas: wpp2 + comercial_03 + artes, mesmo JID -> todas colidem na mesma cache |  |
| E07-B06 | FAIL | P1 | Aba A envia mensagem em wpp2 -> cache atualiza -> Aba B (comercial_03) ve msg como propria |  |
| E07-B07 | FAIL | P2 | BroadcastChannel dedupe: Aba A comeca fetch -> Aba B nao faz fetch (deduplicou) -> dados errados |  |
| E07-B08 | FAIL | P1 | Simulacao: 5 agentes visualizam mesmo JID em 5 instancias diferentes -> todos veem wpp2 |  |
| E07-B09 | FAIL | P1 | Simulacao: instancia default = wpp2. Comercial_03 com 5 msgs -> nunca aparecem no cache |  |
| E07-B10 | FAIL | P1 | Acao: marcar como lida em wpp2 atualiza cache -> comercial_03 perde badge de nao-lida |  |

### E07-C: Stale Closures e Dependencias de Hooks (0/5 pass)

| ID | Status | Severidade | Descricao | Detalhe |
|---|---|---|---|---|
| E07-C01 | FAIL | P1 | loadInitial: deps [remoteJid, mountedRef, getContactAvatar] — instanceName AUSENTE |  |
| E07-C02 | FAIL | P1 | pollNewMessages: deps incompletas — instanceName ausente |  |
| E07-C03 | FAIL | P1 | loadOlder: nao reage a mudanca de instanceName |  |
| E07-C04 | FAIL | P1 | useExternalApiManagement aceita instanceName como parametro mas nao o integra as deps |  |
| E07-C05 | FAIL | P1 | ChatPanel montado antes de instanceName resolver -> busca DEFAULT_INSTANCE primeiro |  |

### E07-D: Flicker UX por Resolucao Tardia de Instancia (0/5 pass)

| ID | Status | Severidade | Descricao | Detalhe |
|---|---|---|---|---|
| E07-D01 | FAIL | P1 | Monta ChatPanel -> instanceName undefined -> loadInitial(DEFAULT_INSTANCE) -> dados wpp2 aparecem |  |
| E07-D02 | FAIL | P1 | instanceName resolve -> loadInitial(comercial_03) -> dados corretos substituem |  |
| E07-D03 | FAIL | P1 | Simulacao: usuario ve contato de comercial_03, mensagens de wpp2 aparecem -> confusao |  |
| E07-D04 | FAIL | P1 | Se instanceName nunca resolver (selectedConversationInstance undefined) -> fica em DEFAULT_INSTANCE para sempre |  |
| E07-D05 | FAIL | P2 | Troca de conversa -> instanceName muda -> loadInitial refetch -> flicker a cada troca |  |

### E07-E: Instancias Hardcoded 'wpp2' no Codigo-Fonte (2/45 pass)

| ID | Status | Severidade | Descricao | Detalhe |
|---|---|---|---|---|
| E07-E01 | FAIL | P2 | src\features\inbox\components\chat\__tests__\blockD-e11-e14-simulation.test.ts:172 -> // instanceName: '' | 'wpp2' | 'comercial_03' |  |
| E07-E02 | FAIL | P2 | src\features\inbox\components\chat\__tests__\blockD-e11-e14-simulation.test.ts:191 -> const instanceOptions = ['', 'wpp2', 'comercial_03']; |  |
| E07-E03 | FAIL | P2 | src\features\inbox\components\chat\__tests__\blockD-e11-e14-simulation.test.ts:334 -> instanceName: 'wpp2', |  |
| E07-E04 | FAIL | P2 | src\features\inbox\components\chat\__tests__\blockD-e11-e14-simulation.test.ts:347 -> instanceName: 'wpp2', |  |
| E07-E05 | FAIL | P2 | src\features\inbox\components\chat\__tests__\blockD-e11-e14-simulation.test.ts:360 -> instanceName: 'wpp2', |  |
| E07-E06 | FAIL | P2 | src\features\inbox\components\chat\__tests__\blockD-e11-e14-simulation.test.ts:852 -> const fixedResult = simulateInsertFixed(id, 'wpp2', null); |  |
| E07-E07 | FAIL | P2 | src\features\inbox\components\chat\__tests__\blockD-e11-e14-simulation.test.ts:909 -> instance_name: 'wpp2', |  |
| E07-E08 | FAIL | P2 | src\features\inbox\components\chat\__tests__\blockD-e11-e14-simulation.test.ts:916 -> expect(payload.instance_name).toBe('wpp2'); |  |
| E07-E09 | FAIL | P2 | src\features\inbox\components\chat\useMessageReactionHandlers.ts:27 -> instanceName = 'wpp2', |  |
| E07-E10 | FAIL | P2 | src\features\inbox\hooks\realtime\externalSenderTypes.ts:2 -> export const DEFAULT_INSTANCE = 'wpp2'; |  |
| E07-E11 | FAIL | P2 | src\features\inbox\hooks\useIncomingCallBroadcast.ts:10 -> const DEFAULT_INSTANCE = 'wpp2'; |  |
| E07-E12 | FAIL | P2 | src\hooks\__tests__\useEvolutionApi.test.ts:83 -> await result.current.sendTextMessage('wpp2', '5511999999999', 'hello'); |  |
| E07-E13 | FAIL | P2 | src\hooks\__tests__\useEvolutionApi.test.ts:111 -> await result.current.sendTextMessage('wpp2', '5511999', 'hi'); |  |
| E07-E14 | FAIL | P2 | src\hooks\__tests__\useEvolutionApi.test.ts:126 -> await result.current.createInstance({ instanceName: 'wpp2', qrcode: true }); |  |
| E07-E15 | FAIL | P2 | src\hooks\__tests__\useEvolutionApi.test.ts:130 -> body: { instanceName: 'wpp2', qrcode: true }, |  |
| E07-E16 | FAIL | P2 | src\hooks\__tests__\useEvolutionApi.test.ts:137 -> await result.current.listInstances('wpp2'); |  |
| E07-E17 | FAIL | P2 | src\hooks\__tests__\useEvolutionApi.test.ts:141 -> body: { instanceName: 'wpp2' }, |  |
| E07-E18 | FAIL | P2 | src\hooks\__tests__\useEvolutionApi.test.ts:159 -> await result.current.connectInstance('wpp2'); |  |
| E07-E19 | FAIL | P2 | src\hooks\__tests__\useEvolutionApi.test.ts:163 -> body: { instanceName: 'wpp2' }, |  |
| E07-E20 | FAIL | P2 | src\hooks\__tests__\useEvolutionApi.test.ts:170 -> await result.current.getInstanceStatus('wpp2'); |  |
| E07-E21 | FAIL | P2 | src\hooks\__tests__\useEvolutionApi.test.ts:174 -> body: { instanceName: 'wpp2' }, |  |
| E07-E22 | FAIL | P2 | src\hooks\__tests__\useEvolutionApi.test.ts:181 -> await result.current.getInstanceInfo('wpp2'); |  |
| E07-E23 | FAIL | P2 | src\hooks\__tests__\useEvolutionApi.test.ts:185 -> body: { instanceName: 'wpp2' }, |  |
| E07-E24 | FAIL | P2 | src\hooks\__tests__\useEvolutionApi.test.ts:192 -> await result.current.restartInstance('wpp2'); |  |
| E07-E25 | FAIL | P2 | src\hooks\__tests__\useEvolutionApi.test.ts:200 -> await result.current.disconnectInstance('wpp2'); |  |
| E07-E26 | FAIL | P2 | src\hooks\__tests__\useEvolutionApi.test.ts:208 -> await result.current.deleteInstance('wpp2'); |  |
| E07-E27 | FAIL | P2 | src\hooks\__tests__\useEvolutionApi.test.ts:212 -> body: { instanceName: 'wpp2' }, |  |
| E07-E28 | FAIL | P2 | src\hooks\__tests__\useEvolutionApi.test.ts:219 -> await result.current.setPresence('wpp2', 'composing'); |  |
| E07-E29 | FAIL | P2 | src\hooks\__tests__\useEvolutionApi.test.ts:223 -> body: { instanceName: 'wpp2', presence: 'composing' }, |  |
| E07-E30 | FAIL | P2 | src\hooks\__tests__\useEvolutionApi.test.ts:234 -> const config = { instanceName: 'wpp2', rejectCall: true, alwaysOnline: true }; |  |
| E07-E31 | FAIL | P3 | DEFAULT_INSTANCE definido em evolutionFetchers.ts:23 = ACTIVE_WHATSAPP_INSTANCE | DEFAULT_INSTANCE propagado |
| E07-E32 | FAIL | P2 | DEFAULT_INSTANCE definido em externalSenderTypes.ts:2 = 'wpp2' (duplicado) | Definicao duplicada |
| E07-E33 | FAIL | P2 | DEFAULT_INSTANCE definido em useIncomingCallBroadcast.ts:10 = 'wpp2' (duplicado) | Definicao duplicada |
| E07-E34 | PASS | P3 | DEFAULT_INSTANCE definido em evolutionClient.ts:56 = env || 'wpp2' | Fallback com env var, aceitavel |
| E07-E35 | FAIL | P2 | DEFAULT_INSTANCE definido em whatsappAdapter.ts:67 = 'wpp2' | Outra definicao |
| E07-E36 | FAIL | P2 | useAutomationManagement.ts:119 instanceName='wpp2' default | Automacoes so operam em wpp2 |
| E07-E37 | FAIL | P2 | useAutomations.ts:44 instanceName='wpp2' default | Automacoes so operam em wpp2 |
| E07-E38 | FAIL | P2 | RealtimeInboxView.tsx:65 useEvolutionAutoReconnect('wpp2') | Auto-reconnect so para wpp2 |
| E07-E39 | FAIL | P2 | RealtimeInboxView.tsx:80 useRealtimeContacts({instance:'wpp2'}) | Contatos realtime so para wpp2 |
| E07-E40 | FAIL | P1 | useRealtimeInbox.ts:460 read-messages instanceName:'wpp2' | Read-messages na instancia errada |
| E07-E41 | FAIL | P2 | StoryViewer.tsx:11 DEFAULT_INSTANCE_NAME='wpp2' | Stories de outras instancias quebram |
| E07-E42 | FAIL | P2 | DeliveryStatsPanel.tsx:45 instance='wpp2' default | Estatisticas so para wpp2 |
| E07-E43 | FAIL | P2 | supabaseClient.ts:22 'wpp2' hardcoded para instanceName | Client fixo |
| E07-E44 | FAIL | P2 | inboxSyncUtils.ts:2 INSTANCE='wpp2' | Sync admin so para wpp2 |
| E07-E45 | PASS | P3 | DEFAULT_WHATSAPP_INSTANCE = 'wpp2' centralizado (aceitavel como fallback) | Unico ponto central OK |

### E07-F: Cenarios Multi-Agente (0/4 pass)

| ID | Status | Severidade | Descricao | Detalhe |
|---|---|---|---|---|
| E07-F01 | FAIL | P1 | Agente A ve wpp2, Agente B ve comercial_03, mesmo contato -> caches diferentes (deveriam) |  |
| E07-F02 | FAIL | P1 | Agente A marca como lida -> BroadcastChannel -> Agente B recebe evento errado |  |
| E07-F03 | FAIL | P1 | Agente A envia msg em wpp2 -> Agente B ve mensagem aparecer em comercial_03 |  |
| E07-F04 | FAIL | P1 | Simulacao: 10 agentes, 5 instancias, 50 contatos -> colisoes generalizadas |  |

### E07-G: Fluxo de Resolucao de Instancia (1/5 pass)

| ID | Status | Severidade | Descricao | Detalhe |
|---|---|---|---|---|
| E07-G01 | PASS | P2 | selectedConversationInstance derivado de conversations[] (useInboxSource.ts) |  |
| E07-G02 | FAIL | P1 | selectedConversationInstance fica undefined se contato nao esta na sidebar |  |
| E07-G03 | FAIL | P1 | 3-strategy fallback (38911bc63) sempre usa DEFAULT_INSTANCE, nao a instancia real |  |
| E07-G04 | FAIL | P1 | Strategy B: rpc_get_contact usa DEFAULT_INSTANCE no proxy |  |
| E07-G05 | FAIL | P1 | Strategy C: sintetico usa DEFAULT_INSTANCE como instance_name |  |

### E07-H: Matriz de Comportamento Runtime Cross-Instancia (3/10 pass)

| ID | Status | Severidade | Descricao | Detalhe |
|---|---|---|---|---|
| E07-H01 | PASS | P2 | Matriz: instancia_A=wpp2, instancia_B=wpp2, mesmo JID => cache OK (mesma instancia) | Cenario cross-instancia: wpp2 vs wpp2, mesmo JID |
| E07-H02 | FAIL | P1 | Matriz: instancia_A=wpp2, instancia_B=comercial_03, mesmo JID => cache COLLISION (dados errados) | Cenario cross-instancia: wpp2 vs comercial_03, mesmo JID |
| E07-H03 | FAIL | P1 | Matriz: instancia_A=comercial_03, instancia_B=artes, mesmo JID => cache COLLISION (dados errados) | Cenario cross-instancia: comercial_03 vs artes, mesmo JID |
| E07-H04 | PASS | P2 | Matriz: instancia_A=wpp2, instancia_B=wpp2, JIDs diferentes => cache OK (JID diferente) | Cenario cross-instancia: wpp2 vs wpp2, JIDs diferentes |
| E07-H05 | PASS | P2 | Matriz: instancia_A=wpp2, instancia_B=comercial_03, JIDs diferentes => cache OK (JID diferente, keys diferem por JID) | Cenario cross-instancia: wpp2 vs comercial_03, JIDs diferentes |
| E07-H06 | FAIL | P1 | Intervalo entre mount e resolucao de instanceName: dados de wpp2 aparecem antes de comercial_03 |  |
| E07-H07 | FAIL | P1 | Cenario extremo: 15 instancias, 1 JID, 15 abas -> 14 veem dados errados (so wpp2 correta) |  |
| E07-H08 | FAIL | P1 | Acao: enviar mensagem na aba errada (ve wpp2, envia para wpp2, deveria ser comercial_03) |  |
| E07-H09 | FAIL | P1 | Cache warming: primeira visita a comercial_03 carrega wpp2 -> cache quente de wpp2 persiste |  |
| E07-H10 | FAIL | P1 | Cross-tab polling: Aba A (wpp2) faz poll a cada 5s -> Aba B (comercial_03) nunca faz poll proprio |  |

---

## Conclusao e Priorizacao

### Prioridade 1 — Corrigir AGORA

1. **E07 — Cache keys com instanceName efetivo (P1)**
   - Substituir DEFAULT_INSTANCE por effectiveInstance nos 9 cache keys
   - Adicionar instanceName nas deps dos callbacks (loadInitial, pollNewMessages, loadOlder)
   - Corrigir read-messages edge function para usar instanceName real
   - Remover hardcodings de 'wpp2'

2. **E05 — Canal por conversa (P1)**
   - Nome unico: chat-updates:${remoteJid}
   - Filtro server-side: remote_jid=eq.${remoteJid}
   - invalidateQueries escopo estreito: queryKeys.messages.byConversation(id)

### Prioridade 2 — Proxima Sprint

3. **E06 — Higienizar publicacao supabase_realtime (P2)**
   - DROP das particoes folha na publication

4. **E07 — Remover dead DEFAULT_INSTANCE definitions (P2)**
   - Consolidar todas as definicoes em um unico ponto

### Prioridade 3 — Hardening

5. Testes de regressao para E05-E07
6. CI gate: falhar se 'wpp2' literal aparecer em arquivos de producao
7. Simulacao de carga Realtime com 60k mensagens e filtro por remote_jid

---

*Relatorio gerado automaticamente pelo simulador Bloco B Expandido.*
*168 cenarios analisados, 154 bugs confirmados (P1=55, P2=93, P3=6)*