-- Seed idempotente de contatos de teste para specs E2E de CRM/Inbox.
--
-- Convenção (compatível com zapp.rpc_e2e_cleanup):
--   * name começa com 'E2E '
--   * email termina em '@zappweb.test'
--   * phone = 5511999999 + sufixo (dentro do range que o cleanup remove)
--   * remote_jid = <phone>@s.whatsapp.net
--
-- Uso:
--   psql "$SUPABASE_DB_URL" -f scripts/seed-e2e-contacts.sql
--
-- Roda dentro de uma transação e é 100% idempotente:
--   * Detecta dinamicamente quais colunas existem em zapp.contacts
--     (para não quebrar se o schema evoluir).
--   * Faz UPSERT por phone quando possível; caso contrário, INSERT ... WHERE NOT EXISTS.

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_seeds jsonb := jsonb_build_array(
    jsonb_build_object('phone','5511999999901','name','E2E Contact Alpha',   'email','e2e-alpha@zappweb.test'),
    jsonb_build_object('phone','5511999999902','name','E2E Contact Beta',    'email','e2e-beta@zappweb.test'),
    jsonb_build_object('phone','5511999999903','name','E2E Contact Gamma',   'email','e2e-gamma@zappweb.test'),
    jsonb_build_object('phone','5511999999904','name','E2E Contact Delta',   'email','e2e-delta@zappweb.test'),
    jsonb_build_object('phone','5511999999905','name','E2E Contact Epsilon', 'email','e2e-epsilon@zappweb.test')
  );
  v_row jsonb;
  v_phone text;
  v_name  text;
  v_email text;
  v_jid   text;
  v_has_email     boolean;
  v_has_jid       boolean;
  v_has_active    boolean;
  v_has_tags      boolean;
  v_cols text;
  v_vals text;
  v_updates text;
  v_inserted int := 0;
  v_updated  int := 0;
  v_id uuid;
BEGIN
  -- Introspeção defensiva de colunas
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='zapp' AND table_name='contacts' AND column_name='email')      INTO v_has_email;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='zapp' AND table_name='contacts' AND column_name='remote_jid') INTO v_has_jid;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='zapp' AND table_name='contacts' AND column_name='is_active')  INTO v_has_active;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='zapp' AND table_name='contacts' AND column_name='tags')       INTO v_has_tags;

  FOR v_row IN SELECT * FROM jsonb_array_elements(v_seeds) LOOP
    v_phone := v_row->>'phone';
    v_name  := v_row->>'name';
    v_email := v_row->>'email';
    v_jid   := v_phone || '@s.whatsapp.net';

    -- Já existe? (chave lógica: phone)
    SELECT id INTO v_id FROM zapp.contacts WHERE phone = v_phone LIMIT 1;

    IF v_id IS NULL THEN
      -- Monta INSERT dinâmico com apenas as colunas presentes
      v_cols := 'phone, name';
      v_vals := format('%L, %L', v_phone, v_name);

      IF v_has_email  THEN v_cols := v_cols || ', email';      v_vals := v_vals || format(', %L', v_email); END IF;
      IF v_has_jid    THEN v_cols := v_cols || ', remote_jid'; v_vals := v_vals || format(', %L', v_jid);   END IF;
      IF v_has_active THEN v_cols := v_cols || ', is_active';  v_vals := v_vals || ', true';                END IF;
      IF v_has_tags   THEN v_cols := v_cols || ', tags';       v_vals := v_vals || format(', %L::text[]', '{e2e,seed}'); END IF;

      EXECUTE format('INSERT INTO zapp.contacts (%s) VALUES (%s)', v_cols, v_vals);
      v_inserted := v_inserted + 1;

    ELSE
      -- Já existe: só sincroniza nome/email/jid/is_active
      v_updates := 'name = ' || quote_literal(v_name);
      IF v_has_email  THEN v_updates := v_updates || ', email = '      || quote_literal(v_email); END IF;
      IF v_has_jid    THEN v_updates := v_updates || ', remote_jid = ' || quote_literal(v_jid);   END IF;
      IF v_has_active THEN v_updates := v_updates || ', is_active = true'; END IF;

      EXECUTE format('UPDATE zapp.contacts SET %s WHERE id = %L', v_updates, v_id);
      v_updated := v_updated + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'E2E_SEED_SUMMARY_JSON:%', jsonb_build_object(
    'kind',       'contacts',
    'timestamp',  to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'table',      'zapp.contacts',
    'inserted',   v_inserted,
    'updated',    v_updated,
    'total',      v_inserted + v_updated,
    'columns',    jsonb_build_object(
                    'email',      v_has_email,
                    'remote_jid', v_has_jid,
                    'is_active',  v_has_active,
                    'tags',       v_has_tags
                  )
  )::text;

  RAISE NOTICE 'E2E_SEED_OK: contacts inseridos=% atualizados=% (total=%)',
    v_inserted, v_updated, v_inserted + v_updated;
END $$;


COMMIT;
