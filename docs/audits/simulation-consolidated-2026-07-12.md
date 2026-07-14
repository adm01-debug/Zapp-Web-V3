# Simulação Consolidada — 2026-07-12

Bateria combinatória executada em 3 eixos críticos antes da marcha de melhorias
rumo ao 10/10. Cada eixo tem script reproduzível e JSON bruto de cenários.

| Eixo               | Cenários | Violações | Script                                       |
| ------------------ | -------- | --------- | -------------------------------------------- |
| WhatsApp Flow      | 693      | 252       | `scripts/simulate-whatsapp-flow.ts`          |
| Auth / RLS         | 70       | 6         | `scripts/simulate-auth-rls.ts`               |
| Realtime / Hydrate | 25       | 11        | `scripts/simulate-realtime.ts`               |
| **Total**          | **788**  | **269**   |                                              |

Relatórios detalhados:
- [whatsapp-flow-simulation.md](./whatsapp-flow-simulation.md)
- [auth-rls-simulation.md](./auth-rls-simulation.md)
- [realtime-simulation.md](./realtime-simulation.md)

---

## Gaps priorizados

### P0 — Robustez de Envio WhatsApp (252 violações no eixo)
1. **Fast-fail 4xx** — retries desnecessários em 400/401/403/422 (`evolution-sender`)
2. **Circuit breaker de config** — Vault/secrets falhos disparam tempestade
3. **Backoff exponencial + jitter** — hoje linear em várias camadas
4. **Watchdog `processing` órfão** — sem recuperação após crash entre `processing` e `sent`
5. **Idempotência sem `messageId`** — provider ACK sem id gera duplicata
6. **Métricas Prometheus** — sem visibilidade de retries exauridos e fast-fails

### P0 — Segurança / Auth (6 violações)
7. **Rate-limit reset-password no edge** — hoje só no trigger DB
8. **Cache `has_role` invalidável** — role revogado pode persistir no client
9. **`SECURITY DEFINER` sem audit** — `rpc_dlq_*` sem `has_role` + `log_rls_denied`

### P1 — Realtime / UX (11 violações)
10. **Dedup determinístico** — `Map<id, Message>` em `useRealtimeInbox`
11. **Reconexão com cap + jitter** — evitar acumular backoff > 30s
12. **Hidratação lazy** — contact ausente do cache ao receber message

### P1 — Qualidade de Código
13. Remover `@ts-nocheck` (baseline 114 → 100)
14. Zod strict em payloads de webhook (eliminar `any`)
15. Extrair componentes > 340 linhas (top 10 auditados)

### P2 — Observabilidade / Deploy
16. Dashboard Grafana consolidado
17. Alertas Sentry categorizados
18. Checklist deploy 17 itens automatizado no CI

---

## Ordem de execução

Cada item = 1 turno de build. Diagnóstico → implementação → verificação → relatório.
Próximo passo: **Item 1 — Fast-fail 4xx em `evolution-sender`**.
