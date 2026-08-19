-- migration: 20260806135751_atualizar_ranking_vendas_hoje_com_exclusoes.sql
-- Atualiza financeiro.ranking_vendas_hoje() para excluir pedidos presentes em
-- financeiro.ranking_exclusoes (tabela criada na migration anterior 20260806135729).
-- Aplicado diretamente em produção — este arquivo é stub de documentação.

CREATE OR REPLACE FUNCTION financeiro.ranking_vendas_hoje()
RETURNS TABLE(
  vendedor      text,
  total_vendido numeric,
  qtd_pedidos   bigint,
  pct_meta      numeric,
  falta         numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'financeiro', 'vendas'
AS $function$
  WITH meta AS (SELECT 50000::numeric AS valor),
  vendas AS (
    SELECT
      v.vendedor,
      SUM(v.valor_total)  AS total_vendido,
      COUNT(*)            AS qtd_pedidos
    FROM financeiro.vendas_unificadas v
    WHERE v.data_venda = CURRENT_DATE
      AND v.vendedor IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM financeiro.ranking_exclusoes e
        WHERE e.pedido_pai = v.pedido_pai
      )
    GROUP BY v.vendedor
  )
  SELECT
    v.vendedor,
    v.total_vendido,
    v.qtd_pedidos,
    ROUND((v.total_vendido / m.valor) * 100, 2) AS pct_meta,
    GREATEST(0, m.valor - v.total_vendido)       AS falta
  FROM vendas v, meta m
  ORDER BY v.total_vendido DESC
$function$;
