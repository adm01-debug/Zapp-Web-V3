-- =============================================================================
-- R25: Fix RT05 (FK user_roles->profiles) + RT21 (idle_in_transaction_session_timeout)
-- Data: 2026-07-30
-- Regression tests: 25/25 PASS pos-apply
-- =============================================================================

-- FIX RT05: FK zapp.user_roles -> zapp.profiles
-- check_critical_fks() esperava este par e nao encontrava.
-- profiles.user_id e UNIQUE via profiles_user_id_key.
-- 0 orphans confirmado antes de adicionar a constraint.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint k
    JOIN pg_class bc ON bc.oid = k.conrelid
    JOIN pg_namespace bn ON bn.oid = bc.relnamespace
    JOIN pg_class cc ON cc.oid = k.confrelid
    JOIN pg_namespace cn ON cn.oid = cc.relnamespace
    WHERE k.contype = 'f'
      AND bc.relname = 'user_roles' AND bn.nspname = 'zapp'
      AND cc.relname = 'profiles'  AND cn.nspname = 'zapp'
  ) THEN
    ALTER TABLE zapp.user_roles
      ADD CONSTRAINT user_roles_profiles_user_id_fkey
      FOREIGN KEY (user_id)
      REFERENCES zapp.profiles(user_id)
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

-- FIX RT21: idle_in_transaction_session_timeout em 3 roles
-- RT21 verifica: postgres, authenticated, anon com '60s' em pg_db_role_setting.setdatabase=0
-- authenticated tinha 300s; postgres nao tinha; anon ja tinha 60s (R23).
ALTER ROLE postgres      SET idle_in_transaction_session_timeout = '60s';
ALTER ROLE authenticated SET idle_in_transaction_session_timeout = '60s';
ALTER ROLE service_role  SET idle_in_transaction_session_timeout = '300s';

-- Verificacao: deve retornar 3
-- SELECT COUNT(*) FROM pg_roles r
-- JOIN pg_db_role_setting s ON s.setrole=r.oid AND s.setdatabase=0
-- WHERE r.rolname IN('postgres','authenticated','anon')
--   AND s.setconfig @> ARRAY['idle_in_transaction_session_timeout=60s'];
