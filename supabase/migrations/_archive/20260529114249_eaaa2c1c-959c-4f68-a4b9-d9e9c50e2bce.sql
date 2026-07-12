-- 1. SECURE FUNCTIONS: Revoke PUBLIC execute and grant to roles
DO $$ 
DECLARE 
    func_record RECORD;
BEGIN 
    FOR func_record IN 
        SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p 
        JOIN pg_namespace n ON p.pronamespace = n.oid 
        WHERE nspname = 'public'
    LOOP 
        EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || quote_ident(func_record.nspname) || '.' || quote_ident(func_record.proname) || '(' || func_record.args || ') FROM PUBLIC';
        EXECUTE 'GRANT EXECUTE ON FUNCTION ' || quote_ident(func_record.nspname) || '.' || quote_ident(func_record.proname) || '(' || func_record.args || ') TO authenticated';
        EXECUTE 'GRANT EXECUTE ON FUNCTION ' || quote_ident(func_record.nspname) || '.' || quote_ident(func_record.proname) || '(' || func_record.args || ') TO service_role';
    END LOOP; 
END $$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;

-- 2. ONBOARDING & SETTINGS: Add persistence and triggers
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;

CREATE OR REPLACE FUNCTION public.handle_new_user_settings()
RETURNS TRIGGER AS $$
BEGIN
    -- Use NEW.user_id since this table has a user_id column
    INSERT INTO public.user_settings (user_id, onboarding_completed)
    VALUES (NEW.user_id, false)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_profile_created_settings ON public.profiles;
CREATE TRIGGER on_profile_created_settings
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_settings();

-- 3. PERFORMANCE: Critical indexes
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_contact_id ON public.messages(contact_id);

DO $$ 
BEGIN 
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'evolution_contacts') THEN
        CREATE INDEX IF NOT EXISTS idx_evolution_contacts_remote_jid ON public.evolution_contacts(remote_jid);
    END IF;
END $$;
