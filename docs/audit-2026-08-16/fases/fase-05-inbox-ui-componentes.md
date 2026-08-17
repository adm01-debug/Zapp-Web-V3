# FASE 5 — INBOX UI (componentes)

## Etapa 41 — MessageHoverToolbar: ativar favoritar/fixar/responder-depois/reportar

**Objetivo:** Eliminar os 4 stubs da toolbar hover (Favoritar ★, Fixar 📌, Responder depois e Reportar) conectando-os a mecanismos reais de persistência ou desativando-os com aviso.

**Base:** findings-04.md:38 — `MessageHoverToolbar.tsx:188-233` Favoritar ★, Fixar 📌, Responder depois `disabled` sem handler; Reportar sem onClick (A2).

### Subetapas
- [ ] 41.1 Auditar no código-fonte quais stores/hooks reais de favorito de contato e pin de conversa existem (ex.: coluna `favorite`/`pinned` em conversas, `VirtualizedRealtimeList` pin-sort) antes de escrever qualquer handler — sem mecanismo real, registrar débito.
- [ ] 41.2 Implementar handler de Favoritar com persistência (UPDATE/RPC) + estado otimista e rollback em falha.
- [ ] 41.3 Conectar Fixar ao mecanismo de pin existente no ordenador da lista (`pin-sort`), com `aria-pressed` refletindo o estado.
- [ ] 41.4 Ligar "Responder depois" ao snooze já existente em `useChatPanelHandlers` (whisper/snooze), removendo o `disabled` sem motivo.
- [ ] 41.5 Reportar: verificar tabela de denúncia (ex.: `message_reports`/`audit_logs`); persistir motivo + messageId; se não houver destino, ocultar o botão com tooltip "em breve" em vez de botão morto.
- [ ] 41.6 Adicionar `aria-label` e `title` a todos os botões da toolbar (toolbar navegável por teclado, WCAG 2.1.1).
- [ ] 41.7 Exibir estados de loading/erro com toast acessível (`aria-live`) em cada ação, sem `catch {}` silencioso.
- [ ] 41.8 Escrever testes unitários por ação (render, clique, persistência mockada, rollback em falha).
- [ ] 41.9 Validar contraste e foco visível com tokens do design system (nunca cor literal) nos estados hover/ativo.
- [ ] 41.10 Validação manual: nenhum botão da toolbar permanece `disabled` ou sem `onClick` em produção.

### Critério de conclusão (checklist da etapa)
- [ ] Nenhum dos 4 itens (188-233) permanece stub: todos executam ação real ou foram ocultados com aviso.
- [ ] `grep` por `disabled` sem handler na MessageHoverToolbar retorna zero casos sem justificativa.
- [ ] Suíte nova de testes da toolbar passa no CI (vitest) com cobertura das 4 ações.
- [ ] Inspeção manual via teclado (Tab+Enter) executa cada ação; toast de erro aparece em falha de persistência.

## Etapa 42 — Tags funcionais: ContactTagsContent + ChatHeaderMenu

**Objetivo:** Transformar a gestão de tags de decorativa em funcional (remover X, adicionar tag) e ligar "Adicionar tag"/"Marcar como resolvido" do menu do header a fluxos reais.

**Base:** findings-04.md:93 — `ContactTagsContent.tsx:31,48,60` ícone X e botão "Adicionar" sem onClick — UI decorativa (A2); findings-04.md:52 — `ChatHeaderMenu.tsx:58,85` "Adicionar tag" e "Marcar como resolvido" `disabled` sem handler (A1).

### Subetapas
- [ ] 42.1 Identificar o hook/tabela real de tags (ex.: `useTags` + tabela de tags de conversa/contato) e mapear mutations disponíveis.
- [ ] 42.2 ContactTagsContent: implementar `onClick` do X (remover tag) com mutation + invalidação de cache da conversa.
- [ ] 42.3 Implementar botão "Adicionar" abrindo seletor de tags (popover/dialog) com as tags existentes e criação inline.
- [ ] 42.4 ChatHeaderMenu: ligar "Adicionar tag" ao mesmo seletor compartilhado (callback único, sem duplicar UI).
- [ ] 42.5 ChatHeaderMenu: ligar "Marcar como resolvido" ao mecanismo real de resolução de ticket (mesmo fluxo da tab "Resolvidos"), com confirmação e toast.
- [ ] 42.6 Estado vazio (contato sem tags) usando o componente de empty state único (ver Etapa 50), nunca `return null` mudo.
- [ ] 42.7 Acessibilidade: `aria-label` nos Xs, foco retorna ao botão após remoção, `aria-pressed`/`aria-expanded` no seletor (WCAG AA).
- [ ] 42.8 Erros de RLS/escrita exibidos ao usuário (toast), eliminando falha silenciosa de tag.
- [ ] 42.9 Criar/estender testes unitários (render, remover tag, adicionar tag, resolver conversa).
- [ ] 42.10 Validação manual ponta-a-ponta: adicionar, remover e resolver via header e painel lateral.

### Critério de conclusão (checklist da etapa)
- [ ] Nenhum `onClick` ausente nas linhas 31/48/60 do ContactTagsContent; X e Adicionar persistem no banco.
- [ ] "Adicionar tag" e "Marcar como resolvido" executam fluxos reais (verificado manualmente e em teste).
- [ ] Testes novos passam no CI; nenhum `disabled` sem handler resta no ChatHeaderMenu.
- [ ] Verificação manual: erro de permissão aparece em toast, não silenciosamente.

## Etapa 43 — Stubs de vídeo: ChatHeader videochamada + ContactActionButtons

**Objetivo:** Remover os 2 stubs de chamada de vídeo (header e botão do contato), ativando via `useCalls`/SIP quando suportado ou ocultando com aviso quando não.

**Base:** findings-04.md:51 — `ChatHeader.tsx:246` videochamada hardcoded `undefined`, botão nunca ativa (A8); findings-04.md:90 — `ContactActionButtons.tsx:91` botão Vídeo é stub (`toast.info('Chamada de vídeo em breve')`); `:104` email via `window.location.hash` não-Router (A17).

### Subetapas
- [ ] 43.1 Verificar capacidade real do `useCalls`/SIP existente (findings-03) para vídeo; registrar veredito: vídeo suportado ou não.
- [ ] 43.2 ChatHeader: substituir `undefined` hardcoded (l.246) por condição real (capacidade + conversa ativa) e renderizar o botão só quando aplicável.
- [ ] 43.3 ContactActionButtons: substituir o toast "em breve" (l.91) por chamada real via `useCalls` ou ocultar o botão sob feature flag.
- [ ] 43.4 Corrigir email via `window.location.hash` (l.104) para navegação React Router (`useNavigate`), sem mudar comportamento visual.
- [ ] 43.5 Centralizar a decisão de exposição dos botões de vídeo em um único ponto (flag/config), evitando stubs espalhados.
- [ ] 43.6 `aria-label` nos botões de chamada e foco visível com tokens (nunca cor literal).
- [ ] 43.7 Testes unitários: botão oculto quando sem capacidade; chamada dispara handler real; email navega via Router.
- [ ] 43.8 Atualizar docs de estado (08-1) marcando videochamada como ATIVA ou OCULTA, com justificativa.
- [ ] 43.9 Validação manual: abrir conversa e confirmar que nenhum botão de vídeo morto aparece.
- [ ] 43.10 Se vídeo não suportado: registrar débito explícito (issue) em vez de deixar stub silencioso.

### Critério de conclusão (checklist da etapa)
- [ ] `ChatHeader.tsx:246` sem `undefined` hardcoded; botão condicionado a capacidade real.
- [ ] `ContactActionButtons.tsx:91` sem toast "em breve" — chamada real ou botão oculto por flag.
- [ ] Email (l.104) navega via React Router (teste confirma).
- [ ] Nenhum stub de vídeo visível em produção (verificação manual + grep).

## Etapa 44 — StickerManager: upload de compartilhadas + filtro Recentes

**Objetivo:** Corrigir o filtro "Recentes" (que não filtra nada) e destravar o upload de stickers compartilhados no picker.

**Base:** findings-04.md:79 — `StickerManager.tsx:84-91` filtro "Recentes" (`showRecent`) não filtra nada (A7); `StickerManager.tsx:34,180-192` `pendingUpload` nunca setado para compartilhadas — upload inacessível no picker (A8).

### Subetapas
- [ ] 44.1 Auditar a fonte real de recência de stickers (localStorage de uso ou tabela/bucket); se não existir, definir critério documentado (ex.: data de criação decrescente).
- [ ] 44.2 Implementar o filtro `showRecent` (l.84-91) usando a fonte de recência definida, com ordenação estável.
- [ ] 44.3 Setar `pendingUpload` ao selecionar arquivo em stickers compartilhadas (l.34, 180-192), destravando o preview de upload.
- [ ] 44.4 Completar o fluxo de upload para o bucket `stickers` (existente em settings/media-library, findings-06 14@L206-210) com estado de progresso real.
- [ ] 44.5 Exibir erro visível (toast acessível) em falha de upload/tamanho/tipo — sem `catch {}` silencioso.
- [ ] 44.6 Validar tipo/tamanho antes do upload (reusar validação de arquivos do projeto, sem duplicar lógica).
- [ ] 44.7 Acessibilidade: input file com `aria-label`, foco gerenciado após upload, grid navegável por teclado.
- [ ] 44.8 Estender `StickerTypes.test.ts`/novos testes: filtro Recentes, fluxo de upload compartilhado, erro de validação.
- [ ] 44.9 Validação manual: upload de sticker compartilhado aparece no picker e fica acessível.
- [ ] 44.10 Atualizar docs de estado (09/stickers) com o fluxo corrigido.

### Critério de conclusão (checklist da etapa)
- [ ] `showRecent` produz lista diferente/ordenada por recência (teste unitário).
- [ ] Upload de compartilhadas acessível pelo picker: seleção → preview → upload ao bucket `stickers`.
- [ ] Nenhum `pendingUpload` órfão; erro de upload visível em toast.
- [ ] Suíte de stickers passa no CI.

## Etapa 45 — ConversationItem: orquestrar variantes e eliminar monolito

**Objetivo:** Substituir o monolito ConversationItem (l.212-714) por um orquestrador que delega às variantes refatoradas, sem duplicação.

**Base:** findings-04.md:103 — `ConversationItem.tsx:212-714` monolito coexiste com variantes sem orquestrador (A3); `:117-156` TruncatedTooltip duplicado localmente (A4); `:463` cast `as never` (A12); findings-04.md:115 — barrel `conversation-list/index.ts` omite Comfortable, Compact, TruncatedTooltip, useConversationDisplay.

### Subetapas
- [ ] 45.1 Fazer diff monolito × variantes (Comfortable/Compact): listar comportamentos exclusivos do monolito que precisam ser portados.
- [ ] 45.2 Remover TruncatedTooltip duplicado (l.117-156) e importar de `TruncatedTooltip.tsx`.
- [ ] 45.3 Criar orquestrador `ConversationItem` que seleciona a variante por prop (densidade) e repassa props tipadas.
- [ ] 45.4 Portar para as variantes os comportamentos exclusivos identificados (retry badge, SLA, seleção, navegação).
- [ ] 45.5 Remover o cast `as never` (l.463) com tipagem real do evento/estado.
- [ ] 45.6 Completar o barrel `conversation-list/index.ts`: exportar Comfortable, Compact, TruncatedTooltip e `useConversationDisplay`.
- [ ] 45.7 Apagar as linhas órfãs do monolito após a migração (zero churn: remover só o bloco morto, não reescrever o arquivo).
- [ ] 45.8 Expandir `ConversationItem.test.tsx` (hoje 4 casos empty-handlers): densidades, retry/SLA, seleção e a11y (findings-04:116).
- [ ] 45.9 Validação visual das 3 densidades (comfortable/compact/monolito) em lista real.
- [ ] 45.10 Atualizar docs de estado (09 §4 barrel) com os exports completos.

### Critério de conclusão (checklist da etapa)
- [ ] `ConversationItem.tsx` não contém mais o bloco monolito 212-714 nem TruncatedTooltip local.
- [ ] Barrel `conversation-list/index.ts` exporta os 4 símbolos omissos (build + lint passam).
- [ ] `ConversationItem.test.tsx` cobre densidades, retry e a11y (≥10 casos).
- [ ] Validação manual: lista renderiza nas 3 densidades sem regressão visual.

## Etapa 46 — Falhas silenciosas: onArchive + EditContactDialog `_pendingData`

**Objetivo:** Fazer `/archive` falhar de forma visível quando sem prop e reativar o estado pendente do EditContactDialog para não perder edições em conflito.

**Base:** findings-04.md:69 — `useChatPanelHandlers.ts:548-553` `onArchive?.()` resolve silenciosamente sem prop (A4); findings-04.md:92 — `EditContactDialog.tsx:99` `_pendingData` nunca lido — edições perdidas em conflito (A10).

### Subetapas
- [ ] 46.1 Substituir `onArchive?.()` por chamada explícita que lança erro controlado (toast) quando a prop não existe.
- [ ] 46.2 Garantir que todos os call sites (ChatPanel e atalhos de teclado) passem `onArchive` real (useArchiveConversationActions) — ou desabilitem o atalho.
- [ ] 46.3 Ler `_pendingData` no EditContactDialog e reaplicar as edições locais quando a versão do servidor muda (optimistic lock via `update_contact_versioned`).
- [ ] 46.4 Exibir dialog de conflito com opções "manter minhas alterações" / "descartar" (reusar `ConflictResolutionDialog` existente, findings-06 15@L70).
- [ ] 46.5 Persistir as edições locais em estado/ref estável (não descartar em re-render).
- [ ] 46.6 Corrigir `useChatPanelHandlers.edit.test.ts` (mock incompleto, findings-04:128 A13) para exercitar o caminho real.
- [ ] 46.7 Criar teste de conflito do EditContactDialog: versão nova + `_pendingData` → resolução correta.
- [ ] 46.8 Acessibilidade: foco no dialog de conflito, `aria-describedby`, Escape fecha sem perder dados.
- [ ] 46.9 Validação manual: arquivar sem prop mostra erro; edição concorrente não perde texto.
- [ ] 46.10 Atualizar docs 08-2/09 com o novo contrato de `onArchive` e do conflito.

### Critério de conclusão (checklist da etapa)
- [ ] `onArchive` sem prop produz erro visível (teste cobre); nenhum `?.()` silencioso no caminho de arquivamento.
- [ ] `_pendingData` é lido e reaplicado; edições sobrevivem a conflito (teste + manual).
- [ ] Suíte `useChatPanelHandlers.edit` e novo teste de conflito passam no CI.
- [ ] Verificação manual: cenário de 2 abas editando o mesmo contato preserva ambas as edições com escolha explícita.

## Etapa 47 — ConversationContextMenu legível + navegação de histórico por UUID

**Objetivo:** Restaurar contraste do menu de contexto (texto ilegível sobre `bg-foreground`) e corrigir a navegação de histórico que passa data no lugar de UUID.

**Base:** findings-05.md:50 — `ConversationContextMenu.tsx:93,183,214` `bg-foreground` deixa texto invisível (A1); delete sem confirmação; atalhos decorativos; findings-05.md:51 — `ConversationHistory.tsx:199` passa `dayKey` (data) onde consumidor espera UUID (A4).

### Subetapas
- [ ] 47.1 Substituir `bg-foreground` (l.93/183/214) por tokens do design system (`bg-popover` + `text-popover-foreground`), nunca cor literal.
- [ ] 47.2 Revisar estados hover/ativo do menu com tokens e validar contraste WCAG AA (4.5:1 texto, 3:1 UI).
- [ ] 47.3 Adicionar confirmação ao delete de conversa (dialog `alert-dialog` padrão do projeto) antes da chamada destrutiva.
- [ ] 47.4 Implementar ou remover os atalhos decorativos do menu (decisão por item; nada de item visual sem efeito).
- [ ] 47.5 ConversationHistory: carregar/armazenar `conversationId` (UUID) junto do `dayKey` ao agrupar por dia.
- [ ] 47.6 `onSelectConversation` passa UUID real (l.199) e o tipo do callback passa a exigir UUID.
- [ ] 47.7 Atualizar o consumidor do callback para abrir a conversa por UUID (navegação/state do inbox).
- [ ] 47.8 Testes: contraste via tokens (snapshot de classes), delete com confirmação, `onSelectConversation` recebe UUID válido.
- [ ] 47.9 Validação manual: menu legível em tema claro/escuro; histórico clica e abre a conversa certa.
- [ ] 47.10 Atualizar docs 10/11 com o contrato corrigido de histórico.

### Critério de conclusão (checklist da etapa)
- [ ] Zero ocorrências de `bg-foreground` como fundo no ConversationContextMenu (grep).
- [ ] Contraste validado em claro/escuro (medição de contraste ≥4.5:1 nos textos do menu).
- [ ] Delete exige confirmação; atalhos do menu são funcionais ou removidos.
- [ ] `ConversationHistory` entrega UUID (teste unitário valida `onSelectConversation`).

## Etapa 48 — Ações de conversa: ChatPanel atalhos, BulkActionsToolbar, NextBestActionEngine

**Objetivo:** Dar efeito aos 4 atalhos vazios do ChatPanel, restaurar a animação de saída da BulkActionsToolbar e tornar os cards do NextBestActionEngine executáveis.

**Base:** findings-05.md:44 — `ChatPanel.tsx:278-283` 4 handlers de atalho `() => {}` (A10); findings-05.md:41 — `BulkActionsToolbar.tsx:33,42` `return null` antes do `AnimatePresence` (A14) + tipo `"connection"` não coberto; findings-05.md:95 — `NextBestActionEngine.tsx:28-31` `action` nunca atribuído (A3).

### Subetapas
- [ ] 48.1 `onNextConversation`/`onPrevConversation`: navegar pela ordem real da lista de conversas (`useRealtimeInbox`), com wrap-around.
- [ ] 48.2 `onArchive`: ligar ao handler real de arquivamento (useArchiveConversationActions) com feedback de sucesso/erro.
- [ ] 48.3 `onRefresh`: invalidar/refetch das queries do inbox (React Query), com indicador de carregamento.
- [ ] 48.4 Registrar os atalhos na ajuda de teclado (`KeyboardShortcutsHelp`), alinhado a `useInboxShortcuts`.
- [ ] 48.5 BulkActionsToolbar: mover o `return null` (l.33) para depois do `AnimatePresence` (l.42), restaurando a saída animada.
- [ ] 48.6 BulkActionsToolbar: cobrir o tipo `"connection"` no switch de ações (ou remover do tipo com decisão documentada).
- [ ] 48.7 NextBestActionEngine: atribuir `action` por card — "Responder agora" foca o compositor; "Follow-up" abre agendamento (ScheduleMessageDialog); "Escalar SLA" abre transferência (TransferDialog).
- [ ] 48.8 Acessibilidade: `aria-expanded`/`aria-label` nos botões de bulk e cards clicáveis com foco visível.
- [ ] 48.9 Testes: atalhos disparam handlers reais; bulk toolbar renderiza com `"connection"`; cards do engine executam callback.
- [ ] 48.10 Validação manual: atalhos Ctrl/Alt+seta navegam conversas; animação de saída visível; cards executam ações.

### Critério de conclusão (checklist da etapa)
- [ ] Nenhum `() => {}` nos 4 atalhos do ChatPanel (grep l.278-283); todos têm efeito verificado.
- [ ] Exit animation da BulkActionsToolbar dispara (validação manual + teste de render).
- [ ] Cards do NextBestActionEngine executam ações reais (teste unitário por card).
- [ ] Ajuda de teclado documenta os atalhos ativados.

## Etapa 49 — LinkPreview OG, MediaGallery download, ScheduleMessageDialog fuso

**Objetivo:** Corrigir 3 defeitos funcionais: preview de link sem OG tags, download da galeria sem spinner e agendamento interpretando data como UTC.

**Base:** findings-05.md:76 — `LinkPreview.tsx` sem fetch real de OG tags (PARCIAL); findings-05.md:79 — `MediaGallery.tsx:78` `_setIsDownloading` nunca chamado (A18); findings-05.md:107 — `ScheduleMessageDialog.tsx:181` preview `new Date("yyyy-MM-dd")` = UTC midnight (A5); findings-04.md:74 — `useChatScheduleMessage.ts:43` signed URL 7d invalida agendamentos longos (A5).

### Subetapas
- [ ] 49.1 LinkPreview: implementar fetch real de OG tags (título/descrição/imagem) com timeout e AbortSignal, via caminho servidor/edge ou proxy já existente — sem fetch direto de URL arbitrária do bundle.
- [ ] 49.2 Sanitizar HTML retornado com DOMPurify (padrão do projeto) antes de renderizar; validar protocolo http(s).
- [ ] 49.3 Estados: carregando (skeleton), erro (fallback para domínio da URL) e sem OG (não renderiza card vazio).
- [ ] 49.4 Cache de previews (memória/`linkPreviewUtils.ts`) para evitar refetch a cada render.
- [ ] 49.5 MediaGallery: chamar `_setIsDownloading` real (l.78) durante o download e resetar ao concluir/errar.
- [ ] 49.6 MediaGallery: spinner de download acessível (`aria-busy`) e toast de erro de download.
- [ ] 49.7 ScheduleMessageDialog: converter "yyyy-MM-dd HH:mm" para datetime local com timezone explícita (date-fns-tz), corrigindo o desvio UTC-3.
- [ ] 49.8 Alinhar com `useChatScheduleMessage`: limitar agendamento ao prazo da signed URL (7d) com validação no dialog OU migrar mídia para URL permanente — decisão registrada.
- [ ] 49.9 Testes: `linkPreviewUtils` (parse/sanitize), `mediaUtils` (download state), agendamento (parse local × UTC).
- [ ] 49.10 Validação manual: URL genérica mostra título real; download mostra spinner; agendamento para amanhã 09:00 envia às 09:00 locais.

### Critério de conclusão (checklist da etapa)
- [ ] LinkPreview exibe título/descrição reais de URL externa (teste com fixture de OG).
- [ ] `_setIsDownloading` efetivamente altera o estado (teste) e o spinner aparece.
- [ ] Agendamento para hora local não desvia por fuso (teste com timezone fixada).
- [ ] Nenhuma URL arbitrária é fetcheada do bundle sem sanitização/timeout (revisão de código).

## Etapa 50 — Features mortas e consolidação: CRMAutoSync, sumários RLS, EmptyState único, páginas órfãs

**Objetivo:** Fechar a fase resolvendo as 4 pendências transversais: CRMAutoSync (RPC stub), RLS de `conversation_summaries`, unificação dos 5 sistemas de empty state + barrel quebrado e triagem das 128 páginas órfãs.

**Base:** findings-05.md:43 — `CRMAutoSync.tsx` RPC `sync_to_crm` é stub RAISE P0001, `catch {}` silencia, `sentiment` hardcoded (A2); findings-04.md:111 — `conversationSummaryStorage.ts:14-19` RLS de INSERT/UPDATE ausente p/ não-admins (A1); findings-06.md:56 — 5 implementações paralelas de Empty State (13@L397-401) + findings-06.md:36 — barrel `empty-states.tsx` quebrado (13@L296); pendencias-consolidadas.md:8-9 — 128 páginas órfãs não roteadas, 16 com `return-null`/empty-handlers (findings-01 L748-888).

### Subetapas
- [ ] 50.1 CRMAutoSync: decidir entre implementar o RPC `sync_to_crm` real (com contrato de payload) ou desativar a UI com banner de "indisponível" — decisão registrada em doc.
- [ ] 50.2 Remover o `catch {}` silencioso do CRMAutoSync: erro visível em toast acessível em qualquer falha.
- [ ] 50.3 Substituir `sentiment` hardcoded `'neutral'` pela análise real disponível (campo de sentimento da conversa) ou remover o envio do campo.
- [ ] 50.4 Criar migration de RLS para `conversation_summaries` (INSERT/UPDATE p/ `authenticated` no próprio workspace/conversa acessível), seguindo as policies existentes do schema.
- [ ] 50.5 conversationSummaryStorage: fallback para armazenamento local quando a escrita falhar (não perder o sumário gerado), com aviso discreto.
- [ ] 50.6 Eleger um único componente de empty state (`empty-states/` ContextualEmptyState) e migrar os consumidores dos outros 4 (EmptyState, GenericEmptyState, empty-state, UnifiedEmptyState) — sem reescrever páginas inteiras, só o import.
- [ ] 50.7 Corrigir o barrel `empty-states.tsx`: eliminar o conflito de nome `EmptyState` e re-exportar do módulo canônico; remover o barrel duplicado só se ficar sem consumidores.
- [ ] 50.8 Triagem das 128 páginas órfãs: classificar as 16 com `return-null`/empty-handlers em IMPLEMENTAR / ROTEAR / REMOVER, com veredito por página registrado (findings-01 L748-888).
- [ ] 50.9 Executar a triagem: remover páginas mortas confirmadas, rotear as vivas ou implementar os empty-handlers das 16 — um commit por página, sem churn colateral.
- [ ] 50.10 Fechamento da fase: rodar a suíte completa (vitest + lint + typecheck), atualizar docs de estado 08-1/09/10-12 e registrar débitos remanescentes (ex.: issue para RPC de CRM se desativado).

### Critério de conclusão (checklist da etapa)
- [ ] CRMAutoSync executa RPC real ou está oculto com banner; zero `catch {}` silencioso no arquivo.
- [ ] Migration de RLS de `conversation_summaries` aplicada e validada com `SET ROLE` (não-admin consegue salvar sumário).
- [ ] 5 sistemas de empty state reduzidos a 1 canônico; barrel `empty-states.tsx` sem conflito de nome.
- [ ] 16 páginas com `return-null`/empty-handlers classificadas e resolvidas; veredito das 128 registrado em doc.
- [ ] Fase 5 completa: suíte CI verde, docs de estado atualizados, débitos remanescentes com issue.


## Resumo

- **10 etapas** cobrindo os 21 achados de UI do inbox: 4 stubs da MessageHoverToolbar, tags decorativas (ContactTagsContent/ChatHeaderMenu), 2 stubs de vídeo, StickerManager, ConversationItem monolito + barrel, onArchive/_pendingData, menu ilegível + histórico por UUID, atalhos vazios + BulkActions + NextBestActionEngine, LinkPreview/MediaGallery/ScheduleMessageDialog e consolidação final (CRMAutoSync, RLS de sumários, EmptyState único, 128 páginas órfãs).
- **100 subetapas** com regras de zero churn (edição cirúrgica), tokens de design (nunca cor literal) e WCAG AA em toda interação nova.
- **50 checklists verificáveis** (3-5 itens cada) cobrindo grep, testes CI, validação manual e contraste.
- Toda etapa tem base real em findings-04/05/06 ou pendencias-consolidadas com arquivo:linha; nenhuma pendência inventada.
- Dependências entre etapas: 42 depende do empty state único (50.6) apenas para o estado vazio — ordem flexível; 48.7 reusa ScheduleMessageDialog (49.7) e TransferDialog.


---
