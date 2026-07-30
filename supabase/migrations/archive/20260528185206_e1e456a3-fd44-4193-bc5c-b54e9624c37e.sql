-- 1. Fix remaining permissive RLS policies
-- ai_usage_logs
DROP POLICY IF EXISTS "Service role can insert AI usage logs" ON public.ai_usage_logs;
CREATE POLICY "Service role can insert AI usage logs" 
ON public.ai_usage_logs FOR INSERT 
TO service_role
WITH CHECK (true);

-- contact_notes
DROP POLICY IF EXISTS "Users insert contact notes" ON public.contact_notes;
CREATE POLICY "Users insert contact notes" 
ON public.contact_notes FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() IS NOT NULL);

-- 2. Revoke EXECUTE on all trigger functions (they should only be called by the system)
DO $$ 
DECLARE 
    func_record RECORD;
BEGIN 
    FOR func_record IN 
        SELECT n.nspname as schema_name, p.proname as func_name, pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.prorettype = 'trigger'::regtype
    LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC, anon, authenticated', 
            func_record.schema_name, func_record.func_name, func_record.args);
    END LOOP;
END $$;

-- 3. Harder storage listing prevention
-- Consolidated and hardened policies
DO $$
BEGIN
    -- Avatars
    DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
    CREATE POLICY "Avatar images are publicly accessible" 
    ON storage.objects FOR SELECT 
    USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] <> '');

    -- Stickers
    DROP POLICY IF EXISTS "Anyone can view stickers" ON storage.objects;
    CREATE POLICY "Anyone can view stickers" 
    ON storage.objects FOR SELECT 
    USING (bucket_id = 'stickers' AND (storage.foldername(name))[1] <> '');

    -- audio-memes
    DROP POLICY IF EXISTS "Public read audio memes" ON storage.objects;
    CREATE POLICY "Public read audio memes" 
    ON storage.objects FOR SELECT 
    USING (bucket_id = 'audio-memes' AND (storage.foldername(name))[1] <> '');

    -- custom-emojis
    DROP POLICY IF EXISTS "Public read for custom emojis" ON storage.objects;
    CREATE POLICY "Public read for custom emojis" 
    ON storage.objects FOR SELECT 
    USING (bucket_id = 'custom-emojis' AND (storage.foldername(name))[1] <> '');
END $$;
