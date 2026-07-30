-- ============================================================================
-- Message Retention Safety Floor (E7-04)
-- Auditoria 2026-07-10
--
-- Problema: fn_gc_deleted_messages não tinha piso mínimo em created_at.
-- Se chamada com p_days pequeno (e.g., 1 dia), podia deletar mensagens
-- recém-inseridas ainda em processamento ativo no pipeline (roteamento,
-- ack de RabbitMQ, gravação de media, etc.).
--
-- Solução: adiciona AND created_at < NOW() - INTERVAL '7 days' como piso
-- absoluto. Mesmo chamada com p_days=0, mensagens com menos de 7 dias
-- são protegidas — janela suficiente para qualquer processamento de pipeline.
--
-- fn_archive_old_wpp2_messages: já tem GREATEST(p_months_old, 12) — segura.
-- Aplicada ao vivo via MCP em 2026-07-10 e verificada (has_floor=true).
-- Idempotente: CREATE OR REPLACE FUNCTION.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_gc_deleted_messages(p_days integer DEFAULT 90)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'evo', 'zapp', 'monitoring'
AS $$
DECLARE
  v               integer     := 0;
  v_batch         integer;
  v_cutoff        timestamptz := now() - (p_days || ' days')::interval;
  v_created_floor timestamptz := now() - INTERVAL '7 days';
BEGIN
  SET LOCAL statement_timeout = '30min';
  LOOP
    WITH victims AS (
      SELECT id
      FROM evolution_messages
      WHERE deleted_at IS NOT NULL
        AND deleted_at < v_cutoff
        AND created_at < v_created_floor  -- E7-04: absolute floor — never delete messages < 7 days old
      LIMIT 5000
    )
    DELETE FROM evolution_messages m
    USING victims vv
    WHERE m.id = vv.id;
    GET DIAGNOSTICS v_batch = ROW_COUNT;
    v := v + v_batch;
    EXIT WHEN v_batch = 0;
    PERFORM pg_sleep(0.1);
  END LOOP;
  RETURN v;
END;
$$;
