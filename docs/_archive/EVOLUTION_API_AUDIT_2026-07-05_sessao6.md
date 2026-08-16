> **📜 DOCUMENTO HISTÓRICO** — Reflete o estado do sistema na data indicada. A arquitetura atual usa um único Supabase Self-Hosted com schema `zapp`. Veja [SCHEMA_REFERENCE.md](docs/SCHEMA_REFERENCE.md).

# 🔬 Auditoria Exaustiva — Evolution API (Sessão 6 — outage ativo + causa-raiz do falso-positivo)

> **Data:** 2026-07-05 (~00:20–01:15 UTC)
> **Escopo:** continuação das sessões 1–5 (`EVOLUTION_API_AUDIT_2026-07-03.md` até
> `_sessao5_wpp2.md`). Aquelas sessões já levaram infra, banco, índices, backups, cron e o
> contrato do webhook a 10/10 (fuzz de 8.640 cenários). Esta sessão foca em: (1) um outage
> **ativo agora**, não documentado nas sessões anteriores, e sua causa-raiz na camada de
> aplicação (não infra); (2) revisão exaustiva de código nas camadas que as sessões
> anteriores não cobriram em profundidade (hooks do front-end, proxy REST de 111 ações,
> handlers de webhook, funções/RLS do banco).
> **Método:** recon ao vivo via MCP (Evolution API, Portainer, Supabase self-hosted),
> leitura de código-fonte das funções PL/pgSQL diretamente do catálogo do Postgres (`pg_proc`),
> correlação de timestamps entre a API ao vivo e as tabelas de espelho, e um workflow de
> revisão adversarial (5 dimensões de código, cada achado verificado por um segundo agente
> cético antes de entrar neste relatório).

---

## 0. TL;DR

| # | Achado | Severidade | Estado |
|---|--------|:---:|--------|
| S6-1 | **Outage ativo**: `wpp2` e `wpp_pink_test` desconectadas (401) desde 2026-07-04 15:00:44Z e 13:39:07Z respectivamente — **~10h+ sem pareamento real** no momento desta auditoria. | 🔴 crítico | Requer QR físico (runbook §4) |
| S6-2 | **Causa-raiz do falso-positivo**: `public.fn_apply_connection_update()` marcava a instância `connected`/`health_status=ok` a partir de um **único** evento de webhook `connection.update` com `state:'open'`, sem debounce — e o Baileys emite esse pulso no início de CADA tentativa de handshake, mesmo quando a sessão foi invalidada e será rejeitada segundos depois. | 🔴 crítico | ✅ **Corrigido nesta sessão** (migração + deploy ao vivo) |
| S6-3 | **Health score enganoso**: `fn_system_health_score()` dava 20/20 para `wpp2_connection` (Grade A, 94,2%) usando uma janela de graça de 15min sobre `last_connected_at`, que herdava o falso-positivo do S6-2. | 🟠 alto | ✅ **Corrigido nesta sessão** |
| S6-4 | **Alertas críticos fechados indevidamente**: um lote de alertas (`pipeline_dead_man`, `qrcode_required`) foi marcado resolvido em `2026-07-05T00:13:09Z` com justificativas como *"auto-resolve: MCP offline (manutenção) — não falha de pipeline"* e *"wpp2 connected via phone-match reconcile"` — nenhuma bate com a lógica real de `fn_auto_resolve_alerts`/`fn_auto_resolve_baileys_alerts` (que nem mexe em `severity='critical'`), indicando fechamento manual sem verificação contra a API ao vivo. | 🔴 crítico (processo) | Novos alertas críticos reabertos nesta sessão; ver §3 |
| S6-5 | **Drift de schema**: `fn_system_health_score`, `fn_apply_connection_update`, `fn_reconcile_apply`, `fn_reconcile_dispatch`, `fn_auto_resolve_alerts`, `fn_auto_resolve_baileys_alerts` existem **apenas no banco ao vivo** — nenhuma tinha migração correspondente no repositório antes desta sessão. | 🟠 alto | Parcial: as 2 funções alteradas agora têm migração; as demais continuam sem (ver §5) |
| S6-6 | **Webhook nativo de erro sem assinatura**: `WEBHOOK_EVENTS_ERRORS_WEBHOOK` da Evolution aponta para o mesmo endpoint assinado do webhook de negócio, mas não envia `x-webhook-secret` — todo erro interno relatado pela própria Evolution (ex.: S6-7) é descartado com 401 antes de ser logado. | 🟡 médio | Documentado, não corrigido (ver §6) |
| S6-7 | **Crash upstream da Evolution**: `GET /chat/fetchPrivacySettings/{instance}` retorna 500 (`Cannot read properties of undefined (reading 'fetchPrivacySettings')`) quando chamado numa instância desconectada — bug no software da Evolution (upstream), não no nosso código; não encontramos nenhuma action nossa que chame esse endpoint. | 🟡 médio | Não corrigível no nosso repo — documentado |
| S6-8..N | Achados de revisão de código (hooks, proxy REST, handlers de webhook, RLS/funções) — ver §7. | vário | ver tabela §7 |

---

## 1. S6-1 — Outage ativo (linha do tempo)

| Quando (UTC) | Evento | Evidência |
|---|---|---|
| 2026-07-04 13:39:07 | `wpp_pink_test` desconecta, 401 genérico (`location: frc`) | `evo_instance_list` |
| 2026-07-04 15:00:44 | `wpp2` desconecta, 401 `conflict/device_removed` | `evo_instance_list` |
| 2026-07-04 23:49:10 | `fn_system_health_score()` reporta `wpp2_connection: connected 20/20`, Grade A 94,2% | `evo.evolution_alerts` (`health_score_degraded`, o próprio score já mascarava o problema) |
| 2026-07-05 00:13:09 | Lote de alertas críticos (`pipeline_dead_man` ×4, `qrcode_required` ×2) marcado resolvido em bloco, com justificativas não rastreáveis a nenhuma função automática real | `evo.evolution_alerts` |
| 2026-07-05 00:20–01:00 | **Esta sessão**: `evo_status`/`fetchInstances` ao vivo confirmam `close`/401 em ambas as instâncias, com `disconnectionAt` **inalterado** desde os timestamps acima — ou seja, a linha nunca voltou a autenticar de fato, apesar do dashboard/health-score terem mostrado "conectado" em vários pontos entre os dois horários | `evo_status`, `evo_instance_list` (múltiplas chamadas ao longo da sessão) |
| 2026-07-05 ~00:42–00:48 | Enquanto a auditoria rodava, capturamos **ao vivo** o ciclo do bug S6-2: `disconnected_at=00:42:27Z` → `last_connected_at=00:44:44Z` (2min17s depois) → instância seguiu marcada `connected/ok` seguindo por vários minutos, enquanto `fetchInstances` nunca deixou de reportar `close` | `public.whatsapp_connections`, `evo.evolution_webhook_events_v2` |

**Estado no fim desta sessão:** ambas as instâncias corrigidas para refletir a realidade
(`status='disconnected'`, `health_status='down'`) e dois novos alertas críticos abertos em
`evo.evolution_alerts` (ver §3). **A reconexão de fato exige escanear um QR code no
aparelho físico de cada linha — isso não pode ser automatizado via API/MCP** (mesma
limitação documentada nas sessões 3–5). Runbook em §4.

---

## 2. S6-2 — Causa-raiz: `fn_apply_connection_update` sem debounce

### 2.1 Como o bug se manifesta

`supabase/functions/_shared/evolution-webhook-handlers.ts::handleConnectionUpdate` delega
a decisão de status para a RPC `public.fn_apply_connection_update(p_event)`, documentada no
próprio código como *"single-source-of-truth"*. Essa função mapeia o `state` do evento
Baileys para `connected`/`connecting`/`disconnected`/etc. — e **qualquer** `state` que comece
com `'open'` virava `connected` imediatamente, sem checar se a conexão *permaneceu* aberta.

O Baileys emite um evento `connection.update` com `state:'open'` assim que o socket
estabelece a camada de transporte — **antes** da autenticação ser de fato aceita pelo
WhatsApp. Quando a sessão foi invalidada (401 `device_removed`/`conflict`, como é o caso
aqui), esse pulso `open` chega, e a rejeição definitiva vem segundos a minutos depois. Sem
debounce, cada pulso isolado bastava para marcar a instância inteira como `connected`/
`health_status='ok'`, apagando o sinal de outage.

### 2.2 Evidência capturada ao vivo durante esta sessão

```
public.whatsapp_connections (instance_name='wpp2'), antes do fix:
  disconnected_at    = 2026-07-05T00:42:27.075Z
  last_connected_at  = 2026-07-05T00:44:44.983Z   (2min17s depois do disconnect)
  status             = 'connected'
  health_status      = 'ok'
  health_reason      = null

evo.evolution_webhook_events_v2 (mesma janela):
  00:48:12.608Z  connection.update  {"data":{"wuid":"551146375517@...","state":"open"}}  status=processed

evo_status (Evolution API ao vivo, MESMO instante):
  connectionStatus = 'close'
  disconnectionReasonCode = 401
  disconnectionAt = '2026-07-04T15:00:44.421Z'   ← inalterado desde o dia anterior
```

Ou seja: no exato momento em que o banco dizia "conectado, saudável", a própria Evolution
API dizia "fechada, 401, sem mudança há 9+ horas". O `zapp.webhook_audit_log` mostra o
padrão de flapping ao vivo: eventos `connection.update` chegando a cada 1–7 minutos
(`00:29:19`, `00:33:34`, `00:40:52`, `00:41:58`×2, `00:42:16`×2, `00:42:27`×2, `00:43:04`,
`00:47:00`, `00:48:12`), a maioria deduplicada como `duplicate` mas alguns processados como
"novos" — cada `open` reabrindo a máscara de "saudável".

### 2.3 Fix aplicado

Migração
[`20260705005207_fix_apply_connection_update_flap_debounce.sql`](../supabase/migrations/20260705005207_fix_apply_connection_update_flap_debounce.sql):
`fn_apply_connection_update` agora exige que **não tenha havido uma desconexão registrada
nos últimos 10 minutos** antes de aceitar um `open` isolado como `connected` — caso
contrário, rebaixa para `connecting` (não confirmado) e registra o motivo em
`health_reason`. Deployado ao vivo e testado: o próximo evento `connection.update` com
`state:'open'` para uma instância com `disconnected_at` recente agora resulta em
`new_status:'connecting'`, `debounced:true`.

**Isto é uma mitigação, não uma garantia absoluta.** Um flap mais lento que 10 minutos
ainda pode escapar. A recomendação de médio prazo (não aplicada nesta sessão, requer mais
desenho): usar o poll periódico de `fn_reconcile_apply` (que consulta `fetchInstances` — a
fonte mais autoritativa) como corroboração obrigatória antes de qualquer `connected` vindo
só do caminho de webhook, em vez de um debounce baseado em tempo.

### 2.4 Correção dos dados já contaminados

As linhas de `wpp2` e `wpp_pink_test` em `public.whatsapp_connections` foram corrigidas
manualmente nesta sessão para `status='disconnected'`, `health_status='down'`, com
`health_reason` documentando a correção (auditável, não apaga histórico — apenas o estado
atual). Confirmado por nova chamada a `fn_system_health_score()`: `wpp2_connection` caiu de
`20/20 "connected"` para `0/20 "disconnected"`, e o score total caiu de 95 (A+) para 85,7
(A) — refletindo a realidade em vez de escondê-la.

---

## 3. S6-3/S6-4 — Health score e alertas fechados indevidamente

`fn_system_health_score()` tinha uma segunda camada do mesmo problema: mesmo que
`fn_apply_connection_update` não tivesse o bug, a heurística de pontuação aceitava
`last_connected_at > now() - 15 minutos` como prova de "efetivamente conectado" **para
qualquer estado atual**, inclusive `disconnected`. Corrigido na migração
[`20260705004526_fix_health_score_wpp2_false_positive.sql`](../supabase/migrations/20260705004526_fix_health_score_wpp2_false_positive.sql):
a janela de graça agora só vale quando o estado atual também é `connecting` (transitório
legítimo), e foi reduzida para 3 minutos.

Sobre os alertas fechados às `2026-07-05T00:13:09Z`: `fn_auto_resolve_alerts` só toca
`acknowledged` (não `resolved`) e explicitamente **exclui** `severity='critical'`;
`fn_auto_resolve_baileys_alerts` só mexe em alertas com `alert_type ILIKE '%baileys%'` e
também só ack, não resolve. Nenhuma das duas explica um `resolved_by` com texto narrativo
como *"auto-resolve: MCP offline (manutenção) — não falha de pipeline"* nos alertas
`pipeline_dead_man` (que reportavam corretamente **dias** sem mensagem da wpp2). Isso
indica um fechamento manual em lote, presumivelmente de uma sessão anterior, que classificou
alertas reais como ruído sem confirmar contra a API ao vivo. Não reescrevemos o histórico
(os registros antigos permanecem como estavam, para auditoria); em vez disso, abrimos dois
alertas novos e precisos nesta sessão (`evo.evolution_alerts`, `alert_type='qrcode_required'`,
`severity='critical'`, não reconhecidos, não resolvidos) para que o próximo operador que
olhar o painel veja o estado real.

**Recomendação de processo:** qualquer resolução em lote de alertas críticos deveria exigir
uma chamada de confirmação contra a API ao vivo (`evo_status`/`fetchInstances`) antes de
marcar `resolved=true` — não apenas inferir a partir de outra tabela do próprio banco, que
é exatamente o dado que estava errado.

---

## 4. Runbook — reconexão física (inalterado desde a sessão 5)

1. Abrir o Manager (`https://evolution.atomicabr.com.br/manager`) → instância `wpp2` (ou
   `wpp_pink_test`) → **Connect/QR Code**.
2. No celular da linha correspondente: WhatsApp → **Aparelhos conectados** → **Conectar
   aparelho** → escanear o QR.
3. Validar: `evo_status` retornando `state:'open'` **de forma estável por vários minutos**
   (não apenas um pulso) — com o fix do S6-2, o painel só vai marcar `connected` depois de
   10 minutos sem uma nova desconexão, então a confirmação definitiva demora um pouco mais
   que antes, mas é confiável.
4. **Atenção ao erro da sessão 5 (S5-1 do relatório anterior):** nunca digitar o UUID da
   instância no lugar do nome ao reconectar pela Manager UI — isso cria uma instância
   fantasma. O guard server-side de `evolution-api/index.ts` (PR #192) já bloqueia isso via
   API, mas a Manager UI nativa da Evolution não passa por esse proxy.

---

## 5. S6-5 — Drift: funções críticas sem migração no repositório

Antes desta sessão, uma busca em todo o repositório pelas seguintes funções — que
controlam **todo** o pipeline de reconciliação/alerta/health-score — não encontrou nenhuma
migração correspondente, apenas menções em relatórios de auditoria anteriores:

- `public.fn_system_health_score()` — agora capturada em
  `20260705004526_fix_health_score_wpp2_false_positive.sql` (com o fix).
- `public.fn_apply_connection_update()` — agora capturada em
  `20260705005207_fix_apply_connection_update_flap_debounce.sql` (com o fix).
- `public.fn_reconcile_apply()`, `public.fn_reconcile_dispatch()`,
  `public.fn_auto_resolve_alerts()`, `public.fn_auto_resolve_baileys_alerts()`,
  `public.fn_auto_resolve_media_alerts()`, `public.fn_alert_health_score_degraded()` —
  **continuam sem migração**. Não as alteramos nesta sessão (fora do escopo dos bugs
  investigados), mas isso significa que um `supabase db reset`/provisionamento novo a
  partir deste repositório **não recriaria** essas funções — o pipeline de alerta e
  reconciliação inteiro ficaria faltando.

**Recomendação:** uma sessão dedicada de "schema sync" deveria extrair o `pg_get_functiondef`
de toda função `public.fn_*`/`evo.fn_*`/`zapp.fn_*` que existe ao vivo mas não tem migração,
e commitar como uma migração única de baseline — não fizemos isso aqui para não misturar
dezenas de funções não relacionadas ao incidente investigado num único PR de auditoria.

---

## 6. S6-6/S6-7 — Achados menores (infra/upstream, não corrigidos)

**S6-6 (webhook nativo sem assinatura):** a Evolution está configurada com
`WEBHOOK_EVENTS_ERRORS_WEBHOOK=https://supabase.atomicabr.com.br/functions/v1/evolution-webhook`
— o mesmo endpoint do webhook de negócio (assinado por instância). Esse canal específico do
software da Evolution (relatório interno de erros 500) **não envia** o header
`x-webhook-secret`, então é sempre rejeitado com 401 `Missing webhook signature` pelo nosso
validador estrito — visto ao vivo nos logs do container (`evolution_evolution`) tentando
reportar um erro interno e recebendo 401 de volta. Isso significa que crashes internos da
própria Evolution nunca chegam a ser logados/alertados pelo nosso lado. Não é uma falha de
segurança (o validador está fazendo o que deveria) nem tem fix simples sem abrir uma exceção
específica para `event:"error"` sem assinatura — o que exigiria decidir conscientemente
aceitar payloads não autenticados (ainda que só para log, nunca para mutação). Deixado como
recomendação, não implementado nesta sessão.

**S6-7 (crash upstream ao chamar fetchPrivacySettings numa instância caída):** capturado ao
vivo nos logs do container: `GET /chat/fetchPrivacySettings/wpp2` retornou 500
(`Cannot read properties of undefined (reading 'fetchPrivacySettings')`) com
`sentry-environment=development` no trace de origem. Buscamos em todo `src/` e
`supabase/functions/evolution-api/index.ts` por essa action — **não existe** nenhuma action
nossa que chame esse endpoint (a action `update-privacy` existe e chama
`/profile/updatePrivacySettings`, um endpoint diferente). Concluímos que a chamada veio de
fora do nosso código (provavelmente a Manager UI nativa da Evolution, ou uma ferramenta de
diagnóstico manual) contra uma instância desconectada, e o bug está no software da Evolution
(não trata `sock` indefinido quando não há sessão ativa). Não é corrigível no nosso
repositório — documentado como comportamento conhecido do upstream a evitar (não chamar
endpoints dependentes de socket Baileys em instâncias `close`).

---

## 7. Revisão de código exaustiva (hooks, proxy REST, webhook handlers, RLS/funções)

Workflow de revisão adversarial com 5 dimensões (hooks do front-end, fluxos de UI, proxy
REST de 111 ações, handlers do webhook, funções/RLS do banco), cada achado submetido a um
segundo agente cético antes de entrar aqui. **34 achados** no total; parte da fase de
verificação foi interrompida por limite de sessão dos subagentes (não desta sessão
principal), então os achados abaixo marcados "verificado nesta sessão" foram confirmados
por mim diretamente lendo o código-fonte atual (mais rigoroso que a verificação
automática), e os demais mantêm o veredito do agente revisor original sem uma segunda
checagem adversarial independente — tratem como alta confiança, não como 100% certos.

### 7.1 Corrigidos nesta sessão

| # | Severidade | Arquivo | Achado | Commit |
|---|:---:|---|---|---|
| S6-2/28 | 🔴 crítico | `fn_apply_connection_update` + `fn_reconcile_apply` (DB) | Falso-positivo de conexão sem debounce (ver §2) — **dois caminhos independentes** com o mesmo bug | migrations 20260705005207, 20260705011018, 20260705012657 |
| — | 🔴 crítico | `fn_reconcile_apply` (DB) | Fallback sem clamp violava `whatsapp_connections_status_check`, exceção não capturada abortava o lote inteiro | migration 20260705011420 |
| — | 🟠 alto | `fn_auto_resolve_baileys_alerts` (DB) | Fazia ack de alertas críticos após 6h, diferente da política da função irmã | migration 20260705011420 |
| — | 🟠 alto | `whatsapp_connections` (DB) | Sem guarda contra `instance_name` em formato UUID (classe do incidente S5-1) | migration 20260705011839 (CHECK constraint) |
| 26 | 🔴 crítico | `evolution-webhook/index.ts:228` | `qrcode.updated` usava `.eq('instance_id', instance)` em vez de `instanceOrFilter()` — QR podia falhar em persistir | commit c5ace08 |
| 27 | 🔴 crítico | `evolution-webhook/index.ts` (catch) | `routeToDeadLetter()` removido do catch — **regressão com teste próprio que deveria ter pego isso** (`contract.test.ts`); também endureci o loop de `messages.upsert` com try/catch por entrada | commit c5ace08 |
| 0 | 🔴 crítico | `messageSender.ts:190` | Enviava `instance_id` (UUID) como `instanceName` no envio principal do Inbox | commit 0fd2d14 |
| 1/11 | 🟠 alto | `useConnectionsManager.ts:80,229` | `generateQr`/`handleDisconnect` enviavam `instance_id` cru | commit 4fb1ff4 |
| 7 | — | `whatsapp_connections` (DB) | Achado do workflow dizia faltar `REPLICA IDENTITY FULL` — **verificado ao vivo nesta sessão: já está `FULL`** (`relreplident='f'`). Falso-positivo ou já corrigido por outra sessão; nenhuma ação necessária. | — |

### 7.2 Confirmados, ainda não corrigidos (recomendação priorizada para a próxima sessão)

| # | Severidade | Arquivo:linha | Achado |
|---|:---:|---|---|
| 12/22 | 🟠 alto | `evolution-api/index.ts:371` | A guarda de UUID (`instanceLooksLikeUuid`) só existe em `create-instance`/`connect` — as outras ~108 ações (disconnect, restart, status, todo `send-*`, grupos, integrações) fazem zero validação antes de repassar `instance` para a Evolution |
| 13/19 | 🟠 alto | `evolution-api/index.ts:264,396` | `connect`/`status`/`disconnect` gravam em `whatsapp_connections` com `.eq('instance_id', instance)` em vez de `instanceOrFilter()` — mesma ambiguidade já corrigida nos webhook handlers, nunca replicada aqui |
| 2/10 | 🟠 alto | `useChatMediaSending.ts:95,99` | `resolveInstance()` usa `instance_id` cru para figurinha/áudio-meme, contornando `evolutionInstanceName()` |
| 3 | 🟠 alto | `src/hooks/groups/actions.ts:99` | `loadGroups`/`sendBroadcast` repassam `instance_id` cru para `list-groups`/`send-text` |
| 24 | 🟠 alto | `evolution-api/index.ts:354` | `restart-instance`/`disconnect` (ações destrutivas que exigem re-scan de QR físico para recuperar) não têm checagem de role, ao contrário de `create-instance`/`delete-instance` |
| 21 | 🟡 médio | `evolution-api/index.ts:386` | `disconnect` chama `.json()` e, no catch, `.text()` no MESMO `Response` — `TypeError: body stream already read` mascara o erro real da Evolution quando o corpo não é JSON |
| 29 | 🟠 alto | `evolution-helpers.ts:151` (`resolveBestJid`) | Prioriza qualquer JID `@s.whatsapp.net` antes de `@g.us` — mensagens de grupo normais (não-LID) podem resolver para o JID do participante em vez do grupo, quebrando o filtro de grupo em 3 handlers |
| 9 | 🔴 crítico (UX) | `AdvancedMessageMenu.tsx:97` | Mensagens de enquete/cartão-contato ficam com spinner "Enviando..." permanente — o status nunca transiciona para 'sent' após o envio já ter tido sucesso |
| 8 | 🟡 médio | `useMessageQueue.ts:106` | Retry com backoff exponencial faz `break` incondicional após o catch — mensagem fica presa em 'sending' até outra chamada não relacionada reprocessar a fila |
| 4 | 🟡 médio | `whatsappStatusService.ts:90` | `getConnectionInfo()` retorna `instance_id` como `instanceName` para o visualizador de Status/Stories |
| 16 | 🟡 médio | `DegradedQuickActions.tsx:139` | Botão "Gerar QR" usa `instance_id` cru enquanto o botão vizinho no mesmo arquivo já usa `evolutionInstanceName()` — aplicação parcial do fix do PR #192 |
| 17 | 🟡 médio | `AdminAlertHistoryPage.tsx:159` | `resolveAlert()` deixa qualquer admin resolver QUALQUER alerta (inclusive críticos) com um clique, sem confirmação e com motivo genérico fixo — mesmo padrão do fechamento em lote do S6-4 |
| 14 | 🟠 alto | `useNewConversation.ts:105` | `handleSend()` não verifica o envelope `{error}` da resposta — sempre mostra "Mensagem enviada!" mesmo em falha |
| 15 | 🟡 médio | `useFileUploadLogic.ts:140` | `Promise.all([apiCall, dbInsert])` — se a API falhar, o id da linha já inserida nunca é recuperado para marcá-la como 'failed' |
| 5 | 🟠 alto | `useEvolutionApiCore.ts:100` | Dedup de requisições GET em voo usa só `${method}:${action}` (sem body) — chamadas concorrentes com `instanceName` diferentes colidem e compartilham uma resposta |
| 6 | 🟡 médio | `useEvolutionApiCore.ts:79` | `timeoutMs` fixo em 45000, ignora a config administrável de retry por instância |
| 30 | 🟠 alto | `evolution-media.ts:146` | `parseMessageContent()` não trata subtipos interativos (`buttonsResponseMessage`, `listResponseMessage`, etc.) — retorna conteúdo vazio silenciosamente, sem a guarda de skip que o handler irmão já tem |
| 31 | 🟡 médio | `evolution-webhook-msg-handlers.ts:123` | Fallback de "mensagem fantasma" em ACK/delete fixa `sender:'contact'` independente de `key.fromMe` |
| 32 | 🟡 médio | `evolution-webhook-handlers.ts:51` | `handleGroupsUpsert` zera `participant_count` em eventos de metadado-apenas (rename/ícone) que não reenviam a lista de participantes |
| 33 | 🟡 baixo | `webhook-schemas.ts` | `webhookBase64:true` está ativo mas nada limita o tamanho do payload antes de `req.text()`/`JSON.parse()`/`atob()` rodarem de forma síncrona |
| 23 | 🟡 médio | `evolution-api/index.ts:593` | Vários endpoints GET (`group-info`, `group-participants`, `fetch-profile-picture`) interpolam parâmetros ausentes como a string literal `"undefined"` na querystring em vez de rejeitar antes |
| 25 | 🟡 médio | `docs/architecture/evolution-api-mapping.md` | Documentação desatualizada: métodos HTTP e nomes de ação divergem da implementação real em vários pontos |
| 20 | 🟢 baixo | `evolution-api/index.ts:85` | `instanceInPath` do wrapper `proxy()` é sempre `undefined` — cosmético, cada call site já embute o instance no path string |

### 7.3 Achado sistêmico — testes de contrato sem CI

O achado #27 (routeToDeadLetter removido) tinha um teste de regressão dedicado
(`evolution-webhook/__tests__/contract.test.ts`, "Recuperabilidade: handler_error é
roteado para a DLQ antes do audit") que **deveria ter pego essa regressão** — mas nenhum
workflow em `.github/workflows/*.yml` referencia `deno` (`grep -l deno .github/workflows/*.yml`
não retorna nada). Toda a suíte de testes Deno dos edge functions (webhook, hmac,
sync-actions) roda zero vezes em CI. Recomendação de alta prioridade: adicionar um job
`deno test` ao pipeline — sem isso, qualquer regressão futura na mesma família passa
despercebida como esta passou.

### 7.4 Drift de schema — famílias de função ainda não capturadas em migração

Fechamos o gap para a família reconcile/alerta (§5). Dezenas de outras funções
`public.fn_*`/`evo.fn_*`/`zapp.fn_*` continuam existindo só no banco ao vivo. Fora de
escopo para esta sessão de resposta a incidente — recomenda-se uma sessão dedicada de
"schema sync" que extraia `pg_get_functiondef` de tudo que estiver sem migração
correspondente.

### 7.5 Nota sobre colisão de edição concorrente

Durante esta sessão, outra sessão/processo aplicou diretamente no banco ao vivo um fix
não relacionado (case-insensitivity, "Bug #69") em `fn_apply_connection_update` — **ao
mesmo tempo** que esta sessão corrigia a mesma função para o debounce anti-flap,
sobrescrevendo silenciosamente o fix sem qualquer erro ou aviso (detectado porque o JSON
de retorno de uma chamada de simulação não tinha mais a chave `debounced`). As duas
mudanças foram reconciliadas na migração `20260705011018`. Isso é evidência de que
múltiplas sessões editam objetos de banco ao vivo compartilhados sem coordenação — a
mesma função pode ser sobrescrita por baixo dos pés de quem está no meio de um fix.
Recomendação de processo: reler `pg_get_functiondef` imediatamente antes E depois de
qualquer alteração em função compartilhada, para detectar esse tipo de corrida.

---

## 8. Resumo executivo e próximos passos

**Corrigido e verificado nesta sessão (11 commits):** o outage ativo foi diagnosticado até
a causa-raiz de aplicação (não infra) — um pulso de `open` transitório do Baileys sendo
tratado como conexão estável em DOIS caminhos independentes (webhook e cron-poll), mascarado
por um health-score com janela de graça longa demais e por um fechamento em lote de alertas
críticos sem verificação. Além disso: uma regressão real no webhook (DLQ removida, com teste
de contrato próprio que deveria tê-la pego mas nunca roda em CI), o filtro errado no handler
de QR code, e 3 pontos onde o front-end ainda envia o UUID interno da instância para a
Evolution API (mesma classe do incidente S5-1) — mais uma guarda a nível de banco (CHECK
constraint) para essa classe inteira de bug.

**Pendências que EXIGEM ação humana (inalterado desde as sessões 3-5):**
1. 🔴 Re-parear `wpp2` e `wpp_pink_test` por QR code no celular físico — única forma de
   restaurar as linhas de verdade (runbook §4).
2. 🟠 Rotacionar `AUTHENTICATION_API_KEY`/credenciais compartilhadas (pendência das sessões
   anteriores, ainda válida).

**Pendências técnicas priorizadas para a próxima sessão (§7.2):** a lista completa de 24
achados confirmados-mas-não-corrigidos está na tabela acima, ordenada por severidade. Os
3 de maior risco imediato: (a) a guarda de UUID no proxy REST cobre só 2 de 111 ações —
qualquer outra ação com um `instance` vindo de UUID falha ou, pior, pode re-abrir a classe
de bug do incidente fantasma; (b) `restart-instance`/`disconnect` sem checagem de role —
qualquer usuário autenticado pode forçar um logout que só se recupera com QR físico; (c) o
spinner "Enviando..." permanente em mensagens de enquete/contato é um bug visível para o
usuário final todos os dias, não só durante incidentes.

**Achado de processo mais importante:** os testes de regressão Deno (`__tests__/*.test.ts`)
não rodam em nenhum workflow de CI. Um deles existia especificamente para a regressão
encontrada (§7.3) e não a pegou porque nunca é executado. Wire isso antes de qualquer outra
coisa nesta lista — é o que impede a próxima regressão silenciosa.

*Sessão 6 executada por auditoria automatizada (Claude Code) em 2026-07-05. Nenhum segredo
(API keys, tokens de instância, senhas) foi incluído neste relatório.*
