-- =============================================================================
-- E52 — Validação: zapp.search_contacts_cursor (Fase 3 — Isolamento I1)
-- =============================================================================
-- Objetivo: confirmar que search_contacts_cursor não possui violações I1.
-- Estratégia: inspeção do corpo da função via pg_proc + assertion.
-- Resultado esperado: NOTICE 'E52 OK: search_contacts_cursor sem violacoes I1'
-- =============================================================================

DO $$
DECLARE
  v_body    text;
  v_ok      boolean := true;
  v_patterns text[] := ARRAY[
    'evo\.evolution_',
    'evo\.evolution_messages',
    'evo\.evolution_contacts',
    'evo\.evolution_conversations',
    'evo\.evolution_settings',
    'evo\.evolution_webhook'
  ];
  v_pat     text;
BEGIN
  SELECT prosrc INTO v_body
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'zapp'
    AND p.proname = 'search_contacts_cursor';

  IF v_body IS NULL THEN
    RAISE EXCEPTION 'E52 ERRO: funcao zapp.search_contacts_cursor nao encontrada';
  END IF;

  FOREACH v_pat IN ARRAY v_patterns
  LOOP
    IF v_body ~ v_pat THEN
      v_ok := false;
      RAISE WARNING 'E52 VIOLACAO I1: padrao "%" encontrado em search_contacts_cursor', v_pat;
    END IF;
  END LOOP;

  IF v_ok THEN
    RAISE NOTICE 'E52 OK: search_contacts_cursor sem violacoes I1';
  ELSE
    RAISE EXCEPTION 'E52 FALHOU: search_contacts_cursor possui referencias diretas a evo.*';
  END IF;
END;
$$;
