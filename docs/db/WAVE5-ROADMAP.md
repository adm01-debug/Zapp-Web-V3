# Wave 5 Roadmap — Melhorias futuras

> Items de baixa prioridade ou que requerem janela de manutenção.

---

## Prioridade 2 (requer staging completo)

- [ ] **Mover extensões de public para extensions** (ADR-DB-003, DEFERIDO)
  - Impacto: Quebra PostgREST e Auth
  - Precondição: Staging com carga de produção simulada

- [ ] **Repatriar tabelas evo→ops** (Step 9)
  - Impacto: Requer freeze do Evolution API container
  - Precondição: Janela de manutenção + backup

- [ ] **Mudar whatsapp-media para private** (ADR-DB-004)
  - Impacto: Breaking change em URLs de mídia
  - Precondição: Auditar código (buscar `getPublicUrl` de whatsapp-media)

- [ ] **Mudar recibos-entrega para private**
  - Impacto: Breaking change em URLs de recibos
  - Precondição: Auditar código

---

## Prioridade 3 (requer projeto dedicado)

- [ ] Read replicas para queries analíticas
- [ ] Partition pruning em todas as queries por `created_at`
- [ ] BRIN indexes para logs de eventos
- [ ] Materialized views para relatórios pesados
- [ ] pg_repack para reconstrução de tabelas fragmentadas
- [ ] Replicação lógica para staging sync
- [ ] Pipeline de dados: evo → data warehouse
- [ ] Full-text search com tsvector columns
- [ ] Monitoramento de BLOAT com pgstattuple

---

## Prioridade 4 (ideias)

- [ ] TimescaleDB extension para séries temporais
- [ ] pg_cron visualizer (cron job monitor dashboard)
- [ ] Auto-DDL reviewer com pg_query
- [ ] Schema evolution tracker (diff entre versões)
- [ ] Generated columns para computed fields
- [ ] Partial indexes para dados esparsos
