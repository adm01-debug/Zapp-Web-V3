# Onda 0 — Registro de Ações Executadas
## 2026-08-08 BRT — Claude (auditoria exaustiva)

### Contexto do incidente
- **P0-1**: 1.222–2.432 hits 401/h na REST + 1.892 msgs stuck na outbound_queue
- **P0-2**: Watchdogs 104 e 144 desligados (wpp2_disconnection_watchdog, alert-consumer-halt)
- **P0-3**: Flapping de conexão wpp2 (5x em 12h)
- **P0-4**: baileys-errors observer morto silenciosamente desde 2026-07-31

### Ações executadas na onda-0

| # | Etapa | Ação | Resultado |
|---|---|---|---|
| 1 | 1 | DEPLOY_FREEZE registrado em evo.evolution_audit_log | id: 38b40e43-f42d-4369-9f36-0bbfaa27b17a |
| 2 | 2 | Snapshot VERSION_INDEX + stackfiles commitado | este commit |
| 3 | 3 | IPs 401 extraídos (30 origens, 24h) | em investigação |
| 4 | 10 | Drainer diagnosticado: fn_outbound_dispatch sem pg_cron | vault key correto (atualizado 2026-08-06T14:07Z) |
| 5 | 11 | 1.892 msgs internas de ops CANCELADAS (age>12h, retry=0) | UPDATE 1892 rows — alertas/canaries internos, nenhum cliente |
| 6 | 13 | Job 104 wpp2_disconnection_watchdog REATIVADO | cron.alter_job OK — teste: ok/connected |
| 7 | 13 | Job 144 alert-consumer-halt REATIVADO | cron.alter_job OK |
| 8 | 14 | pg_cron job 317: outbound-queue-dispatch (*/2min) | SELECT zapp.fn_outbound_dispatch(30) — teste: {sent:0,failed:0,skipped:0} |
| 9 | 14 | pg_cron job 318: outbound-queue-stalled-alert (*/15min) | alerta warroom se pending>0 por 15 min |

### Investigação em andamento (etapas 3–9)

| IP | RequestPath | Total 401 | Primeiro hit | Último hit | Status |
|---|---|---|---|---|---|
| 52.67.175.207 (AWS sa-east-1) | /message/sendText/wpp2 | 2.669 | 2026-08-07T09:21 | 2026-08-08T09:15 | **ATIVO agora** |
| 172.18.0.1 (Docker bridge local) | /chat/getBase64FromMediaMessage/wpp2 | 526 | 2026-08-07T13:45 | 2026-08-07T17:01 | parou |
| 54.78.199.253 (AWS eu-west-1) | /message/sendText/wpp2 | 1.250 | 2026-08-07T11:04 | 2026-08-07T13:35 | parou |
| Outros IPs eu-west-1 | /message/sendText/wpp2 | ~5.000 total | 2026-08-07T11:00 | 2026-08-07T13:35 | pararam |

**Hipótese principal (52.67.175.207)**: Supabase Cloud `uqysyzndkfiwfztbqvsl` (zapp-web Lovable) com
edge function usando apikey v4 — região sa-east-1 é compatível com Supabase Brasil.

**Hipótese local (172.18.0.1)**: ZAPP Media Download Worker (N8N) chamando
`/chat/getBase64FromMediaMessage` via URL externa com apikey v4 hardcoded.

**Ação pendente**: Atualizar apikey na origem (Supabase Cloud env variable / N8N credential) para v5.

### Estado após onda-0

```
FILA outbound_message_queue
  cancelled: 1892 (alertas ops antigos — nenhum cliente)
  pending: 0

WATCHDOGS
  job 104 wpp2_disconnection_watchdog: ATIVO
  job 144 alert-consumer-halt: ATIVO

DRAINER
  job 317 outbound-queue-dispatch (*/2min): NOVO, ATIVO

ALERTA
  job 318 outbound-queue-stalled-alert (*/15min): NOVO, ATIVO

DEPLOY FREEZE
  stacks 25/113/126: CONGELADAS
  liberar após: 401 < 50/h por 1h + pendente identificar 52.67.175.207
```
