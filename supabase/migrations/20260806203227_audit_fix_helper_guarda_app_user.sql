-- ESPELHO repo×DB — migration aplicada via MCP (supabase_apply_migration) na auditoria Hermes 2026-08-06/07.
-- Registro em supabase_migrations.schema_migrations; este arquivo é o registro histórico (DB-as-source).
CREATE OR REPLACE FUNCTION zapp.fn_require_app_user()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = zapp, pg_temp AS $$
BEGIN
  -- Guarda canonica (P0 auditoria): bloqueia usuario autenticado sem perfil de app.
  -- Caminhos internos (service_role, cron/postgres, edge) tem auth.uid() = NULL e passam.
  IF auth.uid() IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM zapp.profiles WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: app user required' USING ERRCODE = '42501';
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION zapp.fn_require_app_user() TO authenticated, service_role;
