-- MELHORIA #7 — security_invoker=on for views in financeiro, ops, vendas schemas
--
-- Audit (2026-07-21): 19 views in non-zapp schemas had reloptions IS NULL or lacked
-- the security_invoker option.  Without it, queries execute with the VIEW OWNER's
-- privileges rather than the calling user's, enabling privilege escalation through
-- view chains even when the underlying tables have RLS.
--
-- v_wal_health already carries security_invoker=true (skipped).

-- ── financeiro (11 views) ────────────────────────────────────────────────────
ALTER VIEW financeiro.vw_conciliacao_vendas   SET (security_invoker = on);
ALTER VIEW financeiro.vw_emprestimos          SET (security_invoker = on);
ALTER VIEW financeiro.vw_parcelas_lista       SET (security_invoker = on);
ALTER VIEW financeiro.vw_parcelas_vencidas    SET (security_invoker = on);
ALTER VIEW financeiro.vw_pedidos_sem_nf       SET (security_invoker = on);
ALTER VIEW financeiro.vw_pendentes_nf_venda   SET (security_invoker = on);
ALTER VIEW financeiro.vw_proximos_vencimentos SET (security_invoker = on);
ALTER VIEW financeiro.vw_resumo_mensal        SET (security_invoker = on);
ALTER VIEW financeiro.vw_resumo_vales_mes     SET (security_invoker = on);
ALTER VIEW financeiro.vw_resumo_vendedor      SET (security_invoker = on);
ALTER VIEW financeiro.vw_vales                SET (security_invoker = on);

-- ── ops (3 views — v_wal_health already has security_invoker=true) ───────────
ALTER VIEW ops.v_auth_health          SET (security_invoker = on);
ALTER VIEW ops.v_auth_session_monitor SET (security_invoker = on);
ALTER VIEW ops.v_health_deadman       SET (security_invoker = on);

-- ── vendas (5 views) ─────────────────────────────────────────────────────────
ALTER VIEW vendas.v_itens_pedido_pendentes SET (security_invoker = on);
ALTER VIEW vendas.vw_pedidos_pai           SET (security_invoker = on);
ALTER VIEW vendas.vw_produtos_sem_codigo   SET (security_invoker = on);
ALTER VIEW vendas.vw_produtos_sem_ncm      SET (security_invoker = on);
ALTER VIEW vendas.vw_status_ncm            SET (security_invoker = on);
