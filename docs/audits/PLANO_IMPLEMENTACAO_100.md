# PLANO DE CORREÇÃO — populado durante a análise

> Documento vivo. Cada achado real da análise vira uma etapa aqui, com origem (etapa da análise), evidência (query/arquivo/log) e critério de aceite.
> **Correção é responsabilidade do próximo chat.**

Convenção de ID: `F<bloco>-<seq>` — ex. `F1-01` = primeiro achado do bloco 1 da análise.

**Total de achados até agora: 63** (14 Bloco 1 + 13 Bloco 2 + 12 Bloco 3 + 24 Bloco 4).

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
