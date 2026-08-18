-- 20260817125000_decouple_revoke_contact_phones_write_public_vector
-- Espelho DB-as-source (reconstruido do estado vivo em 2026-08-18; aplicado
-- originalmente via MCP em 2026-08-17). Fecha o vetor de escrita em
-- contact_phones para roles de front: authenticated fica read-only na tabela.
-- A view public.contact_phones e security_invoker=true, entao os grants de
-- write remanescentes na view sao inertes (a tabela zapp bloqueia).
-- Idempotente.

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON zapp.contact_phones FROM anon, authenticated;
REVOKE ALL ON zapp.contact_phones FROM anon;
GRANT SELECT ON zapp.contact_phones TO authenticated;
