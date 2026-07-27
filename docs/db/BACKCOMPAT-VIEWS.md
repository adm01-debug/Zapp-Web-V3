# ⚠️ Views de Backcompat (leitura obrigatória antes de mexer em views)

**Retrato de:** 27/07/2026.

## O que é

O app precisa que certos nomes existam no schema `public` (porque o **PostgREST expõe `public`**) e no schema `zapp` (código legado que usa `zapp.*`). Como o dado real vive no `evo` (e em `zapp`, `bpm`, etc.), foram criadas **views de compatibilidade**:

- **539 views** no `public` → apontam para `zapp` (300), `evo` (182), `bpm` (41), `vendas` (12), `logistica` (3).
- **406 views** no `zapp` → 254 espelham o `evo`.
- Todas com **`security_invoker=on`** (respeitam o RLS da tabela base — não são furo de segurança).

## 🚨 Por que você NÃO pode simplesmente editar/dropar essas views

Existe um cron que **recria** as views de compat automaticamente:

| Item | Valor |
|---|---|
| Cron | `ensure-evolution-backcompat-views` (jobid 138) |
| Schedule | `0 */6 * * *` (a cada 6 horas) |
| Função | `evo.fn_ensure_evolution_backcompat_views()` |

**Consequência:** se você dropar ou editar uma view de compat à mão, ela **volta em ≤6h** no formato que a função define. Editar a view manualmente é trabalho perdido (e gera divergência silenciosa).

## Consequências práticas já observadas (ver CLAUDE.md)

Como as views de compat existem em vários schemas, escrever no lugar errado gera bugs sutis:
- **Realtime:** view **nunca** emite evento CDC (só relation física na publication emite). Assinar `public.x` ou `zapp.x` quando `x` é view = subscription **muda** (no-op silencioso). Use a tabela física no schema dono.
- **`CREATE INDEX ON zapp.evolution_x`** falha ("cannot create index on view") — crie no schema físico (`evo`).
- **`INSERT`/DDL** contra a view pode resolver para o objeto errado dependendo do `search_path`.

## Como mexer corretamente

1. **Para adicionar/remover uma view de compat:** altere a **allowlist** que a função `evo.fn_ensure_evolution_backcompat_views()` usa — não a view diretamente. (A etapa 11 do plano torna essa função declarativa a partir de uma allowlist versionada; enquanto isso, alterar a função é a única via correta.)
2. **Para mudar o formato de uma view:** mude a definição **dentro** da função geradora, via migration versionada.
3. **Nunca** rode `CREATE OR REPLACE VIEW public.x` ou `DROP VIEW zapp.y` solto.

## Regra para agentes LLM

> Se a tarefa envolve criar/alterar/remover uma view em `public` ou `zapp` cujo nome espelha uma tabela `evolution_*` (ou qualquer tabela de outro schema), **pare** e trate como alteração da função `evo.fn_ensure_evolution_backcompat_views` (via migration + staging), não como DDL de view avulsa.
