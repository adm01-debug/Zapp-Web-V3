---
name: ADR-010-sql-gateway
status: Accepted
date: 2026-08-14
---

# ADR-010: SQL Gateway — resolução centralizada de credenciais Evolution em PL/pgSQL

## Contexto

O plano de desacoplamento V2 prescrevia a criação de um resolver HTTP genérico
(`ops.fn_provider_http`) para centralizar o egresso de chamadas HTTP feitas por
funções PL/pgSQL.

A implementação real, porém, adotou um caminho mais simples e suficiente: dois
resolvers especializados, `ops.fn_evo_url()` e `ops.fn_evo_key()`, que leem as
credenciais da Evolution API a partir de `vault.decrypted_secrets`. Essa decisão
elimina a indireção de um provider genérico sem sacrificar o objetivo central:
nenhuma função SQL conhece ou monta o endpoint da Evolution diretamente.

## Decisão

Toda chamada HTTP de funções PL/pgSQL à Evolution API resolve `url` e `key`
SOMENTE por meio de `ops.fn_evo_url()` e `ops.fn_evo_key()`, seguido de
`net.http_get`/`net.http_post`. Aplicam-se às 5 funções de egresso:

- `fn_outbound_dispatch` — envio em produção via cron `outbound-queue-dispatch`
- `fn_reconcile_dispatch`
- `ops.fn_notify_critical_alerts`
- `evo.fn_sync_lid_from_api`
- `zapp.fn_validate_whatsapp_connection_url`

Nenhuma função SQL monta endpoint com a string `evolution_api_url` direta (nem
hardcoded nem lida de settings). O gate `scripts/decouple/sql-gate.mjs` roda no
CI e falha o build caso qualquer função SQL desvie desse padrão.

## Consequências

### Positivas

- Ponto único de resolução de credenciais no Postgres: rotacionar URL/chave não
  exige alterar as funções de negócio.
- Menos indireção que o `ops.fn_provider_http` genérico prescrito no plano V2 —
  menos código, menos superfície de teste.
- O gate no CI impede regressão (reintrodução de URL hardcoded ou montada).
- Segredos não transitam em literais de código-fonte nem em migrações.

### Negativas

- Resolvers são específicos da Evolution (acoplamento nominal ao provider);
  trocar de provider exige novos resolvers.
- Dependência de runtime do `vault.decrypted_secrets`: indisponibilidade do vault
  derruba as 5 funções de egresso.
- Cobre apenas a porta Postgres→Evolution; edge functions seguem o gateway do
  ADR-009 (`supabase/functions/_shared/providers/evolution/client.ts`).

## Referências cruzadas

- ADR-009 — gateway pattern para edge functions.
- `docs/decouple/PLANO_DESACOPLAMENTO_V3_100_ETAPAS.md` — etapa F3.
- `scripts/decouple/sql-gate.mjs` — gate de CI que valida esta ADR.
