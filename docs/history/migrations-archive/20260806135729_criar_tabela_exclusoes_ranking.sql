-- migration: 20260806135729_criar_tabela_exclusoes_ranking.sql
-- Cria tabela financeiro.ranking_exclusoes para excluir pedidos do ranking de vendas do dia.
-- Aplicado diretamente em produção — este arquivo é stub de documentação.

CREATE TABLE IF NOT EXISTS financeiro.ranking_exclusoes (
  id         SERIAL PRIMARY KEY,
  pedido_pai TEXT NOT NULL,
  vendedor   TEXT NOT NULL,
  motivo     TEXT,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_por TEXT
);
