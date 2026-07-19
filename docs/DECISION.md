# DECISION.md — Registro de Decisões de Arquitetura (ADR)

> **Arquitetura atual**: Supabase Self-Hosted (`supabase.atomicabr.com.br`), schema `zapp`. Veja [SCHEMA_REFERENCE.md](SCHEMA_REFERENCE.md).


> **Última atualização:** 2026-07-05  
> **Status:** 🟢 ATIVO — aplica-se a todos os projetos do monorepo

---

## ADR-001 — Canonicidade do Schema: Self-Hosted `zapp` é a Fonte da Verdade

### Contexto

Em 2026-07-05 foi realizada uma auditoria exaustiva byte-a-byte comparando:
- **Cloud Lovable** (`uqysyzndkfiwfztbqvsl.supabase.co`) — schema `public`
- **Self-Hosted VPS** (`supabase.atomicabr.com.br`) — schema `zapp`

O pacote de espelhamento `ALL_IN_ONE.sql` (5.8k linhas, gerado pelo Lovable) **não foi aplicado**.

### Evidências da Auditoria

| Métrica | Cloud `public` | `zapp` self-hosted |
|---|---:|---:|
| Tabelas | 146 | 155 |
| Linhas de dados | **766** | **71.513** |
| Funções SECDEF | 105 | 600+ (schema `public`) |
| Edge Functions (Deno) | — | **118 deployadas** |
| Buckets Storage | 7 | 7 (+ 9 extras) |
| Maior tabela | evolution_retry_metrics (484) | webhook_audit_log (21.286) |

O Cloud está **praticamente vazio** (766 linhas em 146 tabelas). O `zapp` self-hosted é o sistema **real e em produção**.

### Decisão: Cenário B — `zapp` Self-Hosted é Canônico

**Aprovado em:** 2026-07-05  

O schema `zapp` no self-hosted é a **única fonte da verdade** para:
- Schema (tabelas, colunas, constraints, índices, FKs)
- Dados de produção
- RLS policies
- Triggers

O Cloud Lovable é usado exclusivamente como **ambiente de preview/prototipação** do frontend (Lovable AI). Qualquer mudança de schema que o Lovable gerar deve ser:
1. Revisada manualmente
2. Adaptada para o schema `zapp` (não `public`)
3. Testada via `ops.run_all_checks()` antes de aplicar

### Consequências

#### O que muda
- ❌ **`ALL_IN_ONE.sql` está CONGELADO** — não aplicar. Tratá-lo como referência histórica.
- ❌ **Cloud não é origem** — nunca executar dump/restore do Cloud para o `zapp`.
- ✅ **Lovable** continua sendo usado para prototipação de UI; o schema gerado por ele é uma *sugestão*, não uma prescrição.
- ✅ **Migrations** continuam na pasta `/supabase/migrations/` via PR no GitHub, aplicadas via `psql` no VPS.
- ✅ **Tipos TypeScript** devem ser gerados a partir do schema real do VPS, não do Cloud.

#### Arquitetura de camadas (documentada)

```
Frontend (zapp-web-v3) → PostgREST (public.*)
                                     ↓
                         Views public.* (security_invoker=true)
                                     ↓
                         Tabelas zapp.* (fonte da verdade)
```

- `public` é a **camada API** (views + RPCs SECDEF, 600+ funções, 1050 grants)
- `zapp` é a **camada de dados** (155 tabelas base, 71k+ linhas, RLS 100%)
- `evo` é a **camada Evolution API** (mensagens, instâncias, webhooks)
- `ops` é a **camada de observabilidade** (guards, checks, drift logs, registries)

### Regras derivadas desta decisão

1. **Nunca** criar tabela em `public` sem criar a view correspondente em `public` sobre `zapp`.
2. **Nunca** alterar schema via Cloud Lovable sem passar pelo processo de PR+migration.
3. **Sempre** rodar `SELECT * FROM ops.run_all_checks()` após qualquer migration.
4. **Sempre** rodar `SELECT * FROM ops.fn_regression_tests()` em qualquer deploy.
5. **Sempre** manter `ops.edge_function_registry` atualizado após deploy de edge functions.
6. **Nunca** usar `(supabase as any).from(...)` ou `.rpc(... as never)` no frontend (CI guard).

### Exceções

- **`evo` schema**: gerenciado pelo Evolution API (externo), não pelo time de produto.
- **`auth` schema**: gerenciado pelo Supabase GoTrue, nunca modificar diretamente.
- **`extensions` schema**: extensões PostgreSQL, ler-only.

---

## ADR-002 — Geração de Tipos TypeScript

**Status:** 🟡 PENDENTE de implementação  
**Decisão:** Tipos devem ser gerados a partir do VPS self-hosted, não do Cloud.

```bash
# Correto:
npx supabase gen types typescript \
  --db-url "postgresql://postgres:...@supabase.atomicabr.com.br:5432/postgres" \
  > src/integrations/supabase/types.ts

# ERRADO (stale do Cloud):
# npx supabase gen types typescript --project-id uqysyzndkfiwfztbqvsl
```

---

## ADR-003 — Frozen Assets

Os seguintes artefatos são **read-only**. Não alterar sem nova ADR.

| Arquivo | Status | Razão |
|---|---|---|
| `supabase/migrations/all_in_one_cloud_mirror/ALL_IN_ONE.sql` | 🧊 CONGELADO | Cloud vazio não é origem |
| `supabase/migrations/all_in_one_cloud_mirror/data/*.csv` | 🧊 CONGELADO | 766 linhas do Cloud, irrelevante |
| `supabase/migrations/all_in_one_cloud_mirror/10_buckets.json` | ✅ Aplicado | 7 buckets já existem no VPS |

---

## Histórico de Decisões

| Data | ADR | Decisão | Responsável |
|---|---|---|---|
| 2026-07-05 | ADR-001 | `zapp` self-hosted é canônico | Auditoria Pink e Cérebro + Claude |
| 2026-07-05 | ADR-002 | Tipos gerados do VPS | Auditoria |
| 2026-07-05 | ADR-003 | ALL_IN_ONE.sql congelado | Auditoria |
