# Onda — Cluster CRM/Sales + Observability

**Data:** 2026-07-15
**Escopo:** 5 entregas — CRM TS fix, gen-types zapp, CI cluster ratchet, Grafana dashboard, health endpoint.

## 1. CRM/Sales — `CRMAutoSync.tsx` + `useCRMManagement.ts`

**Status:** ⚠️ `@ts-nocheck` mantido (dívida documentada).

**Diagnóstico após remover `@ts-nocheck`:**

- `CRMAutoSync.tsx`: chama `syncConversation`, `isConfigured`, `syncConversationAsync`, `lastResult` — nenhum existe em `useSyncToCRM()` atual, que hoje é um shim para `useSyncToCRMManagement` retornando apenas `{ isSyncing, lastSyncAt, syncToCRM }`. Regressão de API introduzida na consolidação ETAPA 42.
- `useCRMManagement.ts`: consulta `contact_intelligence`, `contact_notes`, `contact_assignments`, `contact_custom_fields` com coluna `contact_id`. Essas tabelas não existem no `types.ts` do schema `zapp` — só ficam corretas depois de regerar tipos via `scripts/gen-types-zapp.mjs`.

**Plano de destravamento (fora do escopo de uma sessão):**

1. Rodar `META_URL=... META_TOKEN=... node scripts/gen-types-zapp.mjs` na VPS self-hosted.
2. Reimplementar `useSyncToCRM` com o contrato completo (`syncConversation`, `syncConversationAsync`, `isConfigured`, `lastResult`) ou refatorar `CRMAutoSync` para o contrato mínimo atual.
3. Remover `@ts-nocheck` dos dois arquivos e rodar `node scripts/check-cluster-typecheck.mjs --cluster crm-sales`.

## 2. Geração de tipos — `scripts/gen-types-zapp.mjs`

Novo script que chama `postgres-meta` com `included_schemas=public,zapp,evo`, preserva a cauda Lovable (`DatabaseWithoutInternals` + helpers) e grava em `src/integrations/supabase/types.ts`.

Uso na VPS:

```bash
META_URL=https://supabase-meta.atomicabr.com.br \
META_TOKEN=<token> \
SCHEMAS=public,zapp,evo \
node scripts/gen-types-zapp.mjs
```

## 3. CI cluster ratchet — `scripts/check-cluster-typecheck.mjs`

Regras:

- Cluster listado não pode regredir para `@ts-nocheck`.
- `tsgo --noEmit` roda com `tsconfig.app.json`; erros são filtrados para o escopo do cluster.
- Clusters cobertos: `crm-sales`, `inbox-core`, `queues`, `observability`.

Adicionado ao `.github/workflows/quality-gate.yml` como step `Cluster typecheck ratchet` (advisory até `crm-sales` sair do `@ts-nocheck`).

## 4. Grafana dashboard — `docs/observability/grafana-metrics-dashboard.json`

Painéis:

- Health check `up{job="zapp-edge"}`
- Latência p50/p95/p99 por função (histograma)
- Webhooks/seg por canal
- Taxa de falhas por função (%)
- Realtime — conexões ativas
- Realtime — msg/s por schema (`zapp` vs `evo`)
- Top 10 funções por erros (1h)

Variáveis: `$function`, `$channel`. Refresh 30s.

Config Prometheus em `docs/observability/prometheus-scrape.yml` com dois jobs: `zapp-edge-health` (30s, gatekeeper) e `zapp-edge` (métricas).

## 5. Health check — `supabase/functions/health/index.ts`

Endpoint consolidado (`GET /functions/v1/health`) que valida:

1. **Database** — `SELECT` em `zapp.profiles` (head only).
2. **Realtime** — abre WebSocket em `/realtime/v1/websocket`, aborta em 3s.
3. **Metrics endpoint** — confirma que `/functions/v1/metrics` responde em formato Prometheus.

Retorna 200 quando todos os checks passam, 503 caso contrário. Suporta `?probe=1` para probes HTTP simples (kube/blackbox exporter).

## Guardrails ativos

| Guardrail | Status |
|-----------|--------|
| Schema usage (`scripts/check-schema-usage.mjs`) | ✅ |
| Schema access simulation | ✅ |
| Data layer ratchet | ✅ |
| **Cluster typecheck ratchet** | ✅ novo (advisory) |
| Dead code ratchet | ✅ |

## Próximos passos priorizados

1. Rodar `gen-types-zapp.mjs` na VPS → commit do novo `types.ts`.
2. Restaurar API completa em `useSyncToCRM` → remover `@ts-nocheck` do cluster CRM.
3. Provisionar o dashboard Grafana e apontar Prometheus para `/functions/v1/health`.
4. Deploy da edge function `health` (auto-deploy do Lovable cuida disso).
