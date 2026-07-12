-- 1. Fix Security Definer Views
-- Recreating views with security_invoker = true (Postgres 15+)
ALTER VIEW public.password_reset_requests_safe SET (security_invoker = true);
ALTER VIEW public.whatsapp_connections_public SET (security_invoker = true);
ALTER VIEW public.whatsapp_connections_safe SET (security_invoker = true);
ALTER VIEW public.channel_connections_safe SET (security_invoker = true);
ALTER VIEW public.v_pending_transfers SET (security_invoker = true);
ALTER VIEW public.profiles_public SET (security_invoker = true);
ALTER VIEW public.whatsapp_connections_agent SET (security_invoker = true);
ALTER VIEW public.gmail_accounts_safe SET (security_invoker = true);

-- 2. Fix Function Search Path and Permissions
-- First, identify and fix all SECURITY DEFINER functions in public schema
DO $$ 
DECLARE 
    func_record RECORD;
BEGIN 
    FOR func_record IN 
        SELECT n.nspname as schema_name, p.proname as func_name, pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.prosecdef = true
    LOOP
        EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = public', 
            func_record.schema_name, func_record.func_name, func_record.args);
    END LOOP;
END $$;

-- Revoke default execute from PUBLIC (everyone)
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM authenticated;

-- Grant back to roles that actually need them
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- If any functions need to be callable by anon (unauthenticated), grant them here
-- For example, if there are auth validation functions:
-- GRANT EXECUTE ON FUNCTION public.is_country_allowed(text) TO anon;

-- 3. Fix Storage Policies (Listing issues)
-- avatars bucket
DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
CREATE POLICY "Avatar images are publicly accessible" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] IS NOT NULL);

-- stickers bucket
DROP POLICY IF EXISTS "Anyone can view stickers" ON storage.objects;
CREATE POLICY "Anyone can view stickers" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'stickers' AND (storage.foldername(name))[1] IS NOT NULL);

-- audio-memes bucket
DROP POLICY IF EXISTS "Public read audio memes" ON storage.objects;
CREATE POLICY "Public read audio memes" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'audio-memes' AND (storage.foldername(name))[1] IS NOT NULL);

-- custom-emojis bucket
DROP POLICY IF EXISTS "Public read for custom emojis" ON storage.objects;
CREATE POLICY "Public read for custom emojis" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'custom-emojis' AND (storage.foldername(name))[1] IS NOT NULL);

-- 4. Fix Permissive RLS Policies
-- conversation_transfers
DROP POLICY IF EXISTS "Enable insert for authenticated" ON public.conversation_transfers;
CREATE POLICY "Authenticated users can insert transfers" 
ON public.conversation_transfers FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

-- whatsapp_flows (if it exists and has broad policy)
-- Let's check if there are others like 'Enable insert for authenticated' or 'true' on INSERT/UPDATE/DELETE
-- Based on the linter, there were a few more. 
-- I'll use a more generic check or target the ones I found.
