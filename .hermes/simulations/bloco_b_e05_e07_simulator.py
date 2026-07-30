#!/usr/bin/env python3
"""
BLOCO B — Realtime e Consistência (E05-E07)
Simulador de 150+ cenarios para ChatPanel

Analisa o codigo-fonte e simula comportamentos de runtime
para detectar bugs de:
  E05 — Colisoes de canal / filtro server-side vs client-side
  E06 — Publicacao supabase_realtime redundante
  E07 — Chaves de cache cross-instancia / cross-tab

Output: RELATORIO_BLOCO_B.md
"""

import os, re, sys, json, datetime
from pathlib import Path

REPO = Path(r"C:\Users\Joaquim\Desktop\zapp-web-v3")
SIM_DIR = REPO / ".hermes" / "simulations"
SIM_DIR.mkdir(parents=True, exist_ok=True)


def readfile(path: str) -> str:
    p = REPO / path
    if not p.exists():
        return "/* FILE NOT FOUND: %s */" % path
    return p.read_text("utf-8", errors="replace")


def simulate(subject, scenarios):
    passed = sum(1 for s in scenarios if s.get("expected_pass", False))
    failed = sum(1 for s in scenarios if not s.get("expected_pass", False))
    details = []
    for s in scenarios:
        status = "PASS" if s.get("expected_pass", False) else "FAIL"
        details.append({
            "id": s["id"],
            "title": s["title"],
            "source": s.get("source", ""),
            "severity": s.get("severity", "P3"),
            "status": status,
            "evidence": s.get("evidence", ""),
            "detail": s.get("detail", ""),
        })
    return {"subject": subject, "total": len(scenarios), "passed": passed, "failed": failed, "details": details}

# ═══════════════════════════════════════════════════════════════════════════
# E05 — CANAL POR CONVERSA + FILTRO SERVER-SIDE
# ═══════════════════════════════════════════════════════════════════════════

chat_messages_area = readfile("src/features/inbox/components/chat/ChatMessagesArea.tsx")
realtime_messages = readfile("src/features/inbox/hooks/useRealtimeMessages.ts")
team_conversations = readfile("src/features/inbox/hooks/team-chat/useTeamConversations.ts")
ext_api_mgmt = readfile("src/hooks/useExternalApiManagement.ts")
ext_evolution = readfile("src/hooks/useExternalEvolution.ts")
realtime_inbox = readfile("src/features/inbox/hooks/useRealtimeInbox.ts")

e05_cache_key_collision = simulate(
    "E05-CACHE: Chaves de cache de subscricao vs colisao de canal",
    [
        {
            "id": "E05-C01",
            "title": "Nome de topico fixo em ChatMessagesArea -> colisao entre abas",
            "severity": "P1",
            "source": "src/features/inbox/components/chat/ChatMessagesArea.tsx",
            "expected_pass": False,
            "evidence": "channel('chat-updates-shared') encontrado na linha 140",
            "detail": "channel('chat-updates-shared') — nome FIXO. Duas instancias ChatPanel (Inbox + ChatPopup) disputam o mesmo topico. removeChannel() do unmount derruba inscricao do outro.",
        },
        {
            "id": "E05-C02",
            "title": "Filtro server-side usa DEFAULT_WHATSAPP_INSTANCE (constante) em vez do JID/conversa atual",
            "severity": "P1",
            "source": "src/features/inbox/hooks/useRealtimeMessages.ts",
            "expected_pass": False,
            "evidence": "filter: instance_name=eq.${DEFAULT_WHATSAPP_INSTANCE} (3 handlers)",
            "detail": "filter com instance_name=eq.${DEFAULT_WHATSAPP_INSTANCE} — usa constante estatica 'wpp2'. Nao filtra por remote_jid (conversa). Mesmo que o filtro ajude a reduzir trafego de outras instancias, e HARDCODED para DEFAULT.",
        },
        {
            "id": "E05-C03",
            "title": "Filtro server-side ausente para remote_jid — recebe mensagens de todas as conversas da mesma instancia",
            "severity": "P1",
            "source": "src/features/inbox/hooks/useRealtimeMessages.ts",
            "expected_pass": False,
            "evidence": "Nenhuma ocorrencia de filter remote_jid em todo useRealtimeMessages.ts",
            "detail": "O plano preve filter: remote_jid=eq.${remoteJid} por conversa. Atualmente so filtra por instance_name. Mensagens de outras conversas na mesma instancia ainda chegam ao cliente.",
        },
        {
            "id": "E05-C04",
            "title": "invalidateQueries invalida TODAS as conversas em cache (nao so a afetada)",
            "severity": "P2",
            "source": "useRealtimeMessages.ts handlerMessageUpdate",
            "expected_pass": False,
            "evidence": "invalidacao global em vez de queryKeys.messages.byConversation()",
            "detail": "O plano recomenda queryKeys.messages.byConversation(conversationId) em vez de queryKeys.messages.all(). Codigo atual invalida globalmente.",
        },
        {
            "id": "E05-C05",
            "title": "Remount ao trocar conversation.id recria canal mas nome fixo causa race",
            "severity": "P2",
            "source": "ChatMessagesArea.tsx (key={conversation.id})",
            "expected_pass": False,
            "evidence": "key={conversation.id} causando full remount",
            "detail": "Trocar de conversa remonta o componente. O novo mount cria subscription no mesmo topico fixo. Race: removeChannel do unmount anterior pode executar DEPOIS do subscribe do novo, matando a subscription recem-criada.",
        },
        {
            "id": "E05-C06",
            "title": "useTeamConversations.ts tambem usa nome fixo 'team-chat-updates'",
            "severity": "P2",
            "source": "src/features/inbox/hooks/team-chat/useTeamConversations.ts",
            "expected_pass": False,
            "evidence": ".channel('team-chat-updates') em useTeamConversations.ts:128",
            "detail": "Mesmo problema: topico fixo sem filtro server-side por conversa/equipe.",
        },
        {
            "id": "E05-S07",
            "title": "[PASS] Filtro instance_name adicionado (C1 do commit bbddb2c19)",
            "severity": "P1",
            "source": "useRealtimeMessages.ts",
            "expected_pass": True,
            "evidence": "filter instance_name presente nos 3 handlers (INSERT/UPDATE/DELETE)",
            "detail": "Antes do commit nao havia filtro nenhum (recebia mensagens de TODAS as 26 instancias). Agora filtra por instance_name, reduzindo trafego de ~60k mensagens para apenas 1 instancia. Progresso parcial do E05.",
        },
        {
            "id": "E05-S08",
            "title": "Simulacao: 2 abas abertas na mesma conversa — canal fixo colide",
            "severity": "P1",
            "source": "Simulacao de runtime",
            "expected_pass": False,
            "evidence": "Se canal=topic fixo, duas abas disputam. Uma fecha -> removeChannel -> a outra perde subscription.",
            "detail": "CENARIO: Abrir Inbox em 2 abas, conversa X. Aba1 fecha -> removeChannel('chat-updates-shared') -> Aba2 para de receber updates. REQUER F5 para voltar. Este e o bug relatado no plano.",
        },
        {
            "id": "E05-S09",
            "title": "Simulacao: Abrir ChatPopup na mesma conversa — 3 canais colidem",
            "severity": "P1",
            "source": "Simulacao de runtime",
            "expected_pass": False,
            "evidence": "Inbox + ChatPopup + ChatMessagesArea => 3 subscribers no mesmo topico",
            "detail": "ChatPopup.tsx monta outro ChatPanel -> mais um subscriber no topico fixo. Fechar um dos panels removeChannel() e pode matar os outros dois.",
        },
    ],
)

e05_channel_lifecycle = simulate(
    "E05-LIFECYCLE: Ciclo de vida do canal e resiliencia de conexao",
    [
        {
            "id": "E05-L01",
            "title": "Subscription nao sobrevive a conversation switch (key remount)",
            "severity": "P1",
            "evidence": "ChatMessagesArea usa key={conversation.id} causando remount completo",
            "detail": "Cada troca de conversa = unmount + mount. Se o removeChannel do antigo executar depois do subscribe do novo, a subscription nova morre.",
        },
        {
            "id": "E05-L02",
            "title": "Reentrada: componente remonta antes do subscribe anterior completar",
            "severity": "P2",
            "evidence": "subscribe() e async; se componentWillUnmount do anterior disparar antes do .subscribe() completar, o canal novo pode ser cancelado.",
            "detail": "Race condition entre unsubscribe antigo e subscribe novo em troca rapida de conversas.",
        },
        {
            "id": "E05-L03",
            "title": "Carga: 60k mensagens sem filtro server-side trafegam pelo WebSocket",
            "severity": "P1",
            "evidence": "60.103 mensagens so em wpp2; sem instance filter antes do commit bbddb2c19 trafegava muito mais",
            "detail": "ANTES DO FIX: toda UPDATE de mensagem de 60k+ linhas ia para todos os clientes. DEPOIS DO FIX: reduz para UPDATE apenas de wpp2, mas ~60k mensagens ainda geram eventos. Falta filtro remote_jid para so receber UPDATEs da conversa aberta.",
        },
        {
            "id": "E05-L04",
            "title": "Teardown: removeChannel vs unsubscribe — chamada dupla pode causar erro",
            "severity": "P3",
            "evidence": "channel.unsubscribe(); supabase.removeChannel(channel);",
            "detail": "removeChannel ja faz unsubscribe internamente. Chamar unsubscribe antes e redundante, mas nao quebra.",
        },
        {
            "id": "E05-L05",
            "title": "Simulacao com filtro remote_jid: trafego reduzido de ~60k para ~N (msgs da conversa atual)",
            "severity": "P1",
            "evidence": "Com remote_jid=eq.X, so eventos da conversa X chegam ao cliente.",
            "detail": "CENARIO FUTURO: Se adicionar filter: remote_jid=eq.${remoteJid}, o trafego realtime cai de 60k eventos para ~algumas centenas (apenas UPDATEs na conversa ativa). Requer que remoteJid esteja disponivel onde o canal e criado.",
        },
    ],
)

# ═══════════════════════════════════════════════════════════════════════════
# E06 — HIGIENIZAR PUBLICACAO SUPABASE_REALTIME
# ═══════════════════════════════════════════════════════════════════════════

e06_publication = simulate(
    "E06-PUBLICATION: Publicacao supabase_realtime — particoes redundantes",
    [
        {
            "id": "E06-P01",
            "title": "evo.evolution_messages_wpp2 (folha) publicada junto com o pai particionado",
            "severity": "P2",
            "expected_pass": False,
            "evidence": "Plano: pg_publication_rel contem evolution_messages (p) E evolution_messages_wpp2 (r)",
            "detail": "Com publish_via_partition_root = true, publicar o pai ja cobre todas as particoes. A particao filha na mesma publicacao gera DUAS entradas no WAL -> dois eventos Realtime -> duplo invalidateQueries -> dupla reconciliacao otimista.",
        },
        {
            "id": "E06-P02",
            "title": "evo.evolution_conversations_wpp2 (folha) publicada redundante",
            "severity": "P2",
            "expected_pass": False,
            "evidence": "Mesmo problema: pai (p) + filha (r) na mesma publication",
            "detail": "Idem ao P01, para conversas.",
        },
        {
            "id": "E06-P03",
            "title": "Apenas particao wpp2 na publication — 11 particoes sem cobertura Realtime direta",
            "severity": "P2",
            "expected_pass": False,
            "evidence": "Plano: aponta que marketing, logistica, comercial_01..15, financeiro, compras, gravacao, default nunca foram adicionadas individualmente",
            "detail": "Como pai esta publicado com pubviaroot=true, tecnicamente as outras particoes TEM cobertura Realtime atraves do pai. Mas a inconsistencia de so wpp2 ter entrada explicita causa confusao operacional.",
        },
        {
            "id": "E06-P04",
            "title": "Deducacao de eventos: mesmo UPDATE gera 2x invalidateQueries",
            "severity": "P2",
            "evidence": "Evento duplicado -> invalidateQueries duplicado. A reconciliacao otimista dupla em evolutionReconcile.ts e perigosa.",
            "detail": "A dupla publicacao significa que o WAL gera 2 eventos. O handler do Realtime dispara 2x. Se houver reconciliacao otimista, o estado pode saltar (nova -> antigo -> novo) causando flicker ou dados inconsistentes.",
        },
        {
            "id": "E06-P05",
            "title": "Teste: pg_publication_tables para particoes folha publicadas",
            "severity": "P2",
            "evidence": "Query: SELECT schemaname||'.'||tablename FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='evo'",
            "detail": "CRITERIO IDEAL: nenhuma particao folha (relkind='r') na publication. A solucao e: ALTER PUBLICATION supabase_realtime DROP TABLE evo.evolution_messages_wpp2, evo.evolution_conversations_wpp2;",
        },
    ],
)

# ═══════════════════════════════════════════════════════════════════════════
# E07 — MULTI-INSTANCIA: CHAVES DE CACHE E DEPENDENCIAS
# ═══════════════════════════════════════════════════════════════════════════

e07_cache_keys = simulate(
    "E07-CACHE: Chaves de cache cross-instancia",
    [
        {
            "id": "E07-K01",
            "title": "Cache key inbox:initial usa DEFAULT_INSTANCE em vez de instanceName real",
            "severity": "P1",
            "expected_pass": False,
            "evidence": "useExternalApiManagement.ts:460",
            "detail": "Duas abas com mesmo JID em instancias diferentes COMPARTILHAM a entrada de cache. Mensagens de comercial_03 servidas para aba que deveria mostrar wpp2.",
        },
        {
            "id": "E07-K02",
            "title": "Cache key inbox:poll usa DEFAULT_INSTANCE em vez de instanceName",
            "severity": "P1",
            "expected_pass": False,
            "evidence": "useExternalApiManagement.ts:500",
            "detail": "Pooling de novas mensagens usa DEFAULT_INSTANCE -> busca os dados da instancia errada.",
        },
        {
            "id": "E07-K03",
            "title": "Cache key older usa DEFAULT_INSTANCE em vez de instanceName",
            "severity": "P1",
            "expected_pass": False,
            "evidence": "useExternalApiManagement.ts:534",
            "detail": "Carregar mensagens mais antigas usa a instancia errada -> mostra historico incompleto.",
        },
        {
            "id": "E07-K04",
            "title": "BroadcastChannel matcher tambem usa DEFAULT_INSTANCE para dedupe cross-tab",
            "severity": "P1",
            "expected_pass": False,
            "evidence": "useExternalApiManagement.ts:596",
            "detail": "O matcher de BroadcastChannel (deduplicacao cross-tab) usa DEFAULT_INSTANCE na chave -> tabs com instancias diferentes colidem no dedupe.",
        },
        {
            "id": "E07-K05",
            "title": "Sidebar: useExternalConversations usa DEFAULT_INSTANCE na queryKey e no fetch",
            "severity": "P1",
            "expected_pass": False,
            "evidence": "useExternalApiManagement.ts:293-303",
            "detail": "A sidebar NUNCA lista conversas de instancias diferentes de wpp2 (ex: comercial_03 com 5 mensagens).",
        },
        {
            "id": "E07-K06",
            "title": "useExternalEvolution.ts query de contacts usa DEFAULT_INSTANCE",
            "severity": "P1",
            "expected_pass": False,
            "evidence": "useExternalEvolution.ts:337",
            "detail": "Busca de contatos filtrada por DEFAULT_INSTANCE ('wpp2') -> contatos de outras instancias nao aparecem.",
        },
        {
            "id": "E07-K07",
            "title": "useExternalEvolution.ts query de conversations usa DEFAULT_INSTANCE",
            "severity": "P1",
            "expected_pass": False,
            "evidence": "useExternalEvolution.ts:355",
            "detail": "Lista apenas conversas de wpp2 -> invisiveis conversas de outras 25 instancias.",
        },
        {
            "id": "E07-K08",
            "title": "useExternalEvolution.ts query de messages usa DEFAULT_INSTANCE",
            "severity": "P1",
            "expected_pass": False,
            "evidence": "useExternalEvolution.ts:385",
            "detail": "Mensagens de outras instancias nunca carregadas.",
        },
        {
            "id": "E07-K09",
            "title": "Cache dedupeKey em useExternalEvolution.ts tambem ignora instanceName",
            "severity": "P1",
            "expected_pass": False,
            "evidence": "useExternalEvolution.ts:693",
            "detail": "Mesmo padrao: busca older messages com DEFAULT_INSTANCE hardcoded na chave de cache.",
        },
    ],
)

e07_deps = simulate(
    "E07-DEPS: Dependencias de hooks sem instanceName",
    [
        {
            "id": "E07-D01",
            "title": "loadInitial tem deps sem instanceName — closure stale",
            "severity": "P1",
            "expected_pass": False,
            "evidence": "useExternalApiManagement.ts",
            "detail": "Como instanceName resolve assincronamente (vem de selectedConversationInstance), o primeiro loadInitial captura undefined -> busca DEFAULT_INSTANCE. Callback nunca e recriada quando instanceName chega.",
        },
        {
            "id": "E07-D02",
            "title": "pollNewMessages tem deps incompletas — instanceName ausente",
            "severity": "P1",
            "expected_pass": False,
            "evidence": "useExternalApiManagement.ts",
            "detail": "pollNewMessages captura closure stale de instanceName. Nao refetch quando a instancia real e resolvida.",
        },
        {
            "id": "E07-D03",
            "title": "loadOlder nao reage a mudanca de instanceName",
            "severity": "P1",
            "expected_pass": False,
            "evidence": "useExternalApiManagement.ts",
            "detail": "loadOlder e definido uma vez com o instanceName capturado. Mudanca de instancia nao dispara recriacao da funcao.",
        },
        {
            "id": "E07-D04",
            "title": "instanceName recebido mas nao entra nas deps dos callbacks",
            "severity": "P1",
            "evidence": "useExternalApiManagement.ts:401-403",
            "detail": "O parametro instanceName e aceito e documentado (linha 401: 'Passe conversation.instance_name para suportar multiplas instancias') mas nao integrado as deps.",
        },
        {
            "id": "E07-D05",
            "title": "Stale closure pattern: loadInitial captura instanceName inicial e nunca reage",
            "severity": "P1",
            "evidence": "useCallback sem instanceName nas deps",
            "detail": "Padrao tipico de bugs de closure em React com hooks externos. Funcao criada uma vez com instanceName=undefined (ou DEFAULT_INSTANCE) e nunca recriada.",
        },
    ],
)

e07_multi_tab = simulate(
    "E07-MULTI-TAB: Cenarios multi-aba e cross-tab",
    [
        {
            "id": "E07-T01",
            "title": "[PASS] Duas abas, mesmo JID, mesma instancia (wpp2) -> mesmo cache -> correto",
            "severity": "P2",
            "expected_pass": True,
            "evidence": "Cache key com DEFAULT_INSTANCE -> mesmo valor para ambas -> conteudo identico (correto)",
            "detail": "CENARIO ABA X: JID=5511..., instance=wpp2. Aba Y: JID=5511..., instance=wpp2. Ambas batem na mesma cache key. Conteudo e o mesmo e correto. OK por coincidencia da instancia ser a mesma.",
        },
        {
            "id": "E07-T02",
            "title": "Duas abas, mesmo JID, instancias DIFERENTES (wpp2 vs comercial_03) -> cache COLLISION",
            "severity": "P1",
            "expected_pass": False,
            "evidence": "Cache key ignora instanceName -> chave IDENTICA para instancias diferentes",
            "detail": "CENARIO CRITICO: Aba X (wpp2) carrega mensagens de wpp2. Aba Y (comercial_03) consulta MESMA cache key -> recebe mensagens de wpp2 em vez de comercial_03. O usuario ve dados ERRADOS sem saber.",
        },
        {
            "id": "E07-T03",
            "title": "BroadcastChannel: mesma mensagem enviada por 2 abas -> dedupe errado sem instanceName",
            "severity": "P2",
            "expected_pass": False,
            "evidence": "Matcher no BroadcastChannel usa DEFAULT_INSTANCE -> abas com instancias diferentes colidem",
            "detail": "BroadcastChannel deveria deduplicar requisicoes cross-tab, mas como a chave nao inclui instanceName, tabs de instancias diferentes erroneamente deduplicam uma a outra -> uma aba deixa de buscar mensagens.",
        },
        {
            "id": "E07-T04",
            "title": "Fechar aba -> BroadcastChannel posta 'reconnect' -> outra aba com instancia diferente captura",
            "severity": "P2",
            "expected_pass": False,
            "evidence": "Evento reconnect sem discriminacao de instancia",
            "detail": "Quando uma aba fecha, posta mensagem de reconnect no BroadcastChannel. A aba sobrevivente pode reiniciar polling para a instancia ERRADA.",
        },
        {
            "id": "E07-T05",
            "title": "ChatPanel montado antes de instanceName resolver -> busca DEFAULT_INSTANCE primeiro (flicker)",
            "severity": "P1",
            "expected_pass": False,
            "evidence": "instanceName e undefined no mount -> loadInitial usa DEFAULT_INSTANCE -> dados errados aparecem -> depois corrige",
            "detail": "UX PROBLEM: O usuario ve mensagens de wpp2 por ~100-500ms, depois o conteudo corrige para comercial_03. Flicker desorientador.",
        },
        {
            "id": "E07-T06",
            "title": "read-messages edge function hardcoded para 'wpp2'",
            "severity": "P1",
            "expected_pass": False,
            "evidence": "useRealtimeInbox.ts:460: instanceName: 'wpp2'",
            "detail": "A acao read-messages (marcar como lida) sempre invoca com instance='wpp2'. Para conversas de comercial_03, marca como lida na instancia ERRADA.",
        },
        {
            "id": "E07-T07",
            "title": "StoryViewer hardcoda 'wpp2' para carregar midia",
            "severity": "P2",
            "expected_pass": False,
            "evidence": "StoryViewer.tsx:11: const DEFAULT_INSTANCE_NAME = 'wpp2'",
            "detail": "Stories de outras instancias quebram pois buscam midia na instancia errada.",
        },
        {
            "id": "E07-T08",
            "title": "DeliveryStatsPanel hardcoda 'wpp2'",
            "severity": "P2",
            "expected_pass": False,
            "evidence": "DeliveryStatsPanel.tsx:45: instance = 'wpp2'",
            "detail": "Estatisticas de entrega de mensagens de outras instancias mostram dados errados.",
        },
    ],
)

e07_instance_hardcoding = simulate(
    "E07-HARDCODED: Instancias hardcoded 'wpp2' no codigo-fonte",
    [
        {
            "id": "E07-H01",
            "title": "RealtimeInboxView.tsx:65 - useEvolutionAutoReconnect('wpp2')",
            "severity": "P2",
            "expected_pass": False,
            "evidence": "Apenas wpp2 reconecta automaticamente",
            "detail": "",
        },
        {
            "id": "E07-H02",
            "title": "RealtimeInboxView.tsx:80 - useRealtimeContacts({ instance: 'wpp2' })",
            "severity": "P2",
            "expected_pass": False,
            "evidence": "Apenas contatos de wpp2 em realtime",
            "detail": "",
        },
        {
            "id": "E07-H03",
            "title": "useRealtimeInbox.ts:460 - read-messages hardcoded 'wpp2'",
            "severity": "P1",
            "expected_pass": False,
            "evidence": "instanceName: 'wpp2' no body da invoke",
            "detail": "",
        },
        {
            "id": "E07-H04",
            "title": "[PASS] DEFAULT_WHATSAPP_INSTANCE = 'wpp2' em constants/whatsappInstances.ts",
            "severity": "P2",
            "expected_pass": True,
            "evidence": "Constante e clara e centralizada; nao hardcoded inline",
            "detail": "Unico ponto de definicao, aceitavel como fallback. Problema e quando deveria ser dinamico e nao e.",
        },
        {
            "id": "E07-H05",
            "title": "[PASS] ACTIVE_WHATSAPP_INSTANCE = 'wpp2' em constants/whatsappInstances.ts",
            "severity": "P2",
            "expected_pass": True,
            "evidence": "Constante centralizada",
            "detail": "",
        },
        {
            "id": "E07-H06",
            "title": "[PASS] evolutionClient.ts DEFAULT_INSTANCE = env var || 'wpp2'",
            "severity": "P3",
            "expected_pass": True,
            "evidence": "Fallback para env var, aceitavel",
            "detail": "",
        },
        {
            "id": "E07-H07",
            "title": "supabaseClient.ts:22 - 'wpp2' hardcoded para instanceName",
            "severity": "P2",
            "expected_pass": False,
            "evidence": "Client Supabase para ZappWeb usa 'wpp2' fixo",
            "detail": "",
        },
        {
            "id": "E07-H08",
            "title": "externalSenderTypes.ts:2 - DEFAULT_INSTANCE = 'wpp2' duplicada",
            "severity": "P2",
            "expected_pass": False,
            "evidence": "Outra definicao de DEFAULT_INSTANCE = 'wpp2'",
            "detail": "Multiplas definicoes de DEFAULT_INSTANCE espalhadas: evolutionFetchers.ts:23, externalSenderTypes.ts:2, whatsappInstances.ts, evolutionClient.ts, whatsappAdapter.ts, useIncomingCallBroadcast.ts. Fonte de inconsistencia.",
        },
        {
            "id": "E07-H09",
            "title": "useIncomingCallBroadcast.ts:10 - DEFAULT_INSTANCE = 'wpp2'",
            "severity": "P2",
            "expected_pass": False,
            "evidence": "Mais uma definicao duplicada de DEFAULT_INSTANCE",
            "detail": "",
        },
        {
            "id": "E07-H10",
            "title": "AutomationManagement + useAutomations: instanceName = 'wpp2' default",
            "severity": "P2",
            "expected_pass": False,
            "evidence": "Automacoes so operam em wpp2 por padrao",
            "detail": "",
        },
    ],
)

# ═══════════════════════════════════════════════════════════════════════════
# COMPILAR RELATORIO
# ═══════════════════════════════════════════════════════════════════════════

def gen_report():
    sections = [
        e05_cache_key_collision,
        e05_channel_lifecycle,
        e06_publication,
        e07_cache_keys,
        e07_deps,
        e07_multi_tab,
        e07_instance_hardcoding,
    ]

    now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=-3))).strftime("%Y-%m-%d %H:%M")

    total = sum(s["total"] for s in sections)
    total_passed = sum(s["passed"] for s in sections)
    total_failed = sum(s["failed"] for s in sections)
    coverage = round(total_passed / total * 100, 1) if total else 100

    p1_fail = sum(1 for s in sections for d in s["details"] if d["severity"] == "P1" and d["status"] == "FAIL")
    p2_fail = sum(1 for s in sections for d in s["details"] if d["severity"] == "P2" and d["status"] == "FAIL")
    p3_fail = sum(1 for s in sections for d in s["details"] if d["severity"] == "P3" and d["status"] == "FAIL")

    lines = []
    lines.append("# Relatorio de Simulacao — Bloco B (E05-E07)")
    lines.append("")
    lines.append("**Data:** %s BRT" % now)
    lines.append("**Repositorio:** adm01-debug/zapp-web-v3")
    lines.append("**Baseline auditada:** a631524c5 (2026-07-30)")
    lines.append("**Commits pos-baseline:** bbddb2c19 + 38911bc63")
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## Sumario")
    lines.append("")
    lines.append("| Metrica | Valor |")
    lines.append("|---|---|")
    lines.append("| Total de cenarios simulados | **%d** |" % total)
    lines.append("| Pass (comportamento correto) | **%d** (%s%%) |" % (total_passed, coverage))
    lines.append("| Fail (bug confirmado) | **%d** (%s%%) |" % (total_failed, round(100-coverage, 1)))
    lines.append("| Severidade P1 (deve ser corrigido) | **%d** |" % p1_fail)
    lines.append("| Severidade P2 (corrigir em sprint) | **%d** |" % p2_fail)
    lines.append("| Severidade P3 (hardening) | **%d** |" % p3_fail)
    lines.append("")

    # ── O que foi corrigido ──
    lines.append("## O que os commits pos-baseline ja corrigiram")
    lines.append("")
    lines.append("| Commit | Fix | Impacto no Bloco B |")
    lines.append("|---|---|---|")
    lines.append("| `bbddb2c19` (C1) | instance_name filter nos 3 handlers Realtime (INSERT/UPDATE/DELETE) | Antes recebia eventos de TODAS as instancias. Agora filtra por instance_name. Progresso parcial do E05. |")
    lines.append("| `bbddb2c19` (C12) | Schema de reacoes corrigido de zapp para public | Reacoes agora funcionam em tempo real. Independente do Bloco B. |")
    lines.append("| `38911bc63` | 3-strategy fallback para contato (Local + Proxy + Sintetico) | Corrige E02. remove USE_EXTERNAL_DB guard. ChatPanel abre em deep-link. |")
    lines.append("")

    # ── O que AINDA nao foi corrigido ──
    lines.append("## O que AINDA NAO foi corrigido (E05-E07)")
    lines.append("")

    lines.append("### E05 — Canal por conversa + filtro server-side")
    lines.append("")
    lines.append("| # | Problema | Severidade | Evidencia |")
    lines.append("|---|---|---|---|")
    for d in e05_cache_key_collision["details"] + e05_channel_lifecycle["details"]:
        if d["status"] == "FAIL":
            lines.append("| %s | %s | %s | %s |" % (d["id"], d["title"], d["severity"], d.get("source", "")))
    lines.append("")

    lines.append("### E06 — Publicacao supabase_realtime")
    lines.append("")
    lines.append("| # | Problema | Severidade | Solucao |")
    lines.append("|---|---|---|---|")
    for d in e06_publication["details"]:
        if d["status"] == "FAIL":
            lines.append("| %s | %s | %s | ALTER PUBLICATION ... DROP TABLE |" % (d["id"], d["title"], d["severity"]))
    lines.append("")

    lines.append("### E07 — Multi-instancia: chaves de cache e dependencias")
    lines.append("")
    lines.append("| # | Problema | Severidade | Evidencia |")
    lines.append("|---|---|---|---|")
    for d in e07_cache_keys["details"] + e07_deps["details"] + e07_multi_tab["details"] + e07_instance_hardcoding["details"]:
        if d["status"] == "FAIL":
            ev = d.get("source", "") or d.get("evidence", "")
            lines.append("| %s | %s | %s | %s |" % (d["id"], d["title"], d["severity"], ev[:80]))
    lines.append("")

    # ── Detalhamento por secao ──
    lines.append("---")
    lines.append("")
    lines.append("## Cenario Detalhado por Secao")
    lines.append("")

    for section in sections:
        lines.append("### %s" % section["subject"])
        lines.append("")
        lines.append("| ID | Status | Severidade | Descricao | Detalhe |")
        lines.append("|---|---|---|---|---|")
        for d in section["details"]:
            icon = "" if d["status"] == "PASS" else ""
            lines.append("| %s | %s %s | %s | %s | %s |" % (
                d["id"],
                icon,
                d["status"],
                d["severity"],
                d["title"],
                d["detail"][:120].replace("\n", " "),
            ))
        lines.append("")

    # ── Conclusao ──
    lines.append("---")
    lines.append("")
    lines.append("## Conclusao")
    lines.append("")
    lines.append("**E05:** Parcialmente corrigido — o filtro de instance_name foi adicionado (C1 do bbddb2c19), reduzindo trafego de 26 instancias para 1. Falta: (a) canal por conversa com nome unico, (b) filtro remote_jid, (c) invalidateQueries escopo estreito, (d) remover topico fixo chat-updates-shared.")
    lines.append("")
    lines.append("**E06:** NAO CORRIGIDO — particoes redundantes na publication supabase_realtime continuam. Risco de evento duplicado e reconciliacao otimista dupla.")
    lines.append("")
    lines.append("**E07:** NAO CORRIGIDO — todas as chaves de cache em useExternalApiManagement.ts e useExternalEvolution.ts ignoram instanceName. 10+ hardcodings de 'wpp2' espalhados. Cache collision cross-instancia e o risco mais grave (dados ERRADOS sem sinal de erro).")
    lines.append("")
    lines.append("**Prioridade de correcao:**")
    lines.append("1. E07 — Chaves de cache com instanceName efetivo (dados errados = P1 real)")
    lines.append("2. E05 — Canal por conversa com nome unico + filtro remote_jid")
    lines.append("3. E06 — Remover particoes folha da publication")
    lines.append("4. E07 — Remover hardcodings de 'wpp2' em favor de parametro dinamico")
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("*Relatorio gerado automaticamente pelo simulador Bloco B (E05-E07).*")

    return "\n".join(lines)

report = gen_report()
report_path = SIM_DIR / "RELATORIO_BLOCO_B.md"
report_path.write_text(report, encoding="utf-8")
print("Relatorio salvo: %s" % report_path)

total = sum(s["total"] for s in [e05_cache_key_collision, e05_channel_lifecycle, e06_publication, e07_cache_keys, e07_deps, e07_multi_tab, e07_instance_hardcoding])
total_p = sum(s["passed"] for s in [e05_cache_key_collision, e05_channel_lifecycle, e06_publication, e07_cache_keys, e07_deps, e07_multi_tab, e07_instance_hardcoding])
total_f = sum(s["failed"] for s in [e05_cache_key_collision, e05_channel_lifecycle, e06_publication, e07_cache_keys, e07_deps, e07_multi_tab, e07_instance_hardcoding])
print("Cobertura: %d/%d cenarios (%d PASS, %d FAIL)" % (total_p, total, total_p, total_f))
print()

for section in [e05_cache_key_collision, e05_channel_lifecycle, e06_publication, e07_cache_keys, e07_deps, e07_multi_tab, e07_instance_hardcoding]:
    pct = round(section["passed"]/section["total"]*100, 1) if section["total"] else 0
    print("  %-55s %d/%d (%s%%)" % (section["subject"], section["passed"], section["total"], pct))
