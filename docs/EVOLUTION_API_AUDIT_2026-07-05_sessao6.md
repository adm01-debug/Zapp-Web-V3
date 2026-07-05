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

_(preenchido após o workflow de revisão adversarial de 5 dimensões — ver commits desta
sessão para os fixes aplicados)_
