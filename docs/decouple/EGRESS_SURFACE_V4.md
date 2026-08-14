# EGRESS_SURFACE_V4 — Inventário formal das edge functions `evolution-*`

> **Status:** VIVO (V4) · **Data:** 2026-08-14 · **Pasta:** `docs/decouple/`
> **Método:** leitura de cada `supabase/functions/evolution-*/index.ts` + `grep` de chamadores em `src/` e `supabase/functions/` + `supabase/config.toml` + evidência de deploy (`docs/edge/reconciliacao-2026-08.md`).
> **Escopo:** 10 edge functions `evolution-*`. Decisão final: **1 porta edge canônica** (egresso) + allowlist de actions + destino de cada função.

---

## 1. Resumo executivo (tabela-mestra)

| # | Função | Papel (1 linha) | Chamadores | Classificação | Status deploy |
|---|--------|------------------|------------|---------------|---------------|
| 1 | `evolution-api` | Router de egresso ~41 actions → Evolution API (proxy server-side com auth JWT, rate limit, idempotency, pause de instância, contrato `evolution-api@v1`) | `src/lib/whatsappAdapter.ts`, `src/lib/sendFunctionRouter.ts` (default), `src/features/inbox/hooks/realtime/externalMessageSender.ts`, `public-api` (send-* repassam via invoke), `whatsappConnectionRepository.callEvolutionApiV2`, hooks de UI (useEvolutionApi, media, etc.) — **egresso REAL do app** | **PORTA OFICIAL** (única porta de egresso browser→Evolution) | ✅ Deployada |
| 2 | `evolution-proxy` | Proxy server-side com allowlist de **6 paths** (sendText/sendMedia/sendWhatsAppAudio/markChatUnread/fetchInstances/connectionState) para a ZappWebbDemoPage | Só `src/integrations/zappweb/evolutionClient.ts` + `src/pages/admin/ZappWebbDemoPage.tsx` (+ `src/_archive/evolutionClient.archived.ts`, arquivado) | **CANDIDATA APOSENTAR** (uso restrito a página demo; subconjunto da evolution-api) | ✅ Deployada (v2 2026-08-14) |
| 3 | `evolution-webhook` | Ingestão de eventos Evolution (539 linhas): HMAC primário, shared-secret deprecated, dispatch para handlers `_shared`, DLQ, registry-guard, instance-pause, Sentry, contrato v1/v2 (v2 atual, sunset v1 2027-01-01) | URL configurada nas instâncias (webhook/set), `connection-test`, `webhook-diagnostic`, `useMonitoringManagement`, `whatsappAdapter.getEvolutionWebhookUrl`, `_shared/evolution-sync-actions.ts` (setup-webhook) | **PORTA OFICIAL P3** (ingestão) | ✅ Deployada |
| 4 | `evolution-credentials` | GET = **410 Gone** (key nunca mais sai do servidor, fix Phase 6 2026-08-14); **POST `save`/`delete` vivos** (CRUD de credenciais via RPCs SECURITY DEFINER `zapp.fn_edge_*`) | POST: `src/features/integrations/hooks/useEvolutionApiIntegration.ts` (UI admin). GET: nenhum (legado) | **SUPORTE com ressalva** (GET morto; POST é o caminho de escrita da UI admin) | ✅ Deployada |
| 5 | `evolution-bitrix-sync` | Cron de dreno da fila `evo.evolution_bitrix_queue` → Bitrix24 CRM (contact/deal add/update) via webhook do Bitrix | Nenhum em `src/`; serviço interno (service-role/cron); registrado em contract-schemas | **SUPORTE VÁLIDO** — ressalva: `bitrix_webhook_url` AUSENTE (R06-07) → 503 se chamado | ✅ Deployada |
| 6 | `evolution-group-sync` | Sync de grupos WhatsApp (GET fetchAllGroups → RPC `zapp.zapp_upsert_group_from_event`); substituiu pg_net (que não enviava header apikey → 401); rota única `action='groups'`, cron interno | Nenhum em `src/`; serviço interno (service-role/cron) | **SUPORTE VÁLIDO** (porta interna de sync, não é egresso browser) | ✅ Deployada |
| 7 | `evolution-sync` | Sync administrativo manual (actions `sync-contacts`, `sync-messages`, `sync-all-messages`, `full-sync`, `setup-webhook`, `cleanup-mock`) — gate admin/supervisor | `src/components/connections/ConnectionsView.tsx` (botão de sincronizar), `src/components/docs/featuresSectionsData.ts` (menção) | **SUPORTE VÁLIDO** (porta administrativa; não é egresso de runtime) | ✅ Deployada |
| 8 | `evolution-templates` | GET/POST de templates HSM com `requireServiceRoleOrCron` — **browser recebe 401** (E25 V4-FINAL); feature quebrada em produção | `src/hooks/useWhatsAppTemplates.ts` (invoca com JWT de usuário → 401) | **RISCO / QUEBRADA** (decisão #31: corrigir ou aposentar) | ✅ Deployada (mas quebrada p/ browser) |
| 9 | `evolution-notification-dispatcher` | Dispatcher da outbox `evo.evolution_notification_outbox` (canais whatsapp_promo/email/slack/webhook) com claim atômico, priority_filter e config por canal via RPC | Nenhum em `src/`; serviço interno (service-role/cron); migrations de apoio 20260811150400/170000 | **SUPORTE VÁLIDO** (porta interna de notificação) | ✅ Deployada |
| 10 | `evolution-retry-metrics` | GET admin de métricas de retry (agregação, percentis, janela comparativa) sobre `evo.evolution_retry_metrics` | `src/features/admin/hooks/monitoring/useRetryMetrics.ts`, `src/services/api/queryKeys.ts` (painel admin) | **SUPORTE VÁLIDO** (leitura admin) | ✅ Deployada |

**Status deploy:** todas as 10 estão **deployadas em produção** — evidência: presença na tabela de reconciliação `docs/edge/reconciliacao-2026-08.md` (todas listadas, sem nota de ausência) e `infra/supabase/EDGE_FUNCTIONS.md`. `supabase/config.toml` só declara `verify_jwt` para 4 (`evolution-api=true`, `evolution-webhook=false`, `evolution-credentials=true`, `evolution-sync=false`); as demais rodam com o default do runtime.

---

## 2. Detalhamento por função

### 2.1 `evolution-api` — PORTA OFICIAL (egresso canônico)
- **Papel:** router de egresso do app para a Evolution API; 281 linhas; auth JWT obrigatória (401 sem usuário); CORS; rate limit diferenciado (`evolution-poll:` 600/60s para ações read-only de polling; `evolution:` 120/60s; `evolution-send:<instance>` por instância via `EVOLUTION_SEND_RATE_PER_INSTANCE`, default 60/min); validação `instanceName` (`^[a-zA-Z0-9_-]{1,128}$`); pause de instância (`INSTANCE_PAUSED` 503); idempotency-key repassada ao upstream; contrato `evolution-api@v1` (gate via `parseOrReject` em JSON e multipart); envelope `EVOLUTION_ENVELOPE_VERSION` em erros; fallback de perfil/instâncias e telemetria de fallback.
- **Chamadores (grep):** 208 ocorrências em 57 arquivos — destaque: `src/lib/whatsappAdapter.ts` (invoca `evolution-api` com `{action}` para TODAS as ações de envio/leitura), `src/lib/sendFunctionRouter.ts` (resolve `evolution-api` para `api_type !== 'official'`), `src/features/inbox/hooks/realtime/externalMessageSender.ts` (send-text), `supabase/functions/public-api` (repassa send-* via `functions.invoke('evolution-api')` — teste `no-direct-fetch` garante que NÃO há fetch direto), `useEvolutionApi` (create-instance, connect, list-instances), `get-media-base64` (mídia), `whatsappConnectionRepository.callEvolutionApiV2`.
- **Actions (41, allowlist documentada na §3):** `send-text, send-media, send-audio, send-ptv, send-location, send-contact, send-reaction, send-poll, send-sticker, send-list, send-buttons, send-status, send-template, read-messages, mark-read, mark-unread, find-chats, find-messages, find-contacts, check-numbers, find-status-messages, send-chat-presence, archive-chat, delete-message, fetch-profile, update-profile-name, update-profile-status, update-block-status, handle-label, find-labels, get-media-base64, get-settings, set-settings, get-webhook, set-webhook, status, list-instances, instance-info, connect, create-instance, pairing-code`.
  - *Nota:* o plano falava em "~50 actions"; o inventário exato do `index.ts` (regex `action === '...'`) é **41**.
- **Status:** ✅ Deployada (`verify_jwt=true` em config.toml). **Decisão: MANTER como a ÚNICA porta edge de egresso.**

### 2.2 `evolution-proxy` — CANDIDATA APOSENTAR
- **Papel:** proxy server-side com allowlist rígida de 6 paths (sendText, sendMedia, sendWhatsAppAudio, markChatUnread, fetchInstances, connectionState), gate admin/supervisor, rate 60/min; key nunca chega ao browser (fix Phase 6, v2 2026-08-14).
- **Chamadores (grep):** somente `src/integrations/zappweb/evolutionClient.ts` (10 ocorrências) e `src/pages/admin/ZappWebbDemoPage.tsx` (2); `src/_archive/evolutionClient.archived.ts` é cópia arquivada.
- **Status:** ✅ Deployada. **Decisão: APOSENTAR** — migrar `ZappWebbDemoPage` para `evolution-api` (todos os 6 verbos têm action equivalente: `send-text`, `send-media`, `send-audio`, `mark-read`, `status`, `list-instances`), remover `src/integrations/zappweb/evolutionClient.ts` e o arquivo em `src/_archive`, e então remover a função do deploy. Não é porta usada por fluxo de negócio (só página admin demo).

### 2.3 `evolution-webhook` — PORTA OFICIAL P3 (ingestão)
- **Papel:** ingestão de eventos da Evolution (539 linhas — plano dizia 537, wc real: 539): validação HMAC primária (`EVOLUTION_WEBHOOK_SECRETS` multi-secret, rotação zero-downtime), shared-secret plaintext como fallback DEPRECATED (`EVOLUTION_WEBHOOK_ALLOW_SHARED_SECRET`, default true), STRICT_MODE, rate limit, registry-guard (`instance_registry`, fail-open), instance-pause, DLQ (`routeToDeadLetter`), auditoria de eventos, proveniência `consumer` vs `evolution-native`, Sentry; contrato v1/v2 com sunset v1 em 2027-01-01.
- **Chamadores (grep):** 97 ocorrências em 38 arquivos — a URL `/functions/v1/evolution-webhook` é o webhook configurado nas instâncias; referenciada por `connection-test`, `webhook-diagnostic`, `useMonitoringManagement`, `whatsappAdapter.getEvolutionWebhookUrl()`, `_shared/evolution-sync-actions.ts` (setupWebhook) e testes de contrato.
- **Status:** ✅ Deployada (`verify_jwt=false` — recebe POST sem JWT, autentica por assinatura). **Decisão: MANTER — porta oficial P3 de ingestão.**

### 2.4 `evolution-credentials` — SUPORTE com ressalva
- **Papel:** GET = **410 Gone** (desde 2026-08-14: a key não sai mais do servidor; corpo do 410 instrui a usar `evolution-proxy`); **POST `save`/`delete` vivos** para CRUD de credenciais via RPCs SECURITY DEFINER (`zapp.fn_edge_upsert_evolution_credentials` / `fn_edge_delete_evolution_credentials`), gate admin/supervisor, rate 10/min, contrato `evolution-credentials-write@v1`.
- **Chamadores (grep):** POST: `src/features/integrations/hooks/useEvolutionApiIntegration.ts` (UI admin — teste garante escrita via invoke, nunca `.schema`). GET: nenhum (código morto após o return 410 na linha 165).
- **Status:** ✅ Deployada. **Decisão: MANTER com ressalva** — o POST é o caminho oficial de escrita da UI admin; o branch GET (linhas 167-232, inalcançável) deve ser removido em limpeza futura para eliminar o risco de reativação acidental; manter o 410 como sentinela de clientes legados até remoção.

### 2.5 `evolution-bitrix-sync` — SUPORTE VÁLIDO (com pendência de segredo)
- **Papel:** drena `evo.evolution_bitrix_queue` (pending, até 20/lote, claim atômico, backoff exponencial, max_attempts) e envia create/update de contatos/deals ao Bitrix24 via webhook (STAGE_MAP, SOURCE_ID=WHATSAPP); registra `evolution_performance_metrics`; contrato `evolution-bitrix-sync@v1`; gate service-role/cron.
- **Chamadores (grep):** nenhum em `src/`; serviço interno (cron). Registrado em `_shared/contract-schemas.ts` / `contract-versions.ts`.
- **Status:** ✅ Deployada. **Decisão: MANTER com condição** — segredo `bitrix_webhook_url` **ausente** em env/vault (docs/reconciliation/06_segredos.md R06-07 → função retorna 503 "Bitrix24 não configurado"); restaurar o segredo ou formalizar aposentadoria se a integração Bitrix estiver descontinuada.

### 2.6 `evolution-group-sync` — SUPORTE VÁLIDO
- **Papel:** sync de grupos WhatsApp (GET `/group/fetchAllGroups/{instance}?getParticipants=true` com header apikey → normaliza participantes → RPC `zapp.zapp_upsert_group_from_event`); substituiu o backfill via pg_net (`evo.fn_sync_groups_from_api`), que não enviava header custom (401 — investigação 2026-08-11); rota única `action='groups'` (default); exige `EVOLUTION_INSTANCE_TOKEN_WPP2` no env (503 sem ele); contrato `evolution-group-sync@v1`; gate service-role/cron.
- **Chamadores (grep):** nenhum em `src/`; disparo interno/cron (migrations 20260811180000 depreca funções pg_net e aponta para esta edge).
- **Status:** ✅ Deployada. **Decisão: MANTER** (porta interna de sync de grupos; fora da superfície browser).

### 2.7 `evolution-sync` — SUPORTE VÁLIDO
- **Papel:** sync administrativo manual (gate admin/supervisor, rate 10/min) com actions `sync-contacts`, `sync-messages`, `sync-all-messages`, `full-sync`, `setup-webhook`, `cleanup-mock` (handlers compartilhados em `_shared/evolution-sync-actions.ts`); contrato `evolution-sync@v1`; valida `instanceName` (`^[a-zA-Z0-9_-]{1,64}$`).
- **Chamadores (grep):** `src/components/connections/ConnectionsView.tsx` (botão de sincronizar, `functions.invoke('evolution-sync')`); listada em `main/index.ts` (linha 52, grupo interno) e config.toml (`verify_jwt=false`).
- **Status:** ✅ Deployada. **Decisão: MANTER como porta administrativa** — não é egresso de runtime; avaliar consolidação futura (ex.: expor sync como actions internas da `evolution-api`) sem prazo.

### 2.8 `evolution-templates` — RISCO / QUEBRADA
- **Papel:** GET de templates ativos + POST `send`/`preview` (envio direto via fetch à Evolution com key do vault; insere em `evolution_message_queue`; incrementa uso via `fn_use_template`); gate **`requireServiceRoleOrCron`** — qualquer JWT de usuário recebe 401.
- **Chamadores (grep):** `src/hooks/useWhatsAppTemplates.ts` invoca `evolution-templates` com `method: 'GET'` **com JWT de usuário** → **401 provável/confirmado** (E25 V4-FINAL: "401 silencioso — feature quebrada em produção sem ninguém saber"); UI `TemplatesPicker` / feature-registry WHATSAPP-05 (Partial).
- **Status:** ✅ Deployada, mas **quebrada para o browser**. **Decisão: corrigir ou aposentar (etapa #31 V4-FINAL)** — recomendação: remover a chamada browser (`useWhatsAppTemplates` deve ler de `zapp.whatsapp_templates` via PostgREST ou de action nova na `evolution-api` com gate admin); manter a função apenas para uso service-role/cron se o envio programático continuar sendo necessário; caso contrário aposentar e apontar `send-template` da `evolution-api`.

### 2.9 `evolution-notification-dispatcher` — SUPORTE VÁLIDO
- **Papel:** dispatcher da outbox `evo.evolution_notification_outbox` (lote 20 default, claim atômico `zapp.fn_evo_outbox_claim`, marks `zapp.fn_evo_outbox_mark`, release p/ dryRun), canais `whatsapp_promo` (sendText com token wpp2 via vault), `email` (Resend), `slack`/`webhook` (POST na URL do payload); config por canal via `zapp.zapp_notif_config_get` com fallback de destinatário e priority_filter; rate 1 envio/s; contrato `evolution-notification-dispatcher@v1`; gate service-role/cron.
- **Chamadores (grep):** nenhum em `src/`; serviço interno (cron); migrations de apoio `20260811150400` e `20260811170000`. O cron `process-evolution-notifications` (`*/2 * * * *`) chama a RPC `zapp.fn_process_evolution_notifications` (enfileira); o dispatch da outbox pela edge é disparado por cron/agendador interno.
- **Status:** ✅ Deployada. **Decisão: MANTER** (porta interna de notificação; fora da superfície browser).

### 2.10 `evolution-retry-metrics` — SUPORTE VÁLIDO
- **Papel:** GET admin (auth JWT + `is_admin_or_supervisor`) de métricas de retry: janela atual vs anterior (`hours` ≤168), filtros action/instance/status, agregações (successRate, percentis p50/p95 de attempts, avgDurationMs, topActions, topReasons, deltaPct); contrato `evolution-retry-metrics@v1`.
- **Chamadores (grep):** `src/features/admin/hooks/monitoring/useRetryMetrics.ts` + `src/services/api/queryKeys.ts` (painel admin de monitoramento).
- **Status:** ✅ Deployada. **Decisão: MANTER** (leitura admin; sem risco de egresso).

---

## 3. Decisão recomendada

### 3.1 Porta edge canônica: **`evolution-api`** (única porta de egresso browser → Evolution)

- Todo fluxo de negócio que precise falar com a Evolution API (enviar, ler, gerenciar instância, templates, status) passa por `evolution-api` com JWT de usuário autenticado.
- Portas internas (cron/service-role) ficam FORA da superfície browser: `evolution-webhook` (ingestão P3), `evolution-group-sync`, `evolution-bitrix-sync`, `evolution-notification-dispatcher` (crons), `evolution-retry-metrics` (leitura admin), `evolution-sync` (ação admin manual), `evolution-credentials` (POST admin).
- Princípio de fronteira (ADR-009/010): o browser **nunca** conhece URL/key da Evolution; só conhece `functions.invoke('evolution-api', { action })`.

### 3.2 Allowlist documentada de actions — `evolution-api@v1` (41 actions)

| Grupo | Actions |
|---|---|
| **Envio** (15) | `send-text`, `send-media`, `send-audio`, `send-ptv`, `send-location`, `send-contact`, `send-reaction`, `send-poll`, `send-sticker`, `send-list`, `send-buttons`, `send-status`, `send-template`, `send-chat-presence`, `read-messages` |
| **Leitura conversa/chat** (7) | `find-chats`, `find-messages`, `find-contacts`, `check-numbers`, `find-status-messages`, `mark-read`, `mark-unread` |
| **Gerenciamento de conversa** (3) | `archive-chat`, `delete-message`, `handle-label`, `find-labels` |
| **Perfil** (4) | `fetch-profile`, `update-profile-name`, `update-profile-status`, `update-block-status` |
| **Mídia/config** (4) | `get-media-base64`, `get-settings`, `set-settings`, `get-webhook`, `set-webhook` |
| **Instância** (6) | `status`, `list-instances`, `instance-info`, `connect`, `create-instance`, `pairing-code` |

Regras da allowlist (comportamento do `index.ts`):
- Action vem do body (`action`) com fallback para o último segmento do path (`pathAction`) — aceitar `evolution-api/<action>` e `{ action }`.
- Ações de polling read-only (`status`, `list-instances`, `instance-info`, `find-status-messages`) têm rate limit próprio (600/60s por IP) e **não** disparam instance-pause.
- Ações `send-*` têm rate limit por instância (`EVOLUTION_SEND_RATE_PER_INSTANCE`, default 60/min).
- Headers de idempotência (`idempotency-key` / `x-idempotency-key`) repassados ao upstream.
- Instância pausada → 503 `INSTANCE_PAUSED` com `Retry-After: 60` (exceto leituras da lista READE_ONLY_INSTANCE_ACTIONS).
- Contrato `evolution-api@v1` validado por `parseOrReject` (JSON e multipart) — novas actions exigem atualização de `CONTRACT_SCHEMAS` e `contract-versions.ts`.

### 3.3 Destino de cada função (consolidado)

| Função | Classificação | Destino | Ação |
|---|---|---|---|
| `evolution-api` | PORTA OFICIAL | **MANTER** | Nenhuma (canônica). Congelar superfície: novas actions só via contrato v1. |
| `evolution-webhook` | PORTA OFICIAL P3 | **MANTER** | Nenhuma. Vigiar sunset v1 (2027-01-01). |
| `evolution-credentials` | SUPORTE com ressalva | **MANTER** (POST) | Remover branch GET morto (pós-410) em limpeza futura; manter 410 como sentinela. |
| `evolution-proxy` | CANDIDATA APOSENTAR | **APOSENTAR** | Migrar `ZappWebbDemoPage` → `evolution-api`; deletar `evolutionClient.ts` + `_archive/evolutionClient.archived.ts`; remover do deploy. |
| `evolution-sync` | SUPORTE VÁLIDO | **MANTER** | Opcional futuro: consolidar em `evolution-api`. |
| `evolution-group-sync` | SUPORTE VÁLIDO | **MANTER** | Nenhuma (cron interno). |
| `evolution-bitrix-sync` | SUPORTE VÁLIDO | **MANTER condicional** | Restaurar `bitrix_webhook_url` (R06-07) ou formalizar aposentadoria. |
| `evolution-notification-dispatcher` | SUPORTE VÁLIDO | **MANTER** | Nenhuma (cron interno). |
| `evolution-retry-metrics` | SUPORTE VÁLIDO | **MANTER** | Nenhuma (painel admin). |
| `evolution-templates` | RISCO / QUEBRADA | **CORRIGIR ou APOSENTAR** | Etapa #31 V4-FINAL: tirar browser da rota (401 E25); decidir uso service-role/cron ou aposentar em favor de `send-template` da `evolution-api`. |

### 3.4 Regras de governança da superfície de egresso

1. **Browser → Evolution: só `evolution-api`.** Qualquer nova necessidade de egresso vira action nova (com contrato) na allowlist.
2. **Servidor → Evolution (cron/svc):** funções dedicadas com gate `requireServiceRoleOrCron`, sem exposição pública; `verify_jwt=false` só onde o gate interno substitui (webhook, sync).
3. **Key/URL da Evolution nunca transitam em resposta para o browser** (GET de `evolution-credentials` = 410; `evolution-proxy` foi ponte temporária do Phase 6 e deve ser retirado).
4. **Toda função deployada tem contrato registrado** em `_shared/contract-schemas.ts` + `contract-versions.ts` (as 10 têm).
5. Remoção de função = remover código em `src/` (chamadores), `_shared` (contratos), `config.toml` e deploy — nunca só o deploy.
