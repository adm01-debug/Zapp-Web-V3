-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: 20260729190006_harden_secdef_artes_monitoring.sql
-- Purpose  : Remover 'public' do search_path de 7 funções SECDEF nos schemas
--            'artes' e 'monitoring' (esquecidos na migration anterior).
--
-- Contexto: A migration 20260729190005 cobriu schemas zapp,evo,public,
-- financeiro,vendas,email_app,ai,bpm,ops,archive. Os schemas 'artes' e
-- 'monitoring' também contêm SECDEF com 'public' no search_path.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER FUNCTION artes.listar_pedidos_novos(text)
  SET search_path TO vendas, artes;

ALTER FUNCTION artes.notificar_bitrix_novo_pedido()
  SET search_path TO artes, net;

ALTER FUNCTION artes.garantir_auth_tokens_nao_null()
  SET search_path TO artes, auth, extensions;

ALTER FUNCTION artes.notificar_bitrix_fechamento_concluido()
  SET search_path TO artes, net;

ALTER FUNCTION artes.salvar_fechamento_completo(jsonb, uuid)
  SET search_path TO artes, vendas;

ALTER FUNCTION monitoring.fn_integration_health(jsonb)
  SET search_path TO monitoring, evo, zapp;

ALTER FUNCTION monitoring.fn_migration_readiness_check()
  SET search_path TO monitoring, evo;

-- ── VERIFICAÇÃO ─────────────────────────────────────────────────────────────
DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  CROSS JOIN LATERAL unnest(p.proconfig) AS cfg
  WHERE p.prosecdef=true
    AND cfg ILIKE '%public%';
  IF v_count > 0 THEN
    RAISE EXCEPTION 'VERIFICATION FAILED: % funções SECDEF ainda com public', v_count;
  END IF;
  RAISE NOTICE 'OK: 0 SECDEF com public restantes em TODOS os schemas';
END $$;
