# Estado: src/lib (raiz) — bloco 1E-b

> Runtime: NAO_VERIFICADO | Auditado em: 2026-08-16 | Arquivos lidos: 87/87 inventariados (cabeçalho + assinaturas de export + contagem de importadores); 12 lidos integralmente (`env`, `mediaUrl` head, `healthCheck`, `supabase-helpers`, `supabaseHelpers`, `crypto`, `utils`, `index`, `contactsDB` head, `sanitize-extra` exports, `logger` head, `correlationId`)

**Escopo:** somente profundidade 1 de `src/lib/` — 87 arquivos, 14.353 linhas (`find src/lib -maxdepth 1 -type f \( -name '*.ts' -o -name '*.tsx' \) | xargs wc -l` → `14353 total`). Subdiretórios (`__tests__/`, `realtime/`, `mcp/`, `audio/`, `stressTest/`, `schemas/`) pertencem a E4/E5 e **não** foram auditados.

**Método:** contagem de importadores via `rg -l` sobre `src/ supabase/ scripts/ tests/ e2e/`, com regex cobrindo `@/lib/<mod>`, `./<mod>` e `import('...lib/<mod>')`. Módulos com 0 hits foram reconferidos com grep amplo sobre `docs/` e `scripts/dead-code-allowlist.txt`.

**Não verificável neste ambiente:** compilação, execução de testes, comportamento em runtime (sem `node_modules`; ZERO acesso ao banco).

---

## 1. Visão Geral

`src/lib` (raiz) é a camada de utilitários compartilhados do frontend. A distribuição de uso é extremamente desbalanceada:

| Faixa de importadores | Nº de módulos | Observação |
|---|---|---|
| 300+ | 2 | `utils` (388) e `logger` (319) — god modules de fato |
| 10–35 | 8 | `sanitize`, `whatsappAdapter`, `queryStaleTimes`, `evolutionInstance`, `formatters`, `mediaUrl`, `index`, `safeStorage` |
| 3–9 | 34 | corpo saudável da camada |
| 1–2 | 31 | muitos com o **único** importador sendo teste ou outro módulo do próprio `src/lib` |
| 0 | 12 | órfãos (~1.900 linhas) |

**Conformidade de topologia `evo`/`zapp`: OK.** Zero ocorrências de `schema('evo')`, `evo.evolution_*`, `evolution_messages_v2` ou sufixos `_wpp2` em toda a raiz de `src/lib` (`rg -n "schema\(['\"]evo['\"]\)|\bevo\.evolution|evolution_messages_v2|_wpp2\b" --glob 'src/lib/*.ts'` → nenhuma). Nenhum achado de defasagem evo→zapp neste bloco.

**Barrel `src/lib/index.ts`** (55 linhas) reexporta 6 módulos-folha (`utils`, `formatters`, `normalizers`, `phoneUtils`, `jid`, `sanitize`) com regras estritas documentadas em `src/lib/index.ts:5-9`. Verifiquei colisões de `export *` entre os 6: **nenhuma** — o barrel está consistente.

**Smells estruturais dominantes:** (a) 12 órfãos, vários representando trabalho iniciado e não ligado; (b) 4 famílias de duplicação funcional (retry, mídia, diagnóstico, sanitização); (c) hooks React e acesso direto a banco morando em `lib` (altitude errada).

---

## 2. Tabela de Arquivos

Legenda de status: **EM_USO** = ≥1 importador em código de produção; **EM_USO(teste)** = importadores apenas de teste; **ORFAO** = 0 importadores de código.

| arquivo | linhas | o que faz | status | impl | o que falta |
|---|---|---|---|---|---|
| alertHistory.ts | 85 | histórico de alertas de webhook em localStorage | EM_USO (3) | COMPLETA | — |
| appMetrics.ts | 97 | TTM + falhas de authz expostas em `window.__zappMetrics` | EM_USO (1: ProtectedRoute) | COMPLETA | — |
| audit.ts | 62 | `logAudit()` → tabela de auditoria | EM_USO (5) | COMPLETA | regra de negócio em `lib` (ver §5) |
| avatarColors.ts | 40 | cor determinística de avatar + `getInitials` | EM_USO (10) | COMPLETA | `getInitials` duplica formatters (A12) |
| buildVersion.ts | 758 | watcher de build id vs `/version.json`, purga cache/SW | EM_USO (3: App.tsx, useServiceWorker) | COMPLETA | maior arquivo do bloco; exporta `__TEST__` em runtime |
| businessAnalytics.ts | 260 | métricas de negócio → `analytics_events` + hook `useAnalytics` | **ORFAO** | COMPLETA | sem nenhum consumidor; contém hook React |
| clientRateLimiter.ts | 183 | rate limit client-side + hook `useRateLimitedAction` | **ORFAO** | COMPLETA | sem consumidor; contém hook React |
| clientTelemetry.ts | 279 | telemetria de queries, snapshot em `window.__queryTelemetry` | EM_USO (8) | COMPLETA | — |
| configBackup.ts | 267 | export/import JSON de configurações do usuário | **ORFAO** | COMPLETA | sem UI que acione |
| consoleErrorFilter.ts | 75 | fonte única de "ruído benigno" de console | EM_USO (2: main.tsx, sentry) | COMPLETA | — |
| contactHealth.ts | 48 | score de saúde de contato | EM_USO (5) | COMPLETA | regra de negócio em `lib` |
| contactsDB.ts | 340 | CRUD de contatos/notas/telefones/emails no Supabase | **ORFAO** | COMPLETA | duplica `src/services/contacts/contactsRepository.ts` (A9) |
| correlationId.ts | 31 | ID de correlação cliente→edge→DB | EM_USO (5) | COMPLETA | colide com alias em logger (A6) |
| crossTabSendDedupe.ts | 293 | dedupe de envio entre abas | EM_USO (1 prod: evolutionSendRetry) | COMPLETA | — |
| crypto.ts | 18 | `buildFileHash` (SHA-256) | EM_USO (4) | COMPLETA | sobrepõe `idempotency.sha256Hex` |
| csvUtils.ts | 216 | CSV RFC4180 + prevenção de injection | EM_USO (1 prod: ContactImportDialog) | COMPLETA | — |
| dedupeMetrics.ts | 158 | métricas in-memory do cross-tab dedupe | EM_USO (3) | COMPLETA | — |
| devRealtimeLogger.ts | 190 | logger dev de subscriptions realtime | EM_USO (8) | COMPLETA | — |
| diagnostics.ts | 148 | `runConnectionDiagnostics` | EM_USO (1: admin/Connections) | COMPLETA | 1 de 4 módulos de diagnóstico (A11) |
| env.ts | 71 | env validada por Zod | **ORFAO** | COMPLETA | nunca ligado; o hardcode que ele resolveria continua (A1) |
| eventBus.ts | 87 | event bus tipado | EM_USO (1 prod: useEvolutionAutoReconnect) | COMPLETA | — |
| evolutionCircuitBreaker.ts | 260 | circuit breaker por instância | EM_USO (1 prod: evolutionSendRetry) | COMPLETA | — |
| evolutionDiagnostics.ts | 94 | probes da bridge Evolution | EM_USO (2) | COMPLETA | `DiagnosticResult` duplicado (A11) |
| evolutionInstance.ts | 33 | resolve nome (não UUID) da instância | EM_USO (18) | COMPLETA | — |
| evolutionMessageId.ts | 67 | extrai id de mensagem da resposta Evolution | EM_USO (4) | COMPLETA | — |
| evolutionSendRetry.ts | 232 | envio Evolution com backoff | EM_USO (1: messageSender) | COMPLETA | hub real do pipeline de envio |
| externalProxy.ts | 291 | query ao Supabase self-hosted (superfície legada mantida) | EM_USO (6) | COMPLETA | nome enganoso pós-consolidação 2026-07-15 |
| failedMessagesEnqueue.ts | 117 | enqueue client-side na DLQ | EM_USO (1 prod: evolutionSendRetry) | COMPLETA | — |
| failureRootCause.ts | 132 | classifica causa raiz de falha de envio | EM_USO (10) | COMPLETA | — |
| featureFlags.ts | 262 | flags booleanas + rollout % + targeting | EM_USO (3) | COMPLETA | regra de negócio em `lib` |
| formatters.ts | 191 | formatação de data/telefone/moeda/bytes | EM_USO (15 + barrel) | COMPLETA | `getInitials`/`formatBRL`/`truncate` duplicados (A12) |
| healthCheck.ts | 45 | serviço de health check | **ORFAO** (só `src/_archive/`) | **STUB** | `run()` retorna sempre `healthy:true`/`status:'unknown'` (A2) |
| idempotency.ts | 97 | chave de idempotência estável (sha256) | EM_USO (4) | COMPLETA | — |
| index.ts | 55 | barrel curado de 6 módulos-folha | EM_USO (13) | COMPLETA | — |
| instrumentedExternal.ts | 82 | `timedRpc` instrumentado | EM_USO (1: useMessageDetails) | PARCIAL | header declara "adoção incremental"; 1 call site em 6 meses |
| jid.ts | 366 | helpers canônicos de JID WhatsApp | EM_USO (6 + barrel) | COMPLETA | sobreposição com phoneUtils (A5b) |
| lazyWithRetry.ts | 213 | lazy import com recuperação de chunk error | EM_USO (10) | COMPLETA | — |
| logger.ts | 155 | logging centralizado | EM_USO (319) | COMPLETA | alias `generateCorrelationId` confuso (A6) |
| loginAttempts.ts | 152 | lock de conta por tentativas falhas | EM_USO (3) | COMPLETA | regra de segurança em `lib` |
| mapbox-loader.ts | 18 | carrega mapbox-gl sob demanda | EM_USO (2) | COMPLETA | — |
| mediaUrl.ts | 344 | resolução canônica de URL de mídia | EM_USO (14) | COMPLETA | URL hardcoded em `:32`; `PUBLIC_BUCKETS` duplicado (A1, A5) |
| normalizers.ts | 152 | coerção de colunas nullable | EM_USO (8 + barrel) | COMPLETA | — |
| offlineQueue.ts | 234 | fila offline em IndexedDB + Background Sync | **ORFAO** | COMPLETA | ADR-005 (PWA offline) não concluída |
| openContactInChat.ts | 169 | abre inbox num contato | EM_USO (3) | COMPLETA | orquestração de UI em `lib` |
| optimisticConcurrency.ts | 162 | OCC com checagem de versão | **ORFAO** | COMPLETA | sem consumidor |
| phoneUtils.ts | 274 | telefones BR (67 DDDs) | EM_USO (8 + barrel) | COMPLETA | sobreposição com jid/formatters/sanitize-extra (A5b) |
| popupManager.ts | 74 | janelas popup de chat | EM_USO (1 prod: ChatPanelHeader) | COMPLETA | — |
| queryStaleTimes.ts | 62 | TTLs centralizados do React Query | EM_USO (18) | COMPLETA | — |
| queryTimeout.ts | 106 | timeout centralizado de queries | **ORFAO** | COMPLETA | sem consumidor |
| reactRefs.ts | 39 | convenções de tipagem de refs | EM_USO (1 prod: ChatInputArea) | COMPLETA | — |
| rechartsFormatters.ts | 40 | formatters tolerantes a `ValueType` | EM_USO (3) | COMPLETA | `formatBRL`/`toNumber` duplicados (A12) |
| recheckWebhookSignature.ts | 30 | client da edge fn homônima | EM_USO (2) | COMPLETA | — |
| requestDedupeKey.ts | 165 | chave estável de dedupe por request | EM_USO (1 prod: evolutionSendRetry) | COMPLETA | — |
| requestDeduplicator.ts | 165 | coalescing de requests paralelas | **ORFAO** | COMPLETA | função sobreposta a crossTabSendDedupe |
| retry.ts | 140 | `withRetry` / `withNetworkRetry` | EM_USO (6) | COMPLETA | 1 de 3 implementações de retry (A4) |
| retryAlerts.ts | 285 | thresholds + avaliador de alertas de retry | EM_USO (6) | COMPLETA | — |
| retryConfig.ts | 220 | config de retry por instância (`global_settings`) | EM_USO (8) | COMPLETA | `RetryConfig` colide com retryStrategyAudit (A4) |
| retryScheduleSimulation.ts | 82 | simula cronograma de tentativas | EM_USO (1 prod: RetrySchedulePreview) | COMPLETA | — |
| retryStrategyAudit.ts | 420 | classificação de erro + RetryExecutor + métricas | EM_USO (1: useRetryAndErrorPrevention) | COMPLETA | 3ª implementação de retry (A4) |
| runtimeGuards.ts | 76 | type predicates para payloads `unknown` | EM_USO (1 prod: useExternalApiManagement) | COMPLETA | — |
| safeStorage.ts | 58 | wrapper de localStorage à prova de exceção | EM_USO (12) | COMPLETA | — |
| sanitize-extra.ts | 237 | sanitização complementar (email, arquivo, URL) | **ORFAO** | COMPLETA | `sanitizeUrl`/`truncate` duplicados com sanitize/formatters (A12) |
| sanitize.ts | 411 | XSS: DOMPurify + DOM-based (v3.0 unificada) | EM_USO (33 + barrel) | COMPLETA | — |
| scanResponse.ts | 228 | parser das respostas do security-scanner | EM_USO (4) | COMPLETA | `isRetryable` duplicado (A12) |
| schemaDrift.ts | 204 | detecta drift schema DB × types.ts | **ORFAO** | COMPLETA | usa `rpc_schema_tables`/`rpc_schema_columns`; nunca invocado |
| selfHostedDiagnostics.ts | 236 | probes do Supabase self-hosted | EM_USO (1: SelfHostedHealthPage) | COMPLETA | `DiagnosticResult` duplicado (A11) |
| sendFunctionRouter.ts | 69 | roteia envio: evolution-api × whatsapp-cloud-api | EM_USO (1 prod: evolutionSendRetry) | COMPLETA | — |
| sendIdempotency.ts | 136 | chave estável por mensagem de saída | EM_USO (1 prod: messageSender) | COMPLETA | — |
| sentry.ts | 112 | init do Sentry (noop sem DSN) | EM_USO (1: main.tsx) | COMPLETA | — |
| silentErrorPrevention.ts | 295 | evita erros engolidos; `safeAsync`, `fireAndForget` | EM_USO (4) | COMPLETA | contém 3ª `retryWithBackoff` (A4) |
| storageSignedUrls.ts | 120 | signed URLs para buckets privados | EM_USO (7) | COMPLETA | 1 de 3 módulos de mídia (A5) |
| structuredErrorLogging.ts | 482 | log estruturado com categoria/severidade/correlação | EM_USO (3) | COMPLETA | — |
| supabase-helpers.ts | 19 | `unwrapRows` / `unwrapRow` | EM_USO (8) | COMPLETA | nome quase idêntico a supabaseHelpers (A7) |
| supabaseHelpers.ts | 18 | `fromTable` (tabela dinâmica) | EM_USO (5) | COMPLETA | nome quase idêntico a supabase-helpers (A7) |
| undoToast.ts | 69 | toast com botão "Desfazer" + `confirmToast` | EM_USO (3) | COMPLETA | UI em `lib` |
| useMediaUrl.ts | 371 | **hooks React** de resolução de mídia | EM_USO (7) | COMPLETA | hook em `lib`, não em `hooks/` (A8); `PUBLIC_BUCKETS` duplicado (A5) |
| utils.test.ts | 21 | teste de `cn()` | n/a (teste) | COMPLETA | teste solto na raiz, fora de `__tests__/` |
| utils.ts | 13 | `cn()` + `wrap()` | EM_USO (388) | COMPLETA | `wrap()` sem nenhum importador (A10) |
| webVitals.ts | 292 | Core Web Vitals | EM_USO (3) | COMPLETA | — |
| webauthnUtils.ts | 53 | conversões buffer/base64url WebAuthn | EM_USO (1 prod: useWebAuthn) | COMPLETA | consta no dead-code-allowlist |
| webhookEventsDeepLink.ts | 50 | deep-link via sessionStorage entre páginas admin | EM_USO (5) | COMPLETA | — |
| webhookHealthAlerts.ts | 156 | alertas de saúde de webhook | EM_USO (5) | COMPLETA | `evaluateAllInstances` duplicado (A12) |
| whatsappAdapter.ts | 549 | adapter único de envio WhatsApp (cloud × evolution) | EM_USO (24) | COMPLETA | — |
| whatsappAdapterTransport.ts | 111 | resolve modo/transport do workspace | EM_USO (1 prod: whatsappAdapter) | COMPLETA | — |
| whatsappAdapterTypes.ts | 122 | tipos do adapter | EM_USO (2) | COMPLETA | — |
| whatsappConnectionsCache.ts | 85 | cache TTL 30s de `whatsapp_connections` | EM_USO (4) | COMPLETA | — |
| withRequestId.ts | 29 | trace end-to-end por ação | EM_USO (3) | COMPLETA | — |

---

## 3. Chamado Por

**Consumidores de altíssimo volume (god modules):**
- `utils.ts` → 388 arquivos (via `cn()`, direto ou pelo barrel)
- `logger.ts` → 319 arquivos
- `sanitize.ts` → 33 · `whatsappAdapter.ts` → 24 · `evolutionInstance.ts` / `queryStaleTimes.ts` → 18 cada · `formatters.ts` → 15 · `mediaUrl.ts` → 14

**Cluster de envio (o hub real do bloco).** `src/features/inbox/hooks/realtime/messageSender.ts` → `evolutionSendRetry.ts`, que por sua vez é o único consumidor de produção de 5 módulos: `sendFunctionRouter`, `crossTabSendDedupe`, `evolutionCircuitBreaker`, `failedMessagesEnqueue`, `requestDedupeKey`. Esses 5 aparentam baixo uso na contagem bruta, mas estão no caminho crítico de todo envio de mensagem — **NAO_REMOVER**.

**Módulos com importador único fora de teste** (verificado com `rg -l`):
`appMetrics` ← `src/features/auth/components/ProtectedRoute.tsx` · `diagnostics` ← `src/pages/admin/Connections.tsx` · `instrumentedExternal` ← `src/features/inbox/hooks/useMessageDetails.ts` · `retryStrategyAudit` ← `src/hooks/useRetryAndErrorPrevention.ts` · `selfHostedDiagnostics` ← `src/pages/admin/SelfHostedHealthPage.tsx` · `sentry` ← `src/main.tsx` · `whatsappAdapterTransport` ← `src/lib/whatsappAdapter.ts` · `csvUtils` ← `src/components/contacts/ContactImportDialog.tsx` · `eventBus` ← `src/hooks/useEvolutionAutoReconnect.ts` · `runtimeGuards` ← `src/hooks/useExternalApiManagement.ts` · `popupManager` ← `src/features/inbox/components/chat/ChatPanelHeader.tsx` · `reactRefs` ← `src/features/inbox/components/chat/ChatInputArea.tsx` · `retryScheduleSimulation` ← `src/components/monitoring/RetrySchedulePreview.tsx` · `webauthnUtils` ← `src/hooks/useWebAuthn.ts`.

**`healthCheck.ts`:** único importador é `src/_archive/healthCheck.archived.ts` — ou seja, **nenhum consumidor vivo**.

---

## 4. Órfãos (veredito)

12 arquivos, ~1.936 linhas sem nenhum importador de código.

| arquivo | linhas | veredito | justificativa |
|---|---|---|---|
| `src/lib/healthCheck.ts` | 45 | **SEGURO** (remover) | `@deprecated` na linha 2; implementação é stub (`healthCheck.ts:31-38` sempre `healthy:true`); histórico já preservado em `src/_archive/healthCheck.archived.ts`; substituto declarado é `useDiagnosticsData.ts` |
| `src/lib/contactsDB.ts` | 340 | **VERIFICAR** | duplica `src/services/contacts/contactsRepository.ts` (mesma tabela `contacts`); decidir qual é canônico antes de remover |
| `src/lib/requestDeduplicator.ts` | 165 | **VERIFICAR** | função sobreposta a `crossTabSendDedupe.ts` (que está EM_USO); consta em `scripts/dead-code-allowlist.txt` |
| `src/lib/optimisticConcurrency.ts` | 162 | **VERIFICAR** | consta em `scripts/dead-code-allowlist.txt`; OCC sem call site — decidir se a estratégia foi abandonada |
| `src/lib/businessAnalytics.ts` | 260 | **VERIFICAR** | escreve em `analytics_events` (tabela existe em migrations); consta no dead-code-allowlist; feature nunca ligada |
| `src/lib/offlineQueue.ts` | 234 | **NAO_REMOVER** | é a implementação de `docs/adr/ADR-005-implementar-pwa-offline.md`; remover apaga a única implementação da ADR |
| `src/lib/schemaDrift.ts` | 204 | **NAO_REMOVER** | depende de `rpc_schema_tables`/`rpc_schema_columns`, que existem em migrations (`20260805160000_harden_rpc_schema_whitelist.sql`); é ferramenta de auditoria de schema, útil justamente no contexto desta onda |
| `src/lib/sanitize-extra.ts` | 237 | **VERIFICAR** | contém validação de upload (MIME/extensão/tamanho) sem equivalente em `sanitize.ts`; migrar o que for único antes de remover |
| `src/lib/configBackup.ts` | 267 | **VERIFICAR** | feature completa sem UI; decidir ligar ou remover |
| `src/lib/clientRateLimiter.ts` | 183 | **VERIFICAR** | defense-in-depth declarada no header; servidor tem rate limiter próprio |
| `src/lib/queryTimeout.ts` | 106 | **VERIFICAR** | timeout centralizado nunca adotado; sobrepõe-se parcialmente a `retryConfig.timeoutMs` |
| `src/lib/env.ts` | 71 | **NAO_REMOVER** | ver A1 — remover consolida o hardcode que ele existia para eliminar |

**Export morto dentro de arquivo vivo:** `wrap()` em `src/lib/utils.ts:10` não tem um único importador (`rg` por `wrap` importado de `@/lib/utils` → 0 hits; os hits de "wrap" no repo são todos `wrapMessagesHandler` de `devRealtimeLogger`). Veredito: **SEGURO**.

**Teste solto:** `src/lib/utils.test.ts` (21 linhas) está na raiz em vez de `src/lib/__tests__/`. Inconsistência de convenção, não órfão.

---

## 5. Duplicações e smells

### 5.1 Duplicação funcional (4 famílias)

**Família RETRY — 3 implementações independentes de backoff:**
- `src/lib/retry.ts:36` `withRetry` (6 importadores) — a canônica de fato
- `src/lib/retryStrategyAudit.ts:174` `calculateRetryDelay` + `:239` `RetryExecutor` (1 importador)
- `src/lib/silentErrorPrevention.ts:155` `retryWithBackoff` (4 importadores do módulo)

Agravante: a **interface `RetryConfig` é exportada duas vezes com formatos diferentes** — `src/lib/retryConfig.ts:18` (persistida em `global_settings`) e `src/lib/retryStrategyAudit.ts:33` (in-memory). Importar a errada compila e falha em runtime.

**Família MÍDIA — 3 módulos, 835 linhas, com constante duplicada:**
- `src/lib/mediaUrl.ts` (344) — resolução pública; `PUBLIC_BUCKETS` em `:202`
- `src/lib/useMediaUrl.ts` (371) — hooks React; **`PUBLIC_BUCKETS` de novo** em `:41`
- `src/lib/storageSignedUrls.ts` (120) — signed URLs para buckets privados

Dois `Set` de buckets públicos mantidos em paralelo: divergirem é questão de tempo, e o sintoma seria mídia quebrada em produção.

**Família DIAGNÓSTICO — 4 módulos, 523 linhas:** `diagnostics.ts` (148), `evolutionDiagnostics.ts` (94), `selfHostedDiagnostics.ts` (236), `healthCheck.ts` (45, stub). A interface `DiagnosticResult` é declarada duas vezes com shapes distintos: `evolutionDiagnostics.ts:6` e `selfHostedDiagnostics.ts:28`.

**Família SANITIZAÇÃO/TELEFONE:** `sanitizeUrl` existe em `sanitize.ts:142` (retorna `string`) e `sanitize-extra.ts:121` (retorna `string | null`) — assinaturas incompatíveis com o mesmo nome. Normalização de telefone aparece em 4 lugares: `phoneUtils.normalizePhone`, `formatters.cleanPhone`/`formatBrazilianPhone`, `sanitize-extra.normalizePhoneBR`, `jid.toPhone`. Conversão telefone↔JID em 3: `jid.ts`, `phoneUtils.toWhatsAppJID`/`fromWhatsAppJID`, `openContactInChat.jidToPhone`.

### 5.2 Nomes colidentes em módulos distintos

Levantados com script sobre todos os `export function|const|class|enum` da raiz:

| símbolo | módulos | risco |
|---|---|---|
| `PUBLIC_BUCKETS` | mediaUrl:202, useMediaUrl:41 | **alto** — divergência silenciosa |
| `RetryConfig` (interface) | retryConfig:18, retryStrategyAudit:33 | **alto** — shapes incompatíveis |
| `generateCorrelationId` | correlationId:17 (cripto), logger:35 (alias de contador) | **alto** — ver A6 |
| `DiagnosticResult` | evolutionDiagnostics:6, selfHostedDiagnostics:28 | médio |
| `sanitizeUrl` | sanitize:142, sanitize-extra:121 | médio |
| `getInitials` | avatarColors:32, formatters:94 | médio |
| `formatBRL` | formatters:74, rechartsFormatters:38 | baixo |
| `truncate` | formatters:86, sanitize-extra:212 | baixo |
| `isRetryable` | scanResponse:70, retryStrategyAudit:166 | baixo |
| `classifySeverity` | alertHistory:32, clientTelemetry:107 | baixo (domínios distintos) |
| `evaluateAllInstances` | retryAlerts:263, webhookHealthAlerts:128 | baixo (domínios distintos) |
| `toNumber` | jid (alias de `toPhone`), rechartsFormatters:12 | baixo |

Nenhuma dessas colisões vaza pelo barrel `index.ts` — verificado.

### 5.3 Altitude errada (regra de negócio / UI / hooks em `lib`)

- **Hooks React em `src/lib` raiz** (deveriam estar em `src/hooks/`): `useMediaUrl.ts:166` `useSignedMediaUrlBatch`, `useMediaUrl.ts:311` `useMessageMediaUrl`, `businessAnalytics.ts:255` `useAnalytics`, `clientRateLimiter.ts:176` `useRateLimitedAction`. O nome do arquivo `useMediaUrl.ts` já denuncia — é um módulo de hooks morando na camada de utilitários.
- **Acesso direto a banco em `lib`**: `contactsDB.ts` (CRUD completo de `contacts`/`contact_notes`/`contact_phones`/`contact_emails`), `optimisticConcurrency.ts` e `queryTimeout.ts` (ambas em `contacts`), `businessAnalytics.ts` (`analytics_events`), `schemaDrift.ts` (2 RPCs), `loginAttempts.ts`, `audit.ts`, `featureFlags.ts`, `retryConfig.ts`, `whatsappConnectionsCache.ts`. O projeto já tem `src/services/` para isso (`contactsRepository.ts`).
- **Orquestração de UI em `lib`**: `undoToast.ts` (renderiza toast), `openContactInChat.ts` (navegação + evento de UI), `popupManager.ts` (abre `window`).

### 5.4 Nomenclatura

- `supabase-helpers.ts` (kebab) e `supabaseHelpers.ts` (camel) coexistem com conteúdos totalmente distintos e 8 + 5 importadores. Convite direto a import errado.
- `externalProxy.ts` mantém o nome "external" mesmo após a consolidação de 2026-07-15 ter eliminado o segundo Supabase (declarado no próprio header do arquivo).
- `buildVersion.ts:?` exporta `__TEST__` no bundle de produção.

---

## 6. Achados

| ID | evidência | severidade | descrição |
|---|---|---|---|
| **A1** | `src/lib/env.ts:65` + `src/lib/mediaUrl.ts:32` | 🟠 Alto | `env.ts` foi criado (com Zod + fallbacks) **exatamente** para eliminar o hardcode de `SUPABASE_PUBLIC_URL` em `mediaUrl.ts` — o próprio header do arquivo diz isso em `env.ts:4-6`. O módulo tem **zero importadores** e o hardcode `export const SUPABASE_PUBLIC_URL = 'https://supabase.atomicabr.com.br'` continua vivo em `mediaUrl.ts:32`, alimentando `STORAGE_PUBLIC_BASE` (`:35`) que serve **14 importadores**. Trabalho iniciado e não ligado: trocar de ambiente ainda exige editar código. |
| **A2** | `src/lib/healthCheck.ts:2`, `:27`, `:31-38` | 🟠 Alto | `healthCheck` é um **stub que sempre reporta sucesso**: `run()` retorna `{ healthy: true, status: 'unknown', components: [] }` incondicionalmente, `getCached()` retorna `null`. Está marcado `@deprecated` e o único importador é `src/_archive/healthCheck.archived.ts`. Risco: o export `healthCheck` continua público em `src/lib`; qualquer religamento futuro produz um painel de saúde que mente. |
| **A3** | `retryConfig.ts:18` × `retryStrategyAudit.ts:33`; `mediaUrl.ts:202` × `useMediaUrl.ts:41`; `correlationId.ts:17` × `logger.ts:35` | 🟠 Alto | Três colisões de nome de **alto risco** entre módulos distintos da mesma pasta. `RetryConfig` tem shapes incompatíveis; `PUBLIC_BUCKETS` é um `Set` de buckets duplicado (divergência → mídia quebrada); `generateCorrelationId` existe como função criptográfica (`correlationId.ts`) e como alias de um contador não-aleatório (`logger.ts:35`) — o próprio comentário em `logger.ts:29-31` alerta "NOT cryptographically random… use generateCorrelationId from @/lib/correlationId instead", ou seja, o código sabe do problema e o mantém. |
| **A4** | `retry.ts:36`, `retryStrategyAudit.ts:174`/`:239`, `silentErrorPrevention.ts:155` | 🟡 Médio | Três implementações independentes de retry com backoff convivem na mesma pasta, totalizando 855 linhas. Não há indicação de qual é canônica; `retry.ts` lidera em adoção (6 importadores) mas `retryStrategyAudit.ts` é o mais elaborado (420 linhas, enum de classificação, métricas) e tem 1 único importador. |
| **A5** | `mediaUrl.ts` (344) + `useMediaUrl.ts` (371) + `storageSignedUrls.ts` (120) | 🟡 Médio | 835 linhas em 3 módulos para resolver URL de mídia, com constante duplicada (A3) e três pontos de entrada distintos usados por 28 arquivos somados. Contradiz a própria "REGRA DE OURO (ADR-001)" declarada em `mediaUrl.ts:4-6` de que a URL é construída "SOMENTE aqui". |
| **A6** | 12 arquivos / ~1.936 linhas — ver §4 | 🟡 Médio | Órfãos representando features completas nunca ligadas (`offlineQueue`/ADR-005, `configBackup`, `businessAnalytics`, `clientRateLimiter`, `optimisticConcurrency`, `queryTimeout`, `schemaDrift`). 5 deles já estão em `scripts/dead-code-allowlist.txt`, o que confirma que a triagem é conhecida mas nunca foi decidida. |
| **A7** | `src/lib/contactsDB.ts` (340) × `src/services/contacts/contactsRepository.ts` | 🟡 Médio | Duas camadas de acesso à mesma tabela `contacts`. `contactsDB.ts` é órfão (o único hit de import é a linha de `export default` dele mesmo) e ainda importa `sanitizePostgrestFilter` e `isValidUUID` — código real, mas morto, sobre uma tabela viva. |
| **A8** | `useMediaUrl.ts:166`, `:311`, `businessAnalytics.ts:255`, `clientRateLimiter.ts:176` | 🟡 Médio | 4 hooks React declarados em `src/lib` raiz, incluindo um arquivo inteiro nomeado `useMediaUrl.ts` (371 linhas) com 7 importadores. Camada de utilitário hospedando camada de hooks. |
| **A9** | `src/lib/supabase-helpers.ts` × `src/lib/supabaseHelpers.ts` | 🟢 Baixo | Dois arquivos com nomes que diferem apenas por hífen/camelCase e conteúdos sem qualquer relação (`unwrapRows`/`unwrapRow` vs `fromTable`), com 8 e 5 importadores respectivamente. |
| **A10** | `src/lib/utils.ts:10` | 🟢 Baixo | `wrap()` sem nenhum importador, dentro do arquivo mais importado do repositório (388 importadores). Export morto em superfície pública máxima. |
| **A11** | `diagnostics.ts`, `evolutionDiagnostics.ts:6`, `selfHostedDiagnostics.ts:28`, `healthCheck.ts` | 🟢 Baixo | 4 módulos de diagnóstico com `DiagnosticResult` declarado duas vezes em shapes distintos; cada um com 0–2 importadores e uma página admin própria. |
| **A12** | `avatarColors.ts:32`×`formatters.ts:94`; `sanitize.ts:142`×`sanitize-extra.ts:121`; `formatters.ts:74`×`rechartsFormatters.ts:38`; `formatters.ts:86`×`sanitize-extra.ts:212`; `scanResponse.ts:70`×`retryStrategyAudit.ts:166` | 🟢 Baixo | 5 pares de símbolos homônimos de baixo risco (domínios distintos ou um dos lados órfão). Nenhum vaza pelo barrel. |
| **A13** | `rg` sobre `src/lib/*.ts` | ✅ Conforme | **Zero** referências a `schema('evo')`, `evo.evolution_*`, `evolution_messages_v2` ou sufixos `_wpp2` na raiz de `src/lib`. Nenhuma defasagem de topologia evo→zapp neste bloco. |
| **A14** | `src/lib/utils.test.ts` | 🟢 Baixo | Único arquivo de teste na raiz de `src/lib`, fora da convenção `src/lib/__tests__/` usada pelos demais ~15 testes do módulo. |
