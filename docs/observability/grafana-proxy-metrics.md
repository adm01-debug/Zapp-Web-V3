# Grafana — External DB Proxy Observability

> **Arquitetura atual**: Supabase Self-Hosted (`supabase.atomicabr.com.br`), schema `zapp`. Veja [../SCHEMA_REFERENCE.md](SCHEMA_REFERENCE.md).


Dashboard pronto para importar: [`grafana-proxy-metrics-dashboard.json`](./grafana-proxy-metrics-dashboard.json).

## 1. Pré-requisitos

- Edge function `proxy-metrics` deployada (expõe formato Prometheus em `/functions/v1/proxy-metrics`).
- Secret `PROXY_METRICS_TOKEN` configurada no Lovable Cloud.
- Prometheus com alcance ao endpoint público da Edge Function.

## 2. Scrape config (Prometheus)

```yaml
scrape_configs:
  - job_name: zapp-proxy-metrics
    metrics_path: /functions/v1/proxy-metrics
    scheme: https
    scrape_interval: 30s
    scrape_timeout: 15s
    params:
      window: ["5m"]            # 1m | 5m | 15m | 60m
    authorization:
      type: Bearer
      credentials: ${PROXY_METRICS_TOKEN}
    static_configs:
      - targets:
          - supabase.atomicabr.com.br
        labels:
          service: external-db-proxy
          env: prod
```

> Use `scrape_interval` ≥ `window`/2 para evitar overlap excessivo (a função
> agrega a janela inteira a cada scrape; valores se sobrepõem mas o Grafana
> usa `max`/`rate` corretamente nos painéis).

## 3. Importar o dashboard

1. Grafana → **Dashboards → New → Import**.
2. Cole o conteúdo de `grafana-proxy-metrics-dashboard.json`.
3. Selecione o data source Prometheus configurado acima.
4. Salve.

## 4. Painéis incluídos

| Linha | Painel | Métrica base |
|------|--------|--------------|
| Saúde geral | Taxa de erro %, RPS, hard-timeouts (14s), Postgres timeouts (57014) | `proxy_requests_*_total`, `proxy_requests_pg_timeout_total` |
| Erro & throughput | Erro % (5m rolling) por target; throughput por operação (stacked) | `rate(proxy_requests_error_total)` / `rate(proxy_requests_total)` |
| Latência | p50/p95/p99/avg agregados; bargauge p95 por op; heatmap p99 | `proxy_request_duration_ms{quantile=...}` |
| Status & códigos | Status HTTP (stacked rps), donut do range, tabela de err_code, séries por código | `proxy_requests_status_total`, `proxy_error_codes_total` |
| Top ops | Tabela rankeada por erro %, com p95 e rps | combinação dos counters acima |

## 5. Variáveis do dashboard

- `$datasource` — escolhe a instância Prometheus.
- `$target` — multi-select (e.g. `evolution_messages`, `evolution_contacts`).
- `$op` — multi-select (e.g. `rpc_list_messages`, `rpc_insert_message`).

## 6. Alertas sugeridos (não inclusos no JSON)

Configure no Grafana ou Alertmanager:

```promql
# Erro alto sustentado
( sum(rate(proxy_requests_error_total[5m]))
  / clamp_min(sum(rate(proxy_requests_total[5m])), 0.001) ) > 0.10

# p95 acima de 5s por 10m
max(proxy_request_duration_ms{quantile="0.95"}) > 5000

# Picos de PGRST002 (schema cache)
increase(proxy_error_codes_total{code="PGRST002"}[5m]) > 20
```

## 7. Troubleshooting

- **`# unauthorized`** no scrape → token errado / secret ausente.
- **Métrica vazia** → verifique se `proxy_metrics` recebe inserts do
  `external-db-proxy` (RLS + service role) e se o range > janela escolhida.
- **Quantis estagnados** → `/proxy-metrics` recomputa a janela inteira a cada
  scrape; é normal a curva ser "step-shaped" em períodos de baixo tráfego.
