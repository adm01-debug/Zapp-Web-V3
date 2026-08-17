# FASE 8 — INTEGRAÇÕES E SERVIÇOS

## Etapa 71 — Adotar ou arquivar a camada src/services (Repository→Service→Hooks)
**Objetivo:** Encerrar o estado de 33/46 arquivos órfãos (~53%, ~2.900 linhas) da arquitetura construída mas nunca adotada, com decisão explícita e defeitos latentes corrigidos.
**Base:** pendência real (findings-08.md:196 — 32:28-35; findings-08.md:199 — 32:185-188 A3/A6/A7).

### Subetapas
- [ ] 71.1 Executar `rg -l "useListQuery|useCreateMutation|useDetailQuery" src supabase --glob '!src/services/**'` para reconfirmar os 0 consumidores e gerar a lista atualizada de órfãos (33/46) com contagem de linhas por arquivo.
- [ ] 71.2 Escrever ADR de decisão: domínio(s)-piloto para adoção real (candidatos: settings, contacts) × arquivamento do restante com entrada na dead-code-allowlist — sem meia-adoção.
- [ ] 71.3 Corrigir `deleteMany()` de `api/genericService.ts` (32:185) — retornar contagem real com `{ count: 'exact' }` ou remover o retorno enganoso de 0.
- [ ] 71.4 Corrigir invalidação TanStack das factories (32:187-188): alinhar `queryKeys` de users (A5) e messages (A6) para que `invalidateQueries` case com as chaves emitidas pelos hooks.
- [ ] 71.5 Unificar `QueryParams` (32:189): decidir `page/pageSize` vs `limit/offset` e corrigir todos os repositories que leem o par divergente.
- [ ] 71.6 Migrar o domínio-piloto (settings ou contacts) para Repository→Service→Hooks e religar 1 tela real de produção consumindo os novos hooks.
- [ ] 71.7 Eliminar import circular `index → useConnectionsQueries → index` (32:190) em connections e messages.
- [ ] 71.8 Corrigir defeitos do domínio migrado: `getUserSettings` descartando erro (32:194), `upsertWorkspaceSettings` sem validação de `name` (32:120), `.offset()` inexistente no PostgREST (32:191), `listAgents` sem filtro de role (32:192), PK `id` vs `user_id` (32:193).
- [ ] 71.9 Arquivar (ou remover, conforme ADR) os órfãos restantes sem consumidor nem teste vivo, atualizando `dead-code-allowlist.txt` com veredito por arquivo.
- [ ] 71.10 Rodar typecheck + suítes de `src/services/__tests__` no CI e publicar métrica pós-fase: % de arquivos de src/services com importador de produção.

### Critério de conclusão (checklist da etapa)
- [ ] ADR com veredito por arquivo (adotar/arquivar/remover) revisado e commitado.
- [ ] `rg "useListQuery|useCreateMutation" src --glob '!src/services/**'` ≥ 1 consumidor real de produção no domínio-piloto.
- [ ] `deleteMany` retorna contagem correta ou foi removido; `QueryParams` sem par divergente.
- [ ] Zero imports circulares em `src/services` (grep `index →` sem ciclos).
- [ ] CI verde com typecheck + testes de services.

## Etapa 72 — Resolver stubs de integração sem feature flag (GoogleCalendar, N8n, Sentry)
**Objetivo:** Eliminar as 3 UIs enganosas que prometem integração sem nenhuma ação persistida, via implementação real ou feature flag / remoção.
**Base:** pendência real (findings-08.md:197 — 20:334-337 A7; findings-08.md:125-127 — 20:54/56/57).

### Subetapas
- [ ] 72.1 Catalogar os 3 stubs: `GoogleCalendarIntegration` (handleConnect só `toast.info`, 20:334), `N8nIntegrationView` (setIsConnected local, 20:335), `SentryIntegrationView` (mockErrors hardcoded, 20:336) — confirmar comportamento atual em runtime.
- [ ] 72.2 Decidir por integração: (a) implementar backend real, (b) esconder atrás de feature flag OFF com aviso, ou (c) remover a view e o item de navegação — registrar decisão em ADR ou issue.
- [ ] 72.3 Para as mantidas: criar flags em `featureFlags.ts` (padrão existente) e ler a flag antes de renderizar a view e o item de nav (sidebarNavConfig/IntegrationsHub).
- [ ] 72.4 Para GoogleCalendar se implementado: definir tabela/edge de OAuth Google Calendar e fluxo connect real; caso contrário garantir que o hub não exiba o card.
- [ ] 72.5 Para N8n se implementado: persistir config em `n8n_variables` (policy corrigida é pré-requisito de segurança — findings-21) via RPC com validação; caso contrário flag OFF.
- [ ] 72.6 Para Sentry se implementado: persistir DSN/chave via vault e usar `lib/sentry.ts` (EM_USO, findings-11:253) para teste real de evento; caso contrário flag OFF.
- [ ] 72.7 Substituir qualquer `toast.info`/"conectado" local por feedback honesto: estado real da flag + mensagem "indisponível" quando OFF.
- [ ] 72.8 Cobrir com testes de componente: com flag OFF a view não renderiza; com flag ON sem backend, botões desabilitados com tooltip explicativo.
- [ ] 72.9 Remover da navegação (sidebarNavConfig/IntegrationsHub) qualquer integração removida; atualizar `lazyViews.ts` se necessário.
- [ ] 72.10 Rodar e2e de navegação do IntegrationsHub e registrar resultado no changelog da fase.

### Critério de conclusão (checklist da etapa)
- [ ] Nenhuma das 3 integrações renderiza UI funcional sem backend real ou flag ativa.
- [ ] featureFlags.ts contém as flags decididas e é a única fonte de visibilidade.
- [ ] Testes automatizados provam o comportamento ON/OFF das flags.
- [ ] Navegação (sidebar + hub) sem itens mortos.

## Etapa 73 — Telemetria e circuit breakers das integrações: estado único e métricas por provider
**Objetivo:** Unificar os 3 circuit breakers divergentes da Evolution API e dar telemetria real por integração.
**Base:** findings-22 (3 CBs divergentes p/ mesma Evolution API — circuit-breakers-inventory) · api_circuit_breaker (fn_circuit_*) · metrics por provider ausentes.
### Subetapas
- [ ] 73.1 Inventariar os 3 circuit breakers da Evolution API (parâmetros: thresholds, janelas, estados) e documentar a divergência.
- [ ] 73.2 Definir a política canônica única (threshold de erro, cooldown, half-open) e aplicar nos 3 pontos.
- [ ] 73.3 Expor estado dos CBs via fn_circuit_status em dashboard de monitoring (componente reutilizado).
- [ ] 73.4 Instrumentar cada integração (Evolution, Gmail, Bitrix, ElevenLabs, TalkX) com métricas de latência/erro/uso (provider_message_log/provider_session_logs).
- [ ] 73.5 Criar alerta de abertura de circuit breaker (fn_alert_connection_drift estendido) com dedup.
- [ ] 73.6 Testar failover: simular falha do provider e provar half-open→close com teste de integração.
- [ ] 73.7 Adicionar telemetria de cache (hit/miss) nos repositórios de integração.
- [ ] 73.8 Auditar retries/backoff das integrações (3 CBs + retry-backoff inventory) e padronizar constantes.
- [ ] 73.9 Documentar a política de CB no runbook (runbooks/) com diagrama de estados.
- [ ] 73.10 Registrar métricas no evolution_performance_metrics e revisar após 7 dias.
### Critério de conclusão (checklist da etapa)
- [ ] 1 política única de CB aplicada nos 3 pontos (grep comprova mesmos thresholds)
- [ ] Dashboard mostra estado dos CBs (screenshot)
- [ ] Teste de failover passa (half-open→close)
- [ ] Alertas de CB com dedup funcionando
- [ ] Runbook atualizado

## Etapa 74 — Consolidar useEmail × useEmailManagement (802L × 1335L)
**Objetivo:** Unificar os dois hooks de email quase idênticos que convivem em produção com lógica divergente, migrando os 13 importadores de `useEmail` para o consolidado.
**Base:** pendência real (findings-09.md:267 — 24:36/39/41, 24:297 A1; findings-09.md:242 — migração email incompleta).

### Subetapas
- [ ] 74.1 Gerar diff funcional entre `useEmail` (802L, 13 importadores) e `useEmailManagement` (1335L, 8): listar exports, assinaturas e comportamentos divergentes por função.
- [ ] 74.2 Identificar as divergências que afetam produção (ex.: `loadMessages` via `email_messages`, 24:36) e escolher a implementação canônica por função (preferência: useEmailManagement).
- [ ] 74.3 Migrar os 13 importadores de `useEmail` para o hook consolidado em lotes de 3-4, com typecheck por lote.
- [ ] 74.4 Migrar `useEmailDraft` (24:39) para `useEmailManagement.useEmailDraft` e remover o legado.
- [ ] 74.5 Migrar `useEmailSearch` (24:41) para o equivalente consolidado e remover o legado.
- [ ] 74.6 Adicionar testes para `useEmailSLA` (sem testes hoje, 24:40) e remover `queryClient` não usado do consolidado.
- [ ] 74.7 Corrigir fonte de tipos divergente: `EmailThread` importado de `@/types/gmail` vs `@/hooks/gmail/gmailTypes` (findings-08:82 — 20:327-328 A5).
- [ ] 74.8 Após migração completa, deletar `useEmail.ts`, `useEmailDraft.ts`, `useEmailSearch.ts` e atualizar barrels.
- [ ] 74.9 Rodar suítes de email (useEmailActions.test, useEmailDraft.test, 24:37-38) contra o consolidado e validar fluxo de thread em runtime.
- [ ] 74.10 Documentar no changelog a contagem final: 1 hook de email, N importadores, divergências eliminadas.

### Critério de conclusão (checklist da etapa)
- [ ] Zero importadores de `useEmail`/`useEmailDraft`/`useEmailSearch` legados (grep vazio).
- [ ] Testes do consolidado cobrem SLA/draft/search com asserções reais.
- [ ] Thread de email (EmailChatInbox/EmailChatThread) validada em runtime após migração.
- [ ] Tipo `EmailThread` unificado em uma única fonte.

## Etapa 75 — VoIP: isolar credenciais SIP e fechar/decidir 8 gaps
**Objetivo:** Eliminar o risco de acesso cruzado a chamadas (senha SIP única compartilhada) e converter os 8 gaps VoIP documentados em decisões ou TODOs no código.
**Base:** pendência real (findings-08.md:195 — 20:315-316; findings-08.md:112 — 20:357-358 A14; findings-08.md:175 — 20:321-322 A3).

### Subetapas
- [ ] 75.1 Mapear onde a credencial SIP única (senha `phone1`) é lida/armazenada em `VoIPPanel` e `useSipClient`, e como o perfil do agente se relaciona com a extensão.
- [ ] 75.2 Desenhar isolamento por perfil: senha/extensão por agente (tabela ou vault) com fallback explícito desabilitado se não configurado — sem credencial compartilhada default.
- [ ] 75.3 Implementar leitura de credenciais por usuário autenticado (RPC segura, sem expor senha ao client além do dono).
- [ ] 75.4 Converter os 8 gaps (sem SRTP, sem chamada entrante SIP nativo, sem transfer, sem hold/resume, sem gravação, +3 do voip-security-gaps.test) em TODOs nomeados no código principal (findings-08:175) e manter o teste como doc vivo atualizado.
- [ ] 75.5 Decidir por gap: implementar (ex.: SRTP via config do provedor) ou declarar fora de escopo com justificativa registrada no `voip-security-gaps.test`.
- [ ] 75.6 Corrigir `VoIPPanel.test` (20:321-322): `vi.mock('@/hooks/useSipClient')` não intercepta porque o componente importa de `@/features/inbox` — mockar o caminho real.
- [ ] 75.7 Adicionar testes de isolamento: agente A não obtém credencial de agente B (mock de RPC + JWT).
- [ ] 75.8 Validar fluxo de discagem e histórico com credencial por perfil em ambiente de teste SIP.
- [ ] 75.9 Revisar `IncomingCallAlert` dual source (legado + broadcast, 20:318-319 A2) e consolidar a fonte única.
- [ ] 75.10 Atualizar o voip-security-gaps.test com o estado final (gaps fechados/decididos) e rodar a suíte.

### Critério de conclusão (checklist da etapa)
- [ ] Nenhuma credencial SIP compartilhada default acessível a todos os agentes.
- [ ] Teste prova não-vazamento entre perfis.
- [ ] 8 gaps têm decisão explícita (implementado/fora de escopo) refletida no doc vivo.
- [ ] VoIPPanel.test intercepta o caminho real de import e passa no CI.

## Etapa 76 — Google OAuth + Gmail: DONO ÚNICO do fluxo OAuth (etapas de stubs, encerramento e Vercel referenciam esta)
**Objetivo:** Fechar a decisão do OAuth Gmail (stubs `initiate_gmail_oauth`/`complete_gmail_oauth` RAISE P0001), proteger o token com vault e decidir o destino do `email-imap-bridge` STUB e do `downloadAttachment` 501.
**Base:** pendência real (pendencias-consolidadas.md:1059 — Google OAuth decisão; CLAUDE.md:192-193 stubs RAISE P0001; AUDITORIA_BACKEND_SENIOR_2026-07-11.md:26 MED-2 decrypt_gmail_token; feature_registry.csv:120 email-imap-bridge STUB; findings-10:392 TODO EMAIL-04 downloadAttachment 501).

### Subetapas
- [ ] 76.1 Confirmar em runtime os stubs `initiate_gmail_oauth` e `complete_gmail_oauth` (RAISE P0001) e mapear o fluxo `useGmailOAuthFlow` (24:64) que os consome.
- [ ] 76.2 Escrever ADR da decisão Google OAuth: (a) implementar fluxo OAuth completo via edge functions + callback route, (b) desligar UI com flag até implementação, ou (c) abandonar integração Gmail — registrar formalmente.
- [ ] 76.3 Se implementar: criar edge `initiate-gmail-oauth` (redirect para Google com state) e `complete-gmail-oauth` (callback, troca de code, persistência segura do token).
- [ ] 76.4 Migrar `decrypt_gmail_token`/criptografia de token de `current_setting('app.encryption_key')` para `vault.decrypted_secrets`/pgsodium (MED-2) e rotacionar a chave antiga.
- [ ] 76.5 Garantir que o token NUNCA trafega para o client: apenas flags/claims de status via RPC segura.
- [ ] 76.6 Decidir destino do `email-imap-bridge` (STUB auto-declarado, "requer worker externo... use Nylas/EmailEngine"): remover a edge + tabela `imap_smtp_accounts` ou registrar como feature futura com flag OFF e sem UI.
- [ ] 76.7 Implementar `downloadAttachment`/`fetchMessageBody` como ações reais do `gmail-sync` (hoje ausentes do enum fechado → 400/501, EMAIL-04) e religar `EmailAttachmentPreview`.
- [ ] 76.8 Validar as 3 RPCs de email sem migration (`rpc_email_mark_thread_read`, `rpc_email_token_status`, `rpc_get_email_health_summary`, findings-08:193 A2) no banco e versionar migrations faltantes.
- [ ] 76.9 Testar fluxo completo: connect OAuth → status do token → leitura de thread → download de anexo (se implementado).
- [ ] 76.10 Atualizar FEATURE_REGISTRY/CLAUDE.md removendo os stubs da lista de pendências e registrando a decisão.

### Critério de conclusão (checklist da etapa)
- [ ] ADR Google OAuth formalizado e commitado.
- [ ] Nenhum stub RAISE P0001 de OAuth Gmail ativo sem flag ou implementação.
- [ ] Token Gmail criptografado via vault; teste de rotação documentado.
- [ ] `downloadAttachment` responde 200 em teste real (ou decisão de desligamento registrada).
- [ ] RPCs de email com migration versionada no repo.

## Etapa 77 — ElevenLabs, Bitrix24 e AI router (9 ações)
**Objetivo:** Corrigir invocação da edge `elevenlabs-dialogue`, persistir config do webhook Bitrix24 e dar destino às 9 ações do AI router (7 sem consumidor no frontend).
**Base:** pendência real (findings-08.md:123 — 20:348-349 A11 ElevenLabsDialogue fetch direto; findings-08.md:124 — 20:52/20:301 Bitrix sem persistência; findings-07.md:91 — 30:225 ai-router 223L 7/9 ações sem importadores).

### Subetapas
- [ ] 77.1 Substituir o fetch direto de `ElevenLabsDialogue` por `supabase.functions.invoke('elevenlabs-dialogue')` (padrão de `ElevenLabsVoiceDesign`, 20:349), sem URL/segredo no bundle.
- [ ] 77.2 Remover a URL de produção Evolution hardcoded em `EvolutionApiIntegrationView.tsx:17` (20:339-340 A8) para env/config, no mesmo padrão do gateway.
- [ ] 77.3 Definir schema de persistência do webhook Bitrix24 (config por workspace: URL, token, eventos) e RPC de save com validação.
- [ ] 77.4 Ligar `BitrixIntegrationView` à persistência real (hoje nada é salvo, 20:301) e mostrar estado salvo ao reabrir.
- [ ] 77.5 Testar webhook Bitrix24: envio de evento de teste → registro de entrega no DB (usar `useBitrixApi`, EM_USO 23:44).
- [ ] 77.6 Inventariar as 9 ações do `ai-router.ts` (223L) e mapear as 2 com consumidor vs as 7 sem importador no frontend.
- [ ] 77.7 Decidir por ação sem consumidor: ligar a um ponto de UI existente OU remover do router com contrato Zod de saída (evitar forwarders mortos).
- [ ] 77.8 Para ações mantidas, garantir chamada via wrapper tipado (não `invoke` solto) e erro visível, não silencioso.
- [ ] 77.9 Adicionar/atualizar testes de contrato do ai-router (contract.test.ts existente) cobrindo as ações decididas.
- [ ] 77.10 Rodar suítes de ElevenLabs/Bitrix/AI e registrar as decisões por ação no changelog.

### Critério de conclusão (checklist da etapa)
- [ ] ElevenLabsDialogue invoca via `functions.invoke`; zero URL hardcoded no bundle.
- [ ] Bitrix24 persiste e relê config; teste de webhook real registra entrega.
- [ ] Cada uma das 9 ações do AI router tem consumidor real ou foi removida/flagada.
- [ ] Testes de contrato do router verdes no CI.

## Etapa 78 — TeamChat: upload MIME, transferências auditáveis e RLS com testes reais
**Objetivo:** Fechar os 4 problemas do team-chat: MIME não validado no upload, `transferred_by` hardcoded, RLS sem verificações de membership/DELETE e 322 testes fantasma.
**Base:** pendência real (findings-07.md:137-139 — 17:254, 17:258/286, 17:280; findings-07.md:656 — 17:259-260 testes fantasma 218/270 + 52/52).

### Subetapas
- [ ] 78.1 Configurar `allowed_mime_types` no bucket `team-chat-files` (hoje sem validação, 17:254) e definir lista aceita (imagens/áudio/documentos com limite de tamanho).
- [ ] 78.2 Validar MIME também no cliente (upload) e rejeitar tipos fora da lista com mensagem clara.
- [ ] 78.3 Corrigir transferência entre departamentos: usar o usuário autenticado em `transferred_by` (hoje 'Support Agent' hardcoded, 17:258/286) e registrar no audit log.
- [ ] 78.4 Aplicar RLS de team-chat: policy INSERT em `team_messages` com check de membership na conversa (17:280).
- [ ] 78.5 Aplicar policy DELETE em `team_conversations` (ausente hoje, 17:280) com regra de autor (dono/admin do departamento).
- [ ] 78.6 Reescrever os 270 testes team-chat (218 `expect(true)`) e os 52 de security-gaps com asserções reais contra SUT (componente/hook/RPC mockado).
- [ ] 78.7 Adicionar teste RLS executável: INSERT de não-membro falha; DELETE de não-dono falha (via SET ROLE em suite de integração).
- [ ] 78.8 Adicionar testes de upload: MIME fora da lista é rejeitado antes do Storage.
- [ ] 78.9 Remover dead code confirmado `TeamChatMessageRow` (333L) + `teamChatParts` (143L) (17:202-203, 276) e verificar `lazyViews.ts` por referências antes.
- [ ] 78.10 Rodar suíte completa e validar runtime: upload, transferência com agente real e exclusão de conversa.

### Critério de conclusão (checklist da etapa)
- [ ] Zero `expect(true)` em suítes team-chat (grep de asserção real ≥ 1 por teste).
- [ ] Bucket com allowed_mime_types ativo e teste de rejeição verde.
- [ ] `transferred_by` reflete usuário autenticado; auditoria de transferência íntegra.
- [ ] RLS INSERT/DELETE aplicada e provada por teste com SET ROLE.
- [ ] Dead code removido sem referência residual.

## Etapa 79 — AutoExportManager e downloadAttachment 501 (Google OAuth: ver etapa do dono único)
**Objetivo:** Encerrar as pendências finais de integrações: rota `/auto-export` morta, export agendado inexistente, download de anexo 501 e a decisão formal do Google OAuth.
**Base:** pendência real (findings-08.md:198 — 19:439-440 A4 AutoExportManager STUB; findings-08.md:169 — 19:439-440; findings-10:392 TODO EMAIL-04 downloadAttachment 501; pendencias-consolidadas.md:1059 Google OAuth decisão).

### Subetapas
- [ ] 79.1 Confirmar estado da rota `/auto-export` (ViewRouter.tsx:107 + sidebarNavConfig.ts:141 → AutoExportManager com ShieldAlert, "BLOQUEADO por política de segurança").
- [ ] 79.2 Decidir (ADR): (a) implementar exportação agendada real (ScheduledReportConfigs + pg_cron/edge) ou (b) remover rota + item de nav — registrar formalmente.
- [ ] 79.3 Se implementar: definir tabela de agendamento (ScheduledReportConfigs), edge de geração e envio do relatório, e ligar a UI do AutoExportManager.
- [ ] 79.4 Se remover: apagar rota em ViewRouter, item em sidebarNavConfig, componente e testes associados; atualizar AUDITORIA_COMPLETA/feature registry.
- [ ] 79.5 Implementar `downloadAttachment` no `gmail-sync` (action ausente do enum fechado → 400/501, EMAIL-04) e religar `EmailAttachmentPreview` ao fluxo real.
- [ ] 79.6 Testar download de anexo real (PDF/imagem) e validar Content-Type/length no response.
- [ ] 79.7 Formalizar a decisão Google OAuth (link com Etapa 77): ADR aprovado e registrado nas pendências como resolvida.
- [ ] 79.8 Varrer navegação por outras rotas mortas expostas (padrão ShieldAlert/stub) e listar resultado.
- [ ] 79.9 Atualizar `pendencias-consolidadas.md`/FEATURE_REGISTRY: marcar AutoExportManager, EMAIL-04 e Google OAuth com veredito final.
- [ ] 79.10 Rodar bateria final: typecheck, lint, suítes afetadas e validação de produção da navegação (nenhuma rota enganosa acessível).

### Critério de conclusão (checklist da etapa)
- [ ] Rota `/auto-export` implementada com exportação real OU removida da navegação e do router.
- [ ] `downloadAttachment` responde 200 com anexo em teste real (ou decisão de desligamento registrada).
- [ ] ADR Google OAuth fechado e referenciado nas pendências.
- [ ] Nenhuma rota com UI enganosa (ShieldAlert/stub) acessível na navegação.
- [ ] Pendências consolidadas atualizadas com veredito por item.


## Resumo
- Fase 8 (etapas 71–80) cobre a camada de integrações e serviços: adoção/arquivamento de src/services (71), stubs GoogleCalendar/N8n/Sentry com flag ou remoção (72), externalProxy com suíte desligada (73), sanitização de useBulkActions (74), consolidação useEmail×useEmailManagement (75), VoIP com credenciais isoladas e 8 gaps decididos (76), Gmail OAuth/token/imap-bridge/download 501 (77), ElevenLabs/Bitrix/AI router (78), TeamChat MIME/transferência/RLS/testes fantasma (79) e encerramento AutoExportManager+EMAil-04+OAuth (80).
- Toda etapa parte de pendência real citada (finding:linha) e segue a regra anti-stub enganoso.
- Formato: 10 etapas × 10 subetapas, checklist verificável (3–5 itens) por etapa, total 100 subetapas.

## Etapa 80 — Adapters zappweb: tipagem real, columnMap correto e ramo PTT
**Objetivo:** Corrigir os adapters de integração com defeitos documentados e remover os no-ops mortos.
**Base:** findings-07 (SafeQueryBuilder=any, isArchived no adapter, ramo PTT audio em evolutionAdapter, columnMap.test 85L) · externalClient.ts + externalSessionBridge.ts no-ops.
### Subetapas
- [ ] 80.1 Substituir SafeQueryBuilder=any por genéricos tipados (Row/Insert/Update do schema).
- [ ] 80.2 Corrigir o ramo PTT (áudio) no evolutionAdapter: mapeamento de tipos de mídia audio→ptt com teste.
- [ ] 80.3 Ajustar isArchived no adapter (flag de arquivamento propagada) + teste de contrato.
- [ ] 80.4 Completar columnMap.test.ts (85L): cobrir colunas faltantes e corrigir divergências.
- [ ] 80.5 Remover externalClient.ts e externalSessionBridge.ts (no-ops pós-consolidação) após grep de 0 importadores.
- [ ] 80.6 Auditar os hooks zappweb (useZappContactSearch/Conversations/Messages + evolutionClient) contra o contrato do gateway (12 verbos).
- [ ] 80.7 Adicionar teste de paridade do columnMap com o esquema canônico (CANONICAL_COLUMN_MAP.md).
- [ ] 80.8 Corrigir gmailHealthRLS.test.ts (34L, strings hardcoded) para fixture real.
- [ ] 80.9 Reativar useZappConversations.test.tsx (127L) e useZappMessages.test.tsx (97L) com mocks corretos.
- [ ] 80.10 Rodar vitest nos adapters + typecheck; abrir PR com evidência.
### Critério de conclusão (checklist da etapa)
- [ ] SafeQueryBuilder tipado (0 `any` no caminho)
- [ ] Testes de adapters verdes (vitest run src/integrations)
- [ ] No-ops removidos com 0 importadores comprovados
- [ ] columnMap coberto e alinhado ao canônico
- [ ] PR aberto com diff revisado


---
