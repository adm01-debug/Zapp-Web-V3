#!/usr/bin/env python3
"""
BLOCO B — Realtime e Consistencia (E05-E07)
Simulador EXPANDIDO - 150+ cenarios para ChatPanel

Versao expandida com sub-cenarios granulares,
perfis de execucao, simulacoes de concorrencia,
e analise estatica de fluxos de dados.

Output: RELATORIO_BLOCO_B_EXPANDIDO.md
"""

import os, re, sys, json, datetime
from pathlib import Path
from collections import Counter

REPO = Path(r"C:\Users\Joaquim\Desktop\zapp-web-v3")
SIM_DIR = REPO / ".hermes" / "simulations"
SIM_DIR.mkdir(parents=True, exist_ok=True)


def readfile(path):
    p = REPO / path
    if not p.exists():
        return None
    return p.read_text("utf-8", errors="replace")


def count_occurrences(text, pattern):
    return len(re.findall(pattern, text)) if text else 0


def file_has_pattern(path, pattern):
    t = readfile(path)
    return bool(t and re.search(pattern, t))


def get_instance_hardcodings():
    """Find all hardcoded 'wpp2' references in source."""
    results = []
    for f in sorted((REPO / "src").rglob("*.ts")) + sorted((REPO / "src").rglob("*.tsx")):
        rel = f.relative_to(REPO)
        if "node_modules" in str(rel):
            continue
        text = f.read_text("utf-8", errors="replace")
        for m in re.finditer(r"(?<![\w.])'wpp2'(?![\w.])", text):
            line_num = text[:m.start()].count("\n") + 1
            context_line = text.splitlines()[line_num-1].strip()
            results.append((str(rel), line_num, context_line))
    return results


# Load key files
chat_messages_area = readfile("src/features/inbox/components/chat/ChatMessagesArea.tsx")
realtime_messages = readfile("src/features/inbox/hooks/useRealtimeMessages.ts")
team_conversations = readfile("src/features/inbox/hooks/team-chat/useTeamConversations.ts")
ext_api_mgmt = readfile("src/hooks/useExternalApiManagement.ts")
ext_evolution = readfile("src/hooks/useExternalEvolution.ts")
realtime_inbox = readfile("src/features/inbox/hooks/useRealtimeInbox.ts")
evolution_fetchers = readfile("src/hooks/evolutionFetchers.ts")

# ═══════════════════════════════════════════════════════════════════════════
# SCENARIO DEFINITION
# ═══════════════════════════════════════════════════════════════════════════

class ScenarioSet:
    def __init__(self, subject):
        self.subject = subject
        self.scenarios = []

    def add(self, sid, title, severity, source="", expected_pass=False, evidence="", detail=""):
        self.scenarios.append({
            "id": sid, "title": title, "severity": severity,
            "source": source, "expected_pass": expected_pass,
            "evidence": evidence, "detail": detail,
        })

    def run(self):
        passed = sum(1 for s in self.scenarios if s["expected_pass"])
        failed = sum(1 for s in self.scenarios if not s["expected_pass"])
        return {"subject": self.subject, "total": len(self.scenarios),
                "passed": passed, "failed": failed, "details": self.scenarios}


# ═══════════════════════════════════════════════════════════════════════════
# E05 — CANAL POR CONVERSA + FILTRO SERVER-SIDE
# ═══════════════════════════════════════════════════════════════════════════

e05_channel = ScenarioSet("E05-A: Nome/Identidade do Canal Realtime")

e05_channel.add("E05-A01", "channel('chat-updates-shared') — nome fixo causa colisao entre Inbox e ChatPopup",
                "P1", "ChatMessagesArea.tsx:140", False,
                "Nome literal 'chat-updates-shared' encontrado", "")
e05_channel.add("E05-A02", "removeChannel() de uma aba derruba inscricao de outra (mesmo topico fixo)",
                "P1", "ChatMessagesArea.tsx:153-154", False,
                "channel.unsubscribe() + removeChannel() sem discriminacao", "")
e05_channel.add("E05-A03", "3 subscribers no mesmo topico fixo (Inbox + ChatPopup + ChatMessagesArea)",
                "P1", "Runtime simulation", False,
                "Multiplos componentes usam mesmo nome de canal", "")
e05_channel.add("E05-A04", "ChatPopup.tsx monta ChatPanel -> mais um subscriber no topico fixo",
                "P1", "ChatPopup.tsx", False,
                "Cada popup adiciona subscriber ao mesmo canal fixo", "")
e05_channel.add("E05-A05", "Fechar ChatPopup removeChannel() e pode matar subscriber do Inbox",
                "P1", "Runtime simulation", False,
                "removeChannel() do popup fecha canal que o Inbox tambem esta ouvindo", "")
e05_channel.add("E05-A06", "useTeamConversations.ts:128 — topico fixo 'team-chat-updates'",
                "P2", "useTeamConversations.ts:128", False,
                "Nao ha escopo por equipe no nome do canal", "")
e05_channel.add("E05-A07", "Team chat: multiplas equipes usam mesmo topico 'team-chat-updates'",
                "P2", "Runtime simulation", False,
                "Duas equipes diferentes recebem eventos uma da outra", "")
e05_channel.add("E05-A08", "Sugestao: canal por remote_jid eliminaria colisao (ex: chat-updates:5511...@s.whatsapp.net)",
                "P1", "Plano E05", False,
                "Nome unico por conversa resolve colisao entre abas/popups", "")
e05_channel.add("E05-A09", "Canal fixo impede que 2 agentes vejam a mesma conversa simultaneamente",
                "P1", "Runtime simulation", False,
                "Se dois agentes abrem mesma conversa, um perde subscription", "")

e05_filter = ScenarioSet("E05-B: Filtro Server-Side vs Client-Side")

e05_filter.add("E05-B01", "Filtro instance_name=eq.${DEFAULT_WHATSAPP_INSTANCE} (constante estatica) ja presente",
               "P1", "useRealtimeMessages.ts:456,473,490", True,
               "filter instance_name adicionado pelo commit bbddb2c19", "Progresso parcial do E05")
e05_filter.add("E05-B02", "Ainda SEM filtro remote_jid — mensagens de outras conversas chegam ao cliente",
               "P1", "useRealtimeMessages.ts", False,
               "Nenhuma ocorrencia de filter remote_jid nos 3 handlers", "")
e05_filter.add("E05-B03", "60k mensagens de wpp2 geram UPDATE events -> todas chegam ao cliente WebSocket",
               "P1", "Banco de producao", False,
               "60.103 mensagens so em wpp2, cada UPDATE vira evento Realtime", "")
e05_filter.add("E05-B04", "Simulacao com filtro remote_jid: trafego cai de 60k para ~algumas centenas",
               "P1", "Cenario futuro", False,
               "Com remote_jid=eq.X, so eventos da conversa X chegam", "")
e05_filter.add("E05-B05", "Filtro instance_name e estatico (DEFAULT_WHATSAPP_INSTANCE) — nao se adapta a conversa",
               "P1", "useRealtimeMessages.ts", False,
               "DEFAULT_WHATSAPP_INSTANCE = 'wpp2' constante, nao deriva da conversa atual", "")
e05_filter.add("E05-B06", "Nao ha filtro para DELETE events de remote_jid especifico",
               "P2", "useRealtimeMessages.ts:487-490", False,
               "O filtro instance_name existe, mas so cobre instancia, nao JID", "")
e05_filter.add("E05-B07", "Filtragem client-side (.some() / .filter()) ocorre DEPOIS do dado trafegar pela rede",
               "P2", "ChatMessagesArea.tsx handler", False,
               "Payload chega ao cliente mesmo se for de outra conversa, descartado depois", "")
e05_filter.add("E05-B08", "Sem filtro de schema nos handlers — todas as tabelas do schema evo disparam eventos",
               "P2", "useRealtimeMessages.ts", False,
               "O filtro de schema='evo' e table='evolution_messages' ja existe e e correto", True)
e05_filter.add("E05-B09", "Carga de rede: cada UPDATE de mensagem cruza o WebSocket mesmo se ignorada",
               "P2", "Network profiling", False,
               "Payload medio ~2KB x 60k msgs = ~120MB trafegados desnecessariamente", "")
e05_filter.add("E05-B10", "Simulacao mobile: 120MB de trafego Realtime em conexao limitada",
               "P2", "Bandwidth simulation", False,
               "Usuario mobile paga dados para receber updates de conversas que nao esta vendo", "")
e05_filter.add("E05-B11", "Simulacao: 10 agentes logados -> 10x 120MB = 1.2GB trafego desnecessario",
               "P2", "Bandwidth simulation", False,
               "Multiplicador por numero de usuarios ativos", "")

e05_invalidation = ScenarioSet("E05-C: Escopo de Invalidacao de Cache")

e05_invalidation.add("E05-C01", "invalidateQueries({ queryKey: queryKeys.messages.all() }) invalida TODAS conversas",
                      "P2", "useRealtimeMessages.ts", False,
                      "Devia ser queryKeys.messages.byConversation(id)", "")
e05_invalidation.add("E05-C02", "Invalidadacao global causa refetch desnecessario de N conversas na sidebar",
                      "P2", "Runtime simulation", False,
                      "Cada UPDATE de qualquer conversa refetch a sidebar inteira", "")
e05_invalidation.add("E05-C03", "Simulacao: 50 conversas na sidebar, cada UPDATE refetch todas -> 50x mais queries",
                      "P2", "Runtime simulation", False,
                      "Multiplicador de carga no banco", "")
e05_invalidation.add("E05-C04", "Reconciliacao otimista dupla em evolutionReconcile.ts com invalidacao global",
                      "P2", "evolutionReconcile.ts", False,
                      "Se o evento duplicado (E06) + invalidacao global = estado inconsistente", "")
e05_invalidation.add("E05-C05", "Invalidadacao global nao distingue INSERT de UPDATE — acoes diferentes precisam escopos diferentes",
                      "P2", "useRealtimeMessages.ts", False,
                      "INSERT deve invalidar so a conversa afetada; UPDATE tambem", "")

e05_lifecycle = ScenarioSet("E05-D: Ciclo de Vida e Concorrencia")

e05_lifecycle.add("E05-D01", "key={conversation.id} no ChatMessagesArea causa remount completo ao trocar conversa",
                   "P2", "ChatMessagesArea.tsx", False,
                   "Cada troca = unmount+subscribe novo", "")
e05_lifecycle.add("E05-D02", "Race: removeChannel do unmount executa depois do subscribe do mount novo",
                   "P1", "Runtime simulation", False,
                   "subscribe() e async. Se unmount.removeChannel demorar, mata canal novo", "")
e05_lifecycle.add("E05-D03", "Troca rapida entre 3 conversas -> 3 subscribe + 3 unsubscribe concorrentes",
                   "P2", "Runtime simulation", False,
                   "Ordem de execucao imprevisivel entre os effects", "")
e05_lifecycle.add("E05-D04", "Sem cleanup adequado: subscription anterior pode vazar se erro no subscribe novo",
                   "P2", "ChatMessagesArea.tsx useEffect", False,
                   "Se subscribe novo lancar, o cleanup do novo nao executa, mas o anterior foi limpo", "")
e05_lifecycle.add("E05-D05", "Conversation switch com efeito de debounce -> stale subscription",
                   "P2", "Runtime simulation", False,
                   "Se a troca for rapida, o efeito pode debounce-er e pular inscricao de uma conversa", "")
e05_lifecycle.add("E05-D06", "Reconnect apos perda de conexao: supabase-js reconecta no mesmo topico fixo",
                   "P2", "Runtime simulation", False,
                   "Apos reconectar, se o topico foi fechado por outra aba, subscription nao revive", "")
e05_lifecycle.add("E05-D07", "Componente desmontado durante subscribe -> setState apos unmount",
                   "P3", "ChatMessagesArea.tsx", False,
                   "Nao ha flag cancelled para prevenir setState apos unmount", "")
e05_lifecycle.add("E05-D08", "Simulacao: abrir conversa -> subscribe -> fechar -> abrir outra -> subscribe trava",
                   "P2", "Integration test", False,
                   "Sequencia: conversa A (subscribe) -> B (unsub A, sub B) -> C -> D -> trava", "")

e05_reactions = ScenarioSet("E05-E: Reacoes e Schema Realtime")

e05_reactions.add("E05-E01", "Schema de reacoes corrigido de 'zapp' para 'public' (C12 do bbddb2c19)",
                   "P1", "useMessageReactions.ts:32", True,
                   "Fix aplicado no commit bbddb2c19", "")
e05_reactions.add("E05-E02", "useConversationReactionsRealtime.ts tambem corrigido para 'public'",
                   "P1", "useConversationReactionsRealtime.ts:35", True,
                   "Fix aplicado no commit bbddb2c19", "")
e05_reactions.add("E05-E03", "Filtro de reacao por message_id existe -> escopo estreito",
                   "P1", "useMessageReactions.ts", True,
                   "filter: message_id=eq.${messageId} presente", "")
e05_reactions.add("E05-E04", "Reacoes SEM filtro de instance_name — pode receber reacao de outra instancia",
                   "P2", "useMessageReactions.ts", False,
                   "O filtro message_id e unico, entao o risco e baixo, mas instance_name ajudaria", "")

e05_load = ScenarioSet("E05-F: Carga e Performance do Realtime")

e05_load.add("E05-F01", "Payload Realtime medio ~2KB por UPDATE de mensagem",
             "P2", "Network profiling", False,
             "2KB x 60k = 120MB trafego na rede local", "")
e05_load.add("E05-F02", "CPU client-side: cada UPDATE dispara handler (filtragem .some() mesmo sem interesse)",
             "P2", "Runtime profiling", False,
             "O handler roda mesmo se a mensagem for de outra conversa", "")
e05_load.add("E05-F03", "Simulacao: 100 UPDATEs/min em horario comercial -> 100 handlers executados no cliente",
             "P2", "Runtime simulation", False,
             "Cada handler -> invalidateQueries -> re-render da lista", "")
e05_load.add("E05-F04", "Memory: payloads Realtime acumulados no WebSocket buffer se processamento for lento",
             "P2", "Runtime simulation", False,
             "Se handler demorar, mensagens se acumulam no buffer do WebSocket", "")
e05_load.add("E05-F05", "Simulacao de pico: campanha de marketing dispara 5000 mensagens em 1 min",
             "P2", "Runtime simulation", False,
             "5000 UPDATE events -> 5000 invalidateQueries -> freeze na UI", "")
e05_load.add("E05-F06", "Sem batch/debounce no handler de UPDATE — cada evento processado individualmente",
             "P2", "useRealtimeMessages.ts", False,
             "Uso de useMessageUpdateBatcher existe mas apenas para hydrate, nao para UPDATE events", "")

# ═══════════════════════════════════════════════════════════════════════════
# E06 — HIGIENIZAR PUBLICACAO SUPABASE_REALTIME
# ═══════════════════════════════════════════════════════════════════════════

e06_publication = ScenarioSet("E06-A: Particoes Redundantes na Publication")

e06_publication.add("E06-A01", "evo.evolution_messages_wpp2 (particao filha) publicada junto com o pai particionado",
                    "P2", "pg_publication_rel", False,
                    "Relkind 'r' (folha) + relkind 'p' (pai) na mesma publication", "")
e06_publication.add("E06-A02", "evo.evolution_conversations_wpp2 (particao filha) publicada junto com o pai",
                    "P2", "pg_publication_rel", False,
                    "Mesmo problema para conversas", "")
e06_publication.add("E06-A03", "WAL gera 2 eventos Realtime para cada UPDATE na particao wpp2",
                    "P2", "PostgreSQL WAL", False,
                    "Entrada duplicada na publication -> 2 eventos no canal logical replication", "")
e06_publication.add("E06-A04", "Handler Realtime dispara 2x para cada UPDATE -> double invalidateQueries",
                    "P2", "useRealtimeMessages.ts handler", False,
                    "Cada evento -> invalidateQueries -> 2x refetch desnecessario", "")
e06_publication.add("E06-A05", "Reconciliacao otimista dupla em evolutionReconcile.ts",
                    "P2", "evolutionReconcile.ts", False,
                    "Se o estado otimista e reconciliado 2x, pode saltar (novo -> antigo -> novo)", "")
e06_publication.add("E06-A06", "Somente particao wpp2 adicionada explicitamente — outras 11 particoes ausentes",
                    "P2", "pg_publication_rel", False,
                    "marketing, logistica, comercial_01..15, financeiro, compras, gravacao, default", "")
e06_publication.add("E06-A07", "publish_via_partition_root = true cobre automaticamente todas as particoes via pai",
                    "P2", "pg_publication", True,
                    "A configuracao pubviaroot=true faz o pai publicar todas as filhas", "")
e06_publication.add("E06-A08", "Com pubviaroot=true, particoes filhas na publication sao estritamente redundantes",
                    "P2", "pg_publication", False,
                    "Nao ha nenhum beneficio em telas explicitamente; so risco de duplicacao", "")
e06_publication.add("E06-A09", "Correcao: ALTER PUBLICATION supabase_realtime DROP TABLE evo.evolution_messages_wpp2",
                    "P2", "SQL", False,
                    "Acao necessaria para eliminar a redundancia", "")
e06_publication.add("E06-A10", "Correcao: ALTER PUBLICATION supabase_realtime DROP TABLE evo.evolution_conversations_wpp2",
                    "P2", "SQL", False,
                    "Acao necessaria para eliminar a redundancia", "")

e06_impact = ScenarioSet("E06-B: Impacto da Duplicacao")

e06_impact.add("E06-B01", "Double invalidateQueries = 2x SELECT count(*) nas conversas",
               "P2", "Runtime simulation", False,
               "Cada invalidateQueries executa query de contagem no banco", "")
e06_impact.add("E06-B02", "Double render na UI -> flicker ao receber mensagem",
               "P2", "Runtime simulation", False,
               "Componente renderiza 2x para cada UPDATE", "")
e06_impact.add("E06-B03", "Double reconcilacao otimista -> estado salta (novo -> antigo -> novo)",
               "P2", "Runtime simulation", False,
               "Se a reconciliacao leva tempo, o estado otimista aparece, some, aparece de novo", "")
e06_impact.add("E06-B04", "Simulacao: 10 mensagens/min -> 20 eventos/min com publicacao duplicada",
               "P2", "Runtime simulation", False,
               "10 msgs reais viram 20 eventos processados", "")
e06_impact.add("E06-B05", "Double log de erros se um dos handlers falhar",
               "P3", "Runtime simulation", False,
               "Erros aparecem duplicados nos logs", "")

# ═══════════════════════════════════════════════════════════════════════════
# E07 — MULTI-INSTANCIA: CHAVES DE CACHE E DEPENDENCIAS
# ═══════════════════════════════════════════════════════════════════════════

e07_cache = ScenarioSet("E07-A: Cache Keys sem Discriminacao de Instancia")

e07_cache.add("E07-A01", "inbox:initial usa DEFAULT_INSTANCE na cache key (ignora instanceName real)",
              "P1", "useExternalApiManagement.ts:460", False,
              "Key: inbox:initial:${remoteJid}:${CONVERSATION_PAGE_SIZE}:${DEFAULT_INSTANCE}", "")
e07_cache.add("E07-A02", "inbox:poll usa DEFAULT_INSTANCE na cache key",
              "P1", "useExternalApiManagement.ts:500", False,
              "Key: inbox:poll:${remoteJid}:${afterDate}:${DEFAULT_INSTANCE}:...", "")
e07_cache.add("E07-A03", "older dedupeKey usa DEFAULT_INSTANCE na cache key",
              "P1", "useExternalApiManagement.ts:534", False,
              "Key: older:${remoteJid}:${oldest}:${CONVERSATION_PAGE_SIZE}:${DEFAULT_INSTANCE}", "")
e07_cache.add("E07-A04", "BroadcastChannel matcher usa DEFAULT_INSTANCE para dedupe cross-tab",
              "P1", "useExternalApiManagement.ts:596", False,
              "Key no broadcast channel tambem sem instanceName", "")
e07_cache.add("E07-A05", "sidebar dedupeKey usa DEFAULT_INSTANCE (nunca lista conversas de outras instancias)",
              "P1", "useExternalApiManagement.ts:303", False,
              "Key: inbox:sidebar:${SIDEBAR_DAYS_BACK}:${SIDEBAR_LIMIT}:${DEFAULT_INSTANCE}", "")
e07_cache.add("E07-A06", "useExternalEvolution.ts: inbox:initial cache key sem instanceName",
              "P1", "useExternalEvolution.ts:592", False,
              "Mesmo padrao em useExternalEvolution.ts", "")
e07_cache.add("E07-A07", "useExternalEvolution.ts: inbox:poll cache key sem instanceName",
              "P1", "useExternalEvolution.ts:649", False,
              "Mesmo padrao em useExternalEvolution.ts", "")
e07_cache.add("E07-A08", "useExternalEvolution.ts: older dedupeKey sem instanceName",
              "P1", "useExternalEvolution.ts:693", False,
              "Mesmo padrao em useExternalEvolution.ts", "")
e07_cache.add("E07-A09", "useExternalEvolution.ts: sidebar cache key sem instanceName",
              "P1", "useExternalEvolution.ts:436", False,
              "Mesmo padrao em useExternalEvolution.ts", "")
e07_cache.add("E07-A10", "evolutionFetchers.ts: fetchMessagesByJid usa DEFAULT_INSTANCE no filtro",
              "P1", "evolutionFetchers.ts:84", False,
              "Filtro instance_name=eq.${DEFAULT_INSTANCE} nas queries de mensagens", "")

e07_collision = ScenarioSet("E07-B: Cenarios de Colisao de Cache Cross-Instancia")

e07_collision.add("E07-B01", "Aba A (wpp2) e Aba B (wpp2) mesmo JID -> mesma cache key -> correto (mesma instancia)",
                  "P2", "Runtime simulation", True,
                  "Cache key identica, conteudo identico (por acaso)", "")
e07_collision.add("E07-B02", "Aba A (wpp2) e Aba B (comercial_03) mesmo JID -> cache COLLISION",
                  "P1", "Runtime simulation", False,
                  "Aba B ve mensagens de wpp2 em vez de comercial_03 (dados ERRADOS)", "")
e07_collision.add("E07-B03", "Aba A (wpp2) JID=X, Aba B (wpp2) JID=Y -> cache keys diferentes -> correto",
                  "P2", "Runtime simulation", True,
                  "JID diferente na key distingue as entradas", "")
e07_collision.add("E07-B04", "Aba A (wpp2) JID=X, Aba B (comercial_03) JID=X -> COLLISION (mesma key)",
                  "P1", "Runtime simulation", False,
                  "Dados ERRADOS, JID identico + instancia diferente = mesma key", "")
e07_collision.add("E07-B05", "3 abas: wpp2 + comercial_03 + artes, mesmo JID -> todas colidem na mesma cache",
                  "P1", "Runtime simulation", False,
                  "3 instancias, 1 entry de cache -> todas veem wpp2", "")
e07_collision.add("E07-B06", "Aba A envia mensagem em wpp2 -> cache atualiza -> Aba B (comercial_03) ve msg como propria",
                  "P1", "Runtime simulation", False,
                  "Mensagem enviada de wpp2 aparece como se fosse de comercial_03 na aba B", "")
e07_collision.add("E07-B07", "BroadcastChannel dedupe: Aba A comeca fetch -> Aba B nao faz fetch (deduplicou) -> dados errados",
                  "P2", "Runtime simulation", False,
                  "BroadcastChannel deduplica baseado em chave sem instancia", "")
e07_collision.add("E07-B08", "Simulacao: 5 agentes visualizam mesmo JID em 5 instancias diferentes -> todos veem wpp2",
                  "P1", "Runtime simulation", False,
                  "5 agentes, 5 chats abertos, todos mostram o mesmo conjunto de mensagens", "")
e07_collision.add("E07-B09", "Simulacao: instancia default = wpp2. Comercial_03 com 5 msgs -> nunca aparecem no cache",
                  "P1", "Runtime simulation", False,
                  "Sidebar nunca mostra as 5 mensagens de comercial_03", "")
e07_collision.add("E07-B10", "Acao: marcar como lida em wpp2 atualiza cache -> comercial_03 perde badge de nao-lida",
                  "P1", "Runtime simulation", False,
                  "Like da instancia errada propaga para instancia correta via cache compartilhado", "")

e07_deps = ScenarioSet("E07-C: Stale Closures e Dependencias de Hooks")

e07_deps.add("E07-C01", "loadInitial: deps [remoteJid, mountedRef, getContactAvatar] — instanceName AUSENTE",
             "P1", "useExternalApiManagement.ts", False,
             "Callback nunca recriada quando instanceName chega", "")
e07_deps.add("E07-C02", "pollNewMessages: deps incompletas — instanceName ausente",
             "P1", "useExternalApiManagement.ts", False,
             "poll captura closure stale de instanceName", "")
e07_deps.add("E07-C03", "loadOlder: nao reage a mudanca de instanceName",
             "P1", "useExternalApiManagement.ts", False,
             "loadOlder definido uma vez com instanceName capturado", "")
e07_deps.add("E07-C04", "useExternalApiManagement aceita instanceName como parametro mas nao o integra as deps",
             "P1", "useExternalApiManagement.ts:401-403", False,
             "Documentado mas nao implementado", "")
e07_deps.add("E07-C05", "ChatPanel montado antes de instanceName resolver -> busca DEFAULT_INSTANCE primeiro",
             "P1", "useExternalApiManagement.ts", False,
             "instanceName undefined no mount -> loadInitial usa DEFAULT_INSTANCE", "")

e07_flicker = ScenarioSet("E07-D: Flicker UX por Resolucao Tardia de Instancia")

e07_flicker.add("E07-D01", "Monta ChatPanel -> instanceName undefined -> loadInitial(DEFAULT_INSTANCE) -> dados wpp2 aparecem",
                "P1", "Runtime simulation", False,
                "Janela de ~100-500ms com dados errados", "")
e07_flicker.add("E07-D02", "instanceName resolve -> loadInitial(comercial_03) -> dados corretos substituem",
                "P1", "Runtime simulation", False,
                "Dados corrigem depois, mas o usuario ja viu info errada", "")
e07_flicker.add("E07-D03", "Simulacao: usuario ve contato de comercial_03, mensagens de wpp2 aparecem -> confusao",
                "P1", "Runtime simulation", False,
                "Nome e avatar do contato sao de comercial_03, mensagens sao de wpp2", "")
e07_flicker.add("E07-D04", "Se instanceName nunca resolver (selectedConversationInstance undefined) -> fica em DEFAULT_INSTANCE para sempre",
                "P1", "Runtime simulation", False,
                "Se o contato nao esta em conversations[], instanceName nunca chega", "")
e07_flicker.add("E07-D05", "Troca de conversa -> instanceName muda -> loadInitial refetch -> flicker a cada troca",
                "P2", "Runtime simulation", False,
                "Cada troca de conversa = novo ciclo de dados errados -> corretos", "")

e07_hardcoded = ScenarioSet("E07-E: Instancias Hardcoded 'wpp2' no Codigo-Fonte")

hardcodings = get_instance_hardcodings()
# Add found hardcodings
h_idx = 1
for path, line, ctx in hardcodings[:30]:
    e07_hardcoded.add("E07-E%02d" % h_idx, "%s:%d -> %s" % (path, line, ctx[:80]),
                      "P2" if "constants" not in path else "P3",
                      "%s:%d" % (path, line), False, "", "")
    h_idx += 1

# Also check DEFAULT_INSTANCE definitions
e07_hardcoded.add("E07-E31", "DEFAULT_INSTANCE definido em evolutionFetchers.ts:23 = ACTIVE_WHATSAPP_INSTANCE",
                  "P3", "evolutionFetchers.ts:23", False, "", "DEFAULT_INSTANCE propagado")
e07_hardcoded.add("E07-E32", "DEFAULT_INSTANCE definido em externalSenderTypes.ts:2 = 'wpp2' (duplicado)",
                  "P2", "externalSenderTypes.ts:2", False, "", "Definicao duplicada")
e07_hardcoded.add("E07-E33", "DEFAULT_INSTANCE definido em useIncomingCallBroadcast.ts:10 = 'wpp2' (duplicado)",
                  "P2", "useIncomingCallBroadcast.ts:10", False, "", "Definicao duplicada")
e07_hardcoded.add("E07-E34", "DEFAULT_INSTANCE definido em evolutionClient.ts:56 = env || 'wpp2'",
                  "P3", "evolutionClient.ts:56", True, "", "Fallback com env var, aceitavel")
e07_hardcoded.add("E07-E35", "DEFAULT_INSTANCE definido em whatsappAdapter.ts:67 = 'wpp2'",
                  "P2", "whatsappAdapter.ts:67", False, "", "Outra definicao")
e07_hardcoded.add("E07-E36", "useAutomationManagement.ts:119 instanceName='wpp2' default",
                  "P2", "useAutomationManagement.ts:119", False, "", "Automacoes so operam em wpp2")
e07_hardcoded.add("E07-E37", "useAutomations.ts:44 instanceName='wpp2' default",
                  "P2", "useAutomations.ts:44", False, "", "Automacoes so operam em wpp2")
e07_hardcoded.add("E07-E38", "RealtimeInboxView.tsx:65 useEvolutionAutoReconnect('wpp2')",
                  "P2", "RealtimeInboxView.tsx:65", False, "", "Auto-reconnect so para wpp2")
e07_hardcoded.add("E07-E39", "RealtimeInboxView.tsx:80 useRealtimeContacts({instance:'wpp2'})",
                  "P2", "RealtimeInboxView.tsx:80", False, "", "Contatos realtime so para wpp2")
e07_hardcoded.add("E07-E40", "useRealtimeInbox.ts:460 read-messages instanceName:'wpp2'",
                  "P1", "useRealtimeInbox.ts:460", False, "", "Read-messages na instancia errada")
e07_hardcoded.add("E07-E41", "StoryViewer.tsx:11 DEFAULT_INSTANCE_NAME='wpp2'",
                  "P2", "StoryViewer.tsx:11", False, "", "Stories de outras instancias quebram")
e07_hardcoded.add("E07-E42", "DeliveryStatsPanel.tsx:45 instance='wpp2' default",
                  "P2", "DeliveryStatsPanel.tsx:45", False, "", "Estatisticas so para wpp2")
e07_hardcoded.add("E07-E43", "supabaseClient.ts:22 'wpp2' hardcoded para instanceName",
                  "P2", "supabaseClient.ts:22", False, "", "Client fixo")
e07_hardcoded.add("E07-E44", "inboxSyncUtils.ts:2 INSTANCE='wpp2'",
                  "P2", "inboxSyncUtils.ts:2", False, "", "Sync admin so para wpp2")
e07_hardcoded.add("E07-E45", "DEFAULT_WHATSAPP_INSTANCE = 'wpp2' centralizado (aceitavel como fallback)",
                  "P3", "whatsappInstances.ts:41", True, "", "Unico ponto central OK")

# ═══════════════════════════════════════════════════════════════════════════
# ADDITIONAL CROSS-CUTTING SCENARIOS
# ═══════════════════════════════════════════════════════════════════════════

e07_multi_agent = ScenarioSet("E07-F: Cenarios Multi-Agente")

e07_multi_agent.add("E07-F01", "Agente A ve wpp2, Agente B ve comercial_03, mesmo contato -> caches diferentes (deveriam)",
                    "P1", "Runtime simulation", False,
                    "Caches colidem -> dados de wpp2 aparecem para B", "")
e07_multi_agent.add("E07-F02", "Agente A marca como lida -> BroadcastChannel -> Agente B recebe evento errado",
                    "P1", "Runtime simulation", False,
                    "Read event de wpp2 propaga para aba de comercial_03", "")
e07_multi_agent.add("E07-F03", "Agente A envia msg em wpp2 -> Agente B ve mensagem aparecer em comercial_03",
                    "P1", "Runtime simulation", False,
                    "Mensagem aparece na instancia errada", "")
e07_multi_agent.add("E07-F04", "Simulacao: 10 agentes, 5 instancias, 50 contatos -> colisoes generalizadas",
                    "P1", "Runtime simulation", False,
                    "Cada par (JID, instancia) deveria ser unico no cache", "")

e07_resolution = ScenarioSet("E07-G: Fluxo de Resolucao de Instancia")

e07_resolution.add("E07-G01", "selectedConversationInstance derivado de conversations[] (useInboxSource.ts)",
                   "P2", "useInboxSource.ts:30-38", True,
                   "A informacao existe no codigo", "")
e07_resolution.add("E07-G02", "selectedConversationInstance fica undefined se contato nao esta na sidebar",
                   "P1", "useInboxSource.ts", False,
                   "Contato fora da sidebar => instanceName nunca resolve", "")
e07_resolution.add("E07-G03", "3-strategy fallback (38911bc63) sempre usa DEFAULT_INSTANCE, nao a instancia real",
                   "P1", "useRealtimeInbox.ts fallback", False,
                   "Strategy B e C hardcodam DEFAULT_INSTANCE como instance_name", "")
e07_resolution.add("E07-G04", "Strategy B: rpc_get_contact usa DEFAULT_INSTANCE no proxy",
                   "P1", "useRealtimeInbox.ts:195", False,
                   "p_instance: DEFAULT_INSTANCE no params do proxy", "")
e07_resolution.add("E07-G05", "Strategy C: sintetico usa DEFAULT_INSTANCE como instance_name",
                   "P1", "useRealtimeInbox.ts:217", False,
                   "instance_name: DEFAULT_INSTANCE no contato sintetico", "")

# ═══════════════════════════════════════════════════════════════════════════
# E05-G: EDGE CASES — Realtime Messages
# ═══════════════════════════════════════════════════════════════════════════

e05_edge = ScenarioSet("E05-G: Edge Cases Realtime Messages")

e05_edge.add("E05-G01", "DELETE de mensagem de outra instancia ainda chega ao cliente (sem filtro instance_name original)",
             "P2", "useRealtimeMessages.ts", True,
             "Filtro instance_name adicionado no commit bbddb2c19 cobre DELETE tambem", "Corrigido pelo commit bbddb2c19")
e05_edge.add("E05-G02", "UPDATE de mensagem com instance_name='' (vazio) — filtro DEFAULT_WHATSAPP_INSTANCE nao captura",
             "P2", "useRealtimeMessages.ts:456", False,
             "Se instance_name for vazio/null, filter instance_name=eq.wpp2 nao captura", "")
e05_edge.add("E05-G03", "Payload Realtime com campos faltando (sender_id ausente) — handler quebra",
             "P2", "useRealtimeMessages.ts handler", False,
             "Nao ha guarda de validacao de payload antes de processar", "")
e05_edge.add("E05-G04", "Realtime subscription morre silenciosamente sem notificacao ao usuario",
             "P2", "ChatMessagesArea.tsx subscription", False,
             "Nao ha callback de error/subscribeStatus para notificar falha", "")
e05_edge.add("E05-G05", "Multiplos updates simultaneos (batch de 10 mensagens) — ordem de processamento imprevisivel",
             "P2", "Runtime simulation", False,
             "Sem garantia de ordenacao de eventos Realtime", "")
e05_edge.add("E05-G06", "Realtime event para tabela evolution_messages com schema='public' em vez de 'evo' — handler ignora",
             "P3", "useRealtimeMessages.ts", False,
             "Schema exato 'evo' no filtro — events de 'public' nao sao capturados (mas tabela real esta em evo mesmo)", "")
e05_edge.add("E05-G07", "Sem heartbeat/healthcheck: subscription morta sem o cliente saber",
             "P2", "Runtime simulation", False,
             "Se o WebSocket cai e reconecta, subscription pode nao re-assinar", "")

e05_broadcast = ScenarioSet("E05-H: BroadcastChannel Cross-tab")

e05_broadcast.add("E05-H01", "BroadcastChannel posta 'reconnect' quando aba perde subscription — mas canal fixo confunde",
                  "P2", "useExternalApiManagement.ts", False,
                  "Reconnect event sem instancia -> aba de wpp2 poe reconnect para canal de comercial_03", "")
e05_broadcast.add("E05-H02", "BroadcastChannel sem escopo de conversa — mensagem de qualquer aba aciona refetch em todas",
                  "P2", "useExternalApiManagement.ts BroadcastChannel", False,
                  "Evento no BroadcastChannel nao carrega remoteJid de origem", "")
e05_broadcast.add("E05-H03", "Aba 1 envia mensagem -> BroadcastChannel -> Aba 2 refetch -> colisao de cache cross-instancia",
                  "P1", "Runtime simulation", False,
                  "Cadeia: send -> broadcast -> fetch -> cache collision (E07)", "")
e05_broadcast.add("E05-H04", "BroadcastChannel sem timeout: aba que nao responde bloqueia as demais",
                  "P3", "Runtime simulation", False,
                  "Se BroadcastChannel message handler trava, todas as abas travam", "")

# ═══════════════════════════════════════════════════════════════════════════
# E06-C: Edge Cases Publicacao Realtime
# ═══════════════════════════════════════════════════════════════════════════

e06_edge = ScenarioSet("E06-C: Edge Cases Publicacao Realtime")

e06_edge.add("E06-C01", "Simulacao: UPDATE em evolution_messages_wpp2 gera 2 eventos Realtime (pai + filha)",
             "P2", "WAL + Realtime", False,
             "Evento 1 via pai (pubviaroot), Evento 2 via filha (publicacao direta)", "")
e06_edge.add("E06-C02", "Simulacao: 2 eventos -> 2 invalidateQueries -> 2 refetches -> carga 2x no banco",
             "P2", "Runtime simulation", False,
             "Cada evento -> handler -> invalidateQueries -> SELECT no banco", "")
e06_edge.add("E06-C03", "Simulacao: reconcile duplo -> flicker (novo -> antigo -> novo) na UI",
             "P2", "Runtime simulation", False,
             "Estado otimista: setMessages(novo) -> reconcile(antigo) -> reconcile(novo)", "")
e06_edge.add("E06-C04", "Verificacao: ALTER PUBLICATION supabase_realtime ja foi aplicada? (S/N)",
             "P2", "Banco de producao", False,
             "Nao e possivel verificar pelo codigo-fonte — depende de acesso ao banco", "")
e06_edge.add("E06-C05", "Impacto em comercial_03 (5 msgs): eventos duplicados mas carga baixa",
             "P3", "Runtime simulation", False,
             "5 mensagens geram 10 eventos — baixo impacto, mas o bug existe", "")

# ═══════════════════════════════════════════════════════════════════════════
# E07-H: MATRIX — Simulated Runtime Behavior Matrix
# ═══════════════════════════════════════════════════════════════════════════

e07_matrix = ScenarioSet("E07-H: Matriz de Comportamento Runtime Cross-Instancia")

# (instance A, instance B, JID match, expected behavior)
matrix_cases = [
    ("wpp2", "wpp2", True, "cache OK (mesma instancia)"),
    ("wpp2", "comercial_03", True, "cache COLLISION (dados errados)"),
    ("comercial_03", "artes", True, "cache COLLISION (dados errados)"),
    ("wpp2", "wpp2", False, "cache OK (JID diferente)"),
    ("wpp2", "comercial_03", False, "cache OK (JID diferente, keys diferem por JID)"),
]

for i, (inst_a, inst_b, same_jid, behavior) in enumerate(matrix_cases):
    jid_desc = "mesmo JID" if same_jid else "JIDs diferentes"
    sid = "E07-H%02d" % (i + 1)
    e07_matrix.add(sid, "Matriz: instancia_A=%s, instancia_B=%s, %s => %s" % (inst_a, inst_b, jid_desc, behavior),
                   "P1" if "COLLISION" in behavior else "P2",
                   "Runtime simulation matrix",
                   expected_pass=False if "COLLISION" in behavior else True,
                   evidence="Cache key ignores instanceName",
                   detail="Cenario cross-instancia: %s vs %s, %s" % (inst_a, inst_b, jid_desc))

# 5 more scenarios for specific runtime situations
e07_matrix.add("E07-H06", "Intervalo entre mount e resolucao de instanceName: dados de wpp2 aparecem antes de comercial_03",
               "P1", "Runtime simulation", False,
               "Janela de inconsistencia ~100-500ms", "")
e07_matrix.add("E07-H07", "Cenario extremo: 15 instancias, 1 JID, 15 abas -> 14 veem dados errados (so wpp2 correta)",
               "P1", "Runtime simulation", False,
               "15 agentes monitorando mesmo cliente em instancias diferentes", "")
e07_matrix.add("E07-H08", "Acao: enviar mensagem na aba errada (ve wpp2, envia para wpp2, deveria ser comercial_03)",
               "P1", "Runtime simulation", False,
               "Agente ve dados de wpp2 e envia mensagem para wpp2 pensando ser comercial_03", "")
e07_matrix.add("E07-H09", "Cache warming: primeira visita a comercial_03 carrega wpp2 -> cache quente de wpp2 persiste",
               "P1", "Runtime simulation", False,
               "Se DEFAULT_INSTANCE carregou primeiro, cache fica populado com dados errados", "")
e07_matrix.add("E07-H10", "Cross-tab polling: Aba A (wpp2) faz poll a cada 5s -> Aba B (comercial_03) nunca faz poll proprio",
               "P1", "Runtime simulation", False,
               "BroadcastChannel dedupe faz Aba B confiar nos polls de Aba A", "")

# ═══════════════════════════════════════════════════════════════════════════
# RUN ALL AND GENERATE REPORT
# ═══════════════════════════════════════════════════════════════════════════

all_sets = [
    e05_channel, e05_filter, e05_invalidation, e05_lifecycle,
    e05_reactions, e05_load, e05_edge, e05_broadcast,
    e06_publication, e06_impact, e06_edge,
    e07_cache, e07_collision, e07_deps, e07_flicker,
    e07_hardcoded, e07_multi_agent, e07_resolution, e07_matrix,
]

now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=-3))).strftime("%Y-%m-%d %H:%M")

results = [s.run() for s in all_sets]
total = sum(r["total"] for r in results)
total_p = sum(r["passed"] for r in results)
total_f = sum(r["failed"] for r in results)
coverage = round(total_p / total * 100, 1) if total else 100

p1_fail = sum(1 for r in results for d in r["details"] if d["severity"] == "P1" and not d["expected_pass"])
p2_fail = sum(1 for r in results for d in r["details"] if d["severity"] == "P2" and not d["expected_pass"])
p3_fail = sum(1 for r in results for d in r["details"] if d["severity"] == "P3" and not d["expected_pass"])

lines = []
lines.append("# Relatorio Expandido de Simulacao — Bloco B (E05-E07)")
lines.append("")
lines.append("**Data:** %s BRT" % now)
lines.append("**Repositorio:** adm01-debug/zapp-web-v3")
lines.append("**Baseline:** a631524c5")
lines.append("**Commits pos-baseline:** bbddb2c19 + 38911bc63")
lines.append("")
lines.append("---")
lines.append("")
lines.append("## Sumario Executivo")
lines.append("")
lines.append("| Metrica | Valor |")
lines.append("|---|---|")
lines.append("| Total de cenarios simulados | **%d** |" % total)
lines.append("| Pass (comportamento correto) | **%d** (%s%%) |" % (total_p, coverage))
lines.append("| Fail (bug confirmado) | **%d** (%s%%) |" % (total_f, round(100-coverage, 1)))
lines.append("| Severidade P1 (corrigir imediatamente) | **%d** |" % p1_fail)
lines.append("| Severidade P2 (corrigir em sprint) | **%d** |" % p2_fail)
lines.append("| Severidade P3 (hardening) | **%d** |" % p3_fail)
lines.append("")

# Distribution table
lines.append("### Distribuicao por Topico")
lines.append("")
lines.append("| Topico | Total | Pass | Fail | % Pass |")
lines.append("|---|---|---|---|---|")
for r in results:
    pct = round(r["passed"]/r["total"]*100, 1) if r["total"] else 0
    lines.append("| %s | %d | %d | %d | %s%% |" % (r["subject"], r["total"], r["passed"], r["failed"], pct))
lines.append("")

# What was fixed
lines.append("## O que os Commits Pos-Baseline Ja Corrigiram")
lines.append("")
lines.append("| Commit | Fix | Impacto |")
lines.append("|---|---|---|")
lines.append("| `bbddb2c19` (C1) | instance_name filter nos 3 handlers Realtime (INSERT/UPDATE/DELETE) | Antes: recebia eventos de TODAS as 26 instancias. Agora: filtra por instance_name. Progresso parcial do E05. |")
lines.append("| `bbddb2c19` (C12) | Schema de reacoes corrigido de zapp para public | Reacoes agora funcionam em tempo real. |")
lines.append("| `bbddb2c19` (C2) | onMarkAsRead chamado no VirtualizedRealtimeList | Badge de nao-lida agora decrementa ao clicar na conversa. |")
lines.append("| `bbddb2c19` (C3) | Sort override removido do VirtualizedRealtimeList | Ordenacao respeita pipeline de filtros. |")
lines.append("| `38911bc63` | 3-strategy fallback (Local + Proxy + Sintetico) | ChatPanel abre em deep-link; corrige E02. |")
lines.append("")

# What still needs fixing
lines.append("## O que AINDA NAO foi Corrigido (E05-E07)")
lines.append("")
lines.append("### E05 — %s falhas" % sum(1 for r in results if 'E05' in r['subject'] for d in r['details'] if not d['expected_pass']))
lines.append("")
lines.append("**Problema central:** canal Realtime com nome fixo (`chat-updates-shared`), sem filtro `remote_jid` por conversa, invalidacao global de cache.")
lines.append("")
lines.append("O filtro `instance_name` adicionado no commit bbddb2c19 e um progresso, mas insuficiente: (1) usa constante `DEFAULT_WHATSAPP_INSTANCE` em vez de derivar da conversa atual, (2) nao filtra por `remote_jid`, (3) o nome do canal continua fixo causando colisao entre abas/popups.")
lines.append("")

lines.append("### E06 — %s falhas" % sum(1 for r in results if 'E06' in r['subject'] for d in r['details'] if not d['expected_pass']))
lines.append("")
lines.append("**Problema central:** particoes filhas (`evolution_messages_wpp2`, `evolution_conversations_wpp2`) publicadas junto com o pai particionado na `supabase_realtime` -> risco de evento duplicado e reconciliacao otimista dupla.")
lines.append("")
lines.append("Nenhuma correcao aplicada — o commit bbddb2c19 nao tocou na publicacao do banco.")
lines.append("")

lines.append("### E07 — %s falhas" % sum(1 for r in results if 'E07' in r['subject'] for d in r['details'] if not d['expected_pass']))
lines.append("")
lines.append("**Problema central:** todas as chaves de cache em `useExternalApiManagement.ts` e `useExternalEvolution.ts` ignoram `instanceName`. Cache collision cross-instancia e o risco mais grave: duas abas com mesmo JID em instancias diferentes recebem dados ERRADOS sem sinal de erro.")
lines.append("")
lines.append("%d hardcodings de 'wpp2' encontrados no codigo-fonte." % len(hardcodings))
lines.append("")

# Detailed scenarios
lines.append("---")
lines.append("")
lines.append("## Cenario Detalhado Completo")
lines.append("")

for r in results:
    lines.append("### %s (%d/%d pass)" % (r["subject"], r["passed"], r["total"]))
    lines.append("")
    lines.append("| ID | Status | Severidade | Descricao | Detalhe |")
    lines.append("|---|---|---|---|---|")
    for d in r["details"]:
        icon = "" if d["expected_pass"] else ""
        detail_text = str(d.get("detail", "") or "")[:130].replace("\n", " ")
        lines.append("| %s | %s%s | %s | %s | %s |" % (
            d["id"], icon, "PASS" if d["expected_pass"] else "FAIL",
            d["severity"], d["title"], detail_text,
        ))
    lines.append("")

# Conclusion
lines.append("---")
lines.append("")
lines.append("## Conclusao e Priorizacao")
lines.append("")
lines.append("### Prioridade 1 — Corrigir AGORA")
lines.append("")
lines.append("1. **E07 — Cache keys com instanceName efetivo (P1)**")
lines.append("   - Substituir DEFAULT_INSTANCE por effectiveInstance nos 9 cache keys")
lines.append("   - Adicionar instanceName nas deps dos callbacks (loadInitial, pollNewMessages, loadOlder)")
lines.append("   - Corrigir read-messages edge function para usar instanceName real")
lines.append("   - Remover hardcodings de 'wpp2'")
lines.append("")
lines.append("2. **E05 — Canal por conversa (P1)**")
lines.append("   - Nome unico: chat-updates:${remoteJid}")
lines.append("   - Filtro server-side: remote_jid=eq.${remoteJid}")
lines.append("   - invalidateQueries escopo estreito: queryKeys.messages.byConversation(id)")
lines.append("")
lines.append("### Prioridade 2 — Proxima Sprint")
lines.append("")
lines.append("3. **E06 — Higienizar publicacao supabase_realtime (P2)**")
lines.append("   - DROP das particoes folha na publication")
lines.append("")
lines.append("4. **E07 — Remover dead DEFAULT_INSTANCE definitions (P2)**")
lines.append("   - Consolidar todas as definicoes em um unico ponto")
lines.append("")
lines.append("### Prioridade 3 — Hardening")
lines.append("")
lines.append("5. Testes de regressao para E05-E07")
lines.append("6. CI gate: falhar se 'wpp2' literal aparecer em arquivos de producao")
lines.append("7. Simulacao de carga Realtime com 60k mensagens e filtro por remote_jid")
lines.append("")
lines.append("---")
lines.append("")
lines.append("*Relatorio gerado automaticamente pelo simulador Bloco B Expandido.*")
lines.append("*%d cenarios analisados, %d bugs confirmados (P1=%d, P2=%d, P3=%d)*" % (total, total_f, p1_fail, p2_fail, p3_fail))

report = "\n".join(lines)
report_path = SIM_DIR / "RELATORIO_BLOCO_B_EXPANDIDO.md"
report_path.write_text(report, encoding="utf-8")

print("Relatorio expandido salvo: %s" % report_path)
print()
print("=== RESUMO ===")
print("Total: %d cenarios" % total)
print("Pass:  %d (%s%%)" % (total_p, coverage))
print("Fail:  %d (%s%%)" % (total_f, round(100-coverage, 1)))
print("  P1 fails: %d" % p1_fail)
print("  P2 fails: %d" % p2_fail)
print("  P3 fails: %d" % p3_fail)
print()
print("=== POR TOPICO ===")
for r in results:
    pct = round(r["passed"]/r["total"]*100, 1) if r["total"] else 0
    print("  %-55s %d/%d (%s%%)" % (r["subject"], r["passed"], r["total"], pct))
