# Observabilidade — dashboard único de saúde do ZAPP (plano-100 etapa 92)

A stack de observabilidade já roda no Swarm (verificado ao vivo em 2026-08-20):

| Stack | Serviço | Papel |
|---|---|---|
| 259 `obs-prometheus` | prometheus + node-exporter | métricas de host e serviços |
| 253 `obs-cadvisor` | cadvisor | métricas por container (fonte dos painéis de CPU/mem) |
| 255 `obs-loki` | loki 3.7 | logs |
| 254 `obs-grafana` | grafana | visualização |
| 20/35 `pg-exporters` | pgx-supabase, pgx-pg14, pgx-om, pgx-scanopy | métricas Postgres |

## Como provisionar o dashboard

`grafana/zapp-health-dashboard.json` é um export de provisioning com
`__inputs` (Prometheus + Loki). Duas opções:

1. **UI**: Grafana → Dashboards → Import → colar o JSON → mapear os dois
   datasources.
2. **Provisioning declarativo** (preferido — sobrevive a redeploy do stack 254):
   montar o arquivo em `/etc/grafana/provisioning/dashboards/` no serviço
   `obs-grafana_grafana` com um provider `type: file`.

> Nomes de séries do cAdvisor usam o label
> `container_label_com_docker_swarm_service_name` — se o scrape estiver com
> outro relabel, ajustar os seletores dos painéis.

## Fontes complementares que já existem (não duplicar)

- **Sentry** (frontend + consumer): DSN embutido no bundle dos 3 hosts
  (verificado 2026-08-20); release = `VITE_GIT_SHA`.
- **Watchdogs ag6** (stack 232): w1–w9 + `creds-ttl-check` + `baileys-drop-check`
  alertando via webhook n8n `warroom-alert`.
- **bundle-secret-guard / post-deploy-health**: gates de CI que também são
  telemetria de disponibilidade.
