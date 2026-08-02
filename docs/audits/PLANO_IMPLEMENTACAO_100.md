# PLANO DE CORREÇÃO — populado durante a análise

> Documento vivo. Cada achado real da análise vira uma etapa aqui, com origem (etapa da análise), evidência (query/arquivo/log) e critério de aceite.
> **Correção é responsabilidade do próximo chat.**

Convenção de ID: `F<bloco>-<seq>` — ex. `F1-01` = primeiro achado do bloco 1 da análise.

**Total de achados até agora: 123** (14 Bloco 1 + 13 Bloco 2 + 12 Bloco 3 + 24 Bloco 4 + 30 Bloco 5 + 30 Bloco 6).

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

_(aguardando Bloco 7 — próximo chat)_

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
- **Evidência:** `SELECT column_name FROM information_schema.columns WHERE table_schema='evo' AND table_name='evolution_contacts'` mostra 44 colunas — **nenhuma** contém `cpf` ou `cnpj`. View `zapp.contacts` expõe `cpf` HARDCODED NULL. UI pode ter campo de CPF, mas dado vai para o void.
- **Ação:**
  1. Adicionar `cpf text`, `cnpj text` em `evo.evolution_contacts` (com constraint length 11 e 14 respectivamente, digits-only).
  2. Adicionar `pii_cpf_masked_at timestamptz` (mascarar via cron para compliance).
  3. Atualizar view + triggers.
- **Aceite:** `INSERT INTO zapp.contacts (name, phone, cpf) VALUES ('X', '+5541999887777', '12345678909')` persiste CPF; `SELECT cpf FROM zapp.contacts WHERE ...` retorna o valor.

### F5-07 — CRÍTICO (P0): sem `validate_cpf(text)` nem `validate_cnpj(text)` no banco — só `mask_cpf`

- **Origem:** Etapa 46 (Bloco 5).
- **Evidência:** `SELECT proname FROM pg_proc WHERE proname ILIKE '%cpf%' OR proname ILIKE '%cnpj%'` retorna só `zapp.mask_cpf(cpf text)`. Sem validação de dígitos verificadores.
- **Ação:**
  1. Implementar `zapp.validate_cpf(cpf text) RETURNS boolean` IMMUTABLE com algoritmo dos dois DVs.
  2. Implementar `zapp.validate_cnpj(cnpj text) RETURNS boolean` IMMUTABLE.
  3. Adicionar constraints em `evo.evolution_contacts`: `CHECK (cpf IS NULL OR zapp.validate_cpf(cpf))`.
  4. Frontend chama validação local antes de submit; backend é última linha de defesa.
- **Aceite:** `SELECT zapp.validate_cpf('12345678909')` retorna resultado correto (algorítmico); INSERT com CPF inválido é rejeitado.

### F5-08 — CRÍTICO (P0): 5 estratégias diferentes de normalização de telefone — merge, search e intelligence usam estratégias divergentes

- **Origem:** Etapa 46, 48, 55 (Bloco 5).
- **Evidência:** 4 funções SQL retornam formatos diferentes para o mesmo input:
  - `fn_normalize_br_phone('+55 (41) 9 9988-7777')` → `41999887777` (10→11 dígitos, sem 55)
  - `fn_normalize_phone('+55 (41) 9 9988-7777')` → `5541999887777` (11+55)
  - `get_normalized_phone('+55 (41) 9 9988-7777')` → `41999887777` (11, sem 55)
  - `normalize_phone_for_unique('+55 (41) 9 9988-7777')` → `41999887777` (11, sem 55)
  - Frontend `useContactIntelligence.cleanPhone`: apenas `[^0-9]+ → ''` → `5541999887777` (dependente do input original)
  - `bulk_auto_merge_duplicates` usa 6ª estratégia hand-rolled inline: `regexp_replace(phone_number, '\D', '', 'g')`.
- **Ação:**
  1. Escolher UMA função canônica (`fn_normalize_phone` retorna E.164-ish: `5541999887777`).
  2. Deprecar as outras 3 funções SQL + a lógica JS.
  3. Criar índice funcional único `CREATE UNIQUE INDEX ON evo.evolution_contacts (fn_normalize_phone(phone_number))`.
  4. Migrar `bulk_auto_merge_duplicates` para usar essa função.
  5. Frontend chama RPC de normalização em vez de fazer localmente.
- **Aceite:** `fn_normalize_phone` é única função referenciada em código de contatos; grep no repo retorna 0 outras estratégias.

### F5-09 — CRÍTICO (P0): `add_contact_note` DESCARTA `p_note_type` e `p_is_pinned` silenciosamente — colunas não existem em `zapp.contact_notes`

- **Origem:** Etapa 52 (Bloco 5).
- **Evidência:** `zapp.add_contact_note(p_contact_id, p_content, p_note_type='general', p_is_pinned=false)` — INSERT só usa 3 colunas: `contact_id, author_id, content`. `zapp.contact_notes` tem 6 colunas (`id, contact_id, author_id, content, created_at, updated_at`) — sem `note_type`, sem `is_pinned`, sem `version`. Signature mente.
- **Ação:**
  1. Adicionar `note_type text DEFAULT 'general' CHECK (note_type IN ('general','call','meeting','task','followup'))`, `is_pinned boolean NOT NULL DEFAULT false`, `updated_by uuid REFERENCES auth.users(id)` em `zapp.contact_notes`.
  2. Ajustar RPC para escrever os campos.
- **Aceite:** `SELECT add_contact_note('<uuid>', 'testando', 'meeting', true)` cria row com `note_type='meeting'` e `is_pinned=true`.

### F5-10 — CRÍTICO (P0): `useContactNotes.addNote` BYPASSA a RPC — INSERT direto na tabela contorna toda validação de segurança

- **Origem:** Etapa 52 (Bloco 5).
- **Evidência:** `src/features/contacts/hooks/useContactNotes.ts` linhas ~100-115: `supabase.from('contact_notes').insert({ contact_id, author_id, content }).select().maybeSingle()`. Não chama `add_contact_note` RPC. Se RLS `contact_notes_insert` policy falhar (edge case, migração incompleta, etc.), insert passa sem validação.
- **Ação:**
  1. Trocar para `supabase.rpc('add_contact_note', { p_contact_id, p_content, p_note_type, p_is_pinned })`.
  2. RPC já valida `is_admin_or_supervisor OR is_contact_visible_to_user`.
  3. Alinhado com F5-09 (RPC precisa suportar todos os campos primeiro).
- **Aceite:** grep por `.from('contact_notes').insert` retorna 0 hits; todas notas passam pela RPC.

### F5-11 — CRÍTICO (P0): `zapp.contact_notes` **VAZIA** em produção (0 rows) — feature 100% dead

- **Origem:** Etapa 52 (Bloco 5).
- **Evidência:** `SELECT COUNT(*) FROM zapp.contact_notes` retorna 0; `notes_7d=0`, `notes_30d=0`, `total=0`. Feature ativa em produção mas nunca produziu dado.
- **Ação:**
  1. Instrumentar telemetria: log de `[notes] addNote called` para verificar se usuários tentam usar mas falha silenciosa.
  2. Investigar RLS: `contact_notes_insert` policy exige `is_contact_visible_to_user(contact_id, auth.uid())` — se `zapp.contacts` view filtra `deleted_at IS NULL`, e user não é o `assigned_to`, policy nega.
  3. Confirmar via GlitchTip: `Failed to fetch author profiles for notes:` seria log de sucesso; ausência total sugere que UI nem tenta.
- **Aceite:** após correções (F5-10, F5-13, review de RLS), `notes_7d > 0` em produção.

### F5-12 — CRÍTICO (P0): `search_contacts_cursor` NÃO usa `pg_trgm` — full scan em ILIKE

- **Origem:** Etapa 55 (Bloco 5).
- **Evidência:** RPC body: `v_where := v_where || ' AND (c.name ILIKE $1 OR c.email ILIKE $1 OR c.phone ILIKE $1)'`. Índices `pg_trgm` existem em `evo.evolution_contacts.push_name` e `.email`, mas RPC busca em `zapp.contacts.name` (que é `COALESCE(full_name, push_name, 'Sem nome')`) — nenhum índice trgm em `full_name`. Search em 20k+ contatos → sequential scan.
- **Ação:**
  1. `CREATE INDEX idx_ec_full_name_trgm ON evo.evolution_contacts USING gin (full_name gin_trgm_ops);`
  2. Reescrever RPC: `WHERE c.name % $1 OR c.email % $1 OR fn_normalize_phone(c.phone) LIKE fn_normalize_phone($1) || '%'` (usar `%` operator do trgm, não ILIKE).
  3. Adicionar `similarity_threshold` argumento (default 0.3) para tuning por caller.
- **Aceite:** `EXPLAIN ANALYZE` do RPC mostra `Bitmap Index Scan on idx_ec_full_name_trgm`; tempo < 100ms para query em 50k rows.

### F5-13 — CRÍTICO (P0): `zapp.tags.name` UNIQUE global — cross-workspace conflict impossibilita multi-tenant real

- **Origem:** Etapa 50 (Bloco 5).
- **Evidência:** `CREATE UNIQUE INDEX uq_tags_name ON zapp.tags (name)`. Se workspace A criar tag "VIP" via `bulk_add_tag`, workspace B não consegue criar sua própria "VIP" — a RPC faz `SELECT id FROM zapp.tags WHERE name = p_tag LIMIT 1` e pega o de A, e o `INSERT INTO zapp.contact_tags` associa contatos de B ao tag_id de A. **Contatos misturados entre tenants por nome de tag idêntico.**
- **Ação:**
  1. Adicionar `workspace_id uuid REFERENCES zapp.workspaces(id) NOT NULL DEFAULT get_default_workspace_id()` em `zapp.tags`.
  2. Trocar `uq_tags_name` por `CREATE UNIQUE INDEX ON zapp.tags (workspace_id, name)`.
  3. `bulk_add_tag` filtra por workspace do caller.
- **Aceite:** dois workspaces podem ter tag "VIP" independentes; contatos de A com tag "VIP" não aparecem na busca de B.

### F5-14 — CRÍTICO (P0): RLS `evo.evolution_contacts.contacts_insert` policy tem `WITH CHECK NULL` — anyone pode inserir contato com qualquer `assigned_to`

- **Origem:** Etapa 46 (Bloco 5).
- **Evidência:** `SELECT polname, polcmd, pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid) FROM pg_policy WHERE polrelid='evo.evolution_contacts'::regclass` mostra `contacts_insert` com `polcmd='a'` e `polqual=NULL` — sem `WITH CHECK` expression. Qualquer authenticated pode inserir contato com `assigned_to = <UUID de outro user>`, `workspace_id` de outro tenant.
- **Ação:**
  1. `ALTER POLICY contacts_insert ON evo.evolution_contacts WITH CHECK (assigned_to::text = (SELECT p.id::text FROM zapp.profiles p WHERE p.user_id = auth.uid()) OR is_admin_or_supervisor())`.
  2. Adicionar teste que confirma que non-admin não pode inserir com `assigned_to` de outro.
- **Aceite:** INSERT como authenticated com `assigned_to` de outro usuário retorna `new row violates row-level security policy`.

### F5-15 — CRÍTICO (P0): RLS `contacts_select` expõe contatos `assigned_to IS NULL` a TODOS os usuários — cross-tenant leak

- **Origem:** Etapa 46 (Bloco 5).
- **Evidência:** Policy `contacts_select` `polqual`: `((EXISTS (admin/supervisor)) OR (assigned_to = <profile>) OR (assigned_to IS NULL))`. **Última cláusula não filtra por workspace**. Todo contato sem `assigned_to` é visível para toda a base de usuários.
- **Ação:**
  1. Remover `OR (assigned_to IS NULL)` OU condicionar a workspace: `OR (assigned_to IS NULL AND workspace_id = (SELECT workspace_id FROM zapp.profiles WHERE user_id = auth.uid()))`.
  2. Necessita coluna `workspace_id` real em `evo.evolution_contacts` (não HARDCODED via view — F5-16).
- **Aceite:** query `SET ROLE authenticated; SET request.jwt.claims.sub = '<UUID>'; SELECT COUNT(*) FROM evo.evolution_contacts WHERE assigned_to IS NULL` retorna 0 (ou apenas contatos do próprio workspace).

### F5-16 — CRÍTICO (P0): `get_default_workspace_id()` retorna workspace mais antigo — sem tenant isolation em contatos

- **Origem:** Etapa 46 (Bloco 5).
- **Evidência:** `get_default_workspace_id()` faz `SELECT id FROM zapp.workspaces ORDER BY created_at LIMIT 1`. View `zapp.contacts.workspace_id` = essa constante para TODOS os contatos. `evo.evolution_contacts` não tem coluna `workspace_id`. Toda infra multi-tenant é fake.
- **Ação:**
  1. Adicionar `workspace_id uuid NOT NULL DEFAULT get_default_workspace_id()` em `evo.evolution_contacts`.
  2. Migrar dados existentes (todos para workspace default por enquanto).
  3. Atualizar view `zapp.contacts` para expor `ec.workspace_id` (não a constante).
  4. Ajustar RLS policies para filtrar por workspace.
- **Aceite:** `SELECT DISTINCT workspace_id FROM evo.evolution_contacts` retorna > 1 valor (após onboarding de 2º workspace).

### F5-17 — `bulk_add_tag` sem cap de tamanho + sem visibility check por contato

- **Origem:** Etapa 50 (Bloco 5).
- **Evidência:** RPC não valida `array_length(p_contact_ids, 1)` (ao contrário de `bulk_soft_delete_contacts` que caps em 500). Chamada com 100k UUIDs consome memória do worker. Também só verifica `is_admin_or_supervisor()`; sem check por contato — admin pode tag contatos de outro workspace.
- **Ação:**
  1. `IF array_length(p_contact_ids, 1) > 1000 THEN RAISE EXCEPTION 'max 1000 contatos por chamada' END IF`.
  2. Filtrar `WHERE contact_id IN (SELECT id FROM zapp.contacts WHERE workspace_id = <caller_ws>)` no INSERT.
- **Aceite:** teste com 5000 UUIDs → rejeita; teste com contato de outro workspace → não tagia.

### F5-18 — `bulk_auto_merge_duplicates` seleção de primário sem regra LGPD explícita — pode migrar consent errado

- **Origem:** Etapa 48 (Bloco 5).
- **Evidência:** RPC ordena `array_agg(ct.id ORDER BY coalesce(ct.total_messages, 0) DESC, ct.created_at ASC)`. Se primário tiver `lgpd_opt_out_at IS NOT NULL` (usuário pediu remoção) e secundário tiver `lgpd_consent_at` (deu consent), merge tornaria opt-out o consentimento antigo — violação LGPD.
- **Ação:**
  1. Regra de precedência LGPD: se qualquer dos merged tem `lgpd_opt_out_at IS NOT NULL`, resultado é opt-out.
  2. Se ambos têm consent, manter o mais recente `lgpd_consent_at`.
  3. Documentar regra em `merge_contacts()` (F5-04).
- **Aceite:** teste unitário: merge(primary=consented, secondary=opted_out) → resultado é opted_out.

### F5-19 — `get_contact_intelligence_by_phone` lê SÓ `evo.evolution_messages_wpp2` — multi-instância bug

- **Origem:** Etapa 51 (Bloco 5).
- **Evidência:** RPC body: `FROM evo.evolution_messages_wpp2 m WHERE m.remote_jid = v_jid_s ...`. Hardcoded `_wpp2`. **17492 contatos estão em `wpp2` (85.5%) mas 2949 estão em `wpp_pink_test` + 4 em outras instâncias**. Esses 2953 contatos recebem intelligence com `total_interactions=0` e sentiment `neutral` mesmo tendo histórico real.
- **Ação:**
  1. Refatorar para consultar tabela pai `evo.evolution_messages` (particionada) OU dispatch por instância: `FROM evo.evolution_messages_{instance_name}`.
  2. Alternativa: usar view `zapp.messages` que agrega todas as instâncias.
- **Aceite:** `SELECT get_contact_intelligence_by_phone(<phone_de_wpp_pink_test>)` retorna `total_interactions > 0` para contato com histórico.

### F5-20 — `contacts_count_by_type` SECURITY DEFINER sem filtro por workspace — data leak agregado

- **Origem:** Etapa 55 (Bloco 5).
- **Evidência:** RPC `SELECT COALESCE(lead_status, 'open')::text, count(*) FROM evo.evolution_contacts WHERE deleted_at IS NULL GROUP BY lead_status` — sem `workspace_id` filter. Any authenticated vê agregado global.
- **Ação:** adicionar `AND workspace_id = (SELECT workspace_id FROM zapp.profiles WHERE user_id = auth.uid())` após F5-16.
- **Aceite:** dois workspaces com dados diferentes → count por type é isolado.

### F5-21 — `search_contacts_cursor` faz COUNT CTE em cada página — custo dobrado

- **Origem:** Etapa 55 (Bloco 5).
- **Evidência:** Query gerada: `WITH total AS (SELECT COUNT(*)::bigint FROM zapp.contacts c <where>) SELECT ..., t.cnt AS total_count FROM zapp.contacts c, total t <where> ORDER BY ... LIMIT $8`. COUNT é recomputado a cada requisição de página.
- **Ação:**
  1. Retornar `total_count` só na primeira página (`cursor_id IS NULL`), NULL nas subsequentes.
  2. Alternativa para tenants grandes: usar estimativa via `pg_class.reltuples` para `search_term=''` (sem filtro).
  3. Frontend cacheia total_count entre navegações da mesma query.
- **Aceite:** `EXPLAIN ANALYZE` de page 2+ não tem `Aggregate (COUNT)` step; latência cai proporcionalmente.

### F5-22 — `search_contacts_cursor` sem normalização de phone na busca — busca por telefone formatado falha

- **Origem:** Etapa 55 (Bloco 5).
- **Evidência:** `c.phone ILIKE '%<search>%'`. Se user digita `(41) 9 9988-7777`, busca é `%(41) 9 9988-7777%` — literal. Contato armazenado como `+5541999887777` não casa.
- **Ação:**
  1. Detectar se `search_term` é predominantemente dígitos: `IF regexp_match(search_term, '^[\d\s\-()+\.]+$') IS NOT NULL THEN v_where := ... AND fn_normalize_phone(c.phone) LIKE '%' || fn_normalize_phone($1) || '%'`.
  2. Criar índice `CREATE INDEX ON evo.evolution_contacts (fn_normalize_phone(phone_number))`.
- **Aceite:** busca `(41) 9 9988-7777` encontra contato `+5541999887777`; grep em produção mostra hits em `phone` searches.

### F5-23 — `search_contacts_cursor` só busca em `name`, `email`, `phone` — não busca em company, job_title, nickname, cpf

- **Origem:** Etapa 55 (Bloco 5).
- **Evidência:** WHERE clause: `c.name ILIKE $1 OR c.email ILIKE $1 OR c.phone ILIKE $1`. UI tem filtros de company/job_title separados, mas usuário que busca "Acme" no campo geral não encontra contato da Acme Corp.
- **Ação:**
  1. Expandir WHERE: `... OR c.company ILIKE $1 OR c.nickname ILIKE $1 OR c.job_title ILIKE $1 OR c.cpf = regexp_replace($1, '\D', '', 'g')` (após F5-06).
  2. Adicionar indexes trgm em todas as colunas.
- **Aceite:** busca "Acme" retorna contatos com `company='Acme Corp'`; busca por CPF numérico retorna contato correspondente.

### F5-24 — `useContactsSearch.pageIndexToCursor` sem deep-link support — jump-to-page-N via URL retorna page 0

- **Origem:** Etapa 55 (Bloco 5).
- **Evidência:** Mapa é populado incrementalmente ao navegar. URL `?p=5` (deep link) inicia com `pageIndexToCursor = Map([[0,null]])` — `currentPageCursor = get(5) ?? null` = null → RPC retorna page 0.
- **Ação:**
  1. Se `cursor_id` for null e `page > 0`, RPC internalmente faz `OFFSET (page * page_size)` (fallback lento mas correto).
  2. Frontend: quando restaura de URL, se page > 0, carrega páginas 0..N em sequência via `refetch` (custo alto, mas correto para deep-links raros).
  3. Alternativa preferida: URL contém cursor encodado, não `p=N`.
- **Aceite:** URL `?p=3` renderiza page 3 (não page 0).

### F5-25 — `useContactNotes` N+1 query + sem pagination + sem edit mutation

- **Origem:** Etapa 52 (Bloco 5).
- **Evidência:** Hook faz `.from('contact_notes').select(...)`, depois `.from('profiles').select('id, name, avatar_url').in('id', authorIds)` — 2 queries em vez de 1 JOIN. Sem `.limit()` — carrega TODAS as notas. Sem mutation de UPDATE (só add e delete).
- **Ação:**
  1. Trocar por RPC `get_contact_notes_with_authors(p_contact_id, p_limit=50, p_cursor=null)` que faz JOIN + pagination.
  2. Adicionar `updateNoteMutation` com campo `updated_by`.
  3. Após F5-09, permitir editar `note_type`, `is_pinned` também.
- **Aceite:** carregamento de contato com 500 notas leva < 500ms; feature de edit funcional.

### F5-26 — 20445 contatos, ZERO com `lgpd_consent_at` ou `lgpd_opt_out_at` set — compliance LGPD ausente

- **Origem:** Etapa 49 (Bloco 5).
- **Evidência:** `SELECT COUNT(*) FROM evo.evolution_contacts WHERE lgpd_consent_at IS NOT NULL` = 0. `SELECT MAX(lgpd_last_updated_at)` = NULL. Colunas existem mas nunca populadas.
- **Ação:**
  1. RPC `record_lgpd_consent(p_contact_id, p_consent_channel, p_marketing, p_data_sharing, p_profiling)`.
  2. Trigger em `evo.evolution_contacts` para popular `lgpd_last_updated_at` quando qualquer coluna LGPD muda.
  3. UI de opt-in ao primeiro contato (Evolution API pode enviar mensagem de consent).
  4. Sincronizar com F5-02 (trigger UPDATE precisa propagar colunas LGPD).
- **Aceite:** após onboarding, novos contatos têm `lgpd_consent_at IS NOT NULL` OU `lgpd_opt_out_at IS NOT NULL`; `SELECT COUNT(*) FROM evo.evolution_contacts WHERE lgpd_last_updated_at IS NOT NULL` cresce diariamente.

### F5-27 — Trigger INSERT view assume individual (`@s.whatsapp.net`) — quebra suporte a grupos (`@g.us`)

- **Origem:** Etapa 46 (Bloco 5).
- **Evidência:** `fn_contacts_view_insert_handler` fallback: `COALESCE(NULLIF(NEW.remote_jid,''), NULLIF(NEW.external_id,''), NEW.phone || '@s.whatsapp.net')`. Contato de grupo tem JID `<groupid>@g.us`; se UI não fornecer `remote_jid` explícito, trigger monta JID errado.
- **Ação:**
  1. Adicionar detecção: se `NEW.channel_type = 'group'` OU `NEW.remote_jid LIKE '%@g.us'`, usar `@g.us` suffix.
  2. Alternativa: exigir `remote_jid` explícito em INSERT via view (não fabricar).
- **Aceite:** INSERT de contato de grupo produz `remote_jid` com `@g.us`; webhook de grupo linka corretamente.

### F5-28 — `rpc_get_contact` (4 overloads em `public` + `zapp`) expõe deals/messages/tasks de contatos opted-out — LGPD violation

- **Origem:** Etapa 46 (Bloco 5).
- **Evidência:** Todas 4 versões: `WHERE c.id = p_contact_id` (ou `WHERE remote_jid = p_remote_jid AND deleted_at IS NULL`). Filtro só por `deleted_at`, não por `lgpd_opt_out_at`. Após opt-out, dado ainda é acessível via RPC.
- **Ação:**
  1. Adicionar `AND lgpd_opt_out_at IS NULL` a todas versões.
  2. Se caller é service_role (backend), permitir mesmo com opt-out (para compliance operations).
  3. Auditar retorno: `deals`, `recent_messages`, `tasks` de contato opted-out devem ser mascarados/omitidos.
- **Aceite:** `SELECT rpc_get_contact(<uuid_de_opted_out>)` retorna `{"contact": null}` OU dados mascarados; audit log gerado.

### F5-29 — Sem FK/relação `zapp.contacts` ↔ `zapp.empresas` — Etapa 54 (validar FK cascade) é unmeetable

- **Origem:** Etapa 54 (Bloco 5).
- **Evidência:** `zapp.empresas` tem 51688 rows mas schema mínimo (6 colunas: `id, created_at, nome, email jsonb, telefone, bitrix_empresa_id`). Sem FK de/para `contacts`. Só `empresas_pkey` como index. Coluna `company` em `zapp.contacts` é `text` livre, não referencia `empresas.id`.
- **Ação:**
  1. Decidir: (a) manter `company` como texto livre (atual) e documentar que "empresa vinculada" via FK não é feature real; (b) adicionar `company_id bigint REFERENCES zapp.empresas(id)` e migrar textos para FKs.
  2. Se (b): índices em `empresas.nome` para lookup + backfill.
- **Aceite:** modelagem documentada; se FK adicionada, cascade behavior definido explicitamente.

### F5-30 — `zapp.tags` schema mistura AI tag suggestions com canonical tags — dupla responsabilidade

- **Origem:** Etapa 50 (Bloco 5).
- **Evidência:** `zapp.tags` tem 11 colunas: `(id, name, color, description, created_by, created_at, updated_at)` (canonical tag definition) MAIS `(contact_id, tag_name, confidence, source)` (parece ML tag suggestion linkada a contato específico). Duas responsabilidades numa tabela; UNIQUE constraint só em `name`.
- **Ação:**
  1. Separar: `zapp.tags` (canonical: id, workspace_id, name, color, description, created_by, timestamps) + `zapp.contact_tag_suggestions` (ML: id, contact_id, tag_name, confidence, source, created_at).
  2. Migrar dados existentes: rows com `contact_id NOT NULL` vão para tag_suggestions; rows canônicas ficam.
  3. Ajustar `bulk_add_tag` para operar só em canonical + criar tags.
- **Aceite:** `SELECT COUNT(*) FROM zapp.tags WHERE contact_id IS NOT NULL` = 0 após migração; `zapp.contact_tag_suggestions` popula.


---

## Tema 12 — Conexões WhatsApp

_(Achados F6-01 a F6-30 registrados no Bloco 6.)_

### F6-01 — CRÍTICO (P0): pairing code (Etapa 58) 100% AUSENTE do código

- **Origem:** Etapa 58 (Bloco 6).
- **Evidência:** `grep -rn "pairing\|Pairing\|PAIRING\|pairing_code\|pairingCode" src` retorna **1 hit** — apenas um JSDoc em `useEvolutionApiManagement.ts` linha 296: `"lifecycle operations: create, connect, reconnect, logout, restart, delete, and QR/pairing-code retrieval"`. Nenhuma implementação. `grep -rn "pairing" no banco` também retorna 0 funções.
- **Ação:**
  1. Adicionar action `pairing-code` no edge function bridge Evolution.
  2. Implementar `whatsappConnectionService.requestPairingCode(evoName, phone)` → chama Evolution `/instance/connect?number=<phone>` retornando `{pairingCode: string, code: string}`.
  3. Adicionar botão "Usar código de emparelhamento" em `QrCodeDialog.tsx` que troca para PairingCodeDialog exibindo o código em formato `XXXX-XXXX`.
- **Aceite:** `grep -rn "pairing" src/**/*.tsx` retorna implementação real; UI mostra opção "QR" ou "código"; conexão via pairing code funciona em produção.

### F6-02 — CRÍTICO (P0): `handleAddConnection` NÃO chama Evolution `/instance/create` — só INSERT no banco

- **Origem:** Etapa 56 (Bloco 6).
- **Evidência:** `src/features/connections/hooks/parts/useConnectionsActions.ts` linhas ~44-65: `handleAddConnection` faz `safeClient.single('whatsapp_connections', q => q.insert({...}))` e depois chama `handleShowQrCode` que invoca `whatsappConnectionService.requestQrCode`. Nunca chama `createInstance` do `useEvolutionApi`. Instância só passa a existir no Evolution API se um sync automático (`useEvolutionAutoSync`) depois puxar — o que requer que instância já tenha sido criada por outro caminho (ex.: Evolution manager direto). Fluxo de criação via UI está quebrado.
- **Ação:**
  1. Antes do INSERT em `whatsapp_connections`, chamar `useEvolutionApi().createInstance({instanceName, integration: 'WHATSAPP-BAILEYS', qrcode: true, ...})`.
  2. Aguardar sucesso e usar `result.instance.instanceId` como `evo_instance_id`.
  3. Só então fazer INSERT no banco com dados sincronizados.
  4. Se createInstance falhar, mostrar erro e não deixar registro fantasma no banco.
- **Aceite:** teste manual — criar conexão via UI e verificar `evo.evolution_instance_credentials` recebeu nova row + Evolution manager (`https://evolution.atomicabr.com.br/manager`) mostra a instância; teste de rollback — Evolution retorna 500 → nenhum registro criado em `whatsapp_connections`.

### F6-03 — CRÍTICO (P0): estado divergente wpp2 entre `zapp.whatsapp_connections` e `evo.evolution_instance_credentials`

- **Origem:** Etapa 60 (Bloco 6).
- **Evidência:** JOIN por `instance_name`:
  - `zapp.whatsapp_connections.wpp2`: `status='connected'`, `health_status='ok'`, `last_connected_at='2026-08-01 20:36'`
  - `evo.evolution_instance_credentials.wpp2`: `health_status='unhealthy'`, `online_instances=0`, `total_instances=1`, `last_health_check='2026-08-02 01:20'`
  
  Duas fontes de verdade, conclusões opostas para a mesma instância no mesmo momento. UI provavelmente lê de `whatsapp_connections` (frontend usa `useConnectionsManager` → `whatsappConnectionRepository.fetchConnections` → tabela `whatsapp_connections`). Usuário vê "conectado" enquanto Evolution está unhealthy. **17 alerts `wpp2_disconnection` em 7 dias** (F6-08) corroboram: Evolution API caiu 17× mas UI nunca mostrou.
- **Ação:**
  1. Definir `evo.evolution_instance_credentials.health_status` como fonte de verdade única para health.
  2. Cron `fn_update_instance_health` (já existe) escreve em `evolution_instance_credentials`; adicionar cron para propagar de volta para `whatsapp_connections.health_status`.
  3. Alternativa preferível: remover `health_status`/`last_connected_at` de `whatsapp_connections` (data drift crônico); UI lê via JOIN da view `zapp.evolution_instances`.
- **Aceite:** query `SELECT wc.instance_name, wc.health_status AS ui_h, eic.health_status AS canonical_h FROM whatsapp_connections wc JOIN evolution_instance_credentials eic USING (instance_name) WHERE wc.health_status IS DISTINCT FROM eic.health_status` retorna 0 rows.

### F6-04 — CRÍTICO (P0): 2 fontes de verdade para instância (whatsapp_connections vs evolution_instance_credentials) sem canonical

- **Origem:** Etapa 56, 60, 61, 64 (Bloco 6).
- **Evidência:** `zapp.whatsapp_connections` (39 colunas, 3 rows) e `evo.evolution_instance_credentials` (17 colunas, 1 row) armazenam informação sobreposta: `instance_name`, `api_url`, `api_key`, `webhook_url`, `display_name`, `department`, `is_active`, `health_status`, `last_health_check`. Frontend usa a primeira; edge functions e crons usam a segunda. `zapp.instance_registry` também existe com 22 rows e statuses distintos. **3 fontes de verdade parcialmente sobrepostas**.
- **Ação:**
  1. Decidir modelo: (a) `evolution_instance_credentials` é canonical para tudo related a Evolution API — `whatsapp_connections` vira view de compat OU (b) `whatsapp_connections` é canonical do frontend — `evolution_instance_credentials` mantém apenas segredos criptografados.
  2. Documentar em `docs/audits/instance-source-of-truth.md`.
  3. Migrar RPCs e crons para usar a canonical.
- **Aceite:** grep de `evo.evolution_instance_credentials` em código de crons não retorna referências à `zapp.whatsapp_connections`; frontend só lê a canonical.

### F6-05 — CRÍTICO (P0): `fn_reconcile_dispatch` reutiliza `request_id` do net_worker → 373 rows (22%) com applied_at anterior a dispatched_at

- **Origem:** Etapa 59 (Bloco 6).
- **Evidência:** `pg_get_functiondef(zapp.fn_reconcile_dispatch)` mostra `INSERT INTO evo.evolution_reconcile_jobs (request_id) VALUES (v_req_id) ON CONFLICT (request_id) DO UPDATE SET dispatched_at = now()`. `pg_net` recicla request_ids ao longo do tempo. Quando `request_id` colide com o de um job antigo, o UPDATE só toca `dispatched_at`, preservando `applied_at` antigo do job anterior. Resultado: `SELECT COUNT(*) FROM evo.evolution_reconcile_jobs WHERE applied_at < dispatched_at - INTERVAL '1 day'` retorna **373 rows de 1663 (22%)**. Sample: id=24041 tem `dispatched_at=2026-08-02 01:15` mas `applied_at=2026-07-28 03:31` (delta=-4d21h44min).
- **Ação:**
  1. Trocar `ON CONFLICT (request_id) DO UPDATE` por `ON CONFLICT DO NOTHING`.
  2. Ou usar `id bigserial` como PK e `request_id` como coluna secundária sem UNIQUE (permite duplicate request_ids ao longo do tempo).
  3. Backfill: `UPDATE evo.evolution_reconcile_jobs SET applied_at = NULL WHERE applied_at < dispatched_at`.
- **Aceite:** query `SELECT COUNT(*) FROM evo.evolution_reconcile_jobs WHERE applied_at < dispatched_at - INTERVAL '1 hour'` retorna 0 após 7 dias; métrica de latência de reconcile fica confiável.

### F6-06 — CRÍTICO (P0): `fn_alert_wpp2_disconnection` hardcoded para instance_name='wpp2' — não escala multi-instância

- **Origem:** Etapa 60, 61 (Bloco 6).
- **Evidência:** `SELECT status, phone_number, ... FROM zapp.whatsapp_connections WHERE instance_name = 'wpp2' LIMIT 1`. Alert body: `format('Instancia wpp2 (%s) desconectada ha %s minutos', ...)`. Também `evo.fn_bootstrap_wpp2_instance` (nome hardcoded), cron `wpp2_disconnection_watchdog` (jobid 104), cron `wpp2-session-expiry-watchdog` (jobid 120). **Multi-instância** (Etapa 61) é fantasia com esse pattern.
- **Ação:**
  1. Refatorar `fn_alert_wpp2_disconnection()` → `fn_alert_instance_disconnection(p_instance text DEFAULT NULL)` que itera sobre `SELECT instance_name FROM zapp.whatsapp_connections WHERE is_active AND api_type='evolution'`.
  2. Renomear crons: `wpp2_disconnection_watchdog` → `instance_disconnection_watchdog`.
  3. Refatorar `fn_bootstrap_wpp2_instance` para receber `p_instance_name`.
- **Aceite:** grep por `'wpp2'` em `pg_proc.prosrc` retorna 0 hits (exceto migrations históricas); adicionar 2ª instância dispara alertas corretamente.

### F6-07 — `fn_alert_wpp2_disconnection` NÃO é SECURITY DEFINER — inconsistente com pattern das outras funções afins

- **Origem:** Etapa 60 (Bloco 6).
- **Evidência:** `SELECT prosecdef FROM pg_proc WHERE proname='fn_alert_wpp2_disconnection'` → `false`. Todas as outras funções afins (`fn_alert_connection_drift`, `fn_reconcile_dispatch`, `fn_reconcile_apply`, `fn_sync_instance_registry_status`, `fn_detect_401_bursts`) são `SECDEF=true`. A função lê `zapp.whatsapp_connections` e insere em `evo.evolution_alerts` — se chamada por cron owner `postgres`, funciona; se chamada por RPC de authenticated, pode ser bloqueada por RLS.
- **Ação:** `ALTER FUNCTION zapp.fn_alert_wpp2_disconnection() SECURITY DEFINER SET search_path = pg_catalog, zapp, evo, public`.
- **Aceite:** `SELECT prosecdef FROM pg_proc WHERE proname LIKE 'fn_alert_%'` mostra `true` para todas.

### F6-08 — CRÍTICO (P0): 17 de 18 alerts `wpp2_disconnection` nunca resolvidos (94% backlog) — alert fatigue

- **Origem:** Etapa 60 (Bloco 6).
- **Evidência:** `SELECT COUNT(*), COUNT(*) FILTER (WHERE resolved_at IS NOT NULL) FROM evo.evolution_alerts WHERE alert_type='wpp2_disconnection'` → `total_ever=18, resolved=1, acked=1`. Alertas nas últimas 10h: 8:00, 9:00, 10:00, 11:10, 12:10, 13:20, 14:20, 15:30, 16:30, 17:40 — um por hora. Anti-flood check `created_at > now() - 60 minutes AND resolved_at IS NULL` funciona (guardaria a alerta a cada 1h), MAS como `resolved_at` nunca é setado, alertas se acumulam indefinidamente sem trigger de auto-close quando instância volta.
- **Ação:**
  1. Trigger em `zapp.whatsapp_connections` AFTER UPDATE OF status: se `NEW.status = 'connected' AND OLD.status != 'connected'`, executar `UPDATE evo.evolution_alerts SET resolved_at = now(), resolved_by='auto:reconnected' WHERE alert_type='wpp2_disconnection' AND resolved_at IS NULL`.
  2. Cron `auto-resolve-stale-alerts` (a cada 1h): resolver alertas `wpp2_disconnection` onde instância voltou.
  3. Purge de alertas `resolved_at < now() - 30d` (cron `purge_evolution_alerts` já existe — verificar se filtra corretamente).
- **Aceite:** `SELECT COUNT(*) FILTER (WHERE resolved_at IS NULL) FROM evo.evolution_alerts WHERE alert_type='wpp2_disconnection'` cai para <= 1 em 24h após reconexão.

### F6-09 — CRÍTICO (P0): cron `wpp2_disconnection_watchdog` (104) schedule `*/10 6-23 * * *` — 6h gap noturno de detecção (23h→6h)

- **Origem:** Etapa 60 (Bloco 6).
- **Evidência:** Schedule limita execução a `6-23` (06:00 até 23:59). Entre 23:00 e 06:00 (7 horas) o watchdog não roda. Se WhatsApp cair às 02:00, alerta só chega às 06:10 — 4h+ de delay. Também `message_pipeline_stalled_alert` `0 8-22 * * *` = 10h gap.
- **Ação:**
  1. Trocar schedule para `*/10 * * * *` (24h/dia).
  2. Se preocupação era pager fatigue noturno, filtrar dentro da função: `IF EXTRACT(hour FROM now() AT TIME ZONE 'America/Sao_Paulo') NOT BETWEEN 8 AND 22 THEN severity='low' ELSE 'critical' END`.
  3. Aplicar mesmo pattern em `message_pipeline_stalled_alert`.
- **Aceite:** `SELECT schedule FROM cron.job WHERE jobname='wpp2_disconnection_watchdog'` = `*/10 * * * *`; disconnection às 03:00 gera alerta em <10min.

### F6-10 — cron `sync-instance-registry-status` (96) perdeu 11% das execuções em 24h (256/288)

- **Origem:** Etapa 64 (Bloco 6).
- **Evidência:** Schedule `2-59/5 * * * *` (a cada 5min, offset 2min) = esperado 12 execuções/hora × 24h = 288/dia. `SELECT COUNT(*) FROM cron.job_run_details WHERE jobid=96 AND start_time > NOW() - INTERVAL '24 hours'` retorna 256. 32 execuções perdidas (11%). Provável causa: concorrência com outros crons que usam mesmo pool, ou reboots de container postgres.
- **Ação:**
  1. Verificar `cron.job_run_details WHERE jobid=96 ORDER BY start_time DESC LIMIT 100` para identificar padrão de gaps.
  2. Se sistemático, escalonar schedule offset para reduzir contention.
  3. Adicionar métrica em `zapp.warroom_alerts` quando gap > 15min.
- **Aceite:** execuções em 24h >= 280/288 (>= 97%).

### F6-11 — 6 triggers em `zapp.whatsapp_connections`; 4 são duplicatas divergentes (2 pares)

- **Origem:** Etapa 62 (Bloco 6).
- **Evidência:** `pg_trigger` mostra 6 triggers:
  - `update_whatsapp_connections_updated_at` (função `update_updated_at_column`) + `trg_wconn_updated_at` (função `fn_wconn_updated_at`) — ambos BEFORE UPDATE fazendo `NEW.updated_at = now()`. Duplicata funcionalmente pura.
  - `clear_qr_on_connect_trigger` (função `clear_qr_on_connect`) + `trg_clear_qr_connect` (função `fn_clear_qr_on_connect`) — ambos BEFORE UPDATE limpando QR. **Divergentes**: primeiro só limpa `qr_code`; segundo limpa `qr_code + qr_code_base64` e seta `connected_at`, `last_connected_at`, `disconnected_at`.
  - `trg_validate_whatsapp_connection_url` — OK
  - `trg_log_whatsapp_connection_state_change` — OK
- **Ação:**
  1. `DROP TRIGGER update_whatsapp_connections_updated_at ON zapp.whatsapp_connections` (versão antiga).
  2. `DROP TRIGGER clear_qr_on_connect_trigger` (versão antiga, incompleta).
  3. Manter `trg_wconn_updated_at` e `trg_clear_qr_connect` (versões novas).
- **Aceite:** `SELECT COUNT(*) FROM pg_trigger WHERE tgrelid='zapp.whatsapp_connections'::regclass AND NOT tgisinternal` retorna 4.

### F6-12 — `fn_validate_whatsapp_connection_url` cai para hardcoded default se vault vazio — não fail-secure

- **Origem:** Etapa 56 (Bloco 6).
- **Evidência:** Trigger body: `SELECT decrypted_secret INTO v_allowed_url FROM vault.decrypted_secrets WHERE name = 'evolution_api_url'; IF v_allowed_url IS NULL THEN v_allowed_url := 'https://evolution.atomicabr.com.br'; END IF`. Se vault estiver corrompido/vazio, valida contra URL hardcoded — permite INSERTs mesmo em ambiente onde vault deveria ser fonte única. Also, mensagem de erro do `RAISE EXCEPTION` **expõe a URL esperada** (`api_url invalida: X | esperado: Y`) — potencial info leak.
- **Ação:**
  1. Remover fallback hardcoded: `IF v_allowed_url IS NULL THEN RAISE EXCEPTION 'vault.evolution_api_url ausente' USING ERRCODE = '42501' END IF`.
  2. Mensagem genérica: `RAISE EXCEPTION 'api_url invalida' USING DETAIL = format('recebido: %s', NEW.api_url)`.
- **Aceite:** vault vazio → INSERT rejeitado com erro claro; mensagem não vaza URL esperada.

### F6-13 — CRÍTICO (P0): `api_url` e `api_key` são NOT NULL sem default — INSERT via `useConnectionsActions.handleAddConnection` faltaria valores

- **Origem:** Etapa 56 (Bloco 6).
- **Evidência:** Schema de `zapp.whatsapp_connections`: `api_url text NOT NULL` (sem default), `api_key text NOT NULL` (sem default). `handleAddConnection` faz INSERT com só 7 colunas: `name, phone_number, instance_id, instance_name, status, is_default, api_type`. Sem `api_url` e `api_key`. INSERT deveria falhar por NOT NULL. As 3 rows atuais em produção têm valores — indica que INSERTs foram feitos por outro caminho (Evolution manager? seed migration?). UI provavelmente nunca conseguiu criar conexão.
- **Ação:**
  1. Adicionar defaults: `ALTER TABLE zapp.whatsapp_connections ALTER COLUMN api_url SET DEFAULT (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'evolution_api_url')`.
  2. `api_key` é per-instance no Evolution API — populado após `createInstance()` retornar `hash`. Fluxo correto (após F6-02 fix): (a) createInstance retorna `hash`, (b) INSERT com `api_key = <hash>`.
  3. Adicionar teste que confirma que INSERT via `useConnectionsActions.handleAddConnection` funciona ponta-a-ponta em ambiente limpo.
- **Aceite:** criar conexão nova via UI funciona; row tem `api_url` e `api_key` populados.

### F6-14 — Só 1 registro em `evo.evolution_instance_credentials` (wpp2); 2 conexões em `whatsapp_connections` órfãs

- **Origem:** Etapa 63, 64 (Bloco 6).
- **Evidência:** LEFT JOIN `whatsapp_connections wc LEFT JOIN evolution_instance_credentials eic USING (instance_name)` mostra: `wpp2` (JOINed), `wppmkt` (eic=NULL), `wpp_pink_test` (eic=NULL). Cron 96 (`sync-instance-registry-status`) rodou 810x em 7d mas não corrigiu essas 2 órfãs. Instance drift real.
- **Ação:**
  1. Investigar por que `sync-instance-registry-status` não popula `evolution_instance_credentials` para essas instâncias.
  2. Decidir: (a) as 2 órfãs são zombie state (nunca provisionadas no Evolution) — deletar; (b) provisionar no Evolution API + popular credentials.
  3. Adicionar constraint `FOREIGN KEY (instance_name) REFERENCES evolution_instance_credentials(instance_name)` em `whatsapp_connections` (após limpeza) para prevenir órfãs futuras.
- **Aceite:** LEFT JOIN retorna 0 rows com `eic IS NULL`; FK constraint ativa.

### F6-15 — "WPP Marketing (Cloud API Oficial)" tem `api_type='evolution'` — nome enganoso vs config real

- **Origem:** Etapa 56 (Bloco 6).
- **Evidência:** Row: `name='WPP Marketing (Cloud API Oficial)'`, `api_type='evolution'`, `instance_id=NULL`, `is_active=false`, `health_status='provisioned'`. Nome sugere Meta Cloud API, `api_type` diz Evolution. Provavelmente configurada incorretamente, ficou dormente. Confusão para operador.
- **Ação:**
  1. Confirmar com stakeholder se conexão deve usar Cloud API ou Evolution.
  2. Se Cloud API: `UPDATE whatsapp_connections SET api_type='official' WHERE id='5658bc88-...'`.
  3. Se abandonada: deletar com purge de referências.
  4. Adicionar validação em `useConnectionsActions.handleAddConnection`: se nome contém "Cloud API" ou "Oficial", forçar `api_type='official'`.
- **Aceite:** row corrigida OU deletada; UI não permite criar conexão com nome/type divergentes.

### F6-16 — CRÍTICO (P0): `created_by = NULL` em 3/3 rows de `whatsapp_connections` — ownership perdida

- **Origem:** Etapa 56 (Bloco 6).
- **Evidência:** `SELECT COUNT(*) FILTER (WHERE created_by IS NULL) FROM zapp.whatsapp_connections` = 3 (todas as rows). Sem trilha de ownership. Combinado com F6-17 (RLS permite orphan INSERTs), qualquer authenticated pode listar/editar conexões porque a policy `wconn_insert_auth` também tem cláusula `created_by IS NULL OR ...`. Sem accountability.
- **Ação:**
  1. Backfill: `UPDATE whatsapp_connections SET created_by = (SELECT id FROM auth.users WHERE email='<owner>@promobrindes.com.br')` para rows históricas.
  2. Adicionar `created_by uuid NOT NULL DEFAULT auth.uid()` em `zapp.whatsapp_connections`.
  3. Trigger BEFORE INSERT que rejeita se `NEW.created_by IS NULL` (após backfill).
- **Aceite:** `SELECT COUNT(*) FILTER (WHERE created_by IS NULL) FROM whatsapp_connections` = 0; INSERT sem `created_by` recebe auto-populate ou falha.

### F6-17 — CRÍTICO (P0): RLS `wconn_insert_auth` policy `WITH CHECK (created_by IS NULL OR created_by = auth.uid())` permite orphan INSERTs

- **Origem:** Etapa 56 (Bloco 6).
- **Evidência:** `pg_get_expr(polwithcheck)` = `((created_by IS NULL) OR (created_by = auth.uid()))`. Cláusula `(created_by IS NULL)` permite INSERT sem ownership — combinado com F6-16, é como as 3 rows atuais entraram. Sem workspace/tenant filter na policy.
- **Ação:**
  1. `ALTER POLICY wconn_insert_auth ON zapp.whatsapp_connections WITH CHECK (created_by = auth.uid() AND workspace_id = (SELECT workspace_id FROM zapp.profiles WHERE user_id = auth.uid()))`.
  2. Adicionar `workspace_id uuid NOT NULL` em `whatsapp_connections` primeiro (multi-tenant, alinhado com F5-16).
- **Aceite:** INSERT com `created_by IS NULL` recebe `new row violates row-level security policy`.

### F6-18 — Policy `auth_secure_123` (nome de código de teste) em produção

- **Origem:** Etapa 56 (Bloco 6).
- **Evidência:** `SELECT polname FROM pg_policy WHERE polrelid='zapp.whatsapp_connections'::regclass` retorna `auth_secure_123` entre as 4 policies. Nome sugere teste/debug (`_123` suffix). Policy USING: `(has_role(auth.uid(), 'agent'::zapp.app_role) OR is_admin_or_supervisor())`. Funcionalmente equivalente a `whatsapp_connections_admin_write`, mas com nome não profissional.
- **Ação:** `ALTER POLICY auth_secure_123 ON zapp.whatsapp_connections RENAME TO whatsapp_connections_agent_or_admin_read`.
- **Aceite:** grep por policies com `_[0-9]` suffix em pg_policy retorna 0 hits em `zapp.*`.

### F6-19 — CRÍTICO (P0): `evo.evolution_ip_watch` = 0 rows total — pipeline VPS→DB de detecção 401 morto

- **Origem:** Etapa 65 (Bloco 6).
- **Evidência:** `SELECT COUNT(*), MAX(created_at) FROM evo.evolution_ip_watch` → `total=0, newest=NULL`. Comentário dentro de `fn_detect_401_bursts` confirma: `"BLIND: evolution_ip_watch=0 rows — VPS log pipeline (Traefik→DB) not active"`. Pipeline documentado como quebrado há semanas (`Ref: AUDITORIA_EVO_API_2026-07-12.md OBS-2`).
- **Ação:**
  1. Escolher entre: (a) configurar Traefik access log → PostgREST insert em `evo.evolution_ip_watch`; (b) usar GlitchTip (que já recebe 401s desde 2026-07-12) como fonte + edge function que faz pull periódico; (c) descontinuar `evolution_ip_watch` e refatorar `fn_detect_401_bursts` para depender só de outras fontes.
  2. Decisão documentada com owner + prazo.
- **Aceite:** OU pipeline reativado (`SELECT COUNT(*) FROM evo.evolution_ip_watch WHERE created_at > NOW() - INTERVAL '1 day'` > 0) OU função refatorada + tabela DROPada.

### F6-20 — CRÍTICO (P0): `fn_detect_401_bursts` documenta seu próprio "monitoring gap" no comentário — cega por design atual

- **Origem:** Etapa 65 (Bloco 6).
- **Evidência:** Body da função contém string literal: `'evo.evolution_ip_watch=0 registros históricos. Ação: configurar Traefik access log → Supabase API. Monitoramento DB-side cego até lá.'`. Função também insere CHECKLIST inteiro no `message` de alertas (7 passos para operador seguir). **Antipattern**: documentação misturada com telemetria; alerta polui `warroom_alerts` sem oferecer detecção real.
- **Ação:**
  1. Após F6-19 (pipeline funcional), remover checklist do body da função — mover para runbook em `docs/runbooks/evolution-401-burst.md`.
  2. Alerta faz REFERÊNCIA ao runbook: `See docs/runbooks/evolution-401-burst.md`, não copia conteúdo.
  3. Simplificar função para apenas detecção real (sem alertas informativos sobre "modo cego").
- **Aceite:** função tem <100 linhas (atualmente >100); checklist migrado para markdown; alertas contêm apenas dado relevante ao momento.

### F6-21 — CRÍTICO (P0): 373 reconcile_jobs (22%) com `applied_at < dispatched_at - 1 day` — telemetria corrompida

- **Origem:** Etapa 59 (Bloco 6).
- **Evidência:** Consequência direta de F6-05. `SELECT COUNT(*) FROM evo.evolution_reconcile_jobs WHERE applied_at < dispatched_at - INTERVAL '1 day'` retorna 373 de 1663 total. Qualquer métrica de "tempo médio de reconcile" ou "latência p95" computada dessa tabela é **completamente falsa**.
- **Ação:**
  1. Corrigir F6-05 primeiro.
  2. Backfill: `UPDATE evo.evolution_reconcile_jobs SET applied_at = NULL WHERE applied_at < dispatched_at`.
  3. Recomputar métricas históricas com filtro `applied_at >= dispatched_at`.
  4. Adicionar assertion no proxima migration: `ALTER TABLE evo.evolution_reconcile_jobs ADD CONSTRAINT chk_applied_after_dispatched CHECK (applied_at IS NULL OR applied_at >= dispatched_at)`.
- **Aceite:** constraint aceita; futuras rows sempre `applied_at >= dispatched_at`.

### F6-22 — 1389 alertas em `zapp.warroom_alerts` em 7d (863 info + 385 critical + 141 warning) — alert fatigue extrema

- **Origem:** Etapa 60, 65 (Bloco 6).
- **Evidência:** `SELECT alert_type, COUNT(*) FROM warroom_alerts WHERE created_at > NOW() - INTERVAL '7 days' GROUP BY 1`: `info=863, critical=385, warning=141`. **385 críticos em 7 dias = 55/dia = >2/hora**. Se ninguém age em >99% dessas alertas (padrão de F6-08), sinal:ruído é catastrófico. Alertas de "critical" perdem significado quando são a norma.
- **Ação:**
  1. Auditoria de 24h: para cada `alert_type`, catalogar (a) quem consome (Slack/email/PagerDuty), (b) taxa de ação real, (c) tempo médio até resolução.
  2. Reclassificar: alertas com ação=0% em 7d viram `info` ou são descontinuados.
  3. Rate limit por `alert_type`: máximo 1 por hora, exceto se novos dados são materialmente diferentes.
  4. Deduplicação: agregar N alertas do mesmo tipo/janela em 1 alerta com `count`.
- **Aceite:** `SELECT COUNT(*) FROM warroom_alerts WHERE alert_type='critical' AND created_at > NOW() - INTERVAL '7 days'` cai para <= 50 (redução de 87%); taxa de resolução `resolved_at IS NOT NULL` > 60%.

### F6-23 — `evo.evolution_alerts` 269 unresolved backlog — nenhum triage

- **Origem:** Etapa 60 (Bloco 6).
- **Evidência:** `SELECT COUNT(*) FROM evo.evolution_alerts WHERE resolved_at IS NULL AND acknowledged_at IS NULL` = 269. Zero triage/acknowledge. Cron `purge_evolution_alerts` (65) rodando diariamente às 04:00 — mas só purga rows antigas, não força triage.
- **Ação:**
  1. Dashboard admin (`AdminAlertHistoryPage.tsx` — já existe) com contador de "pendentes por severidade" no topo.
  2. SLA: alertas `critical` acknowledged em <15min, `high` em <1h, `medium` em <4h.
  3. Auto-escalation: alerta critical sem ack por 30min notifica PagerDuty.
  4. Alinhar com F6-08 (auto-resolve quando condição volta).
- **Aceite:** `unresolved_count` cai para <= 20 em 30 dias.

### F6-24 — `zapp.instance_registry` tem 22 rows; só 3 provisionadas (14%)

- **Origem:** Etapa 61, 64 (Bloco 6).
- **Evidência:** `SELECT status, COUNT(*) FROM zapp.instance_registry GROUP BY status`: `archived, connected, not_provisioned` totalizando 22. Apenas 3 estão em `whatsapp_connections` (fonte real). 19 registradas mas não provisionadas ou arquivadas.
- **Ação:**
  1. Auditar as 22 rows: para cada, decidir manter (relevância histórica), archive, ou hard-delete.
  2. Documentar `instance_registry` como "registry de intenção" separado de "instâncias reais" (whatsapp_connections/evolution_instance_credentials).
  3. Adicionar coluna `archived_reason` para justificar archives.
- **Aceite:** registry tem só rows justificadas; `not_provisioned` count = 0 OU tem `archived_reason` claro.

### F6-25 — `instance_auth_events` últimas 17 rows com `event_type=NULL`, `http_status=NULL`, `success=false` — instrumentação quebrada

- **Origem:** Etapa 65 (Bloco 6).
- **Evidência:** `SELECT event_type, http_status, success, COUNT(*) FROM zapp.instance_auth_events WHERE created_at > NOW() - INTERVAL '24 hours' GROUP BY 1,2,3` retorna **UMA row**: `event_type=NULL, http_status=NULL, success=false, count=17`. Todas as 17 inserções falharam em popular os campos essenciais. Instrumentação do lado do produtor (edge function/trigger) está quebrada — schema espera dados, produtor envia só shell.
- **Ação:**
  1. Investigar quem escreve em `zapp.instance_auth_events`: grep `instance_auth_events` em edge functions e RPCs.
  2. Adicionar NOT NULL constraints em `event_type` e `success` para forçar produtor a preencher.
  3. Log estruturado no produtor.
- **Aceite:** `SELECT COUNT(*) FILTER (WHERE event_type IS NULL) FROM zapp.instance_auth_events WHERE created_at > NOW() - INTERVAL '1 day'` = 0 após correção.

### F6-26 — Test coverage módulo connections: 2 test files para ~30 arquivos (0 tests em componentes)

- **Origem:** Etapa 56-65 (Bloco 6).
- **Evidência:** `find src -path "*connection*" -name "*.test.*"` retorna 2 files: `useHubTabNavigation.test.tsx` e `useConnectionsState.test.ts` (328 linhas). Zero tests para: `useConnectionsActions` (100+ linhas de business logic crítica), `useConnectionsRealtime`, `useConnectionsManager` (dispatcher central), `whatsappConnectionService`, `whatsappConnectionRepository`, `BridgeService`, e **30+ componentes** (ConnectionsView 649 linhas, ConnectionCard 359, InstanceSettingsDialog 496, etc.).
- **Ação:**
  1. Priorizar tests para `useConnectionsActions` (F6-02 depende desses tests para regressão).
  2. Tests para `whatsappConnectionService` mockando Evolution API.
  3. Snapshot tests para ConnectionsView com 0/1/N conexões (empty state, single, plural).
- **Aceite:** coverage do módulo `src/features/connections/` e `src/services/connections/` >= 60% linhas cobertas.

### F6-27 — CRÍTICO (P0): `useEvolutionAutoSync` faz SELECT sem filtro por workspace/user — cross-tenant leak potencial

- **Origem:** Etapa 61 (Bloco 6).
- **Evidência:** `src/hooks/useEvolutionAutoSync.ts` linhas 20-30: `supabase.from('whatsapp_connections').select('instance_id, phone_number')`. Sem `.eq('workspace_id', currentWorkspace)`. Depende só de RLS. Se RLS `contacts_select`-style estiver frouxa (F6-17, F6-18), retorna instâncias de outros tenants. Pior: `INSERT` de instância "missing" sem check de workspace pode acidentalmente atribuir instância de tenant A ao workspace de user B.
- **Ação:**
  1. Adicionar `.eq('workspace_id', workspace.id)` no SELECT (workspace via context).
  2. INSERT com `workspace_id = workspace.id` explícito.
  3. Alinhado com F5-16 (workspace_id real em contatos) e F6-17 (RLS multi-tenant real).
- **Aceite:** user de workspace A não vê/importa instâncias de workspace B; teste com 2 workspaces confirma isolamento.

### F6-28 — `handleDelete` engole erro do Evolution API `.catch(log.warn)` — deixa instância órfã lá

- **Origem:** Etapa 63 (Bloco 6).
- **Evidência:** `src/features/connections/hooks/parts/useConnectionsActions.ts` linhas ~120-125: `await deleteInstance(evoName).catch((e) => log.warn('Failed to delete evolution instance:', e))`. Se Evolution API 5xx, delete no banco continua — instância fica órfã no Evolution manager, consumindo recursos, potencialmente ainda recebendo webhooks para uma tabela que não existe mais.
- **Ação:**
  1. Se `deleteInstance` falhar com retry-able (5xx, timeout), enfileirar em `zapp.evolution_pending_deletes` para retry via cron.
  2. Se falhar com 404 (já deletada), OK continuar.
  3. Se 4xx (auth/perms), abortar delete no banco e alertar usuário.
- **Aceite:** teste com Evolution 500 → banco não deleta, tarefa fica em pending_deletes; cron retry resolve.

### F6-29 — `handleAddConnection` valida só `name` — permite `phone_number` vazio

- **Origem:** Etapa 56 (Bloco 6).
- **Evidência:** `useConnectionsActions.handleAddConnection`: `if (!newConnection.name) { toast(...); return; }`. Não valida `phone_number`. INSERT com phone vazio passa (`phone_number` é nullable no schema). Depois, `useEvolutionAutoSync` matcha por phone e não encontra match, criando duplicatas.
- **Ação:**
  1. Adicionar validação: `if (!newConnection.phone_number || !isValidBrazilianPhone(newConnection.phone_number)) { toast('Número inválido'); return; }`.
  2. Schema Zod para `NewConnectionData` com `phone_number: z.string().regex(BR_PHONE_REGEX)`.
- **Aceite:** teste — click "Conectar" com phone vazio → toast erro, sem INSERT.

### F6-30 — Múltiplas cópias de tabelas em múltiplos schemas: 13 objetos para 5 nomes distintos

- **Origem:** Etapa 56, 60, 61 (Bloco 6).
- **Evidência:** `pg_class`:
  - `qr_attempts`: 2 (zapp TABLE, public VIEW)
  - `evolution_reconcile_jobs`: 3 (evo TABLE, public VIEW, zapp VIEW)
  - `evolution_alerts`: 3 (evo TABLE, public VIEW, zapp VIEW)
  - `evolution_instance_credentials`: 3 (evo TABLE, public VIEW, zapp VIEW)
  - `instance_auth_events`: 2 (zapp TABLE, public VIEW)
  
  13 objetos para 5 conceitos. Views compat criadas para PostgREST/Supabase auto-expose em schemas `public` e `zapp`. Manutenção multiplicada por 3.
- **Ação:**
  1. Documentar em `docs/db/schema-topology.md` qual é canonical para cada conceito.
  2. Views compat devem ser thin passthroughs (`SELECT * FROM canonical`), não têm lógica.
  3. Auditar se PostgREST realmente precisa de views em `public` — se todas as tabelas relevantes estão em schemas expostos (via `db-schemas` config), pode dispensar.
  4. Se necessário, gerar views compat via migration reproduzível (não manual).
- **Aceite:** `docs/db/schema-topology.md` mapeia canonical → compat views; cron `ensure-evolution-backcompat-views` (jobid 138) sincroniza (já existe).