-- =============================================================================
-- E8 — Instrumentação de Rastreamento pg_net (Desacoplamento ZAPP×Evolution)
-- =============================================================================
-- Objetivo: criar tabela de auditoria e função para rastrear todas as chamadas
-- pg_net feitas por funções SQL. Permite medir progresso do invariante I4
-- (egresso HTTP via gateway único) sem acesso ao pg_net internamente.
--
-- ATENÇÃO: Esta migration é READ-ONLY no sentido de que não altera funções
-- existentes — apenas cria infraestrutura de observabilidade. As funções
-- violadoras serão corrigidas em etapas E25+.
-- =============================================================================

-- Tabela de log de chamadas pg_net (egresso HTTP fora do gateway)
CREATE TABLE IF NOT EXISTS ops.pgnet_egress_log (
  id              BIGSERIAL PRIMARY KEY,
  logged_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  caller_schema   TEXT NOT NULL,
  caller_function TEXT NOT NULL,
  target_url      TEXT,
  http_method     TEXT,
  is_gateway_call BOOLEAN NOT NULL DEFAULT FALSE,
  job_id          BIGINT,            -- cron.job.jobid se chamado por cron
  notes           TEXT
);

COMMENT ON TABLE ops.pgnet_egress_log IS
  'Auditoria de chamadas pg_net/extensions.http fora do gateway único. '
  'Instrumento de medição do invariante I4 (desacoplamento ZAPP×Evolution). '
  'Criado em E8 (2026-08-15).';

COMMENT ON COLUMN ops.pgnet_egress_log.is_gateway_call IS
  'TRUE = chamada via ops.fn_evo_url()/fn_evo_key() (permitida). '
  'FALSE = bypass direto (violação I4).';

-- Índice para queries de auditoria por schema/função
CREATE INDEX IF NOT EXISTS idx_pgnet_egress_log_caller
  ON ops.pgnet_egress_log (caller_schema, caller_function, logged_at DESC);

-- Índice para filtrar violações (is_gateway_call = false)
CREATE INDEX IF NOT EXISTS idx_pgnet_egress_log_violations
  ON ops.pgnet_egress_log (logged_at DESC)
  WHERE is_gateway_call = FALSE;

-- -----------------------------------------------------------------------------
-- View: resumo de violações I4 ativas
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW ops.v_i4_violations_summary AS
SELECT
  caller_schema,
  caller_function,
  COUNT(*) AS total_calls,
  COUNT(*) FILTER (WHERE is_gateway_call = FALSE) AS bypass_calls,
  COUNT(*) FILTER (WHERE is_gateway_call = TRUE) AS gateway_calls,
  MAX(logged_at) AS last_call,
  MIN(logged_at) AS first_call
FROM ops.pgnet_egress_log
GROUP BY caller_schema, caller_function
ORDER BY bypass_calls DESC, total_calls DESC;

COMMENT ON VIEW ops.v_i4_violations_summary IS
  'Resumo de violações I4: funções que fazem bypass do gateway HTTP. '
  'bypass_calls > 0 indica violação ativa do invariante I4.';

-- -----------------------------------------------------------------------------
-- Função auxiliar: registrar chamada pg_net manualmente (para uso em funções
-- que serão refatoradas nas etapas E25+)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ops.log_pgnet_call(
  p_caller_schema   TEXT,
  p_caller_function TEXT,
  p_target_url      TEXT DEFAULT NULL,
  p_http_method     TEXT DEFAULT 'POST',
  p_is_gateway      BOOLEAN DEFAULT FALSE,
  p_job_id          BIGINT DEFAULT NULL,
  p_notes           TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ops, public
AS $$
BEGIN
  INSERT INTO ops.pgnet_egress_log (
    caller_schema,
    caller_function,
    target_url,
    http_method,
    is_gateway_call,
    job_id,
    notes
  ) VALUES (
    p_caller_schema,
    p_caller_function,
    p_target_url,
    p_http_method,
    p_is_gateway,
    p_job_id,
    p_notes
  );
EXCEPTION WHEN OTHERS THEN
  -- Log não deve quebrar a função principal
  NULL;
END;
$$;

COMMENT ON FUNCTION ops.log_pgnet_call IS
  'Registra manualmente uma chamada pg_net na tabela ops.pgnet_egress_log. '
  'Usar nas funções violadoras de I4 como instrumentação temporária antes '
  'da refatoração completa (E25+).';

-- -----------------------------------------------------------------------------
-- Tabela de baseline estático I4 (funções violadoras conhecidas no T0)
-- Serve como referência para medir progresso de correção
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ops.i4_violation_baseline (
  id              SERIAL PRIMARY KEY,
  schema_name     TEXT NOT NULL,
  function_name   TEXT NOT NULL,
  violation_type  TEXT NOT NULL CHECK (violation_type IN ('pg_net', 'extensions_http', 'net_http', 'cron_bypass')),
  target_url_hint TEXT,
  baseline_date   DATE NOT NULL DEFAULT '2026-08-15',
  resolved_date   DATE,
  resolved_in     TEXT,  -- referência à migration/etapa que corrigiu
  notes           TEXT
);

COMMENT ON TABLE ops.i4_violation_baseline IS
  'Baseline das violações I4 identificadas no T0 (2026-08-15). '
  'Marcar resolved_date quando a função for corrigida via gateway.';

-- Inserir violadores conhecidos do T0 (baseline pg_net_functions.json)
INSERT INTO ops.i4_violation_baseline (schema_name, function_name, violation_type, notes)
VALUES
  -- Funções de aplicação com pg_net (16 violações identificadas no T0)
  ('evo',  'fn_forward_to_zapp',           'pg_net',          'Encaminha eventos para ZAPP via pg_net direto'),
  ('evo',  'fn_notify_zapp_webhook',        'pg_net',          'Notifica ZAPP de eventos evo via pg_net'),
  ('evo',  'fn_sync_contact_to_zapp',       'pg_net',          'Sincroniza contatos evo→zapp via pg_net'),
  ('evo',  'fn_broadcast_message_status',   'pg_net',          'Status de mensagem via pg_net'),
  ('evo',  'fn_trigger_zapp_action',        'pg_net',          'Dispara ação ZAPP via pg_net'),
  ('evo',  'fn_push_evolution_event',       'pg_net',          'Push evento evolution via pg_net'),
  ('evo',  'fn_call_evolution_api_direct',  'pg_net',          'Chamada direta à Evolution API (BYPASS crítico)'),
  ('evo',  'fn_health_ping_evolution',      'pg_net',          'Health check via pg_net direto'),
  ('zapp', 'fn_send_whatsapp_via_pgnet',    'pg_net',          'Envio WA via pg_net (deve usar gateway)'),
  ('zapp', 'fn_trigger_evolution_send',     'pg_net',          'Dispara envio Evolution via pg_net'),
  ('zapp', 'fn_notify_evolution_status',    'pg_net',          'Notifica Evolution de status via pg_net'),
  ('zapp', 'fn_request_qr_code',            'pg_net',          'Solicita QR code via pg_net direto'),
  ('zapp', 'fn_poll_instance_status',       'pg_net',          'Poll status instância via pg_net'),
  ('zapp', 'fn_disconnect_instance_pgnet',  'pg_net',          'Desconecta instância via pg_net'),
  ('ops',  'fn_evo_url',                    'pg_net',          'INFRAESTRUTURA: lê vault — NÃO É VIOLAÇÃO'),
  ('ops',  'fn_evo_key',                    'pg_net',          'INFRAESTRUTURA: lê vault — NÃO É VIOLAÇÃO')
ON CONFLICT DO NOTHING;

-- Marcar imediatamente os 2 que são infraestrutura (não são violações)
UPDATE ops.i4_violation_baseline
SET
  resolved_date = '2026-08-15',
  resolved_in = 'baseline — infraestrutura permitida (ops schema)',
  notes = notes || ' [INFRAESTRUTURA: permitida, não é violação I4]'
WHERE function_name IN ('fn_evo_url', 'fn_evo_key')
  AND schema_name = 'ops';

-- -----------------------------------------------------------------------------
-- View: progresso de correção I4
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW ops.v_i4_correction_progress AS
SELECT
  violation_type,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE resolved_date IS NOT NULL) AS corrigidos,
  COUNT(*) FILTER (WHERE resolved_date IS NULL) AS pendentes,
  ROUND(100.0 * COUNT(*) FILTER (WHERE resolved_date IS NOT NULL) / NULLIF(COUNT(*), 0), 1) AS pct_corrigido
FROM ops.i4_violation_baseline
WHERE schema_name != 'ops'  -- excluir infraestrutura
GROUP BY violation_type
UNION ALL
SELECT
  'TOTAL' AS violation_type,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE resolved_date IS NOT NULL) AS corrigidos,
  COUNT(*) FILTER (WHERE resolved_date IS NULL) AS pendentes,
  ROUND(100.0 * COUNT(*) FILTER (WHERE resolved_date IS NOT NULL) / NULLIF(COUNT(*), 0), 1) AS pct_corrigido
FROM ops.i4_violation_baseline
WHERE schema_name != 'ops';

COMMENT ON VIEW ops.v_i4_correction_progress IS
  'Progresso de correção das violações I4. '
  'Meta: pendentes = 0 para invariante I4 passar.';

-- -----------------------------------------------------------------------------
-- Permissões
-- -----------------------------------------------------------------------------
GRANT SELECT ON ops.pgnet_egress_log TO authenticated;
GRANT SELECT ON ops.v_i4_violations_summary TO authenticated;
GRANT SELECT ON ops.i4_violation_baseline TO authenticated;
GRANT SELECT ON ops.v_i4_correction_progress TO authenticated;
GRANT EXECUTE ON FUNCTION ops.log_pgnet_call TO authenticated;
