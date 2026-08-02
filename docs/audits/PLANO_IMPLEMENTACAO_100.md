# PLANO DE CORREÇÃO — populado durante a análise

> Documento vivo. Cada achado real da análise vira uma etapa aqui, com origem (etapa da análise), evidência (query/arquivo/log) e critério de aceite.
> **Correção é responsabilidade do próximo chat.**

Convenção de ID: `F<bloco>-<seq>` — ex. `F1-01` = primeiro achado do bloco 1 da análise.

**Total de achados até agora: 155** (14 Bloco 1 + 13 Bloco 2 + 12 Bloco 3 + 24 Bloco 4 + 30 Bloco 5 + 30 Bloco 6 + 32 Bloco 7).

---

## Tema 1 — Higienização do repositório

### F1-01 — Deletar `___TEMP_VERSION_CHECK_DO_NOT_MERGE.txt`
- **Ação:** `git rm ___TEMP_VERSION_CHECK_DO_NOT_MERGE.txt`.
- **Aceite:** arquivo ausente em `main`.

### F1-02 — Ignorar e remover `__pycache__/`
- **Ação:** adicionar `__pycache__/` e `*.pyc` ao `.gitignore`; `git rm -r --cached __pycache__`.

### F1-03 — Mover scripts soltos para `scripts/`
- **Evidência:** `ci_cost_analysis.py`, `gen_insert.cjs` na raiz.
- **Ação:** `mv` para `scripts/`. Atualizar `package.json`.

### F1-04 — Migrar `lgpd_deploy.sql` para `supabase/migrations/`
- **Ação:** renomear com timestamp; registrar em `supabase_migrations.schema_migrations`.

### F1-05 — Mover 8 relatórios `.md` da raiz para `docs/audits/history/`

### F1-06 — Deletar duplicata `playwright.e2e.config.fixed.ts`

### F1-07 — Consolidar 5 pastas de teste em `src/**/__tests__/` + `e2e/`

### F1-08 — Deletar `supabase/functions-legacy/` (grep imports antes)

### F1-09 — Mover/deletar `supabase/fatorx-migrations/` (projeto errado)

---

## Tema 2 — Gates de CI e qualidade

### F1-10 — Remover `|| true` do script `lint` em `package.json`

### F1-11 — Reduzir `--max-warnings 999 → 0` progressivamente

---

## Tema 3 — Segurança Supabase

### F2-01 — Revogar `EXECUTE` de `authenticated` nas 6 TRIGGER functions em `public`
- `fn_contacts_proxy_delete/insert/update`, `fn_messages_bridge_delete/insert/update`.

### F2-02 — Revogar `EXECUTE` de `authenticated` nas 3 outras TRIGGER functions em `public`
- `handle_new_user_settings`, `on_role_change`, `trg_fn_set_transfer_ticket`.

### F2-03 — Revisar 9 RPCs SECDEF em `public` — garantir `auth.uid()` + tenant check
- `rpc_get_contact` (2 overloads), `rpc_app_bootstrap`, `rpc_dashboard_init`, `generate_transfer_ticket`, `get_companies_by_phones_batch`, `get_contact_intelligence_by_phone`, `increment_webhook_rate_limit`, `is_instance_paused`, `log_rls_denied`.

### F2-04 — Auditoria CSV das 119 SECDEF+authenticated em `zapp` (`docs/audits/secdef-zapp.csv`)

### F2-05 — Auditoria similar em `financeiro` (25), `artes` (11), `vendas` (5)

---

## Tema 4 — Performance de banco

### F2-09 — Mover `ops.fn_regression_tests()` para off-peak + MV cached (8,8 s/call → 0)

### F2-10 — Consolidar 588 042 INSERTs unitários em `financeiro.pagamentos_diarios` para batch

### F2-11 — Investigar `zapp.fn_system_health_score_cached` (289 ms apesar do nome "_cached")

### F2-12 — Reduzir invalidações do PostgREST schema cache (203 s totais em introspection)

### F2-13 — Índice parcial em `zapp.messages` para badge unread inbound
```sql
CREATE INDEX CONCURRENTLY idx_msg_unread_inbound
  ON zapp.messages (direction, is_read)
  WHERE is_read = false AND direction = 'inbound';
```

---

## Tema 5 — Consolidação de cron jobs

### F2-06 — Consolidar 4 pares de duplicatas de cron
- `cleanup_expired_contact_ids` (190) + `evo_cleanup_expired_contact_ids` (189).
- `purge-processed-webhook-events` (54) + `purge_webhook_events_processed` (152).
- `purge-webhook-audit-log-90d` (209) + `purge_webhook_audit` (61).
- `cleanup-cron-job-history` (99) + `cleanup-cron-job-logs` (216).

### F2-07 — Escalonar 6 VACUUMs diários (02:06–02:21) em janelas > 5 min

### F2-08 — Reagrupar chain logflare (7 jobs, 03:00–03:45) em job único

---

## Tema 6 — Frontend: router, navegação, arquitetura

### F1-12 — Homônimos em `src/pages/` — padronizar `<slug>/index.tsx`

### F1-13 — 11 pages órfãs (sem `<Route>`) mas lazy-carregadas — decidir URL ou `?view=`

### F1-14 — Consolidar padrão duplo URL canônica vs `?view=X&tab=Y`

---

## Tema 7 — Frontend: auth e sessão

_(Achados F3-01 a F3-12 registrados no Bloco 3, mantidos abaixo.)_

### F3-01 — CRÍTICO (P0): `supabase.auth.getSession()` fora de `useEffect` em `ProtectedRoute.tsx`

- **Origem:** Etapa 22 (Bloco 3).
- **Evidência:** `src/features/auth/components/ProtectedRoute.tsx` linhas 260-269 — executa em cada render (2× em StrictMode). Se `getSession()` retornar null transitoriamente, dispara logout automático.
- **Ação:** mover para `useEffect(() => { ... }, [authLoading, user])` com `AbortController`.
- **Aceite:** teste manual com "Slow 3G" — user autenticado não é deslogado por race entre `getSession` calls.

### F3-02 — `isDev` bypass total sem log de auditoria

- **Origem:** Etapa 28 (Bloco 3).
- **Ação:** adicionar `void supabase.rpc('log_security_event', { p_event_type: 'dev_bypass_used', ... })` com throttle.
- **Aceite:** `zapp.security_events` recebe eventos `dev_bypass_used`.

### F3-03 — `verifyHttpOnlyCookieAuth()` é dead code — remover

### F3-04 — `refreshAll` sem `AbortController` — race em `TOKEN_REFRESHED` consecutivo

### F3-05 — Parsing frágil de `role_permissions` — pode retornar `permissions = []` silenciosamente

### F3-06 — Realtime `zapp.profiles` só captura UPDATE — trocar para `event: '*'`

### F3-07 — `retryBootstrap()` pode empilhar `getSession()` sob `navigator.locks`

### F3-08 — Deletar `externalSessionBridge.ts` — dead code ativo

### F3-09 — `signOut` sem fallback local se supabase-js falhar

### F3-10 — `QuotaExceededError` silenciado em cookieStorage — CustomEvent + toast

### F3-11 — `markTimeToMainScreen` triplicado no ProtectedRoute — guard com `useRef`

### F3-12 — `log_security_event` sem contexto (tenant/UA/IP) — enriquecer

---

## Tema 8 — Frontend: inbox e mensageria

### F4-01 — `fetchConversations` sem cursor/paginação (500+1000 fixo)

- **Origem:** Etapa 31/32 (Bloco 4).
- **Evidência:** `useRealtimeMessages.ts` linhas ~250: `SEEDED_CONTACT_LIMIT = 500`, `RECENT_MESSAGES_LIMIT = 1000`.
- **Ação:** substituir por cursor com `updated_at + id`, tamanho de página 100, load-more sob demanda ao rolar sidebar.
- **Aceite:** tenant com 5000+ contatos ativos carrega inbox em < 2 s; sidebar suporta scroll infinito com virtualização.

### F4-02 — `fetchConversations` sem guard de mount para setState/commitConversations

- **Origem:** Etapa 32 (Bloco 4).
- **Evidência:** await do `.select()` sem checar `active` flag; se hook desmonta durante fetch, setState roda após unmount.
- **Ação:** propagar `AbortController` do `useEffect` para as chamadas `dbFrom`, e no `.finally` checar `active` antes de setLoading/setError.
- **Aceite:** navegar entre rotas durante fetch inicial não gera warning "Can't perform a React state update on an unmounted component".

### F4-03 — Channel realtime com nome aleatório (`Math.random()`)

- **Origem:** Etapa 32 (Bloco 4).
- **Evidência:** `useRealtimeMessages.ts` linha ~330: `` const channelName = `messages-realtime-${Math.random().toString(36).slice(2, 9)}` ``.
- **Ação:** usar chave estável (ex.: `` `messages-realtime-${profile.id}` ``); cleanup async esperar unsubscribe antes de novo subscribe (usar promise).
- **Aceite:** logs mostram apenas 1 channel `messages-realtime-*` por sessão de user; unsubscribe → new subscribe é sequencial em StrictMode.

### F4-04 — `conversationSendState` computed fora de `useMemo`

- **Origem:** Etapa 32 (Bloco 4).
- **Evidência:** `useRealtimeMessages.ts` linhas ~560-600: `for (const c of conversations) { ... getSendStatus(m.id) }` — O(n·m) a cada render.
- **Ação:** envolver em `useMemo` com deps `[conversations, sendStateTick]`.
- **Aceite:** DevTools Profiler mostra o cálculo cacheado; render de 500 conversations sem re-computar quando outra parte do state muda.

### F4-05 — `USE_EXTERNAL_DB = true` hardcoded

- **Origem:** Etapa 31 (Bloco 4).
- **Evidência:** `useRealtimeInbox.ts` linha 27: `const USE_EXTERNAL_DB = true;`.
- **Ação:** trocar por `import.meta.env.VITE_USE_EXTERNAL_DB === 'true'`; documentar em `.env.example`.
- **Aceite:** toggle via env sem PR; teste em ambos os modos.

### F4-06 — `handleSelectConversation` chama `evolution-api/read-messages` fire-and-forget

- **Origem:** Etapa 31 (Bloco 4).
- **Evidência:** `useRealtimeInbox.ts` linha ~370: `void supabase.functions.invoke('evolution-api', { ... })` sem `.catch`.
- **Ação:** adicionar `.catch(err => log.warn('[read-messages] failed', err))` no mínimo; opcionalmente reintroduzir toast silenciado para não spammar.
- **Aceite:** falhas de `read-messages` aparecem em GlitchTip; UI não trava.

### F4-07 — Reconciliação de delivery limitada a `.slice(-10)`

- **Origem:** Etapa 32 (Bloco 4).
- **Evidência:** `useRealtimeInbox.ts` linha ~330: `const recent = selectedMessages.slice(-10)`.
- **Ação:** ampliar para todas as mensagens `external_id != null` da última janela (`created_at > now() - interval '5min'`).
- **Aceite:** teste com burst de 20 mensagens: todas reconciliam com queue.

### F4-08 — `seededAvatarsRef` sem limpeza — memory leak

- **Origem:** Etapa 33 (Bloco 4).
- **Ação:** convert `Set<string>` para `Map<string, timestamp>` com TTL 30min; sweep periódico via `setInterval`.
- **Aceite:** heap snapshot após 4h de uso mostra Set com < 1000 entries.

### F4-09 — `convProbeRef` log de debug em produção

- **Origem:** Etapa 33 (Bloco 4).
- **Evidência:** `useRealtimeInbox.ts` linhas ~140-165: `log.info('[probe] conversations state', { ... })`.
- **Ação:** guard com `import.meta.env.DEV` ou remover completamente.
- **Aceite:** produção não tem entradas `[probe]` no console.

### F4-10 — `processedDeliveriesRef` (Set) cresce sem cap

- **Origem:** Etapa 32 (Bloco 4).
- **Evidência:** `useMessageQueue.ts` linha ~30: `const processedDeliveriesRef = useRef<Set<string>>(new Set())`. Cada `reconcileWithDelivery` adiciona; nunca remove.
- **Ação:** substituir por LRU (`lru-cache` já em deps) com cap de 5000.
- **Aceite:** heap snapshot em session de 8h mostra < 5000 entries.

### F4-11 — `localStorage.setItem` sem try/catch em useMessageQueue

- **Origem:** Etapa 32 (Bloco 4).
- **Evidência:** `useMessageQueue.ts` linha ~135: `useEffect(() => { localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queueToSave)); }, [queue])`.
- **Ação:** envolver em try/catch; no catch emitir `CustomEvent('zapp:storage-quota-exceeded')` (reuso do handler do F3-10).
- **Aceite:** encher localStorage propositalmente + enfileirar msg → toast aparece; sem crash.

### F4-12 — `beforeunload` handler ausente — cascade de sends no próximo load

- **Origem:** Etapa 32 (Bloco 4).
- **Ação:** listener `beforeunload` que marque items `sending` como `pending` no localStorage antes do unload (already handled parcialmente no restore, mas garantir ordem).
- **Aceite:** fechar aba com 10 msgs pending, reabrir → sends ocorrem em rate limitado (não paralelo).

### F4-13 — Classificação de erro sem diferenciar retryable

- **Origem:** Etapa 32 (Bloco 4).
- **Evidência:** `useMessageQueue.ts` linhas ~230-260: qualquer erro é considerado retryable até esgotar `maxRetries`. Erros 400/403 (validação) retentam desnecessário.
- **Ação:** classificar via `messageSenderHelpers.classifyAuthError` + novos helpers para 4xx permanentes.
- **Aceite:** erro 400 é `failed` imediato (sem retry); 429/5xx entra no loop.

### F4-14 — `dbFrom('failed_messages').insert` falha silenciosa

- **Origem:** Etapa 32 (Bloco 4).
- **Evidência:** `zapp.failed_messages` está **vazia** apesar do path `!shouldAutoRetry` no useMessageQueue inserir.
- **Ação:** (a) confirmar RLS da tabela; (b) `.insert(...).select()` para ter erro estruturado; (c) log estruturado do erro em GlitchTip.
- **Aceite:** forçar 4 falhas seguidas → registro aparece em `failed_messages`; se der erro, GlitchTip captura.

### F4-15 — `sendMessageToContact` faz 8 round-trips por mensagem

- **Origem:** Etapa 32 (Bloco 4).
- **Evidência:** `messageSender.ts` — 8 queries no happy path.
- **Ação:** criar RPC SECDEF `rpc_send_message_atomic(p_contact_id, p_content, p_type, p_media_url, p_optimistic_id, p_conversation_id)` que faz insert de mensagem + audit_logs em 1 transação, retornando `messageId` + payload pronto para Evolution. Front chama a RPC, depois invoca Evolution, depois RPC de finalize.
- **Aceite:** envio de 50 mensagens rápidas gera 100 queries (2× por msg) em vez de 400.

### F4-16 — `buildSendIdempotencyKeyFromFingerprint` 5min bucket colide

- **Origem:** Etapa 32 (Bloco 4).
- **Ação:** reduzir bucket para 30s OU incluir hash do timestamp exato do add-to-queue no fingerprint.
- **Aceite:** manual retry com conteúdo diferente após 30s gera nova key.

### F4-17 — `messageSender.audit_logs` fire-and-forget sem retry

- **Origem:** Etapa 32 (Bloco 4).
- **Evidência:** `.then(() => null).catch(e => log.warn(...))` para writes de audit.
- **Ação:** enfileirar em local buffer + flush retry 3× com backoff; se falhar 3×, escrever em `localStorage` como fallback.
- **Aceite:** simular DB offline durante audit_log write → audit não é perdido.

### F4-18 — `retry_attempt` e `error_reason` 100% NULL em `messages` (bug de persistência)

- **Origem:** Etapa 33.5 (Bloco 4).
- **Evidência:** 8 failed + 23 pending com `error_code/error_reason/retry_attempt = NULL`. Código de `messageSender.ts` explicitamente escreve esses campos.
- **Ação:**
  1. Investigar `fn_messages_instead_of_update` (`INSTEAD OF UPDATE` na view `messages`) — provavelmente descarta os campos que não estão na tabela-fonte `evo.evolution_messages`.
  2. Adicionar colunas `error_code`, `error_reason`, `retry_attempt`, `retry_total` em `evo.evolution_messages` (ou tabela `zapp.message_send_metadata` linkada por FK).
  3. Ajustar trigger para propagar corretamente.
- **Aceite:** query `SELECT COUNT(*) FROM zapp.messages WHERE status='failed' AND error_reason IS NOT NULL` retorna > 0 após 1 dia em produção.

### F4-19 — `extractEvolutionMessageId` pode retornar null; msgs sent sem external_id

- **Origem:** Etapa 32 (Bloco 4).
- **Evidência:** 42 messages sem external_id, incluindo 1 sent e 1 delivered.
- **Ação:** se `extractEvolutionMessageId` retornar null e response 200, marcar status como `sent_unverified` e enfileirar job de reconciliation contra `evo.evolution_webhook_events_v2` que resolva o external_id pelo timestamp + phone.
- **Aceite:** teste manual — Evolution retorna 200 sem key.id → status = sent_unverified; após webhook chegar, resolve para external_id real.

### F4-20 — `useMediaUrl.refreshCache` sem cap (potencial 100s MB)

- **Origem:** Etapa 33 (Bloco 4).
- **Ação:** substituir por `LRUCache` com maxSize por bytes (ex.: 50 MB) usando `lru-cache` + `sizeCalculation`.
- **Aceite:** heap snapshot após visitar 500 conversas com mídia mostra cache < 60 MB.

### F4-21 — `buildFileHash(originalUrl) != buildFileHash(dataUrl)` — cache DB nunca hit

- **Origem:** Etapa 33 (Bloco 4).
- **Evidência:** `zapp.media_cache` **vazia** em produção.
- **Ação:** unificar a chave — hash do `originalUrl` como identidade + `storage_path` apontando para o cache real. Ou remover `media_cache` completamente e usar apenas cache em memória.
- **Aceite:** após 24h em produção, `zapp.media_cache` tem > 0 rows; hit rate > 50% em imagens visualizadas 2×.

### F4-22 — `media_cache.storage_path` armazenando data URL base64 (anti-pattern)

- **Origem:** Etapa 33 (Bloco 4).
- **Ação:** trocar para upload real ao R2/MinIO retornando URL público; `storage_path` = URL do bucket.
- **Aceite:** `avg(pg_column_size(storage_path))` em `media_cache` < 200 bytes.

### F4-23 — Cron `retry-stuck-messages` opera em tabela vazia (`outbound_message_queue`) — 23 msgs pending há 5 dias

- **Origem:** Etapa 33.5 (Bloco 4).
- **Evidência:** `fn_retry_stuck_messages()` faz `UPDATE zapp.outbound_message_queue SET status='pending'` mas a table está vazia; as mensagens presas estão em `zapp.messages` (via `evo.evolution_messages`).
- **Ação:**
  1. Reescrever `fn_retry_stuck_messages()` para operar em `evo.evolution_messages` diretamente: `WHERE status='pending' AND updated_at < now() - interval '10 min' AND (retry_attempt IS NULL OR retry_attempt < 3)`.
  2. Ao pegar, invocar edge function de re-send ou marcar como `failed` com `error_reason='timeout_pipeline'` se retry_attempt >= 3.
  3. Adicionar guard para não repostar msgs cuja Evolution API já processou (checar via `webhook_events_processed`).
- **Aceite:** após deploy, as 23 mensagens presas resolvem em < 30 min (sent com external_id OU failed com reason claro).

### F4-24 — Cron `media_pipeline_health_check` (jobid 213) falha por schema drift

- **Origem:** Etapa 33.5 (Bloco 4).
- **Evidência:** falhas históricas: `column "severity" of relation "warroom_alerts" does not exist` e `chk_warroom_alert_type` violation com `alert_type='media_pipeline'`.
- **Ação:** (a) verificar schema atual de `zapp.warroom_alerts` — adicionar coluna `severity` ou remover do INSERT; (b) atualizar constraint `chk_warroom_alert_type` para incluir `'media_pipeline'` ou trocar por outro tipo aceito.
- **Aceite:** run manual de `SELECT zapp.fn_run_media_health_alert()` sem erro; 4557 alertas históricos processados.

---

## Tema 9 — Frontend: admin e observabilidade

_(Ver Tema 13 abaixo — achados F7-01 a F7-32 no Bloco 7.)_

## Tema 10 — Infra, deploy e resiliência

_(aguardando Bloco 9 — próximo chat)_

---

## Tema 11 — Contatos e CRM

_(Achados F5-01 a F5-30 registrados no Bloco 5.)_

### F5-01 — CRÍTICO (P0): view `zapp.contacts` descarta silenciosamente CPF, endereço, is_blocked/is_favorite e vários outros campos

- **Origem:** Etapa 46 (Bloco 5).
- **Evidência:** `pg_get_viewdef('zapp.contacts')` mostra colunas HARDCODED: `NULL::text AS cpf`, `NULL::text AS address`, `NULL::text AS city`, `NULL::text AS state`, `'BR'::text AS country`, `false AS is_blocked`, `false AS is_favorite`, `NULL::text AS surname`, `'normal'::text AS ai_priority`, `'neutral'::text AS ai_sentiment`, `'whatsapp'::text AS channel_type`, `NULL::uuid AS channel_connection_id`, `NULL::text AS group_category`, `0 AS risk_score`. UI pode inserir/editar esses campos; DB descarta.
- **Ação:** decidir por coluna: (a) adicionar suporte real em `evo.evolution_contacts` + propagar via triggers, ou (b) remover da view e limpar UI. Não deixar coluna "fantasma".
- **Aceite:** cada coluna da view `zapp.contacts` ou é backed por dado real em `evo.evolution_contacts`, ou é removida.

### F5-02 — CRÍTICO (P0): trigger UPDATE da view `zapp.contacts` dropa campos LGPD, soft-delete, workspace e AI (mesmo padrão do F4-18)

- **Origem:** Etapa 47 (Bloco 5).
- **Evidência:** `fn_contacts_view_update_handler()` só propaga 16 colunas (`full_name`, `phone_number`, `email`, `profile_picture_url`, `lead_status`, `assigned_to`, `queue_id`, `company`, `notes`, `tags`, `whatsapp_labels`, `lead_score`, `last_message_at`, `instance_name`, `raw_data`, `updated_at`). Descartados: `deleted_at`, `deleted_by`, `deleted_reason`, `workspace_id`, `contact_type`, `ai_priority`, `ai_sentiment`, `channel_type`, `group_category`, `risk_score`, `lead_origin`, `last_seen_at`, `first_message_at`, `unread_count`, `total_purchases`, `consent_status`, `nickname`, `surname`, `first_name`, `last_name`, `role_title`, `is_blocked`, `is_favorite`, `cpf`, `address`, `city`, `state`, `country`.
- **Ação:**
  1. Enumerar quais campos precisam de writeback e adicionar clauses no trigger.
  2. Para campos que não precisam de writeback, torná-los somente-leitura na view (remover da UI de edição).
  3. Adicionar teste vitest que faça UPDATE em cada campo da view e verifique persistência.
- **Aceite:** teste `UPDATE zapp.contacts SET is_favorite=true WHERE id=X; SELECT is_favorite FROM zapp.contacts WHERE id=X` retorna `true` (ou é rejeitado com erro claro, não silenciado).

### F5-03 — CRÍTICO (P0): trigger DELETE da view faz HARD DELETE — viola requisito LGPD de soft-delete com undo 30d

- **Origem:** Etapa 49 (Bloco 5).
- **Evidência:** `fn_contacts_view_delete_handler()` executa `DELETE FROM evo.evolution_contacts WHERE id = OLD.id`. Sem soft-delete, sem timestamp, sem janela de undo. `evo.evolution_contacts` **tem** coluna `deleted_at` (implica soft-delete estava planejado), e a view filtra `WHERE ec.deleted_at IS NULL` — mas o trigger DELETE ignora tudo isso.
- **Ação:**
  1. Reescrever trigger como `UPDATE evo.evolution_contacts SET deleted_at = now() WHERE id = OLD.id`.
  2. Adicionar coluna `undo_expires_at timestamptz DEFAULT (now() + interval '30 days')`.
  3. Criar cron `hard-delete-expired-soft-deletes` que faz DELETE real onde `deleted_at < now() - interval '30 days'` (compliance LGPD: exclusão real após período).
  4. Adicionar RPC `undo_soft_delete(p_contact_id uuid)` gated por admin + janela de 30d.
- **Aceite:** DELETE via UI cria row com `deleted_at IS NOT NULL`; contato some da view mas persiste em `evo.evolution_contacts` por 30d; RPC `undo_soft_delete` restaura dentro da janela.

### F5-04 — CRÍTICO (P0): `zapp.merge_contacts()` LEVANTA EXCEPTION 'implementacao pendente (etapa 30)' — merge está morto desde deploy

- **Origem:** Etapa 48 (Bloco 5).
- **Evidência:** `pg_get_functiondef(zapp.merge_contacts)` mostra body de 5 linhas terminando em `RAISE EXCEPTION 'merge_contacts: implementacao pendente (etapa 30)' USING ERRCODE = '0A000'`. `SELECT COUNT(*) FROM evo.evolution_contacts WHERE merge_source_id IS NOT NULL` retorna **0** — feature nunca funcionou em produção. `bulk_auto_merge_duplicates` chama essa função em loop e propaga a exception.
- **Ação:**
  1. Implementar `merge_contacts(p_primary_id, p_secondary_id, p_merged_fields)` respeitando: (a) LGPD — se secundário tem `lgpd_consent_at` mais recente que primário, migrar consent; (b) merge `tags`, `whatsapp_labels`, `notes` (concatenar); (c) migrar `evo.evolution_messages.contact_id`, `evo.evolution_deals.contact_id`, `evo.evolution_tasks.contact_id`, `zapp.contact_notes.contact_id`, `zapp.contact_tags.contact_id` do secundário para primário; (d) marcar secundário como soft-deleted com `merge_source_id = p_primary_id`; (e) log em `zapp.audit_logs`.
  2. Adicionar teste vitest com 2 duplicatas → merge → verificar preservação de consent + mensagens.
- **Aceite:** RPC `merge_contacts` retorna `{success: true}` e produz row com `merge_source_id != NULL`; `bulk_auto_merge_duplicates` reduz duplicatas conhecidas em produção.

### F5-05 — CRÍTICO (P0): `bulk_soft_delete_contacts` referencia colunas `deleted_by`, `deleted_reason` que NÃO existem na view `zapp.contacts` — RPC falha em cada chamada

- **Origem:** Etapa 49 (Bloco 5).
- **Evidência:** RPC executa `UPDATE zapp.contacts SET deleted_at=now(), deleted_by=auth.uid(), deleted_reason=p_reason, updated_at=now()`. View `zapp.contacts` só tem coluna `deleted_at`; não expõe `deleted_by` nem `deleted_reason`. Postgres rejeita statement no parse com `column "deleted_by" of relation "contacts" does not exist`.
- **Ação:**
  1. Adicionar `deleted_by uuid`, `deleted_reason text` em `evo.evolution_contacts` (`deleted_reason` já existe — só falta `deleted_by`).
  2. Expor essas colunas na view `zapp.contacts` (SELECT + trigger UPDATE handler propagando).
  3. OU reescrever `bulk_soft_delete_contacts` para UPDATE direto em `evo.evolution_contacts` (bypass view).
  4. Alinhado com F5-03 (soft-delete real).
- **Aceite:** `SELECT bulk_soft_delete_contacts(ARRAY[<uuid>]::uuid[], 'test')` retorna `1` e a row em `evo.evolution_contacts` tem `deleted_at IS NOT NULL`, `deleted_by = <auth.uid()>`, `deleted_reason='test'`.

### F5-06 — CRÍTICO (P0): sem coluna CPF em `evo.evolution_contacts` e sem coluna CNPJ em lugar nenhum — feature de validação é impossível

- **Origem:** Etapa 46 (Bloco 5).
- **Ação:** Adicionar `cpf text`, `cnpj text` em `evo.evolution_contacts` + `pii_cpf_masked_at timestamptz`. Atualizar view + triggers.
- **Aceite:** INSERT com CPF persiste e retorna via SELECT.

### F5-07 — CRÍTICO (P0): sem `validate_cpf(text)` nem `validate_cnpj(text)` no banco

- **Origem:** Etapa 46 (Bloco 5).
- **Ação:** Implementar `zapp.validate_cpf/cnpj` IMMUTABLE com algoritmo dos DVs; adicionar CHECK constraint.

### F5-08 — CRÍTICO (P0): 5 estratégias diferentes de normalização de telefone

- **Origem:** Etapa 46, 48, 55 (Bloco 5).
- **Ação:** Escolher `fn_normalize_phone` como canônica; deprecar as outras 3 funções SQL + a lógica JS; criar UNIQUE INDEX funcional.

### F5-09 — CRÍTICO (P0): `add_contact_note` DESCARTA `p_note_type` e `p_is_pinned` silenciosamente

- **Origem:** Etapa 52 (Bloco 5).
- **Ação:** Adicionar colunas em `zapp.contact_notes` + ajustar RPC.

### F5-10 — CRÍTICO (P0): `useContactNotes.addNote` BYPASSA a RPC — INSERT direto

- **Origem:** Etapa 52 (Bloco 5).
- **Ação:** Trocar para `supabase.rpc('add_contact_note', ...)`.

### F5-11 — CRÍTICO (P0): `zapp.contact_notes` **VAZIA** em produção — feature 100% dead

- **Origem:** Etapa 52 (Bloco 5).
- **Ação:** Instrumentar telemetria; investigar RLS `contact_notes_insert`.

### F5-12 — CRÍTICO (P0): `search_contacts_cursor` NÃO usa `pg_trgm` — full scan em ILIKE

- **Origem:** Etapa 55 (Bloco 5).
- **Ação:** Criar índice `idx_ec_full_name_trgm`; reescrever RPC usando operator `%`.

### F5-13 — CRÍTICO (P0): `zapp.tags.name` UNIQUE global — cross-workspace conflict

- **Origem:** Etapa 50 (Bloco 5).
- **Ação:** Adicionar `workspace_id`; trocar UNIQUE para `(workspace_id, name)`.

### F5-14 — CRÍTICO (P0): RLS `contacts_insert` policy tem `WITH CHECK NULL`

- **Origem:** Etapa 46 (Bloco 5).
- **Ação:** `ALTER POLICY contacts_insert WITH CHECK (assigned_to = ... OR is_admin_or_supervisor())`.

### F5-15 — CRÍTICO (P0): RLS `contacts_select` expõe contatos `assigned_to IS NULL` a TODOS

- **Origem:** Etapa 46 (Bloco 5).
- **Ação:** Remover `OR (assigned_to IS NULL)` OU condicionar a workspace.

### F5-16 — CRÍTICO (P0): `get_default_workspace_id()` retorna workspace mais antigo

- **Origem:** Etapa 46 (Bloco 5).
- **Ação:** Adicionar `workspace_id` real em `evo.evolution_contacts`; atualizar view/triggers/policies.

### F5-17 — `bulk_add_tag` sem cap de tamanho + sem visibility check

- **Origem:** Etapa 50 (Bloco 5).
- **Ação:** Cap 1000; filtrar por workspace.

### F5-18 — `bulk_auto_merge_duplicates` seleção de primário sem regra LGPD

- **Origem:** Etapa 48 (Bloco 5).
- **Ação:** Precedência: se qualquer merged tem opt-out, resultado é opt-out.

### F5-19 — `get_contact_intelligence_by_phone` lê SÓ `evolution_messages_wpp2` — multi-instância bug

- **Origem:** Etapa 51 (Bloco 5).
- **Ação:** UNION ALL de todas as instâncias OU consulta via `zapp.messages` (canonical).

### F5-20 — Contact analytics sem workspace filter

- **Origem:** Etapa 55 (Bloco 5).
- **Ação:** adicionar `AND workspace_id = ...` após F5-16.

### F5-21 — `search_contacts_cursor` faz COUNT CTE em cada página

- **Origem:** Etapa 55 (Bloco 5).
- **Ação:** COUNT só na primeira página.

### F5-22 — `search_contacts_cursor` sem normalização de phone

- **Origem:** Etapa 55 (Bloco 5).
- **Ação:** detectar dígitos + `fn_normalize_phone`.

### F5-23 — busca só em `name`, `email`, `phone` — não em company, job_title, nickname, cpf

- **Origem:** Etapa 55 (Bloco 5).
- **Ação:** expandir WHERE + indexes trgm.

### F5-24 — `pageIndexToCursor` sem deep-link support

- **Origem:** Etapa 55 (Bloco 5).
- **Ação:** cursor encodado na URL.

### F5-25 — `useContactNotes` N+1 + sem pagination + sem edit mutation

- **Origem:** Etapa 52 (Bloco 5).
- **Ação:** RPC com JOIN + pagination.

### F5-26 — 20445 contatos, ZERO com LGPD consent — compliance ausente

- **Origem:** Etapa 49 (Bloco 5).
- **Ação:** RPC `record_lgpd_consent` + trigger + UI opt-in.

### F5-27 — Trigger INSERT assume individual — quebra grupos `@g.us`

- **Origem:** Etapa 46 (Bloco 5).
- **Ação:** detecção via `channel_type` OU exigir `remote_jid` explícito.

### F5-28 — `rpc_get_contact` expõe deals/messages/tasks de contatos opted-out — LGPD violation

- **Origem:** Etapa 46 (Bloco 5).
- **Ação:** adicionar `AND lgpd_opt_out_at IS NULL`.

### F5-29 — Sem FK `zapp.contacts` ↔ `zapp.empresas`

- **Origem:** Etapa 54 (Bloco 5).
- **Ação:** decidir modelagem; documentar.

### F5-30 — `zapp.tags` schema mistura AI suggestions com canonical

- **Origem:** Etapa 50 (Bloco 5).
- **Ação:** separar em `zapp.tags` + `zapp.contact_tag_suggestions`.

---

## Tema 12 — Conexões WhatsApp

_(Achados F6-01 a F6-30 registrados no Bloco 6.)_

### F6-01 — CRÍTICO (P0): pairing code 100% AUSENTE do código

- **Origem:** Etapa 58 (Bloco 6).
- **Evidência:** grep de "pairing" retorna 1 hit (só JSDoc). Nenhuma implementação.
- **Ação:** implementar action `pairing-code`, `requestPairingCode()`, botão em `QrCodeDialog`.
- **Aceite:** conexão via pairing code funciona.

### F6-02 — CRÍTICO (P0): `handleAddConnection` NÃO chama Evolution `/instance/create`

- **Origem:** Etapa 56 (Bloco 6).
- **Evidência:** `useConnectionsActions.ts` só faz INSERT no banco; nunca chama `createInstance`.
- **Ação:** chamar `createInstance` antes do INSERT; usar `instanceId` retornado; rollback em falha.

### F6-03 — CRÍTICO (P0): estado divergente wpp2 entre `whatsapp_connections` e `evolution_instance_credentials`

- **Origem:** Etapa 60 (Bloco 6).
- **Evidência:** UI mostra "conectado" enquanto Evolution está unhealthy; 17 alerts wpp2_disconnection em 7d.
- **Ação:** `evolution_instance_credentials.health_status` como fonte única; remover `health_status` de `whatsapp_connections`.

### F6-04 — CRÍTICO (P0): 3 fontes de verdade para instância sem canonical

- **Origem:** Etapa 56, 60, 61, 64 (Bloco 6).
- **Ação:** decidir canonical; documentar em `docs/audits/instance-source-of-truth.md`; migrar RPCs e crons.

### F6-05 — CRÍTICO (P0): `fn_reconcile_dispatch` reutiliza `request_id` do net_worker → 373 rows (22%) com applied_at anterior a dispatched_at

- **Origem:** Etapa 59 (Bloco 6).
- **Ação:** `ON CONFLICT DO NOTHING` em vez de UPDATE; backfill.

### F6-06 — CRÍTICO (P0): `fn_alert_wpp2_disconnection` hardcoded para instance_name='wpp2'

- **Origem:** Etapa 60, 61 (Bloco 6).
- **Ação:** refatorar para `fn_alert_instance_disconnection(p_instance text)` iterando conexões ativas.

### F6-07 — `fn_alert_wpp2_disconnection` NÃO é SECURITY DEFINER

- **Origem:** Etapa 60 (Bloco 6).
- **Ação:** `ALTER FUNCTION ... SECURITY DEFINER SET search_path = ...`.

### F6-08 — CRÍTICO (P0): 17 de 18 alerts `wpp2_disconnection` nunca resolvidos (94% backlog)

- **Origem:** Etapa 60 (Bloco 6).
- **Ação:** trigger AFTER UPDATE em `whatsapp_connections` auto-resolve; cron `auto-resolve-stale-alerts`.

### F6-09 — CRÍTICO (P0): cron `wpp2_disconnection_watchdog` schedule `*/10 6-23 * * *` — 6h gap noturno

- **Origem:** Etapa 60 (Bloco 6).
- **Ação:** trocar para `*/10 * * * *`; severity noturna via `EXTRACT(hour ...)`.

### F6-10 — cron `sync-instance-registry-status` perdeu 11% das execuções (256/288)

- **Origem:** Etapa 64 (Bloco 6).
- **Ação:** identificar gaps; escalonar schedule; alertar em `warroom_alerts` se gap > 15min.

### F6-11 — 6 triggers em `whatsapp_connections`; 4 são duplicatas divergentes

- **Origem:** Etapa 62 (Bloco 6).
- **Ação:** DROP versões antigas; manter `trg_wconn_updated_at` e `trg_clear_qr_connect`.

### F6-12 — `fn_validate_whatsapp_connection_url` cai para hardcoded default — não fail-secure

- **Origem:** Etapa 56 (Bloco 6).
- **Ação:** remover fallback hardcoded; mensagem genérica sem info leak.

### F6-13 — CRÍTICO (P0): `api_url` e `api_key` NOT NULL sem default — INSERT via UI falharia

- **Origem:** Etapa 56 (Bloco 6).
- **Ação:** adicionar defaults; teste E2E de criação de conexão.

### F6-14 — 2 conexões em `whatsapp_connections` órfãs (sem `evolution_instance_credentials`)

- **Origem:** Etapa 63, 64 (Bloco 6).
- **Ação:** investigar sync-instance-registry-status; decidir provisão OU delete; adicionar FK constraint.

### F6-15 — "WPP Marketing (Cloud API Oficial)" tem `api_type='evolution'` — nome enganoso

- **Origem:** Etapa 56 (Bloco 6).
- **Ação:** corrigir tipo OU deletar; validação em `handleAddConnection`.

### F6-16 — CRÍTICO (P0): `created_by = NULL` em 3/3 rows — ownership perdida

- **Origem:** Etapa 56 (Bloco 6).
- **Ação:** backfill; `NOT NULL DEFAULT auth.uid()`; trigger de rejeição.

### F6-17 — CRÍTICO (P0): RLS `wconn_insert_auth` permite orphan INSERTs (`created_by IS NULL` no CHECK)

- **Origem:** Etapa 56 (Bloco 6).
- **Ação:** `ALTER POLICY ... WITH CHECK (created_by = auth.uid() AND workspace_id = ...)`.

### F6-18 — Policy `auth_secure_123` (nome de código de teste) em produção

- **Origem:** Etapa 56 (Bloco 6).
- **Ação:** rename para `whatsapp_connections_agent_or_admin_read`.

### F6-19 — CRÍTICO (P0): `evo.evolution_ip_watch` = 0 rows — pipeline VPS→DB de detecção 401 morto

- **Origem:** Etapa 65 (Bloco 6).
- **Ação:** escolher entre (a) configurar Traefik→DB; (b) usar GlitchTip; (c) descontinuar.

### F6-20 — CRÍTICO (P0): `fn_detect_401_bursts` documenta próprio "monitoring gap" no comentário

- **Origem:** Etapa 65 (Bloco 6).
- **Ação:** mover checklist para runbook; simplificar função.

### F6-21 — CRÍTICO (P0): 373 reconcile_jobs (22%) com `applied_at < dispatched_at - 1 day` — telemetria corrompida

- **Origem:** Etapa 59 (Bloco 6).
- **Ação:** corrigir F6-05 primeiro; backfill; CHECK constraint.

### F6-22 — 1389 alertas em `warroom_alerts` em 7d (863 info + 385 critical + 141 warning) — alert fatigue

- **Origem:** Etapa 60, 65 (Bloco 6).
- **Ação:** auditoria por tipo; rate limit; deduplicação.

### F6-23 — `evo.evolution_alerts` 269 unresolved backlog — nenhum triage

- **Origem:** Etapa 60 (Bloco 6).
- **Ação:** dashboard admin; SLA por severidade; auto-escalation.

### F6-24 — `instance_registry` 22 rows, só 3 provisionadas (14%)

- **Origem:** Etapa 61, 64 (Bloco 6).
- **Ação:** auditar 22 rows; documentar como "registry de intenção"; adicionar `archived_reason`.

### F6-25 — `instance_auth_events` últimas 17 rows com `event_type=NULL` — instrumentação quebrada

- **Origem:** Etapa 65 (Bloco 6).
- **Ação:** investigar produtor; NOT NULL constraints; log estruturado.

### F6-26 — Test coverage módulo connections: 2 test files para ~30 arquivos

- **Origem:** Etapa 56-65 (Bloco 6).
- **Ação:** priorizar tests para `useConnectionsActions`, `whatsappConnectionService`; snapshot tests.

### F6-27 — CRÍTICO (P0): `useEvolutionAutoSync` SELECT sem filtro por workspace — cross-tenant leak potencial

- **Origem:** Etapa 61 (Bloco 6).
- **Ação:** `.eq('workspace_id', workspace.id)`; INSERT com workspace_id explícito.

### F6-28 — `handleDelete` engole erro do Evolution API `.catch(log.warn)` — instância órfã

- **Origem:** Etapa 63 (Bloco 6).
- **Ação:** enfileirar em `zapp.evolution_pending_deletes` para retry via cron.

### F6-29 — `handleAddConnection` valida só `name` — permite `phone_number` vazio

- **Origem:** Etapa 56 (Bloco 6).
- **Ação:** validar `phone_number` com `isValidBrazilianPhone`; schema Zod.

### F6-30 — Múltiplas cópias de tabelas em múltiplos schemas: 13 objetos para 5 nomes distintos

- **Origem:** Etapa 56, 60, 61 (Bloco 6).
- **Ação:** documentar em `docs/db/schema-topology.md`; views compat como thin passthroughs; auditar necessidade.

---

## Tema 13 — Admin, monitoramento, dashboards (Bloco 7)

### F7-01 — `PerformanceDashboard.tsx` renderiza `// @technical` como texto literal em 3 blocos JSX

- **Origem:** Etapa 66 (Bloco 7).
- **Evidência:** `src/pages/admin/PerformanceDashboard.tsx` linhas ~120-140 (bloco "Budget de Performance (CI Gate)"): 3 ocorrências de `// @technical` fora de `{/* */}` — texto renderizado no DOM. Usuário vê `< 2500ms // @technical` na tela.
- **Ação:**
  1. Trocar por comentário JSX válido: `{/* @technical */}` ou remover.
  2. Adicionar teste de snapshot da `PerformanceDashboard` para pegar strings inesperadas.
  3. Lint rule (ESLint plugin `react/jsx-no-comment-textnodes`).
- **Aceite:** DOM não contém texto `// @technical`; teste snapshot passa.

### F7-02 — `AdminBridgeStatusPage.tsx` mesmo bug após `</p>`

- **Origem:** Etapa 66 (Bloco 7).
- **Evidência:** `src/pages/admin/AdminBridgeStatusPage.tsx` linha ~65: `// @technical` aparece como texto entre elementos irmãos.
- **Ação:** trocar por `{/* @technical */}` ou remover. Aplicar lint rule global.
- **Aceite:** mesma verificação que F7-01.

### F7-03 — `AdminEmailAuditPage.tsx` `// @technical` dentro do children de `<Badge>`

- **Origem:** Etapa 66 (Bloco 7).
- **Evidência:** `src/pages/admin/AdminEmailAuditPage.tsx` linha ~125: `// @technical` está dentro do children do `<Badge>` — quebra linha visual antes de `Total:`.
- **Ação:** remover.
- **Aceite:** Badge exibe apenas "Total: N".

### F7-04 — `AdminBridgeStatusPage.tsx` latência 42ms e uptime 99.9% hardcoded

- **Origem:** Etapa 67 (Bloco 7).
- **Evidência:** KPI cards com valor literal `'42ms'` e `'99.9%'` — "Latência Bridge" NÃO mede; "Uptime 24h" NÃO calcula.
- **Ação:**
  1. Latência real: `ping = performance.now(); await fetch(healthUrl); latency = performance.now() - ping;`
  2. Uptime: agregar `zapp.webhook_health_checks`.
  3. Se dado não disponível, exibir "—" com tooltip "Sem dados".
- **Aceite:** valores refletem tráfego real.

### F7-05 — `AuditEvidenceDashboard.tsx` página inteira MOCK ESTÁTICO

- **Origem:** Etapa 67 (Bloco 7).
- **Evidência:** `src/pages/admin/AuditEvidenceDashboard.tsx` (78 L completo): array `evidences` com 3 items hardcoded, badge `V5.0.0-PROD` hardcoded, botão "Ver no Repositório" sem `href`.
- **Ação:**
  1. Se conformidade é objetivo real: puxar de `zapp.compliance_evidences` (a criar).
  2. Botão com `href={buildGithubUrl(ev.path)}` (usar `GITHUB_URL` env).
  3. Se não é: **remover a página** e sua rota do sidebar.
- **Aceite:** ou página lê dados reais e "Ver no Repositório" abre GitHub, ou página é removida.

### F7-06 — `setLastLastUpdate` (typo)

- **Origem:** Etapa 68 (Bloco 7).
- **Evidência:** `PerformanceDashboard.tsx` linha 8: `const [lastUpdate, setLastLastUpdate] = useState(new Date());`.
- **Ação:** renomear para `setLastUpdate`.
- **Aceite:** grep `setLastLastUpdate` retorna zero.

### F7-07 — Normalização de progress bar hardcoded a 4000 para todas as métricas Web Vitals

- **Origem:** Etapa 68 (Bloco 7).
- **Evidência:** `<Progress value={Math.min((m.value / 4000) * 100, 100)} />`. CLS (0-1) dá 0.025%; TTFB (100-500ms) 2-12%; INP (200ms good) 5%. Comparação sem sentido.
- **Ação:**
  1. `THRESHOLDS = { LCP: 2500, INP: 200, CLS: 0.1, FCP: 1800, TTFB: 800 }`.
  2. `value = Math.min((m.value / THRESHOLDS[m.name]) * 100, 100)`.
  3. Cor por rating: green/yellow/red.
- **Aceite:** cada métrica tem barra própria; LCP=2500ms → barra ~100% no limite.

### F7-08 — Polling 500x/hora sem `document.visibilityState`

- **Origem:** Etapa 68 (Bloco 7).
- **Evidência:** `const interval = setInterval(update, 2000);` sem pausar quando aba oculta.
- **Ação:**
  1. Pausar quando `document.hidden === true` (listener `visibilitychange`).
  2. Aumentar intervalo para 5-10s.
  3. Ou event-driven via `web-vitals` library com callbacks.
- **Aceite:** DevTools performance profiler mostra idle quando aba oculta.

### F7-09 — Rota `/admin/webhook-overview` inexistente

- **Origem:** Etapa 69 (Bloco 7).
- **Evidência:** `AdminInboxSyncStatusPage.tsx` alert "sem inbound" linka `<Link to="/admin/webhook-overview">`. Listagem de `src/pages/admin/` NÃO contém `AdminWebhookOverviewPage.tsx`. Route table cai em NotFound.
- **Ação:**
  1. Criar página `AdminWebhookOverviewPage` OU redirecionar para `/admin/whatsapp-logs` (tab webhooks).
  2. Grep global de `Link to="/admin/...` e validar cada destino.
- **Aceite:** clique no link não gera 404.

### F7-10 — `AdminChannelsPage.tsx` `color: "bg-primary"` usado como inline style `backgroundColor`

- **Origem:** Etapa 70 (Bloco 7).
- **Evidência:** `emptyChannel()` retorna `color: "bg-primary"` (classe Tailwind), depois usado em `<span style={{ backgroundColor: ch.color }}>` — CSS `background-color: bg-primary` é inválido. Canais criados via UI ficam sem cor de fundo.
- **Ação:**
  1. Padronizar: guardar `color` como hex ou CSS variable name.
  2. `emptyChannel()` retorna `color: 'var(--primary)'`.
  3. Migration: `UPDATE zapp.service_channels SET color = CASE ... END`.
- **Aceite:** canais existentes renderizam com fundo colorido.

### F7-11 — `zapp.provider_message_log` = 0 rows total

- **Origem:** Etapa 71 (Bloco 7).
- **Evidência:** `AdminWhatsAppLogsPage` diz "provider_message_log — últimas 150 entradas" mas painel sempre em EmptyState. Sistema em produção deveria estar logando.
- **Ação:**
  1. Auditar edge functions de envio — inserção está sendo chamada?
  2. Verificar RLS/NOT NULL bloqueando insert.
  3. `RAISE NOTICE` para debug.
- **Aceite:** enviar 1 mensagem via UI → 1 row com `direction='outbound'` e `delivery_status` populado.

### F7-12 — `AdminSecurityLogsPage` KPI "Tentativas Negadas (24h)" mente sobre janela

- **Origem:** Etapa 71 (Bloco 7).
- **Evidência:** 
  1. `zapp.security_audit_logs` = 0 rows total.
  2. Código: `logs.filter((l) => l.status === 'denied').length` — filtra lista COMPLETA (sem 24h).
- **Ação:**
  1. `logs.filter(l => l.status === 'denied' && new Date(l.created_at) > new Date(Date.now() - 24*3600*1000)).length`.
  2. Ou puxar do backend agregado via RPC.
  3. Auditar por que `security_audit_logs` está vazia.
- **Aceite:** tabela populada; KPI reflete janela de 24h.

### F7-13 — Painel Rate Limiting inteiro sempre em zero

- **Origem:** Etapa 71 (Bloco 7).
- **Evidência:** `rate_limit_logs=0`, `blocked_ips=0`, `ip_whitelist=0`. `RateLimitDashboard.tsx` (489 L) exibe 4 KPIs cards + 5 tabs permanentemente vazios.
- **Ação:**
  1. Auditar se rate-limiting está de fato ativo — provavelmente não.
  2. Se não é implementado: **remover a página**.
  3. Se é implementado mas escreve em outra tabela: mapear e migrar hook.
- **Aceite:** painel exibe dados reais OU não existe.

### F7-14 — `webhook_health_alerts` 724 unresolved (98.6% backlog); sistema pede "não vá pra prod"

- **Origem:** Etapa 72 (Bloco 7).
- **Evidência:** total=734, unresolved=724, last_24h=20. Breakdown: `burnin_critical_alert=709`, `lovable_parity_drift=9`, `burnin_disconnection=4`, `backup_sentinel_stale=2`. Título recorrente: `E10-03: N new critical alert(s) during burn-in — 72h counter reset. Investigate before go-live.` Cron 145 gera 1-2/h.
- **Ação:**
  1. Decidir política: (a) burn-in acabou → desativar cron 145 + resolver massa; (b) burn-in continua → criar `AdminBurnInMonitorPage` com triage/resolve em batch.
  2. Trigger auto-resolve quando counter zera.
  3. Widget de backlog no sidebar admin.
- **Aceite:** backlog < 50; nenhum alerta com "go-live" após decisão.

### F7-15 — Cron 213 `media_pipeline_health_check` 42.8% falha

- **Origem:** Etapa 73 (Bloco 7).
- **Evidência:** Duas cascatas: (a) coluna `severity` NÃO EXISTE em `warroom_alerts`; (b) `alert_type='media_pipeline'` viola `chk_warroom_alert_type`.
- **Ação:**
  1. Verificar schema real e coluna equivalente a "severity".
  2. Adicionar `'media_pipeline'` ao CHECK ou usar valor existente.
  3. Atualizar `fn_run_media_health_alert()`.
  4. `fn_verify_warroom_schema()` no CI.
- **Aceite:** cron 213 100% sucesso nas próximas 24h.

### F7-16 — Cron 100 `analytics-log-retention` 100% falha (`dblink` não instalada)

- **Origem:** Etapa 73 (Bloco 7).
- **Evidência:** `function public.dblink(text, text) does not exist`. Extensão dblink NÃO instalada.
- **Ação:**
  1. `CREATE EXTENSION IF NOT EXISTS dblink;` (via `supabase_db_query`).
  2. Ou reescrever para não usar dblink (FDW permanente).
- **Aceite:** cron 100 sucesso.

### F7-17 — `remote_jid` completo em URL query (PII em logs)

- **Origem:** Etapa 74 (Bloco 7).
- **Evidência:** `<Link to={`/?contact=${encodeURIComponent(c.remote_jid)}`}>` em `AdminInboxSyncStatusPage.tsx` — vaza número WhatsApp em logs/Referer/telemetria.
- **Ação:**
  1. Alternativa A: `useNavigate` com state (`navigate('/', { state: { contact } })`).
  2. Alternativa B: hash SHA-256 (`?c=abc123`) + lookup via RPC.
  3. Grep de `to={\`/?contact=` e corrigir todos.
- **Aceite:** DevTools Network → nenhuma URL contém número WhatsApp.

### F7-18 — `hmac_selftest_audit` = 0 rows

- **Origem:** Etapa 71 (Bloco 7).
- **Evidência:** Edge function `webhook-hmac-selftest` roda (botão dispara) mas nunca insere audit.
- **Ação:**
  1. Auditar edge function — está tentando insert? Que erro?
  2. Verificar RLS/GRANT — service_role tem INSERT?
  3. `RAISE NOTICE`/`console.error` para debug.
- **Aceite:** clicar "Rodar novamente" → 1 row em `hmac_selftest_audit`.

### F7-19 — `STATUS_BADGE[ch.status]` sem defensive fallback

- **Origem:** Etapa 70 (Bloco 7).
- **Evidência:** `AdminChannelsPage.tsx` — se `ch.status='provisioning'` (não mapeado), `statusInfo=undefined` → `TypeError`.
- **Ação:** `const statusInfo = STATUS_BADGE[ch.status] ?? { label: ch.status, variant: 'outline' };` + teste.
- **Aceite:** canal com status `'unknown'` renderiza Badge sem crash.

### F7-20 — `automation_executions` = 0 rows

- **Origem:** Etapa 71 (Bloco 7).
- **Evidência:** `AdminAutomationLogsPage` mostra filtros elaborados mas tabela vazia. Regras são criadas (`AdminAutomationsPage` 790 L) mas execuções não logadas OU escritas em outra tabela.
- **Ação:**
  1. Auditar `useAutomationLogs` — qual tabela consulta?
  2. Se `evo.evolution_automation_logs` for real, criar view compat.
  3. Verificar engine de execução — insere onde?
- **Aceite:** disparar regra manualmente → row visible no painel.

### F7-21 — `HmacSelfTestPage` useEffect com dependência `[run]` — risco de loop infinito

- **Origem:** Etapa 75 (Bloco 7).
- **Evidência:** `useEffect(() => { void run(); }, [run])`. Se `run` NÃO estiver em `useCallback` dentro de `useHmacSelfTest`, muda referência a cada render → loop.
- **Ação:**
  1. Auditar `useHmacSelfTest.ts` — confirmar `run` em `useCallback`.
  2. Se não: envolver em `useCallback` OU usar ref pattern.
  3. Teste: mount + assert 1 chamada após 500ms.
- **Aceite:** DevTools Network → só 1 request no mount.

### F7-22 — Botão "Run test suite" sem confirmação; label hardcoded "50 testes"

- **Origem:** Etapa 75 (Bloco 7).
- **Evidência:** `AdminEvoApiHealthPage.tsx` — clique acidental dispara 50 tests em produção sem confirmação.
- **Ação:**
  1. `<AlertDialog>` com "Executar 50 testes em produção?".
  2. Label dinâmico: `Rodando ${data?.total_tests ?? 'os'} testes…`.
  3. Rate-limit server: 1 run a cada 5min.
- **Aceite:** clicar → dialog; segundo clique <5min → toast "aguarde".

### F7-23 — Decisão de variant baseada em `overall?.includes('🟢')` (contrato frágil)

- **Origem:** Etapa 75 (Bloco 7).
- **Evidência:** `<Alert variant={readiness.overall?.includes('🟢') ? 'default' : 'destructive'}>`. Se backend trocar emoji, todos os banners viram destructive.
- **Ação:**
  1. Backend retorna `readiness.status: 'healthy' | 'degraded' | 'error'` (enum) + `overall_label` string.
  2. Frontend usa enum.
  3. Contract test Zod na resposta RPC.
- **Aceite:** trocar emoji não muda comportamento visual.

### F7-24 — `AdminWhatsAppWebhookVerifyCard.tsx` chave React duplicável

- **Origem:** Etapa 75 (Bloco 7).
- **Evidência:** `<li key={`${p.kind}-${p.created_at}`}>` — 2 pings do mesmo tipo no mesmo ms → warning + remount errado.
- **Ação:** incluir `id`: `<li key={p.id ?? `${p.kind}-${p.created_at}`}>`. Adicionar `id` no payload retornado.
- **Aceite:** console sem warnings de duplicate key.

### F7-25 — Cloud API webhook sem tráfego há 90 dias

- **Origem:** Etapa 75b (Bloco 7).
- **Evidência:** `zapp.whatsapp_cloud_webhook_pings`: 173 total, 0 last 24h, 0 last 7d. Último: `2026-05-04 10:30 UTC`. `AdminWhatsAppWebhookVerifyCard` sempre zero. Sem alertagem.
- **Ação:**
  1. Investigar: (a) canal Cloud API desligado? (b) Meta parou de enviar?
  2. Cron `cloud-api-webhook-heartbeat` (1h): alerta se `max(created_at) < now() - 4h`.
  3. Badge "Silêncio há X dias" no card.
  4. Decidir se Cloud API é usado — se não, arquivar handler.
- **Aceite:** decisão documentada + alerta futuro.

### F7-26 — `AdminQueuesPage` helper `NOT_IMPLEMENTED` em produção

- **Origem:** Etapa 75 (Bloco 7).
- **Evidência:** `const NOT_IMPLEMENTED = 'Ação indisponível nesta versão. Em breve.'; const notImplemented = () => toast.info(NOT_IMPLEMENTED);`.
- **Ação:**
  1. Grep de `notImplemented(` — identificar botões.
  2. Remover botões OU implementar OU marcar "Em breve" com tooltip + desabilitar.
- **Aceite:** nenhum toast "Ação indisponível" em uso normal.

### F7-27 — `AdminProvidersPage` promete "health-check 2min" mas `provider_configs` vazia

- **Origem:** Etapa 75 (Bloco 7).
- **Evidência:** Descrição promete health-check automático 2min, mas tabela vazia.
- **Ação:**
  1. Verificar cron: `SELECT * FROM cron.job WHERE command ILIKE '%provider_configs%'`.
  2. Se cron existe mas tabela vazia: nada roda; texto misleading.
  3. Se cron não existe: implementar OU remover texto.
- **Aceite:** ou tabela populada + cron ativo + descrição verdadeira, ou descrição atualizada.

### F7-28 — `AdminSecurityLogsPage` comentário TODO em prod, filtro sem janela

- **Origem:** Etapa 75 (Bloco 7).
- **Evidência:** Grid tem 4 slots mas 1 card + comentário `{/* Adicionar mais cards conforme necessário */}`. Filtro sem janela 24h (mesmo bug de F7-12).
- **Ação:**
  1. Adicionar 3 cards: "Mudanças de permissão (24h)", "Logins de admin (7d)", "Falhas de RLS (24h)".
  2. Corrigir filtro respeitando "24h".
  3. Remover comentário TODO.
- **Aceite:** grid com 4 cards; filtros janelados corretos.

### F7-29 — `AdminFailedAuthMessagesPage` sem validação `from > to` nem timezone

- **Origem:** Etapa 75 (Bloco 7).
- **Evidência:** `useState<Date | undefined>` sem validação; `new Date(dateStr)` sem timezone.
- **Ação:**
  1. Validação: se `from > to`, Alert + não roda query.
  2. `startOfDay(from)` e `endOfDay(to)` com timezone do usuário.
  3. Query backend em UTC.
- **Aceite:** `from > to` → alert amarelo; sem query.

### F7-30 — `AdminEmailStatusPage` usa `location.hash =` em app path-based

- **Origem:** Etapa 69 (Bloco 7).
- **Evidência:** `onClick={() => (window.location.hash = '#admin/email-audit')}` em app com react-router-dom `BrowserRouter` — não navega.
- **Ação:** `import { useNavigate } from 'react-router-dom'; const navigate = useNavigate(); onClick={() => navigate('/admin/email-audit')}`.
- **Aceite:** clicar "Ver Auditoria" navega para `AdminEmailAuditPage`.

### F7-31 — `SelfHostedHealthPage` sem AbortController + results stale em erro

- **Origem:** Etapa 75 (Bloco 7).
- **Evidência:** `run = async () => { ... }` sem cancel signal. Clique duplo dispara 10 requests. Se throw, `results` antigos stale.
- **Ação:**
  1. AbortController via `useRef`; abort anteriores; propagar `signal` para probes.
  2. Catch: `if (!controller.signal.aborted) { setResults([]); toast.error(...); }`.
- **Aceite:** clique múltiplo aborta anteriores; erro deixa results vazios com toast.

### F7-32 — `AdminAutomationLogsPage` paginação 0-indexed inconsistente

- **Origem:** Etapa 75 (Bloco 7).
- **Evidência:** `const [page, setPage] = useState(0);` e `setPage(0)` no reset. Convenção Supabase 0-indexed mas UI mostra "página N" ao usuário.
- **Ação:**
  1. `page` 1-indexed no state; converter para 0-indexed apenas no `range()`.
  2. `setPage(1)` no reset.
  3. Rótulo "Página 1 de 10", não "Página 0".
- **Aceite:** primeira página exibida como "1"; reset volta para "1".

---
