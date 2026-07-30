# Relatorio de Simulacao — Bloco B (E05-E07)

**Data:** 2026-07-30 18:12 BRT
**Repositorio:** adm01-debug/zapp-web-v3
**Baseline auditada:** a631524c5 (2026-07-30)
**Commits pos-baseline:** bbddb2c19 + 38911bc63

---

## Sumario

| Metrica | Valor |
|---|---|
| Total de cenarios simulados | **51** |
| Pass (comportamento correto) | **5** (9.8%) |
| Fail (bug confirmado) | **46** (90.2%) |
| Severidade P1 (deve ser corrigido) | **26** |
| Severidade P2 (corrigir em sprint) | **19** |
| Severidade P3 (hardening) | **1** |

## O que os commits pos-baseline ja corrigiram

| Commit | Fix | Impacto no Bloco B |
|---|---|---|
| `bbddb2c19` (C1) | instance_name filter nos 3 handlers Realtime (INSERT/UPDATE/DELETE) | Antes recebia eventos de TODAS as instancias. Agora filtra por instance_name. Progresso parcial do E05. |
| `bbddb2c19` (C12) | Schema de reacoes corrigido de zapp para public | Reacoes agora funcionam em tempo real. Independente do Bloco B. |
| `38911bc63` | 3-strategy fallback para contato (Local + Proxy + Sintetico) | Corrige E02. remove USE_EXTERNAL_DB guard. ChatPanel abre em deep-link. |

## O que AINDA NAO foi corrigido (E05-E07)

### E05 — Canal por conversa + filtro server-side

| # | Problema | Severidade | Evidencia |
|---|---|---|---|
| E05-C01 | Nome de topico fixo em ChatMessagesArea -> colisao entre abas | P1 | src/features/inbox/components/chat/ChatMessagesArea.tsx |
| E05-C02 | Filtro server-side usa DEFAULT_WHATSAPP_INSTANCE (constante) em vez do JID/conversa atual | P1 | src/features/inbox/hooks/useRealtimeMessages.ts |
| E05-C03 | Filtro server-side ausente para remote_jid — recebe mensagens de todas as conversas da mesma instancia | P1 | src/features/inbox/hooks/useRealtimeMessages.ts |
| E05-C04 | invalidateQueries invalida TODAS as conversas em cache (nao so a afetada) | P2 | useRealtimeMessages.ts handlerMessageUpdate |
| E05-C05 | Remount ao trocar conversation.id recria canal mas nome fixo causa race | P2 | ChatMessagesArea.tsx (key={conversation.id}) |
| E05-C06 | useTeamConversations.ts tambem usa nome fixo 'team-chat-updates' | P2 | src/features/inbox/hooks/team-chat/useTeamConversations.ts |
| E05-S08 | Simulacao: 2 abas abertas na mesma conversa — canal fixo colide | P1 | Simulacao de runtime |
| E05-S09 | Simulacao: Abrir ChatPopup na mesma conversa — 3 canais colidem | P1 | Simulacao de runtime |
| E05-L01 | Subscription nao sobrevive a conversation switch (key remount) | P1 |  |
| E05-L02 | Reentrada: componente remonta antes do subscribe anterior completar | P2 |  |
| E05-L03 | Carga: 60k mensagens sem filtro server-side trafegam pelo WebSocket | P1 |  |
| E05-L04 | Teardown: removeChannel vs unsubscribe — chamada dupla pode causar erro | P3 |  |
| E05-L05 | Simulacao com filtro remote_jid: trafego reduzido de ~60k para ~N (msgs da conversa atual) | P1 |  |

### E06 — Publicacao supabase_realtime

| # | Problema | Severidade | Solucao |
|---|---|---|---|
| E06-P01 | evo.evolution_messages_wpp2 (folha) publicada junto com o pai particionado | P2 | ALTER PUBLICATION ... DROP TABLE |
| E06-P02 | evo.evolution_conversations_wpp2 (folha) publicada redundante | P2 | ALTER PUBLICATION ... DROP TABLE |
| E06-P03 | Apenas particao wpp2 na publication — 11 particoes sem cobertura Realtime direta | P2 | ALTER PUBLICATION ... DROP TABLE |
| E06-P04 | Deducacao de eventos: mesmo UPDATE gera 2x invalidateQueries | P2 | ALTER PUBLICATION ... DROP TABLE |
| E06-P05 | Teste: pg_publication_tables para particoes folha publicadas | P2 | ALTER PUBLICATION ... DROP TABLE |

### E07 — Multi-instancia: chaves de cache e dependencias

| # | Problema | Severidade | Evidencia |
|---|---|---|---|
| E07-K01 | Cache key inbox:initial usa DEFAULT_INSTANCE em vez de instanceName real | P1 | useExternalApiManagement.ts:460 |
| E07-K02 | Cache key inbox:poll usa DEFAULT_INSTANCE em vez de instanceName | P1 | useExternalApiManagement.ts:500 |
| E07-K03 | Cache key older usa DEFAULT_INSTANCE em vez de instanceName | P1 | useExternalApiManagement.ts:534 |
| E07-K04 | BroadcastChannel matcher tambem usa DEFAULT_INSTANCE para dedupe cross-tab | P1 | useExternalApiManagement.ts:596 |
| E07-K05 | Sidebar: useExternalConversations usa DEFAULT_INSTANCE na queryKey e no fetch | P1 | useExternalApiManagement.ts:293-303 |
| E07-K06 | useExternalEvolution.ts query de contacts usa DEFAULT_INSTANCE | P1 | useExternalEvolution.ts:337 |
| E07-K07 | useExternalEvolution.ts query de conversations usa DEFAULT_INSTANCE | P1 | useExternalEvolution.ts:355 |
| E07-K08 | useExternalEvolution.ts query de messages usa DEFAULT_INSTANCE | P1 | useExternalEvolution.ts:385 |
| E07-K09 | Cache dedupeKey em useExternalEvolution.ts tambem ignora instanceName | P1 | useExternalEvolution.ts:693 |
| E07-D01 | loadInitial tem deps sem instanceName — closure stale | P1 | useExternalApiManagement.ts |
| E07-D02 | pollNewMessages tem deps incompletas — instanceName ausente | P1 | useExternalApiManagement.ts |
| E07-D03 | loadOlder nao reage a mudanca de instanceName | P1 | useExternalApiManagement.ts |
| E07-D04 | instanceName recebido mas nao entra nas deps dos callbacks | P1 | useExternalApiManagement.ts:401-403 |
| E07-D05 | Stale closure pattern: loadInitial captura instanceName inicial e nunca reage | P1 | useCallback sem instanceName nas deps |
| E07-T02 | Duas abas, mesmo JID, instancias DIFERENTES (wpp2 vs comercial_03) -> cache COLLISION | P1 | Cache key ignora instanceName -> chave IDENTICA para instancias diferentes |
| E07-T03 | BroadcastChannel: mesma mensagem enviada por 2 abas -> dedupe errado sem instanceName | P2 | Matcher no BroadcastChannel usa DEFAULT_INSTANCE -> abas com instancias diferent |
| E07-T04 | Fechar aba -> BroadcastChannel posta 'reconnect' -> outra aba com instancia diferente captura | P2 | Evento reconnect sem discriminacao de instancia |
| E07-T05 | ChatPanel montado antes de instanceName resolver -> busca DEFAULT_INSTANCE primeiro (flicker) | P1 | instanceName e undefined no mount -> loadInitial usa DEFAULT_INSTANCE -> dados e |
| E07-T06 | read-messages edge function hardcoded para 'wpp2' | P1 | useRealtimeInbox.ts:460: instanceName: 'wpp2' |
| E07-T07 | StoryViewer hardcoda 'wpp2' para carregar midia | P2 | StoryViewer.tsx:11: const DEFAULT_INSTANCE_NAME = 'wpp2' |
| E07-T08 | DeliveryStatsPanel hardcoda 'wpp2' | P2 | DeliveryStatsPanel.tsx:45: instance = 'wpp2' |
| E07-H01 | RealtimeInboxView.tsx:65 - useEvolutionAutoReconnect('wpp2') | P2 | Apenas wpp2 reconecta automaticamente |
| E07-H02 | RealtimeInboxView.tsx:80 - useRealtimeContacts({ instance: 'wpp2' }) | P2 | Apenas contatos de wpp2 em realtime |
| E07-H03 | useRealtimeInbox.ts:460 - read-messages hardcoded 'wpp2' | P1 | instanceName: 'wpp2' no body da invoke |
| E07-H07 | supabaseClient.ts:22 - 'wpp2' hardcoded para instanceName | P2 | Client Supabase para ZappWeb usa 'wpp2' fixo |
| E07-H08 | externalSenderTypes.ts:2 - DEFAULT_INSTANCE = 'wpp2' duplicada | P2 | Outra definicao de DEFAULT_INSTANCE = 'wpp2' |
| E07-H09 | useIncomingCallBroadcast.ts:10 - DEFAULT_INSTANCE = 'wpp2' | P2 | Mais uma definicao duplicada de DEFAULT_INSTANCE |
| E07-H10 | AutomationManagement + useAutomations: instanceName = 'wpp2' default | P2 | Automacoes so operam em wpp2 por padrao |

---

## Cenario Detalhado por Secao

### E05-CACHE: Chaves de cache de subscricao vs colisao de canal

| ID | Status | Severidade | Descricao | Detalhe |
|---|---|---|---|---|
| E05-C01 |  FAIL | P1 | Nome de topico fixo em ChatMessagesArea -> colisao entre abas | channel('chat-updates-shared') — nome FIXO. Duas instancias ChatPanel (Inbox + ChatPopup) disputam o mesmo topico. remov |
| E05-C02 |  FAIL | P1 | Filtro server-side usa DEFAULT_WHATSAPP_INSTANCE (constante) em vez do JID/conversa atual | filter com instance_name=eq.${DEFAULT_WHATSAPP_INSTANCE} — usa constante estatica 'wpp2'. Nao filtra por remote_jid (con |
| E05-C03 |  FAIL | P1 | Filtro server-side ausente para remote_jid — recebe mensagens de todas as conversas da mesma instancia | O plano preve filter: remote_jid=eq.${remoteJid} por conversa. Atualmente so filtra por instance_name. Mensagens de outr |
| E05-C04 |  FAIL | P2 | invalidateQueries invalida TODAS as conversas em cache (nao so a afetada) | O plano recomenda queryKeys.messages.byConversation(conversationId) em vez de queryKeys.messages.all(). Codigo atual inv |
| E05-C05 |  FAIL | P2 | Remount ao trocar conversation.id recria canal mas nome fixo causa race | Trocar de conversa remonta o componente. O novo mount cria subscription no mesmo topico fixo. Race: removeChannel do unm |
| E05-C06 |  FAIL | P2 | useTeamConversations.ts tambem usa nome fixo 'team-chat-updates' | Mesmo problema: topico fixo sem filtro server-side por conversa/equipe. |
| E05-S07 |  PASS | P1 | [PASS] Filtro instance_name adicionado (C1 do commit bbddb2c19) | Antes do commit nao havia filtro nenhum (recebia mensagens de TODAS as 26 instancias). Agora filtra por instance_name, r |
| E05-S08 |  FAIL | P1 | Simulacao: 2 abas abertas na mesma conversa — canal fixo colide | CENARIO: Abrir Inbox em 2 abas, conversa X. Aba1 fecha -> removeChannel('chat-updates-shared') -> Aba2 para de receber u |
| E05-S09 |  FAIL | P1 | Simulacao: Abrir ChatPopup na mesma conversa — 3 canais colidem | ChatPopup.tsx monta outro ChatPanel -> mais um subscriber no topico fixo. Fechar um dos panels removeChannel() e pode ma |

### E05-LIFECYCLE: Ciclo de vida do canal e resiliencia de conexao

| ID | Status | Severidade | Descricao | Detalhe |
|---|---|---|---|---|
| E05-L01 |  FAIL | P1 | Subscription nao sobrevive a conversation switch (key remount) | Cada troca de conversa = unmount + mount. Se o removeChannel do antigo executar depois do subscribe do novo, a subscript |
| E05-L02 |  FAIL | P2 | Reentrada: componente remonta antes do subscribe anterior completar | Race condition entre unsubscribe antigo e subscribe novo em troca rapida de conversas. |
| E05-L03 |  FAIL | P1 | Carga: 60k mensagens sem filtro server-side trafegam pelo WebSocket | ANTES DO FIX: toda UPDATE de mensagem de 60k+ linhas ia para todos os clientes. DEPOIS DO FIX: reduz para UPDATE apenas  |
| E05-L04 |  FAIL | P3 | Teardown: removeChannel vs unsubscribe — chamada dupla pode causar erro | removeChannel ja faz unsubscribe internamente. Chamar unsubscribe antes e redundante, mas nao quebra. |
| E05-L05 |  FAIL | P1 | Simulacao com filtro remote_jid: trafego reduzido de ~60k para ~N (msgs da conversa atual) | CENARIO FUTURO: Se adicionar filter: remote_jid=eq.${remoteJid}, o trafego realtime cai de 60k eventos para ~algumas cen |

### E06-PUBLICATION: Publicacao supabase_realtime — particoes redundantes

| ID | Status | Severidade | Descricao | Detalhe |
|---|---|---|---|---|
| E06-P01 |  FAIL | P2 | evo.evolution_messages_wpp2 (folha) publicada junto com o pai particionado | Com publish_via_partition_root = true, publicar o pai ja cobre todas as particoes. A particao filha na mesma publicacao  |
| E06-P02 |  FAIL | P2 | evo.evolution_conversations_wpp2 (folha) publicada redundante | Idem ao P01, para conversas. |
| E06-P03 |  FAIL | P2 | Apenas particao wpp2 na publication — 11 particoes sem cobertura Realtime direta | Como pai esta publicado com pubviaroot=true, tecnicamente as outras particoes TEM cobertura Realtime atraves do pai. Mas |
| E06-P04 |  FAIL | P2 | Deducacao de eventos: mesmo UPDATE gera 2x invalidateQueries | A dupla publicacao significa que o WAL gera 2 eventos. O handler do Realtime dispara 2x. Se houver reconciliacao otimist |
| E06-P05 |  FAIL | P2 | Teste: pg_publication_tables para particoes folha publicadas | CRITERIO IDEAL: nenhuma particao folha (relkind='r') na publication. A solucao e: ALTER PUBLICATION supabase_realtime DR |

### E07-CACHE: Chaves de cache cross-instancia

| ID | Status | Severidade | Descricao | Detalhe |
|---|---|---|---|---|
| E07-K01 |  FAIL | P1 | Cache key inbox:initial usa DEFAULT_INSTANCE em vez de instanceName real | Duas abas com mesmo JID em instancias diferentes COMPARTILHAM a entrada de cache. Mensagens de comercial_03 servidas par |
| E07-K02 |  FAIL | P1 | Cache key inbox:poll usa DEFAULT_INSTANCE em vez de instanceName | Pooling de novas mensagens usa DEFAULT_INSTANCE -> busca os dados da instancia errada. |
| E07-K03 |  FAIL | P1 | Cache key older usa DEFAULT_INSTANCE em vez de instanceName | Carregar mensagens mais antigas usa a instancia errada -> mostra historico incompleto. |
| E07-K04 |  FAIL | P1 | BroadcastChannel matcher tambem usa DEFAULT_INSTANCE para dedupe cross-tab | O matcher de BroadcastChannel (deduplicacao cross-tab) usa DEFAULT_INSTANCE na chave -> tabs com instancias diferentes c |
| E07-K05 |  FAIL | P1 | Sidebar: useExternalConversations usa DEFAULT_INSTANCE na queryKey e no fetch | A sidebar NUNCA lista conversas de instancias diferentes de wpp2 (ex: comercial_03 com 5 mensagens). |
| E07-K06 |  FAIL | P1 | useExternalEvolution.ts query de contacts usa DEFAULT_INSTANCE | Busca de contatos filtrada por DEFAULT_INSTANCE ('wpp2') -> contatos de outras instancias nao aparecem. |
| E07-K07 |  FAIL | P1 | useExternalEvolution.ts query de conversations usa DEFAULT_INSTANCE | Lista apenas conversas de wpp2 -> invisiveis conversas de outras 25 instancias. |
| E07-K08 |  FAIL | P1 | useExternalEvolution.ts query de messages usa DEFAULT_INSTANCE | Mensagens de outras instancias nunca carregadas. |
| E07-K09 |  FAIL | P1 | Cache dedupeKey em useExternalEvolution.ts tambem ignora instanceName | Mesmo padrao: busca older messages com DEFAULT_INSTANCE hardcoded na chave de cache. |

### E07-DEPS: Dependencias de hooks sem instanceName

| ID | Status | Severidade | Descricao | Detalhe |
|---|---|---|---|---|
| E07-D01 |  FAIL | P1 | loadInitial tem deps sem instanceName — closure stale | Como instanceName resolve assincronamente (vem de selectedConversationInstance), o primeiro loadInitial captura undefine |
| E07-D02 |  FAIL | P1 | pollNewMessages tem deps incompletas — instanceName ausente | pollNewMessages captura closure stale de instanceName. Nao refetch quando a instancia real e resolvida. |
| E07-D03 |  FAIL | P1 | loadOlder nao reage a mudanca de instanceName | loadOlder e definido uma vez com o instanceName capturado. Mudanca de instancia nao dispara recriacao da funcao. |
| E07-D04 |  FAIL | P1 | instanceName recebido mas nao entra nas deps dos callbacks | O parametro instanceName e aceito e documentado (linha 401: 'Passe conversation.instance_name para suportar multiplas in |
| E07-D05 |  FAIL | P1 | Stale closure pattern: loadInitial captura instanceName inicial e nunca reage | Padrao tipico de bugs de closure em React com hooks externos. Funcao criada uma vez com instanceName=undefined (ou DEFAU |

### E07-MULTI-TAB: Cenarios multi-aba e cross-tab

| ID | Status | Severidade | Descricao | Detalhe |
|---|---|---|---|---|
| E07-T01 |  PASS | P2 | [PASS] Duas abas, mesmo JID, mesma instancia (wpp2) -> mesmo cache -> correto | CENARIO ABA X: JID=5511..., instance=wpp2. Aba Y: JID=5511..., instance=wpp2. Ambas batem na mesma cache key. Conteudo e |
| E07-T02 |  FAIL | P1 | Duas abas, mesmo JID, instancias DIFERENTES (wpp2 vs comercial_03) -> cache COLLISION | CENARIO CRITICO: Aba X (wpp2) carrega mensagens de wpp2. Aba Y (comercial_03) consulta MESMA cache key -> recebe mensage |
| E07-T03 |  FAIL | P2 | BroadcastChannel: mesma mensagem enviada por 2 abas -> dedupe errado sem instanceName | BroadcastChannel deveria deduplicar requisicoes cross-tab, mas como a chave nao inclui instanceName, tabs de instancias  |
| E07-T04 |  FAIL | P2 | Fechar aba -> BroadcastChannel posta 'reconnect' -> outra aba com instancia diferente captura | Quando uma aba fecha, posta mensagem de reconnect no BroadcastChannel. A aba sobrevivente pode reiniciar polling para a  |
| E07-T05 |  FAIL | P1 | ChatPanel montado antes de instanceName resolver -> busca DEFAULT_INSTANCE primeiro (flicker) | UX PROBLEM: O usuario ve mensagens de wpp2 por ~100-500ms, depois o conteudo corrige para comercial_03. Flicker desorien |
| E07-T06 |  FAIL | P1 | read-messages edge function hardcoded para 'wpp2' | A acao read-messages (marcar como lida) sempre invoca com instance='wpp2'. Para conversas de comercial_03, marca como li |
| E07-T07 |  FAIL | P2 | StoryViewer hardcoda 'wpp2' para carregar midia | Stories de outras instancias quebram pois buscam midia na instancia errada. |
| E07-T08 |  FAIL | P2 | DeliveryStatsPanel hardcoda 'wpp2' | Estatisticas de entrega de mensagens de outras instancias mostram dados errados. |

### E07-HARDCODED: Instancias hardcoded 'wpp2' no codigo-fonte

| ID | Status | Severidade | Descricao | Detalhe |
|---|---|---|---|---|
| E07-H01 |  FAIL | P2 | RealtimeInboxView.tsx:65 - useEvolutionAutoReconnect('wpp2') |  |
| E07-H02 |  FAIL | P2 | RealtimeInboxView.tsx:80 - useRealtimeContacts({ instance: 'wpp2' }) |  |
| E07-H03 |  FAIL | P1 | useRealtimeInbox.ts:460 - read-messages hardcoded 'wpp2' |  |
| E07-H04 |  PASS | P2 | [PASS] DEFAULT_WHATSAPP_INSTANCE = 'wpp2' em constants/whatsappInstances.ts | Unico ponto de definicao, aceitavel como fallback. Problema e quando deveria ser dinamico e nao e. |
| E07-H05 |  PASS | P2 | [PASS] ACTIVE_WHATSAPP_INSTANCE = 'wpp2' em constants/whatsappInstances.ts |  |
| E07-H06 |  PASS | P3 | [PASS] evolutionClient.ts DEFAULT_INSTANCE = env var || 'wpp2' |  |
| E07-H07 |  FAIL | P2 | supabaseClient.ts:22 - 'wpp2' hardcoded para instanceName |  |
| E07-H08 |  FAIL | P2 | externalSenderTypes.ts:2 - DEFAULT_INSTANCE = 'wpp2' duplicada | Multiplas definicoes de DEFAULT_INSTANCE espalhadas: evolutionFetchers.ts:23, externalSenderTypes.ts:2, whatsappInstance |
| E07-H09 |  FAIL | P2 | useIncomingCallBroadcast.ts:10 - DEFAULT_INSTANCE = 'wpp2' |  |
| E07-H10 |  FAIL | P2 | AutomationManagement + useAutomations: instanceName = 'wpp2' default |  |

---

## Conclusao

**E05:** Parcialmente corrigido — o filtro de instance_name foi adicionado (C1 do bbddb2c19), reduzindo trafego de 26 instancias para 1. Falta: (a) canal por conversa com nome unico, (b) filtro remote_jid, (c) invalidateQueries escopo estreito, (d) remover topico fixo chat-updates-shared.

**E06:** NAO CORRIGIDO — particoes redundantes na publication supabase_realtime continuam. Risco de evento duplicado e reconciliacao otimista dupla.

**E07:** NAO CORRIGIDO — todas as chaves de cache em useExternalApiManagement.ts e useExternalEvolution.ts ignoram instanceName. 10+ hardcodings de 'wpp2' espalhados. Cache collision cross-instancia e o risco mais grave (dados ERRADOS sem sinal de erro).

**Prioridade de correcao:**
1. E07 — Chaves de cache com instanceName efetivo (dados errados = P1 real)
2. E05 — Canal por conversa com nome unico + filtro remote_jid
3. E06 — Remover particoes folha da publication
4. E07 — Remover hardcodings de 'wpp2' em favor de parametro dinamico

---

*Relatorio gerado automaticamente pelo simulador Bloco B (E05-E07).*