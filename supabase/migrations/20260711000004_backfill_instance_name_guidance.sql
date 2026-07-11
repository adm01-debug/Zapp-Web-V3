-- GAP-04 (sessão 6, 2026-07-11): guia de backfill para instance_name em
-- whatsapp_connections.
--
-- CONTEXTO: o campo instance_name pode estar NULL em linhas históricas inseridas
-- antes que o campo fosse adicionado, ou em linhas onde a sincronização com a
-- Evolution API não ocorreu. Sem esse campo preenchido:
--   • ConnectionStatusIndicator.tsx mostra "null" no toast de desconexão
--   • fn_alert_ghost_message_events não consegue correlacionar eventos com instâncias
--   • A constraint GAP-06 (NOT VALID) nunca passará de VALIDATE se houver NULLs
--     que deveriam ser nomes válidos
--
-- ESTE ARQUIVO NÃO EXECUTA O BACKFILL AUTOMATICAMENTE porque instance_name é
-- um dado operacional que só pode ser corretamente derivado da Evolution API ou
-- do conhecimento do operador. Executar um UPDATE cego com dados incorretos é
-- pior do que deixar NULL.
--
-- INSTRUÇÕES PARA O OPERADOR:
--
--   PASSO 1 — Identificar linhas sem instance_name:
--     SELECT id, phone_number, status, created_at
--     FROM public.whatsapp_connections
--     WHERE instance_name IS NULL
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
--   PASSO 4 — Após backfill completo, validar a constraint NOT VALID adicionada
--     na migration anterior (20260711000003):
--     ALTER TABLE public.whatsapp_connections
--       VALIDATE CONSTRAINT chk_instance_name_format;
--
-- FUNÇÃO AUXILIAR DE DIAGNÓSTICO (opcional, pode ser executada e depois dropada):
-- Retorna um relatório das linhas com instance_name NULL e informações úteis
-- para correlação manual com a Evolution API.

CREATE OR REPLACE FUNCTION ops.fn_diagnose_missing_instance_names()
RETURNS TABLE (
  connection_id   uuid,
  phone_number    text,
  status          text,
  instance_id     text,
  created_at      timestamptz,
  updated_at      timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, ops
AS $$
  SELECT
    id            AS connection_id,
    phone_number,
    status,
    instance_id::text,
    created_at,
    updated_at
  FROM public.whatsapp_connections
  WHERE instance_name IS NULL
  ORDER BY created_at DESC;
$$;

COMMENT ON FUNCTION ops.fn_diagnose_missing_instance_names() IS
  'GAP-04 (2026-07-11): lista conexoes sem instance_name para backfill manual. '
  'Dropar apos backfill completo e VALIDATE CONSTRAINT chk_instance_name_format.';
