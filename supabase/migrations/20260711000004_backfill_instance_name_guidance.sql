-- GAP-04 (sessão 6, 2026-07-11): guia de backfill para instance_name em
-- whatsapp_connections.
--
-- CONTEXTO: o campo instance_name pode estar NULL em linhas históricas inseridas
-- antes que o campo fosse adicionado, ou em linhas onde a sincronização com a
-- Evolution API não ocorreu. Sem esse campo preenchido:
--   • ConnectionStatusIndicator.tsx cai para name/instance_id no toast de desconexão
--     (TS-06/TS-07 já corrigiram o display de "null" literal, mas o fallback é inferior)
--   • fn_alert_ghost_message_events não consegue correlacionar eventos com instâncias
--   • NOTA: a constraint chk_instance_name_format (NOT VALID, em 20260711000003)
--     permite NULL explicitamente (instance_name IS NULL OR <regex>), então VALIDATE
--     não falha por causa de NULLs. O backfill é RECOMENDADO para completude
--     operacional; VALIDATE só pegará nomes com formato inválido em linhas já preenchidas
--
-- ESTE ARQUIVO NÃO EXECUTA O BACKFILL AUTOMATICAMENTE porque instance_name é
-- um dado operacional que só pode ser corretamente derivado da Evolution API ou
-- do conhecimento do operador. Executar um UPDATE cego com dados incorretos é
-- pior do que deixar NULL.
--
-- INSTRUÇÕES PARA O OPERADOR:
--
--   PASSO 1 — Identificar linhas problemáticas (NULL e formato inválido):
--     Execute ops.fn_diagnose_missing_instance_names() — retorna ambos os casos.
--     Ou use as queries abaixo individualmente:
--
--     -- Linhas sem instance_name:
--     SELECT id, phone_number, status, created_at
--     FROM public.whatsapp_connections
--     WHERE instance_name IS NULL
--     ORDER BY created_at DESC;
--
--     -- Linhas com instance_name preenchido mas formato inválido
--     -- (bloquearia UPDATE nessa linha e faria VALIDATE CONSTRAINT falhar):
--     SELECT id, instance_name, phone_number, status, created_at
--     FROM public.whatsapp_connections
--     WHERE instance_name IS NOT NULL
--       AND instance_name !~ '^[A-Za-z0-9_-]{1,64}$'
--     ORDER BY created_at DESC;
--
--   PASSO 2 — Para cada linha, descobrir o instance_name correto consultando
--     a Evolution API:
--       GET /instance/fetchInstances
--     e correlacionar pelo número de telefone (phone_number) ou pelo instance_id.
--
--   PASSO 3 — Atualizar as linhas individualmente (exemplo):
--     UPDATE public.whatsapp_connections
--     SET instance_name = 'nome-correto-da-instancia'
--     WHERE id = '<uuid-da-linha>';
--
--   PASSO 4 — Após backfill/correção completos, validar a constraint NOT VALID
--     adicionada na migration anterior (20260711000003):
--     ALTER TABLE public.whatsapp_connections
--       VALIDATE CONSTRAINT chk_instance_name_format;
--
-- FUNÇÃO AUXILIAR DE DIAGNÓSTICO (opcional, pode ser executada e depois dropada):
-- Retorna um relatório unificado: linhas com instance_name NULL E linhas com
-- instance_name preenchido mas formato inválido (ambas bloqueiam VALIDATE CONSTRAINT).

-- DROP necessário: adiciona coluna problem_type que muda a assinatura de retorno.
DROP FUNCTION IF EXISTS ops.fn_diagnose_missing_instance_names();

CREATE FUNCTION ops.fn_diagnose_missing_instance_names()
RETURNS TABLE (
  connection_id   uuid,
  phone_number    text,
  status          text,
  instance_id     text,
  instance_name   text,
  problem_type    text,
  created_at      timestamptz,
  updated_at      timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, ops
AS $$
  -- Caso 1: instance_name ausente (backfill necessário)
  SELECT
    id            AS connection_id,
    phone_number,
    status,
    instance_id::text,
    NULL::text    AS instance_name,
    'null'::text  AS problem_type,
    created_at,
    updated_at
  FROM public.whatsapp_connections
  WHERE instance_name IS NULL

  UNION ALL

  -- Caso 2: instance_name preenchido mas violando o regex da constraint.
  -- Essas linhas fariam VALIDATE CONSTRAINT chk_instance_name_format falhar
  -- e qualquer UPDATE nelas seria rejeitado pela constraint (NOT VALID só pula
  -- validação de linhas existentes, não protege writes futuros).
  SELECT
    id            AS connection_id,
    phone_number,
    status,
    instance_id::text,
    instance_name::text,
    'invalid_format'::text AS problem_type,
    created_at,
    updated_at
  FROM public.whatsapp_connections
  WHERE instance_name IS NOT NULL
    AND instance_name !~ '^[A-Za-z0-9_-]{1,64}$'

  ORDER BY created_at DESC;
$$;

-- SECURITY DEFINER retorna phone_number/status — não pode ficar executável via PUBLIC
-- (bypass de RLS/controle de acesso). Migration auto-contida.
ALTER FUNCTION ops.fn_diagnose_missing_instance_names() OWNER TO supabase_admin;
REVOKE ALL ON FUNCTION ops.fn_diagnose_missing_instance_names() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops.fn_diagnose_missing_instance_names()
  TO postgres, supabase_admin;

COMMENT ON FUNCTION ops.fn_diagnose_missing_instance_names() IS
  'GAP-04 (2026-07-11): lista conexoes com instance_name ausente (NULL) ou formato '
  'inválido para backfill/correcao manual antes de VALIDATE CONSTRAINT chk_instance_name_format. '
  'Coluna problem_type distingue ''null'' de ''invalid_format''. '
  'REVOKE PUBLIC + DROP/recreate com problem_type adicionados (Cubic review 2026-07-12).';
