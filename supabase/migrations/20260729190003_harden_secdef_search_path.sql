-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: 20260729190003_harden_secdef_search_path.sql
-- Purpose  : Remover 'public' da primeira posição do search_path de 6 funções
--            SECURITY DEFINER de alto risco.
--
-- Contexto: audit 2026-07-29 — 6 funções SECDEF com 'public' como primeiro
-- ou único schema no search_path (CWE-1027 search_path hijacking). Embora
-- CREATE em public esteja revogado de anon/authenticated (mitigação existente),
-- a posição de 'public' é vulnerabilidade teórica se CREATE for re-concedido.
--
-- Fix: ALTER FUNCTION ... SET search_path (não toca no corpo da função — forma
-- canônica e segura de mudar apenas o search_path de runtime).
-- Risco: BAIXO. Idempotente: ALTER FUNCTION SET é reentrante.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. public.fn_apply_connection_update(jsonb) → zapp, pg_catalog ─────────
ALTER FUNCTION public.fn_apply_connection_update(p_event jsonb)
  SET search_path TO zapp, pg_catalog;

-- ── 2. public.fn_contacts_proxy_delete() → zapp, evo, pg_catalog ──────────
ALTER FUNCTION public.fn_contacts_proxy_delete()
  SET search_path TO zapp, evo, pg_catalog;

-- ── 3. public.fn_contacts_proxy_insert() → zapp, evo, pg_catalog ──────────
ALTER FUNCTION public.fn_contacts_proxy_insert()
  SET search_path TO zapp, evo, pg_catalog;

-- ── 4. public.fn_contacts_proxy_update() → zapp, evo, pg_catalog ──────────
ALTER FUNCTION public.fn_contacts_proxy_update()
  SET search_path TO zapp, evo, pg_catalog;

-- ── 5. public.is_instance_paused(text) → zapp, pg_catalog ─────────────────
ALTER FUNCTION public.is_instance_paused(p_instance_name text)
  SET search_path TO zapp, pg_catalog;

-- ── 6. vendas.handle_new_auth_user() → vendas, pg_catalog ─────────────────
ALTER FUNCTION vendas.handle_new_auth_user()
  SET search_path TO vendas, pg_catalog;

-- ── VERIFICAÇÃO ─────────────────────────────────────────────────────────────
DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN LATERAL unnest(p.proconfig) AS cfg
  WHERE p.prosecdef = true
    AND n.nspname IN ('public','vendas','zapp','evo','financeiro','email_app','ai','bpm','ops','archive')
    AND cfg ILIKE 'search_path=%'
    AND (cfg = 'search_path=public' OR cfg LIKE 'search_path=public,%');
  IF v_count > 0 THEN
    RAISE EXCEPTION 'VERIFICATION FAILED: % funções SECDEF ainda com public-first', v_count;
  END IF;
  RAISE NOTICE 'OK: 0 funções SECDEF public-first restantes';
END $$;
