# 🔒 Integration Invariants — ZAPP WEB

> **Documento canônico** de invariantes de integração entre frontend, Edge Functions e Supabase (self-hosted).
> Última atualização: **2026-08-04**. Complementa [SCHEMA_REFERENCE.md](./SCHEMA_REFERENCE.md).
> Qualquer código ou doc que viole um invariante abaixo está **errado**, mesmo que funcione.

---

## Invariante 1 — Schema canônico é `zapp`

- Toda chamada PostgREST do frontend (`supabase.from(...)` / `supabase.rpc(...)`) usa o client fixado em `db: { schema: 'zapp' }`.
- **Nada de `.schema('evo')`, `.schema('email_app')` ou `.schema('public')`** em chamadas PostgREST.
- Leituras de dados Evolution são feitas pelas **views `zapp.*`** (ex.: `zapp.evolution_messages_wpp2`, `zapp.evolution_conversations_wpp2`, `zapp.evolution_contacts`, `zapp.evolution_retry_metrics`, `zapp.evolution_instances`, `zapp.evolution_health_logs`, `zapp.evolution_instance_credentials`).
- **Exceção única documentada**: Realtime (`postgres_changes`) em **tabelas físicas** presentes na publicação `supabase_realtime` — inclusive `evo.*` (ex.: `evo.evolution_retry_metrics`, `evo.evolution_messages` para transcrição). Ver [REGRA REALTIME](#regra-realtime).

## Invariante 2 — Views com `security_invoker = on`

- **Toda view nova** (`zapp.*` ou `public.*`) DEVE ser criada com `security_invoker = on`.
- Views sem `security_invoker` herdam privilégios do owner e quebram o modelo RLS.
- Baseline 2026-07-17: 535/535 views em `public` já corrigidas — não regredir.

## Invariante 3 — `contacts`/`messages` são views graváveis

- `zapp.contacts`, `zapp.messages` (e demais bridges Evolution) são **views graváveis** via triggers `INSTEAD OF` (ou auto-updatable quando aplicável).
- **Nunca** transformar essas views em tabelas físicas.
- Escritas passam pelo trigger `INSTEAD OF` → tabela física (ex.: `evo.*`, service_role) ou são roteadas por edge function.

## Invariante 4 — Nunca criar tabela nova

- **Proibido** criar tabela nova fora do padrão.
- **Exceção única**: backups pontuais no formato `_backup_*_yyyymmdd`.

## Invariante 5 — `profiles.onboarding_status` é phantom

- `profiles.onboarding_status` existe apenas em migrations do Cloud (Lovable) — **não existe no banco self-hosted**.
- **Nunca** criar a coluna; nunca ler/gravar `onboarding_status` via PostgREST.

## Invariante 6 — Auditoria de schema via `pg_catalog`

- A fonte da verdade do schema é **`pg_catalog`** (funções, views, policies, triggers, cron jobs).
- **Nunca** auditar via OpenAPI do PostgREST: não enxerga trigger/policy/cron e não distingue view de tabela (foi o erro do GAP REPORT de 16/07, com 6 dos 8 números errados).

---

## REGRA REALTIME

- **Views nunca emitem WAL** → `postgres_changes` em view = canal sobe, mas **zero eventos**.
- Toda subscription `postgres_changes` DEVE apontar para **`schema.table` FÍSICO** presente em `pg_publication_tables` (publicação `supabase_realtime`).
- Conferir antes de assinar: `SELECT schemaname, tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';`
- Tabelas de referência:

| Física | Schema | Observações |
|---|---|---|
| `zapp.voice_conversion_queue` | `zapp` | Física (relkind r), na publicação. Subscription `schema: 'zapp'`. |
| `evo.evolution_retry_metrics` | `evo` | Física; policy `SELECT` para `authenticated` confirmada. Subscription `schema: 'evo'` — `zapp` só tem view. |
| `evo.evolution_messages` | `evo` | Particionada; assinar a **raiz**, nunca a partição (`publish_via_partition_root = true`). Usada para transcrição. |

## REGRA CREDENCIAIS

- **`api_key` nunca trafega via PostgREST** (nem leitura, nem escrita, nem resposta de RPC).
- **Leitura**: view `zapp.evolution_instance_credentials` — **sem coluna `api_key`**, `security_invoker`, RLS.
- **Escrita**: edge function `evolution-credentials` (GET + POST `save`/`delete`), gate **admin/supervisor**, via `service_role` + RPCs `fn_edge_*` (SECURITY DEFINER, `search_path = ''`, EXECUTE só `service_role`).
- **Física**: `evo.evolution_instance_credentials` é **`service_role` only** (RLS) — `authenticated` não toca.
- **Vault**: valores vivem no Supabase Vault; única ponte é a RPC SECURITY DEFINER (`fn_edge_get_evolution_credentials`). A `api_key` sai da edge function apenas no header `X-Evolution-Key` (nunca no body, log ou resposta).
- Detalhes do fluxo em [CREDENTIAL-MAP.md](./CREDENTIAL-MAP.md).

---

## GAP-H — `fn_toggle_user_meme_favorite` 2-arg overload NUNCA conceder `authenticated`

**Contexto:** Existem dois overloads de `zapp.fn_toggle_user_meme_favorite`:
- `fn_toggle_user_meme_favorite(p_meme_id uuid)` — 1 arg, auto-opera sobre `auth.uid()`. GRANT `authenticated` ✅
- `fn_toggle_user_meme_favorite(p_user_id uuid, p_meme_id uuid)` — 2 args, aceita `p_user_id` arbitrário **sem guard interno**. GRANT `authenticated` **PROIBIDO** ❌

**Risco:** Conceder `authenticated` ao overload 2-arg permitiria escalonamento horizontal de privilégio — qualquer usuário autenticado poderia favoritar/desfavoritar memes **como outro usuário** (passando o `user_id` da vítima como `p_user_id`).

**Decisão de segurança (2026-08-04, Auditoria Exaustiva):** O overload 2-arg **não é grantado a `authenticated`**. Só `postgres` e `service_role` têm EXECUTE. Esta decisão é **intencional e permanente** até que a função receba guard interno (`IF p_user_id <> auth.uid() AND NOT zapp.is_admin_or_supervisor() THEN RAISE EXCEPTION ...`).

**Verificação ACL em produção:**
```sql
SELECT has_function_privilege('authenticated', 'zapp.fn_toggle_user_meme_favorite(uuid,uuid)', 'EXECUTE');
-- DEVE retornar false
```

**Jamais "corrigir" isso adicionando o GRANT** — seria uma regressão de segurança.

---

## RECOMENDAÇÃO PGRST

- `PGRST_DB_SCHEMAS` atual: `public`, `zapp`, `storage`, `graphql_public`, `artes`, `vendas`, `financeiro`.
- `evo` / `email_app`: **NUNCA adicionar** ao PostgREST.
- **Pendente de aprovação** (não executar sem janela): separar `artes`, `vendas`, `financeiro` para outro PostgREST — outros apps dependem desses schemas; requer aprovação e janela de manutenção.

---

## Guardrails (CI)

- **ESLint** (`eslint.config.js`): proíbe `.schema('evo')` e `.schema('email_app')` em código de app; proíbe `schema: 'public'` em `postgres_changes`.
- **`scripts/audit-contract.mjs`**: valida `RPC`/`from`/`invoke` do código contra o banco (drift contract).
- **`scripts/check-schema-usage.mjs`**: guardrail bloqueante no CI para uso de schema (legado — ver [SCHEMA_REFERENCE.md](./SCHEMA_REFERENCE.md)).
