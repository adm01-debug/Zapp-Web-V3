# 📜 Changelog — ZAPP WEB

## [2.4.0] - 2026-08-12 — Desacoplamento Evolution Stack

### Separação de Infraestrutura Evolution API
- Servidor Evolution API (Dockerfile, build-patches T1-T25, consumer RabbitMQ) extraído para [adm01-debug/evolution-stack](https://github.com/adm01-debug/evolution-stack)
- Stacks Portainer (25, 113, 126, 225, 230, 234, 236), watchdogs e scripts operacionais removidos deste repo
- PR #1069 mergeado — remoção de infra/evolution* e 4 workflows de build

### Gateway Pattern (ADR-009) — F5 Zero Bypass
- Todos os 17+ edge functions que liam `EVOLUTION_API_URL` direto migrados para gateway único
- `supabase/functions/_shared/providers/evolution/client.ts`: 12 verbos (10 nomeados + 2 genéricos)
- `inventory.mjs` = 0 bypasses confirmados · CI guard `decouple-guard.yml` ativo

### Egresso via Postgres (F3)
- Writes de mensagem migrados para RPCs: `rpc_claim_outbound_message` + `rpc_update_incoming_message`
- Normalizer canônico: edge fn `evolution-webhook v10` ← fn_process_whatsapp_message


## [2.3.0] - 2026-08-03 — Consolidação Single-DB (FATOR X + Lovable Cloud)

### Auditoria FATOR X (PR #732-#735)

- **108 arquivos, −1.979 linhas**
- Edge functions obsoletas removidas: external-db-bridge, analyze-external-db
- Libs removidas: externalProxyBreaker.ts, externalProxyFetch.ts
- externalProxy.ts: migrado de HTTP proxy → Supabase direto
- useRealtimeInbox.ts: removido USE_EXTERNAL_DB (172 linhas de dead code)
- Labels: 'FATOR X' → 'Evolution DB' em 71 arquivos
- proxy.test.ts: reescrito para Supabase direto (21/21 passando)
- DB: migration para fn_constraints_reference_pipeline (FATOR X → Evolution DB)

### Auditoria Lovable Cloud (PR #736)

- **39 arquivos, +147/−108 linhas**
- UI labels: 'Lovable Cloud Proxy' → 'App Backend'
- Docs: SELF-HOSTED-DATABASE-GUIDE reescrito para single-DB
- ENV_SETUP, FUNCTIONALITIES, runbooks, TECHNICAL_DOCUMENTATION atualizados
- DB: migration com wrapper ops.check_schema_parity()

### Limpeza residual

- eslint.config.js: comentário atualizado
- Variáveis fatorX renomeadas → evoConn
- scripts/check-fe-be-sync.sh: diretório fatorx-migrations removido
- FATOR_X_URL e FATOR_X_SERVICE_ROLE_KEY eliminados

### Segurança

- external-db-proxy: auth mantida (requireUser)
- LOVABLE_API_KEY preservado (gateway IA ativo)
- CORS lovableproject.com preservado (preview environments)

### Correções pós-auditoria

- 3 testes quebrados por mock createLogger faltando (externalProxy, resilienceSimulation, v237Fallbacks)
- 2 edge functions com deno check corrigido (evolution-sender, log-idempotency-miss)
- 4 referências residuais FATOR X removidas (AdminExternalDbExplorer, catalog, connection-health-check, evolution-sender)

---

## [2.2.0] - 2026-07-31 — Lint Cleanup Total (0 erros / 0 warnings) + Design Tokens

### 🟢 Qualidade de Código

- **ESLint 71 → 0 erros e 206 → 0 warnings** (escopo do app; 5 warnings residuais vivem em arquivo de outra sessão em andamento):
  - 21 ocorrências de instância WhatsApp hardcoded (`'wpp2'`) → `DEFAULT_WHATSAPP_INSTANCE` (regra E20).
  - 19 `no-explicit-any` em testes tipados com assinaturas reais; 91 `any` em código de produção tipados (Database rows, AuthError, RealtimePostgresChangesPayload, interfaces locais).
  - 52 `no-non-null-assertion` → guardas/optional chaining; 60 `react-hooks/exhaustive-deps` corrigidos com deps seguras.
  - 9 violações de fronteira de domínio (deep imports `@/features/inbox/...` → imports relativos intra-feature).
  - 3 diretivas `eslint-disable` órfãs removidas; parse error em e2e corrigido; addons Storybook não instalados removidos do config.
- **Design System**: 85 substituições de tokens (autopatch) + 38 casos `font-mono` inspecionados (`// @technical` para dados técnicos; remoção para UI) → **0 violações Medium/High**.
- **Dead code**: 2 arquivos órfãos removidos (`ChatAttachmentsPreview.tsx`, `chatInputTypes.ts` — resquícios do #639) + allowlist da trilha de mensagens sincronizada (VML removido).
- **Ratchet apertado**: data-layer baseline 615 → 612; `lint-supabase-casts` 0 avisos (3 falsos positivos em docstrings corrigidos).

### 📄 Documentação

- LICENSE MIT adicionado (badge já prometia); README aponta para `zapp-web-v3` (badge CI + clone).

### Validação

| Indicador | Resultado |
|-----------|-----------|
| Testes | **7.299/7.299 PASS** (323 arquivos) |
| TypeScript | **zero erros** |
| Build | **1m 25s** |
| Lint | **0 erros / 0 warnings** |
| Design System | **0 violações Medium+** |
| Data-layer | **612/612 (ratchet)** |

### 🔴 Crítico Resolvido

- **ChatPanel não renderizava**: Edge Function `evolution-api` retornava HTTP 401 porque `SELFHOSTED_SUPABASE_ANON_KEY` não estava configurada no Edge Runtime. Corrigido adicionando a env var ao serviço `functions` no Portainer stack 35.
- **Circuit breaker**: 4 breakers independentes no `externalProxy.ts` bloqueavam todas as chamadas quando o `evolution-api` falhava, incluindo queries SELECT via `external-db-proxy`.

### 🟠 Alto Resolvido

- **7 erros TypeScript**: `useRealtimeInbox.ts` (type narrowing de array) e `contactRef.ts` (never type após UUID guard) — `tsc --noEmit` agora passa limpo.
- **`check:datalayer`**: baseline atualizado para 615 chamadas (0 em components/pages).

### Infraestrutura

- **VACUUM FULL + ANALYZE** em `_snapshot_version_state` (95% dead tuples → reduzido).
- **DROP INDEX** `idx_contacts_email_trgm` (24KB, 0 scans, sem constraint).
- **Auditoria de índices**: 5/6 índices com 0 scans são índices de partição PostgreSQL (não dropáveis).
- **140 cron jobs**: todos ativos e saudáveis.
- **Kong logs**: zero erros 401/403 após o fix.

### Validação

| Indicador | Resultado |
|-----------|-----------|
| Testes | **7.889/7.889 PASS** |
| TypeScript | **zero erros** |
| Build | **2m 8s** |
| `bun run check` | **todos os 8 gates passam** |
| CI Deploy | **#394 SUCCESS** |
| Webhooks 24h | 4.804 processados, 0 falhas |

### Commits

- `03b506d71` — fix: resolve 7 TypeScript errors in useRealtimeInbox and contactRef
- `37624fa8e` — chore: update data-layer baseline (615 calls, 0 in components/pages)

### Documentação

- `docs/incident/2026-07-30-chatpanel-blank-fix.md` — relatório completo do incidente e fix

---

## [2.1.0] - 2026-07-26 — Bug Fix Campaign: 7 Clusters Corrigidos

### 🔴 Crítico Resolvido

- **[C1]** URLs `kong:8000` no banco: 5.282 registros backfillados, trigger de bloqueio criado, `fn_rewrite_media_url()` atualizada
- **[C2]** Pipeline de mídia parado: `fn_auto_enqueue_media_download()` corrigida para enfileirar com kong/WA CDN URLs; 6.214 URLs expiradas classificadas

### 🟠 Alto Resolvido

- **[C3]** Realtime DELETE sem `remote_jid`: bug `payload.new={}` truthy → fix `extractRow()` usando `payload.old` explicitamente
- **[C4]** N+1 signed URLs (~1.150 requests/load): bucket `whatsapp-media` tornado público, `useMediaUrl.ts` elimina signed URLs, índices keyset criados
- **[C5]** Mixed Content: resolvido como consequência de C1
- **[C6]** CSP: `media-src`/`img-src` com domínios explícitos (removido `https:` genérico), `connect-src` com Evolution API + n8n
- **[C7]** Erros de áudio sem contexto: `useAudioPlayer.ts` captura `MediaError.code`, cache negativo

### Infraestrutura

- Colunas `media_bucket`, `media_path`, `media_sha256`, `media_status` em `evo.evolution_messages`
- `fn_media_pipeline_health_report()`: 14 métricas de observabilidade
- Cron Job de health check a cada 4 horas
- ADR-001 (URLs absolutas proibidas) + ADR-002 (bucket público)
- Runbook completo com troubleshooting e comandos de emergência

### Métricas Before/After

| Indicador | Antes | Depois |
|-----------|-------|--------|
| kong URLs no banco | 5.282 | **0** |
| POSTs signed URL/load | ~450 | **0** |
| Requests totais/load | ~1.150 | **<60** estimado |
| Media unknown status | 206 | **0** |
| Health check | — | **14 métricas / cron 4h** |

### PRs

- #545 — fix: media pipeline + realtime DELETE + N+1 + audio errors (merged)
- #546 — fix: CSP tighten com domínios explícitos (merged)

---

## [2.0.1] - 2026-05-06
### Adicionado
- Schemas de validação **Zod** para contatos e boundaries.
- Coleta de **Web Vitals** integrada à observabilidade.
- Documentação de **Onboarding** e **Diagrama ER**.
- ADR-005, ADR-006 e ADR-008.
- Template de Pull Request e configuração de **Dependabot**.
- Lint-staged e Husky para pre-commit checks.
- Distributed tracing support no Sentry (tracePropagationTargets).

### Alterado
- Reforço de **Branch Protection** (proibindo console.log e limitando any).
- Logger centralizado agora envia breadcrumbs para o **Sentry**.
- TypeScript: Habilitado `noImplicitAny` (monitoramento de erros faseado).

### Corrigido
- Importação ausente de `web-vitals`.
- Tipagem inconsistente em formulários de catálogo e auth.

---

## ⚠️ Nota Histórica — Consolidação do Backend (Julho de 2026)

> Esta seção **não é uma nova versão**: é uma nota para contextualizar entradas históricas deste changelog (ex.: o fix de circuit breaker da [2.2.0], que citava `externalProxy.ts` e `external-db-proxy`).

- A arquitetura de **backend duplo** (Supabase principal + banco externo "FATOR X", acessado via `externalProxy.ts` → `external-db-proxy` / `external-db-bridge`) foi **descontinuada e consolidada** em um único Supabase self-hosted (schemas `zapp`/`evo`).
- `USE_EXTERNAL_DB` agora é `false`; as Edge Functions `external-db-bridge` e `analyze-external-db` foram removidas (541 linhas de código morto); as env vars `FATOR_X_URL`/`FATOR_X_SERVICE_ROLE_KEY` foram eliminadas; todas as menções a "FATOR X" foram removidas do código-fonte.
- As entradas históricas sobre os circuit breakers do `externalProxy` permanecem como registro do incidente, mas **não refletem mais a arquitetura atual**.
