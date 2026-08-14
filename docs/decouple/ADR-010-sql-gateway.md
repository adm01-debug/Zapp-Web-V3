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
CI (sobre o snapshot commitado — ver "Integração com o CI" abaixo) e falha o
build caso qualquer função SQL desvie desse padrão.

## Integração com o CI

O gate de egresso SQL roda no CI **sobre um fixture snapshot commitado**, nunca
contra o banco vivo:

- **Por quê:** o runner do CI (ubuntu-latest) **não tem acesso ao banco** de
  produção (Supabase self-hosted na VPS). O report que o gate consome é gerado
  por uma query em `pg_proc`/`pg_namespace` — só executável onde o banco existe.
- **Fixture canônico:** `scripts/decouple/fixtures/sql_report_snapshot.json` —
  um array `[{"fn":"schema.fn","prosrc":"..."}, ...]` com o estado do egresso
  SQL na data da última regeneração. O CI roda o gate sobre esse arquivo:
  `node scripts/decouple/sql-gate.mjs scripts/decouple/fixtures/sql_report_snapshot.json`
  (ou via runner único: `SQL_REPORT_PATH=scripts/decouple/fixtures/sql_report_snapshot.json node scripts/decouple/run-all-gates.mjs`).
- **Regeneração do fixture (com acesso ao banco):** a query geradora é impressa
  pelo próprio gate — `node scripts/decouple/sql-gate.mjs --sample`. O report
  gerado deve ser salvo em `scripts/decouple/fixtures/sql_report_snapshot.json`
  e commitado junto com a mudança que motivou a regeneração.
- **Regras do gate** (qualquer violação → exit 1): (1) fn nos schemas
  `evo`/`zapp`/`ops`/`public` cujo `prosrc` chama `net.http_get(`/`net.http_post(`
  e menciona `evolution` SEM usar `ops.fn_evo_url()`/`ops.fn_evo_key()` →
  violação; (2) `prosrc` lendo `vault.decrypted_secrets` com `evolution_api_url`
  fora dos resolvers → violação. Whitelist nominal: `ops.fn_evo_url`,
  `ops.fn_evo_key`, `zapp.fn_check_license_heartbeat`, `evo.fn_detect_instance_recreate`.
- **Snapshot envelhece:** se o banco ganhar uma fn de egresso nova sem o fixture
  ser regenerado, o CI não enxerga a mudança. Regenerar o fixture sempre que a
  4ª porta (Postgres→Evolution) for alterada, e conferir 0 violações no snapshot
  novo antes de commitar.

Query geradora do report (`node scripts/decouple/sql-gate.mjs --sample`):

```sql
SELECT COALESCE(json_agg(t), '[]'::json)::text
FROM (
  SELECT n.nspname || '.' || p.proname AS fn,
         p.prosrc
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE (p.prosrc ~ 'net\.http_' OR p.prosrc ~ 'vault\.decrypted_secrets')
    AND n.nspname IN ('evo', 'zapp', 'ops', 'public')
  ORDER BY 1
) t;
```

Regeneração na VPS (exemplo, substitua `<pg_container>` e `<db>`):

```bash
docker exec -i <pg_container> psql -U postgres -d <db> -At \
  -c "SELECT COALESCE(json_agg(t), '[]'::json)::text FROM (SELECT n.nspname || '.' || p.proname AS fn, p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE (p.prosrc ~ 'net\.http_' OR p.prosrc ~ 'vault\.decrypted_secrets') AND n.nspname IN ('evo','zapp','ops','public') ORDER BY 1) t;" \
  > scripts/decouple/fixtures/sql_report_snapshot.json
node scripts/decouple/sql-gate.mjs scripts/decouple/fixtures/sql_report_snapshot.json
```

> Estado em 2026-08-14 (tarde): o gate (`sql-gate.mjs`), o runner
> (`run-all-gates.mjs`) e o teste de regressão 5/5
> (`scripts/decouple/__tests__/sql-gate.test.mjs`) já estão no repo; **o arquivo
> do fixture e o wiring do passo no workflow de CI ainda não estão commitados** —
> regenerar via `--sample` e commitar o snapshot junto com o wiring.

## Consequências

### Positivas

- Ponto único de resolução de credenciais no Postgres: rotacionar URL/chave não
  exige alterar as funções de negócio.
- Menos indireção que o `ops.fn_provider_http` genérico prescrito no plano V2 —
  menos código, menos superfície de teste.
- O gate no CI impede regressão (reintrodução de URL hardcoded ou montada),
  rodando sobre snapshot commitado — sem depender de acesso a banco no runner.
- Gate testável sem banco: 5/5 cenários de regressão
  (`node --test scripts/decouple/__tests__/sql-gate.test.mjs`) rodam sobre
  reports sintéticos; o CI valida o snapshot commitado.
- Segredos não transitam em literais de código-fonte nem em migrações.

### Negativas

- Resolvers são específicos da Evolution (acoplamento nominal ao provider);
  trocar de provider exige novos resolvers.
- Dependência de runtime do `vault.decrypted_secrets`: indisponibilidade do vault
  derruba as 5 funções de egresso.
- O snapshot commitado pode envelhecer em relação ao banco (drift banco×fixture)
  se não for regenerado ao alterar a 4ª porta — mitigado pelo procedimento de
  regeneração acima.
- Cobre apenas a porta Postgres→Evolution; edge functions seguem o gateway do
  ADR-009 (`supabase/functions/_shared/providers/evolution/client.ts`).

## Referências cruzadas

- ADR-009 — gateway pattern para edge functions.
- `docs/decouple/PLANO_DESACOPLAMENTO_V3_100_ETAPAS.md` — etapa F3.
- `scripts/decouple/sql-gate.mjs` — gate de CI que valida esta ADR (uso:
  `node sql-gate.mjs <report.json>` ou `--sample` para a query geradora).
- `scripts/decouple/run-all-gates.mjs` — runner sequencial (inventory →
  ownership → sql), aceita `SQL_REPORT_PATH` para apontar o fixture.
- `scripts/decouple/__tests__/sql-gate.test.mjs` — teste de regressão do gate
  (5 cenários: egresso hardcoded, fn compliant, falsos positivos legítimos,
  entry null sem crash, report malformado → exit 2).
- `scripts/decouple/fixtures/sql_report_snapshot.json` — fixture canônico do
  report (a commitar junto com o wiring do CI).
