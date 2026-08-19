-- P2 QA pos-merge 2026-08-06: versionar o wrapper extensions.http_post
-- (restaurado manualmente em 2026-08-06; contrato canonico usa essa funcao
-- em 12 chamadas do canonical_schema_squash — nunca esteve versionada).
-- Delega para net.http_post (pg_net) com timeout de 30s; SECURITY INVOKER.
CREATE OR REPLACE FUNCTION extensions.http_post(
  url text,
  body jsonb DEFAULT '{}'::jsonb,
  headers jsonb DEFAULT '{}'::jsonb
)
 RETURNS bigint
 LANGUAGE sql
 SECURITY INVOKER
 SET search_path TO ''
AS $fn$
  SELECT net.http_post(
    url := $1,
    body := $2,
    params := NULL::jsonb,
    headers := $3,
    timeout_milliseconds := 30000
  );
$fn$;
