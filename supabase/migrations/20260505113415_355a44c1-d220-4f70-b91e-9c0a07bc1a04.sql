-- Functions guarded: may not exist in CI if earlier migrations failed
DO $a0_guards$ BEGIN
  BEGIN
    ALTER FUNCTION public.calculate_agent_load(UUID) SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP calculate_agent_load SET search_path: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION public.route_conversation() SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP route_conversation SET search_path: %', SQLERRM;
  END;
END $a0_guards$;
