-- MELHORIA #9 — REVOKE EXECUTE from anon on financeiro + vendas functions
--
-- Audit (2026-07-21): 41 functions in financeiro and 9 in vendas were callable
-- by the anon role, including business-critical RPCs such as:
--   adicionar_parcelas, liquidar_parcela, bulk_upsert_vendas, atualizar_colaborador,
--   unificar_pedidos, apagar_nota_fiscal …
--
-- The anon role maps to unauthenticated callers (public internet).  Financial
-- functions must never be reachable without a valid session.  Trigger functions
-- (fn_atualizar_timestamp, fn_set_atualizado_em, fn_trg_*) are also included:
-- they fire under the table owner's privilege and need no public grant.

-- ── financeiro (41 functions) ────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION financeiro.adicionar_parcelas(p_id uuid, p_quantidade integer) FROM anon;
REVOKE EXECUTE ON FUNCTION financeiro.adicionar_valor_emprestimo(p_id uuid, p_valor numeric, p_data date, p_descricao text) FROM anon;
REVOKE EXECUTE ON FUNCTION financeiro.apagar_nota_fiscal(p_nf_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION financeiro.atualiza_qtd_enviada_nf_emitida() FROM anon;
REVOKE EXECUTE ON FUNCTION financeiro.atualizar_colaborador(p_id uuid, p_nome text, p_cpf text, p_cargo text, p_departamento text, p_chave_pix text, p_tipo_chave_pix text, p_cidade text, p_ativo boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION financeiro.atualizar_colaborador(p_id uuid, p_nome text, p_cpf text, p_cargo text, p_departamento text, p_chave_pix text, p_tipo_chave_pix text, p_cidade text, p_ativo boolean, p_tipo_contrato text) FROM anon;
REVOKE EXECUTE ON FUNCTION financeiro.bulk_insert_parcelas(p_payload jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION financeiro.bulk_sync_parcelas_planilha(p_payload jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION financeiro.bulk_upsert_vendas(p_payload jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION financeiro.cadastrar_parcela_por_pedido(p_payload jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION financeiro.calc_mes_ano_fallback() FROM anon;
REVOKE EXECUTE ON FUNCTION financeiro.desfazer_unificacao(p_grupo_id uuid, p_usuario text) FROM anon;
REVOKE EXECUTE ON FUNCTION financeiro.empresas_reativadas_ou_novas_hoje() FROM anon;
REVOKE EXECUTE ON FUNCTION financeiro.extrair_pedido_pai(pedido_filho text) FROM anon;
REVOKE EXECUTE ON FUNCTION financeiro.fn_app_role() FROM anon;
REVOKE EXECUTE ON FUNCTION financeiro.fn_atualizar_timestamp() FROM anon;
REVOKE EXECUTE ON FUNCTION financeiro.fn_auto_liquidar_emprestimo() FROM anon;
REVOKE EXECUTE ON FUNCTION financeiro.fn_is_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION financeiro.fn_is_admin_diretor() FROM anon;
REVOKE EXECUTE ON FUNCTION financeiro.fn_set_atualizado_em() FROM anon;
REVOKE EXECUTE ON FUNCTION financeiro.fn_sync_nf_para_vendas() FROM anon;
REVOKE EXECUTE ON FUNCTION financeiro.fn_trg_parcelas_recalc() FROM anon;
REVOKE EXECUTE ON FUNCTION financeiro.fn_trg_vu_valor_total_recalc() FROM anon;
REVOKE EXECUTE ON FUNCTION financeiro.get_nome_usuario(p_email text) FROM anon;
REVOKE EXECUTE ON FUNCTION financeiro.liquidar_parcela(p_id uuid, p_valor numeric, p_desconto_tipo text, p_data_pagamento date, p_liquidado_por text, p_acao_restante text) FROM anon;
REVOKE EXECUTE ON FUNCTION financeiro.liquidar_vale(p_id uuid, p_valor numeric, p_data date, p_responsavel text, p_obs text) FROM anon;
REVOKE EXECUTE ON FUNCTION financeiro.listar_irmaos_faturaveis(p_pedido_pai text, p_ano integer) FROM anon;
REVOKE EXECUTE ON FUNCTION financeiro.marcar_parcela_paga(p_parcela_id uuid, p_data_pagamento date, p_forma_pagamento text, p_obs text) FROM anon;
REVOKE EXECUTE ON FUNCTION financeiro.marcar_parcelas_vencidas() FROM anon;
REVOKE EXECUTE ON FUNCTION financeiro.pagar_parcela_emprestimo(p_id uuid, p_liquidado_por text) FROM anon;
REVOKE EXECUTE ON FUNCTION financeiro.prorrogar_parcela(p_id uuid, p_parcela_num integer, p_nova_data date) FROM anon;
REVOKE EXECUTE ON FUNCTION financeiro.ranking_vendas_hoje() FROM anon;
REVOKE EXECUTE ON FUNCTION financeiro.ranking_vendas_semana() FROM anon;
REVOKE EXECUTE ON FUNCTION financeiro.recalcular_venda_unificada(p_venda_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION financeiro.remover_parcelas(p_id uuid, p_quantidade integer) FROM anon;
REVOKE EXECUTE ON FUNCTION financeiro.sincronizar_nome_produto_nfs(p_pedido_pai text, p_cod_produto text, p_cor text, p_nome_antigo text, p_novo_nome text) FROM anon;
REVOKE EXECUTE ON FUNCTION financeiro.sync_parcela_planilha(p jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION financeiro.sync_vendas_unificadas_from_oc(p_pedido_pai text, p_ano integer, p_mes integer) FROM anon;
REVOKE EXECUTE ON FUNCTION financeiro.unificar_pedidos(p_venda_ids uuid[], p_lider_id uuid, p_usuario text) FROM anon;
REVOKE EXECUTE ON FUNCTION financeiro.upsert_venda_unificada(p_payload jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION financeiro.vendedores_acima_50k_hoje() FROM anon;

-- ── vendas (9 functions) ─────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION vendas.aplicar_envio_cotacao(p_cotacao_id uuid, p_enviado_por_email text, p_enviado_por_nome text, p_itens jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION vendas.eh_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION vendas.fn_listar_bling_tokens() FROM anon;
REVOKE EXECUTE ON FUNCTION vendas.fn_listar_produtos_para_ia_ncm(p_limit integer) FROM anon;
REVOKE EXECUTE ON FUNCTION vendas.fn_registrar_ncm_descoberto(p_cod_produto text, p_ncm text, p_nome_produto text, p_bling_produto_id text, p_fornecedor text, p_origem text) FROM anon;
REVOKE EXECUTE ON FUNCTION vendas.handle_new_auth_user() FROM anon;
REVOKE EXECUTE ON FUNCTION vendas.registrar_acesso() FROM anon;
REVOKE EXECUTE ON FUNCTION vendas.resetar_envios_pedido(p_pedido_pai text) FROM anon;
REVOKE EXECUTE ON FUNCTION vendas.set_atualizado_em() FROM anon;
