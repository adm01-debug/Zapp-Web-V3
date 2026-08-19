-- ============================================================================
-- FIX: ops.fn_mirror_warroom_criticals — resolved_at gerado corretamente
-- ============================================================================
-- Tipo: DDL fix
--
-- CONTEXTO:
--   O primeiro deploy de ops.fn_mirror_warroom_criticals (item 84 — migration
--   20260807092000) espelhava alertas críticos sem propagar resolved_at e
--   resolved_reason para o destino no schema ops.
--
--   Isso causava alertas espelhados que nunca marcavam como resolvidos,
--   poluindo o dashboard de operações com alertas stale.
--
--   Este fix reescreve a função para incluir resolved_at e resolved_reason
--   no espelhamento, e adiciona lógica de UPDATE para alertas já espelhados
--   que foram resolvidos no zapp.warroom_alerts origem.
-- ============================================================================

CREATE OR REPLACE FUNCTION ops.fn_mirror_warroom_criticals()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'ops', 'zapp', 'extensions'
AS $$
BEGIN
  -- Espelhar novos alertas críticos não resolvidos
  INSERT INTO ops.warroom_critical_mirror (
    source_id,
    alert_type,
    title,
    message,
    source,
    entity,
    severity,
    created_at,
    resolved_at,
    resolved_reason
  )
  SELECT
    wa.id,
    wa.alert_type::text,
    wa.title,
    wa.message,
    wa.source,
    wa.entity,
    wa.severity,
    wa.created_at,
    wa.resolved_at,
    wa.resolved_reason
  FROM zapp.warroom_alerts wa
  WHERE wa.alert_type = 'critical'
    AND wa.created_at > now() - interval '24 hours'
  ON CONFLICT (source_id) DO UPDATE
    SET resolved_at     = EXCLUDED.resolved_at,
        resolved_reason = EXCLUDED.resolved_reason;

  -- Marcar como resolvidos no mirror os que foram resolvidos na origem
  UPDATE ops.warroom_critical_mirror m
  SET resolved_at     = wa.resolved_at,
      resolved_reason = wa.resolved_reason
  FROM zapp.warroom_alerts wa
  WHERE m.source_id = wa.id
    AND wa.resolved_at IS NOT NULL
    AND m.resolved_at IS NULL;
END;
$$;

-- Mirror table (cria se não existir — ON CONFLICT acima exige a tabela)
CREATE TABLE IF NOT EXISTS ops.warroom_critical_mirror (
  source_id       uuid         NOT NULL,
  alert_type      text         NOT NULL,
  title           text         NOT NULL,
  message         text         NOT NULL,
  source          text,
  entity          text,
  severity        varchar(20),
  created_at      timestamptz,
  resolved_at     timestamptz,
  resolved_reason text,
  mirrored_at     timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT warroom_critical_mirror_pkey PRIMARY KEY (source_id)
);

REVOKE ALL ON TABLE ops.warroom_critical_mirror FROM PUBLIC, anon;
GRANT SELECT ON TABLE ops.warroom_critical_mirror TO authenticated;
GRANT ALL ON TABLE ops.warroom_critical_mirror TO service_role, postgres;

REVOKE ALL ON FUNCTION ops.fn_mirror_warroom_criticals() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION ops.fn_mirror_warroom_criticals() TO service_role, postgres;
