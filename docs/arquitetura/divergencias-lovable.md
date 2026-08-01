# Divergências Deliberadas: Schema Lovable (Cloud) vs Self-Hosted

- **Data da auditoria:** 2026-08-01
- **Contexto:** migração do Supabase cloud (Lovable) → Supabase **self-hosted** `supabase.atomicabr.com.br`
- **Repositório:** adm01-debug/zapp-web-v3 (worktree `C:/c/tmp/wt-audit`)

Este documento registra **4 divergências** identificadas na comparação de schema e **mantidas deliberadamente** — cada uma com veredito e justificativa. Nenhuma delas deve ser "corrigida" cegamente para espelhar o Lovable.

---

## (a) `profiles.onboarding_status` AUSENTE no self-hosted; `is_online` no lugar

| | Lovable (cloud) | Self-hosted |
|---|---|---|
| `profiles.onboarding_status` | presente (string) | **ausente** |
| `profiles.is_online` | — | presente (**boolean**) no lugar |

**Uso no front (verificado no repo):** `grep` por `onboarding_status` em `src/` encontra o termo **apenas** em `src/integrations/supabase/types.ts` — **3 ocorrências de tipo** (linhas 5265, 5292, 5319). **Nenhum componente, hook ou chamada** utiliza a coluna.

**Veredito:** divergência **aceita**. Sem uso no front, a coluna não foi migrada; `is_online` (boolean) ocupa o espaço funcional. Reintroduzir apenas se o front passar a consumir o onboarding — sem previsão.

---

## (b) Enum `app_role` com ordenação divergente

| Ambiente | Ordenação dos valores |
|---|---|
| **Self-hosted** | `admin`, `manager`, `supervisor`, `agent`, `special_agent`, `dev` |
| **Lovable** | `admin`, `supervisor`, `agent`, `special_agent`, `dev`, `manager` |

Conjunto de valores **idêntico**; **ordem ordinal diferente** (posição de `manager`).

**Veredito: NO-GO reordenar.** A reordenação é **cosmética** e **colide com o contrato PostgREST**: enums Postgres são ordenados pelo ordinal — reordenar exige `ALTER TYPE ... RENAME`/rebuild com lock, pode invalidar índices/constraints existentes e muda resultados de `ORDER BY` em qualquer consulta que ordene pela coluna enum. **Manter a ordenação self-hosted como está; nenhuma migration de reordenação.**

---

## (c) `warroom_alert_type` ausente como enum (coluna `text`)

| | Lovable (cloud) | Self-hosted |
|---|---|---|
| `warroom_alert_type` | tipo **enum** (inclui valor `sla_breach`) | coluna **`text`**, sem enum |

**Valores reais em produção (contagem):**

| Valor | Ocorrências |
|---|---|
| `info` | 3379 |
| `critical` | 769 |
| `warning` | 199 |
| `sla_breach` | **0** (nenhuma ocorrência) |

**Veredito:** divergência **aceita**. Sem dados para `sla_breach`, criar o enum não traria ganho e exigiria cast da coluna com risco de falha. **Monitorar**: se `sla_breach` passar a ser gravado, reavaliar a criação do enum.

---

## (d) 4 UNIQUEs ausentes no self-hosted (0 duplicatas confirmadas)

Constraints UNIQUE presentes no Lovable e **ausentes** no self-hosted:

| Tabela | Coluna | Duplicatas confirmadas |
|---|---|---|
| `conversation_memory` | `contact_id` | 0 |
| `permissions` | `name` | 0 |
| `tags` | `name` | 0 |
| `talkx_blacklist` | `contact_id` | 0 |

**Veredito:** divergência **aceita temporariamente**, mas com **ação recomendada**: com **0 duplicatas confirmadas** em todos os casos, adicionar as 4 constraints UNIQUE é **seguro** — são candidatas a migration de hardening (sem necessidade de dedupe prévio).

---

## Tabela-resumo

| # | Divergência | Veredito | Ação |
|---|---|---|---|
| (a) | `onboarding_status` ausente / `is_online` no lugar | Aceita | Nenhuma |
| (b) | Enum `app_role` com ordenação divergente | **NO-GO** reordenar | Nenhuma (manter self-hosted) |
| (c) | `warroom_alert_type` text (sem enum; sem `sla_breach`) | Aceita | Monitorar surgimento de `sla_breach` |
| (d) | 4 UNIQUEs ausentes (0 duplicatas) | Aceita temporariamente | Adicionar UNIQUEs (migration de hardening) |
