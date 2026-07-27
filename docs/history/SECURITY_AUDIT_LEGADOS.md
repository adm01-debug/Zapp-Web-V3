# Auditoria de Segurança — Schemas Legados (financeiro, artes, vendas)
## Data: 2026-07-11 | Requer aprovação de Joaquim antes de qualquer modificação

---

## Problema Identificado

Durante a validação exaustiva de 2026-07-11, o scan completo de funções
`anon+SECURITY DEFINER+bypassrls` identificou o mesmo padrão nos schemas legados:

| Schema | Funções expostas | Risco |
|--------|-----------------|-------|
| `financeiro` | 27 | ALTO — funções de billing/faturas |
| `artes` | 15 | MÉDIO — funções de gestão de arte |
| `vendas` | 11 | ALTO — funções de pedidos/vendas |
| **Total** | **53** | |

## Por que não foi corrigido imediatamente

As memórias do sistema indicam explicitamente:
> "Legacy schemas (financeiro, vendas, artes, archive) require Joaquim's explicit
> approval before modification."

O REVOKE de PUBLIC em funções desses schemas pode quebrar integrações existentes
(ERPs, APIs externas, n8n workflows) que dependem do acesso anon/authenticated.

## Ação necessária (com aprovação)

```sql
-- Para cada schema legado, após auditoria das dependências:
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA financeiro FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA artes FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA vendas FROM PUBLIC;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA financeiro TO postgres, supabase_admin;
-- (adicionar roles específicos conforme necessário após auditoria)
```

## Como auditar cada função antes de revogar

```sql
-- Listar todas as funções expostas e verificar se são chamadas por fluxos autenticados
SELECT p.proname, n.nspname,
  p.prosecdef AS secdef,
  substring(pg_get_functiondef(p.oid), 1, 200) AS def_preview
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname IN ('financeiro','artes','vendas')
  AND has_function_privilege('anon', p.oid, 'execute')
  AND p.prosecdef=true
ORDER BY n.nspname, p.proname;
```

## Contexto

- schemas `evo` (3 funções) e `zapp` (3 funções) foram corrigidos em 20260711_security_revoke_anon_secdef.sql
- `security_acl` dimensão do health score: `anon_any_execute=0` após os fixes de evo+zapp
- Os schemas legados não são monitorados pelo `fn_score_security_acl` atual
