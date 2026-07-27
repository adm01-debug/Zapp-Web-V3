# Schema `financeiro` — Módulo Financeiro

**Dono:** time financeiro  
**Atualizado:** 27/07/2026

## Propósito

Módulo de gestão financeira: links de pagamento, comprovantes, cobranças, integração Sicoob.

## Estatísticas

| Objeto | Quantidade |
|---|---:|
| Tabelas | 16 |
| Views | 11 |
| Funções | 45 |
| Triggers | 19 |

## Tabelas Principais

- `payment_links` — links de pagamento (adicionada à publication Realtime em `20260724000006`)
- `financial_transactions` — transações financeiras
- `cobranças` — cobranças e faturas

## Atenção: Índices Duplicados

Tabelas `colaboradores` e `vendas_unificadas` têm índices duplicados — ver etapa 27.

## Dependências

- **Consumido por:** `public` (via views), `zapp` (via views de contrato)
- **Realtime:** `financeiro.payment_links` na publication `supabase_realtime` (desde `20260724000006`)
