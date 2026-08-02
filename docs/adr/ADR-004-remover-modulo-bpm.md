# ADR-004: Remoção do módulo BPM

**Data:** 2026-08-02
**Status:** Decidido
**Decisor:** Abner (Joaquim)

## Contexto

O schema `bpm` contém 41 tabelas, 62 índices, zero funções, zero views e **zero dados** (todas com 0 rows). Além disso:
- 82 policies com `USING(true)` (RLS aberta — risco de segurança)
- 3 triggers stub (`bpm_track_sla`, `bpm_track_sla_on_create`, `trg_check_card_sla`)
- 2 crons chamando funções BPM (jobs 198 e 205)
- 41 views `zapp.bpm_*` + 41 views `public.bpm_*` (82 views espelho)

O módulo nunca foi ativado em produção e não há plano de uso.

## Decisão

**Remover integralmente o módulo BPM.**

## Consequências

- 🗑️ `DROP SCHEMA bpm CASCADE` — remove 41 tabelas, 62 índices, 3 triggers, 82 views
- 🗑️ Remover crons 198 (`bpm_check_breached_slas`) e 205 (`fn_verify_alert_delivery`)
- ✅ Fecha os achados: **F8-02, F8-04, F8-05, F8-06, F8-15**
- ⚠️ F8-04 e F8-05 também são cobertos pelo ADR-006 (SLA canônico)

## Achados resolvidos por esta decisão

| Achado | Status |
|--------|--------|
| F8-02 | RESOLVIDO POR DECISÃO — schema bpm removido |
| F8-04 | RESOLVIDO POR DECISÃO — triggers stub removidos com o schema |
| F8-05 | RESOLVIDO POR DECISÃO — cron 198 removido |
| F8-06 | RESOLVIDO POR DECISÃO — 82 policies permissivas removidas |
| F8-15 | RESOLVIDO POR DECISÃO — índice em tabela removida |
