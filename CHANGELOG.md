# 📜 Changelog — ZAPP WEB

## [2.1.1] - 2026-07-30 — ChatPanel Blank Fix + TypeScript Cleanup

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
