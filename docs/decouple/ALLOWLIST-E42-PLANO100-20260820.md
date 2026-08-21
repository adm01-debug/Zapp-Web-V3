# Justificativa allowlist E42 — plano de correcao 100 etapas (2026-08-20/21)

7 migrations adicionadas ao `scripts/decouple/evo-ddl-allowlist.txt`. Nenhuma é
DDL evo NOVO: sao **registros retroativos** de DDL ja aplicado e validado em
producao durante a auditoria RELATORIO-AUDITORIA-ZAPP-20260820 e o plano de
correcao (execucao via MCP; `supabase_apply_migration` bugado no self-hosted).
Relatorio completo: `docs/audits/EXECUCAO-PLANO-20260820.md`.

| Arquivo | DDL evo contido | Natureza |
|---|---|---|
| 20260818140000_sentinel_teste_mensal.sql | `CREATE FOREIGN TABLE IF NOT EXISTS evo.fdw_evolution_message` | Retroativo (criado 18/08 no banco; F-003) |
| 20260820093000_recon_coverage_daily.sql | `CREATE TABLE IF NOT EXISTS evo.recon_coverage_daily` + COMMENT | Retroativo (onda CP-2 de 20/08) |
| 20260820130000_f008_comments_full_coverage.sql | apenas `COMMENT ON TABLE zapp.*` cujo TEXTO cita `evo.` (falso positivo do regex) | Retroativo (F-008) |
| 20260820151000_f010_webhook_events_retention_7d_purge.sql | `CREATE OR REPLACE FUNCTION evo.fn_purge_traefik_401_stats` | Retroativo (GATE-C aprovado) |
| 20260820180000_f011_drop_evo_fn_filter_canary_messages.sql | DROP/CREATE TRIGGER em `evo.evolution_messages*` + DROP FUNCTION evo | Retroativo (I2=0; funcao movida PARA zapp — REDUZ presenca em evo) |
| 20260820192000_f007_extra_dup_idx_fk_indexes.sql | `DROP INDEX CONCURRENTLY evo.idx_recon_coverage_daily_snapshot_date` | Retroativo (drop de indice redundante — reduz) |
| 20260820193000_f002_fdw_delta_sentinel.sql | apenas `COMMENT ON FUNCTION zapp.fn_fdw_delta_sentinel` cujo TEXTO cita `evo.` (falso positivo do regex — mesmo caso dos precedentes 20260818210102/210103) | Funcao vive em zapp; zero DDL em evo |
| 20260820194000_f008_comments_evo_staging_e_meta.sql | `COMMENT ON TABLE evo._*_20260820` (3 stagings) | Retroativo (documentacao, sem estrutura) |

Direcao geral: o conjunto REMOVE objetos de evo (funcao canary, indice) e
documenta o existente — alinhado ao desacoplamento, nao contrario a ele.
