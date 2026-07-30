
-- Revoga EXECUTE de anon em TODAS as funções do schema public
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

-- Re-concede a anon apenas o que precisa ser chamado antes da autenticação
GRANT EXECUTE ON FUNCTION public.record_failed_login(text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.is_account_locked(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_own_lockout_status(text) TO anon;
GRANT EXECUTE ON FUNCTION public.validate_reset_token(text) TO anon;
GRANT EXECUTE ON FUNCTION public.clear_login_attempts(text) TO anon;
GRANT EXECUTE ON FUNCTION public.is_country_blocked(text) TO anon;
GRANT EXECUTE ON FUNCTION public.is_country_allowed(text) TO anon;
GRANT EXECUTE ON FUNCTION public.is_ip_blocked(text) TO anon;
GRANT EXECUTE ON FUNCTION public.is_ip_whitelisted(text) TO anon;

-- Garante que authenticated mantenha EXECUTE em tudo (default já é assim, mas reforça)
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
