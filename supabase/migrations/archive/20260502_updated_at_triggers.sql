CREATE OR REPLACE FUNCTION public.handle_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DO $$ DECLARE t TEXT; BEGIN
  FOR t IN SELECT c.table_name FROM information_schema.columns c JOIN pg_tables pt ON pt.tablename=c.table_name AND pt.schemaname='public' WHERE c.table_schema='public' AND c.column_name='updated_at' AND c.table_name NOT IN (SELECT DISTINCT tg.tgrelid::regclass::text FROM pg_trigger tg WHERE NOT tg.tgisinternal) LOOP
    BEGIN EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at()', t); EXCEPTION WHEN duplicate_object THEN NULL; END;
  END LOOP;
END $$;
