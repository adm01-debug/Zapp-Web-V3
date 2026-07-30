-- Fix SECURITY DEFINER functions search_path
DO $$ 
DECLARE 
    func_record record;
BEGIN 
    FOR func_record IN 
        SELECT n.nspname, p.proname, oidvectortypes(p.proargtypes) as args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE p.prosecdef = true
        AND n.nspname = 'public'
    LOOP
        EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = public', 
                       func_record.nspname, func_record.proname, func_record.args);
    END LOOP;
END $$;

-- Harden RLS for profiles (since it exists)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Profiles are viewable by self" ON public.profiles FOR SELECT USING (id = auth.uid());

-- Harden RLS for messages
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view messages" ON public.messages;
-- Assuming messages have a contact_id or similar that link to the user
-- For now, let's just enable it to be safe or set to service_role only if it's system-managed
CREATE POLICY "Service role only" ON public.messages TO service_role USING (true);
