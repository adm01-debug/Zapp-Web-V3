DO $$
DECLARE
    pol RECORD;
    new_qual TEXT;
    new_check TEXT;
BEGIN
    FOR pol IN 
        SELECT tablename, policyname, roles, cmd, qual, with_check 
        FROM pg_policies 
        WHERE schemaname = 'public' 
        AND (
            (qual LIKE '%is_admin_or_supervisor%' AND qual NOT LIKE '%auth_helpers.is_admin_or_supervisor%') OR 
            (with_check LIKE '%is_admin_or_supervisor%' AND with_check NOT LIKE '%auth_helpers.is_admin_or_supervisor%') OR 
            (qual LIKE '%has_role%' AND qual NOT LIKE '%auth_helpers.has_role%') OR 
            (with_check LIKE '%has_role%' AND with_check NOT LIKE '%auth_helpers.has_role%')
        )
    LOOP
        new_qual := REPLACE(REPLACE(pol.qual, 'is_admin_or_supervisor', 'auth_helpers.is_admin_or_supervisor'), 'has_role', 'auth_helpers.has_role');
        new_check := REPLACE(REPLACE(pol.with_check, 'is_admin_or_supervisor', 'auth_helpers.is_admin_or_supervisor'), 'has_role', 'auth_helpers.has_role');
        
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(pol.policyname) || ' ON ' || quote_ident(pol.tablename);
        
        EXECUTE 'CREATE POLICY ' || quote_ident(pol.policyname) || ' ON ' || quote_ident(pol.tablename) || 
                ' FOR ' || pol.cmd || 
                ' TO ' || array_to_string(pol.roles, ',') || 
                CASE WHEN new_qual IS NOT NULL THEN ' USING (' || new_qual || ')' ELSE '' END || 
                CASE WHEN new_check IS NOT NULL THEN ' WITH CHECK (' || new_check || ')' ELSE '' END;
    END LOOP;
END $$;
