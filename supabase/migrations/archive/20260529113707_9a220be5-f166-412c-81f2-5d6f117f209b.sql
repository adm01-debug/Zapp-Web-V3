-- Revoke EXECUTE on all existing functions in the public schema from PUBLIC
DO $$ 
DECLARE 
    func_record RECORD;
BEGIN 
    FOR func_record IN 
        SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p 
        JOIN pg_namespace n ON p.pronamespace = n.oid 
        WHERE n.nspname = 'public'
    LOOP 
        EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || quote_ident(func_record.nspname) || '.' || quote_ident(func_record.proname) || '(' || func_record.args || ') FROM PUBLIC';
    END LOOP; 
END $$;

-- Grant EXECUTE to authenticated and service_role
DO $$ 
DECLARE 
    func_record RECORD;
BEGIN 
    FOR func_record IN 
        SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p 
        JOIN pg_namespace n ON p.pronamespace = n.oid 
        WHERE n.nspname = 'public'
    LOOP 
        EXECUTE 'GRANT EXECUTE ON FUNCTION ' || quote_ident(func_record.nspname) || '.' || quote_ident(func_record.proname) || '(' || func_record.args || ') TO authenticated';
        EXECUTE 'GRANT EXECUTE ON FUNCTION ' || quote_ident(func_record.nspname) || '.' || quote_ident(func_record.proname) || '(' || func_record.args || ') TO service_role';
    END LOOP; 
END $$;

-- Set default privileges for future functions
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;
