# Schema `vendas` — Módulo Vendas

**Dono:** time de vendas  
**Atualizado:** 27/07/2026

## Propósito

Módulo de gestão de vendas: deals, pipeline de vendas, metas, relatórios.

## Estatísticas

| Objeto | Quantidade |
|---|---:|
| Tabelas | 14 |
| Views | 5 |
| Funções | 21 |
| Triggers | 12 |

## Tabelas Principais

- `sales_deals` — oportunidades/deals (Realtime publicada em `20260724000005`)
- `sales_pipeline` — estágios do pipeline
- `sales_goals` — metas de vendas
- `sales_activities` — atividades de vendas

## Dependências

- **Consumido por:** `public` (12 views apontam para `vendas`)
