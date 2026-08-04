# ADR-006: Arquitetura canônica de SLA

**Data:** 2026-08-02
**Status:** Decidido
**Decisor:** Abner (Joaquim), com recomendação técnica do Hermes

## Contexto

O sistema possui atualmente 10+ tabelas relacionadas a SLA espalhadas por 3 schemas, sem fonte de verdade documentada:

| Schema | Tabela | Rows | Status |
|--------|--------|------|--------|
| `bpm` | `bpm_sla_records` | 0 | ❌ Removido (ADR-004) |
| `zapp` | `conversation_sla` | 0 | SLA por conversa WhatsApp |
| `zapp` | `sla_delivery_violations` | 2 | Smoke test 2026-05-04 |
| `zapp` | `sla_delivery_rules` | 2 | Regras de entrega |
| `zapp` | `sla_violations` | 0 | Violações genéricas |
| `zapp` | `sla_history` | 0 | Histórico |
| `zapp` | `sla_rules` | 0 | Regras |
| `zapp` | `sla_policies` | 0 | Políticas |
| `evo` | `evolution_alerts` | 4.509 | Alertas gerais (severity='critical') |

3 triggers SLA (2 BPM + 1 extra), 2 crons SLA, zero consumers ativos.

## Decisão

### Fonte canônica por dimensão:

| Dimensão | Tabela canônica | Justificativa |
|----------|----------------|---------------|
| SLA por conversa | `zapp.conversation_sla` | App é de mensageria — SLA por conversa é a unidade natural |
| Políticas e regras | `zapp.sla_rules` + `zapp.sla_policies` | Implementar — definem os contratos |
| Violações | `zapp.sla_violations` | Implementar — registra quebras |
| Histórico | `zapp.sla_history` | Implementar — auditoria temporal |
| Entrega | `zapp.sla_delivery_violations` + `sla_delivery_rules` | Manter — já testado (2 rows) |
| Alertas | `evo.evolution_alerts` | Canal de notificação — breaches geram alertas aqui |

### Removido:
- `bpm.bpm_sla_records` (ADR-004)
- `zapp.sla_*` redundantes (se houver sobreposição após implementação)

## Consequências

- ✅ Fecha os achados: **F8-03, F8-08, F8-14, F8-17** (parte BPM já coberta pelo ADR-004)
- 📝 `docs/db/schema-topology.md` deve mapear SLA canonical → derivados
- 🔧 `zapp.sla_violations`, `sla_history`, `sla_rules`, `sla_policies` passam de "remover" para "implementar" (decisão do Abner)

## Achados resolvidos por esta decisão

| Achado | Status |
|--------|--------|
| F8-03 | RESOLVIDO POR DECISÃO — canonical definido |
| F8-08 | MOVER PARA IMPLEMENTAÇÃO — queues/sticky assignments |
| F8-14 | MOVER PARA IMPLEMENTAÇÃO — cron 205 sob nova arquitetura |
| F8-17 | RESOLVIDO POR DECISÃO — search_path sem bpm (ADR-004) |
