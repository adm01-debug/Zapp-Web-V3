# Boundary — Evolution API: o que fica aqui, o que foi para evolution-stack

**Separação realizada em:** 2026-08-12/13  
**Repo de infra:** https://github.com/adm01-debug/evolution-stack

## Regra de decisão

| Pergunta | Resposta | Repo |
|---|---|---|
| É o servidor da Evolution API, imagem Docker, stack Portainer, worker Python? | sim | `evolution-stack` |
| Chama a Evolution API a partir do app React ou de um Edge Function Supabase? | sim | `zapp-web-v3` ← aqui |

## O que FICA neste repo (e por quê)

| Grupo | Arquivos | Por quê |
|---|---|---|
| Adapters TS | `src/adapters/evolution*` | Código React que chama a API |
| Hooks React | `src/hooks/evolution*` | Estado browser-side |
| Libs cliente | `src/lib/evolution*` | Circuit breaker, retry, diagnostics do browser |
| Integração | `src/integrations/zappweb/evolutionClient.ts` | HTTP client do app |
| Tipos | `src/types/evolutionExternal.ts` | Tipos consumidos pelo app |
| Edge Functions | `supabase/functions/evolution-*` | Deployadas via Supabase CLI COM este repo |
| Shared Deno | `supabase/functions/_shared/evolution-*` | Shared libs das edge functions |
| Migrations | `supabase/migrations/*evolution*` | Schema do banco deste projeto — intocável |
| Testes | `e2e/*evolution*`, `src/**/__tests__/*evolution*` | Testam o cliente |

## O que FOI para evolution-stack

| Item |
|---|
| Servidor Evolution API (Dockerfile, build-patches, docker-entrypoint) |
| Consumer RabbitMQ → Supabase (`consumer/consumer.py`) |
| Todos os stacks Portainer (`stacks/evolution*.yml`) |
| Watchdogs (4 scripts alpine) |
| Scripts operacionais (evo-forceupdate, security-guardian, purge) |
| Workflows de build (publish-evolution-api-custom, consumer, update-check) |
| GitOps (gitops-stacks.yml) |
| Runbooks de infra (DR, RabbitMQ bindings, tables inventory) |
| ADR-004 (bridge webhook — decisão de arquitetura de infra) |
| Consumer HMAC remediation |

## O que NÃO fazer

- **Não mover** `src/`, `supabase/functions/` ou `supabase/migrations/` para evolution-stack.  
  Isso quebra o build Bun, o deploy Supabase CLI e o histórico de migrations.
- **Não usar** `docs/infra/evolution-stack.reconciled.DEPRECATED.yml` para redeploy.  
  O arquivo tem namespace e digest obsoletos. Fonte da verdade: [evolution-stack/stacks/evolution.yml](https://github.com/adm01-debug/evolution-stack/blob/main/stacks/evolution.yml).

## Auditoria classificatória (2026-08-13)

- 38 arquivos `src/` confirmados como código cliente TypeScript/React
- 9 edge functions `supabase/functions/evolution-*` confirmadas como Deno/Supabase
- 6 migrations `supabase/migrations/*evolution*` mantidas como histórico de schema
- 3 suítes e2e + 6 testes unitários confirmados como testes do cliente
- TypeScript: 0 erros pré/pós operação (baseline limpo)
