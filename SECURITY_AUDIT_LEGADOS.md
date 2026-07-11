# Relatório de Auditoria de Segurança — Schemas Legados
**Data:** 2026-07-10  
**Rodada:** R14  
**Status:** ⚠️ REQUER REVISÃO MANUAL DE JOAQUIM — não alterado

---

## Resumo Executivo

4 schemas legados contêm **47 tabelas/views com problemas de segurança**:
- 37 com grants `anon` (dados acessíveis sem autenticação)
- 34 sem RLS (Row Level Security desabilitado)

**Estes schemas NÃO são monitorados pelo `fn_system_health_score`.** O score atual (100/A+) não reflete o estado de segurança destes schemas.

---

## Schema: `financeiro` (RISCO ALTO)

**25 objetos com grant anon | 11 sem RLS**

Tabelas/views com acesso anônimo (sem autenticação):
- `app_usuarios` — dados de usuários ⚠️
- `bling_token` — tokens de API Bling ⚠️⚠️ (token de integração exposto!)
- `emprestimos` — dados de empréstimos ⚠️
- `pagamentos_diarios` — pagamentos diários ⚠️
- `payment_links` — links de pagamento ⚠️
- `notas_fiscais` — notas fiscais ⚠️
- `vendas_unificadas` — vendas unificadas ⚠️
- `solicitacoes_alteracao_valor` — solicitações financeiras ⚠️
- `vw_conciliacao_vendas`, `vw_resumo_mensal`, etc. — views financeiras ⚠️

**Pergunta para Joaquim:** Estes grants são intencionais para uma API externa específica?

---

## Schema: `vendas` (RISCO ALTO)

**10 objetos com grant anon | 7 sem RLS**

- `creditos` — créditos de clientes ⚠️
- `salespeople` — dados de vendedores ⚠️
- `products` — catálogo de produtos
- `v_itens_pedido_pendentes` — pedidos pendentes ⚠️

---

## Schema: `artes` (RISCO MÉDIO)

**2 objetos com grant anon | 2 sem RLS**

- `usuarios` — dados de usuários ⚠️
- `fechamentos` — fechamentos de período ⚠️

---

## Schema: `archive` (RISCO MÉDIO)

**10 tabelas sem RLS | 0 grants anon**

---

## Ações Recomendadas (mediante aprovação)

```sql
-- SE grants são incorretos:
REVOKE ALL ON ALL TABLES IN SCHEMA financeiro FROM anon;
REVOKE ALL ON ALL VIEWS  IN SCHEMA financeiro FROM anon;
REVOKE ALL ON ALL TABLES IN SCHEMA vendas     FROM anon;
REVOKE ALL ON ALL TABLES IN SCHEMA artes      FROM anon;
```

**Não alterar sem aprovação de Joaquim.**
