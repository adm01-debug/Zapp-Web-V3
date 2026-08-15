-- =============================================================================
-- E53 — Validação Abrangente: Invariante I1 (Fase 3 — Isolamento I1)
-- =============================================================================
-- Objetivo: confirmar que TODAS as funções zapp.* estão livres de referências
--           diretas a evo.* (exceto funções em schemas permitidos: ops, monitoring).
-- Resultado esperado: NOTICE com contagem de violações = 0.
-- =============================================================================

DO $$
DECLARE
  v_violations  integer := 0;
  v_rec         record;
  v_patterns    text := 'evo\.(evolution_messages|evolution_contacts|evolution_conversations|evolution_settings|evolution_webhook_events_v2|evolution_alerts)';
BEGIN
  FOR v_rec IN
    SELECT
      p.proname AS func_name,
      p.prosrc  AS body
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'zapp'
      AND p.prokind IN ('f', 'p')
      AND p.prosrc IS NOT NULL
  LOOP
    IF v_rec.body ~ v_patterns THEN
      v_violations := v_violations + 1;
      RAISE WARNING 'I1 VIOLACAO: zapp.%() referencia evo.* diretamente', v_rec.func_name;
    END IF;
  END LOOP;

  IF v_violations = 0 THEN
    RAISE NOTICE 'E53 I1 PASS: 0 violacoes encontradas em funcoes zapp.*';
  ELSE
    RAISE EXCEPTION 'E53 I1 FAIL: % violacao(oes) encontrada(s) em funcoes zapp.* — verificar WARNINGs acima', v_violations;
  END IF;
END;
$$;
