# 📜 Changelog — ZAPP WEB

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
