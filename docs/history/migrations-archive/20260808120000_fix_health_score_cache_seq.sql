-- =============================================================================
-- fix: zapp.fn_health_score_cache_id_seq desatualizada (P1 VAL-05, 2026-08-07)
-- Classe: mesma do bug zapp.alert_channels_id_seq (REC-05-13) — sequence com
-- last_value=1/is_called=false enquanto a tabela tem id=1 + DEFAULT nextval
-- -> proximo INSERT colidiria na PK (23505).
-- Fix: setval(max(id), true) — proximo nextval retorna max(id)+1.
-- Rollback: setval(seq, 1, false) (estado original).
-- =============================================================================
DO $$
BEGIN
  PERFORM setval('zapp.fn_health_score_cache_id_seq',
                 GREATEST(COALESCE((SELECT max(id) FROM zapp.fn_health_score_cache), 1), 1),
                 true);
END
$$;
