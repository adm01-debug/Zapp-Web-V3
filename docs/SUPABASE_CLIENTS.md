# Supabase Clients — Realidade do Frontend

> Documento de verdade sobre os clients Supabase no frontend ZAPP Web.
> Data: **2026-08-05**. Fonte: leitura direta do código (worktree `zapp-wt-plano30`).
> Conclusão central: **existe UM ÚNICO client real**. Qualquer outra nomenclatura é rótulo histórico ou cosmético.

## (a) O único client real

| Atributo | Valor |
|---|---|
| Arquivo | `src/integrations/supabase/client.ts` |
| URL | `https://supabase.atomicabr.com.br` (self-hosted, AtomicaBR VPS) — `SELF_HOSTED_URL`, linha 24 |
| Schema | `db: { schema: 'zapp' }` (linhas 540–545) |
| Export | `supabase` (createClient do supabase-js) |
| Hardening | Bounded fetch (12s, linha 136), concurrency gate (6 req, ~linha 140+), `shouldRetryFetchError` (linha 361), rejeita URL `.supabase.co` (linhas 67–69, 98–103) |

- NÃO existe um client chamado `lovableCloud` em lugar nenhum do frontend.
- NÃO existe um segundo client real: `externalClient.ts` é um **shim de compatibilidade** desde a consolidação de 2026-07-15 (`externalSupabase = supabase`, linhas 28–30; comentário nas linhas 5–11).
- `VITE_EXTERNAL_SUPABASE_*` é ignorada (aviso em DEV, `externalClient.ts:19-26`).

## (b) `'lovable'` / `'external'` são rótulos históricos

O tipo `DatasourceClient = 'lovable' | 'external'` (`src/integrations/datasource/registry.ts:60`) é um vestígio da arquitetura "dois Supabase" eliminada em 2026-07-15. Hoje:

- **`ENTITY_MAP` inteiro usa `client: 'lovable'`** (`registry.ts:69-103`) — todas as entidades lógicas apontam para o client principal.
- **`dbClient(entity)`** (`db.ts:48-57`): `client === 'external' ? externalSupabase : supabase` — e `externalSupabase` **é** o `supabase` (shim).
- **`rpcClient(client)`** (`db.ts:100-106`): mesma resolução para o catálogo de RPCs.
- Ou seja: os dois rótulos **resolvem para a mesma instância de client** (`supabase` de `client.ts`, schema `zapp`, self-hosted). A ramificação é morta; manter o rótulo `'external'` no catálogo custa zero e não cria segundo client.

## (c) `'lovableCloud'` na telemetria = rótulo cosmético (dívida coordenada)

Em `src/integrations/datasource/db.ts:124` (dentro de `dbRpc`):

```ts
// Telemetry source id — 'lovableCloud' é literal de identificação mantido de
// propósito (dashboards de telemetria dependem dele); 'external' mapeia para
// 'selfHosted'. O app não roda mais em um Lovable separado.
const source = def.client === 'external' ? 'selfHosted' : 'lovableCloud';
```

- Todo RPC com `client: 'lovable'` (ou seja, **todos** do catálogo) reporta `source: 'lovableCloud'` em `recordQueryEvent` — mesmo sendo executado 100% no self-hosted.
- A string é **cosmética**: nenhum roteamento depende dela, mas **dashboards/alertas de observabilidade dependem da string**.
- Renomear `'lovableCloud'` → `'selfHosted'` é **dívida técnica com plano de renomeação coordenado**: exige migração simultânea dos dashboards e consultas de telemetria (senão a série histórica quebra). Não fazer isoladamente.

## (d) Roteamento por operação — realidade

| Operação | Rótulo no registry | Client resolvido | Backend real |
|---|---|---|---|
| `dbFrom` / `dbChannel` / `dbRpc` (todas as entidades `ENTITY_MAP`) | `'lovable'` | `supabase` (client.ts) | **self-hosted** (`zapp`) |
| Todas as RPCs do catálogo (`rpcCatalog.ts`) | `'lovable'` | `supabase` | **self-hosted** |
| **`get_companies_by_phones_batch`** (`rpcCatalog.ts:500-503`) | `'lovable'` | `supabase` | **self-hosted — sempre foi** |
| `get_contacts_360_batch` (`rpcCatalog.ts:490-493`) | `'lovable'` | `supabase` | **self-hosted** |
| `rpc_get_contact_summary_batch` / `rpc_get_reactions_batch` (chamadas diretas `supabase.rpc`) | — | `supabase` | **self-hosted** |
| Qualquer def com `client: 'external'` (não existe no catálogo atual) | `'external'` | `externalSupabase` (shim = `supabase`) | **self-hosted** (mesmo client) |
| Realtime (canais diretos via `supabase.channel`) | — | `supabase` | **self-hosted** |

**Implicação**: a hipótese do plano de 30 etapas de que `get_companies_by_phones_batch` poderia estar roteando para um "lovableCloud" é **refutada** — não há segundo client para onde rotear (ver `docs/audits/PLANO30_DIAGNOSTICO_REAL.md`, item #3).

## (e) Convenção de import

- **Importar SEMPRE de `@/integrations/supabase/client`** (export `supabase`).
- `externalClient.ts:10` (shim): *"Novos módulos devem importar de `@/integrations/supabase/client`"*.
- Não importar de `externalClient` em código novo (mantido só para os ~37 consumidores legados).
- Não criar novos clients `createClient()` — o hardening (timeout, concurrency gate, retry policy, schema `zapp`) vive **somente** no `client.ts`.
- Tipos: via barrel `@/integrations/supabase/schema` (ver `docs/SCHEMA_REFERENCE.md`, Regra de Ouro 3).

---

*Documentação de realidade — nenhum arquivo `.ts`/`.tsx` foi modificado para produzir este doc.*
