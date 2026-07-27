# Plano de Organização e Documentação do Banco — `zapp-web-v3`
## 50 Etapas · "Cada coisa no seu lugar" + Documentação Exaustiva para Devs e Agentes LLM

**Papel:** Analista de Sistemas Sênior / DBA · **Data:** 27/07/2026
**Alvo:** Supabase self-hosted (AtomicaBR) — `supabase.atomicabr.com.br` · PostgreSQL 15.8
**Método:** Auditoria **somente-leitura** do catálogo (`pg_catalog`, `information_schema`, `cron.*`). **Nenhuma alteração foi executada.**
**Natureza:** PLANO. Nada aqui deve ser executado antes de aprovação e ambiente de staging.

> Dois propósitos: (1) sequenciar as correções que colocam cada objeto no seu schema correto; (2) base para a documentação viva em `docs/db/`, que impede devs humanos ou agentes LLM de mexerem onde não devem.

---

# PARTE 1 — SUMÁRIO EXECUTIVO

## 1.1 Veredito de arquitetura (validado contra o banco real)

Pretendido: `zapp` = app ZAPP Web · `evo` = Evolution API · `public` = neutro.

| Schema | Papel pretendido | Realidade medida | Conformidade |
|---|---|---|---|
| **`evo`** | Evolution API | 165 tabelas `evolution_*` com os dados reais (41.462 msgs, 25.906 mídias, 20.638 contatos) + ~11 tabelas de ops/tooling | ⚠️ Parcial (vazamento de ops) |
| **`zapp`** | App ZAPP Web | 320 tabelas reais do app ✓ + 406 views (254 espelham o `evo`) + 1.052 funções | ⚠️ Parcial (espelha a Evolution) |
| **`public`** | Nada dos 2 sistemas | 1 tabela real + 539 views (300→`zapp`, 182→`evo`, 41→`bpm`, 12→`vendas`, 3→`logistica`) | ❌ Fachada sobre tudo |

**Sem duplicação de dados:** o dado do WhatsApp existe uma vez, no `evo`. As cópias em `public`/`zapp` são views.
**Segurança:** todas as views têm `security_invoker=on` → respeitam o RLS das tabelas base. Problema de arquitetura/manutenção, não de furo de RLS.

## 1.2 O que está fora do lugar

1. `public` é fachada de API (o PostgREST expõe `public` por padrão; app chama `/rest/v1/*`).
2. `evo` contaminado por ops (`vps_*`, `ops_runbooks`, `migration_watermark`, `_secure_config`, `idx_usage_audit`, `_snapshot_version_state`).
3. `zapp` espelha o `evo` (254 views) e concentra lógica de pipeline Evolution em `zapp.fn_*`.
4. Tabela real "perdida" no `public` (`_wal_slot_guard_events`) + 9 extensões em `public`.
5. 91% dos índices nunca usados (1.987 de 2.176).
6. Drift de migrations: 52 registradas × 944 arquivos; 4 versões malformadas.
7. Fachada auto-mantida por cron `ensure-evolution-backcompat-views` (6/6h).

---

# PARTE 2 — MAPA DE EVIDÊNCIAS

- PostgreSQL **15.8** · **225 schemas** · **832 tabelas base** · **159 MB** de índices.

| Schema | Tabelas | Views | Matviews | Funções | Triggers | Papel |
|---|---:|---:|---:|---:|---:|---|
| `zapp` | 320 | 406 | 6 | 1.052 | 219 | App ZAPP Web |
| `evo` | 193 | 16 | 4 | 69 | 446 | Evolution API |
| `public` | 1 | 539 | 0 | 145 | 9 | Camada de API |
| `bpm` | 41 | 0 | 0 | — | 32 | BPM |
| `email_app` | 33 | 0 | 0 | — | 23 | E-mail |
| `ai` | 31 | 0 | 0 | — | 14 | IA |
| `archive` | 25 | 0 | 0 | 2 | 1 | Frio/backup |
| `ops` | 20 | 4 | 0 | 47 | — | Infra |
| `financeiro` | 16 | 11 | 0 | 45 | 19 | Financeiro |
| `vendas` | 14 | 5 | 0 | 21 | 12 | Vendas |
| `logistica` | 3 | 0 | 0 | — | 2 | Logística |
| `artes` | 2 | 1 | 0 | 15 | 1 | Artes |

**Storage:** `whatsapp-media` 🔴 público (5.088 obj / 9,56 GB de mídia de cliente); `recibos-entrega` 🔴 público (pode ter PII); privados corretos: `comprovantes-financeiro`, `email-attachments`, `etiquetas-remessa`, `fechamentos`, `audio-messages`, `team-chat-files`, `quarantine`.

**Índices:** 2.176 total · 1.987 sem uso (91%) · 3 duplicatas. **Particionamento:** `evolution_messages`/`_conversations`/`_webhook_events` → 23 partições cada. **Crons:** 80+ ativos, 22.239 ok / 7 falhas em 7d.

**Achados que viram etapas:** migrations 52×944 + versões malformadas (`20260716`, `20260717`, `20260722`, `20260722.2`); JID×UUID (`remote_jid` text vs `contact_id` uuid); 18 tabelas RLS-on-sem-policy (`zapp._lgpd_payload`⚠); 9 extensões em `public`.

---

# PARTE 3 — ARQUITETURA-ALVO

**Direção permitida:** `public (API) → domínios → dados`. **Proibido:** `evo → zapp`.

| Camada | Schemas | Contém | NÃO contém |
|---|---|---|---|
| API | `public` | Views `security_invoker` + RPC de contrato | Tabela de negócio; extensões; lógica |
| Integração | `evo` | Dados + lógica Evolution (`evolution_*`, partições) | Ferramental de ops |
| Produto | `zapp` | Dados + RPC do app | Cópias do `evo` (só contrato curado) |
| Negócio | `bpm`, `vendas`, `financeiro`, `email_app`, `ai`, `logistica`, `artes` | Cada módulo isolado | Objetos de outro módulo |
| Infra | `ops`, `monitoring` | Crons de infra, auditoria, guardrails | Dado de negócio |
| Frio | `archive`, `_backups` | Backups datados, depreciados | Objetos vivos |
| Plataforma | `auth`, `storage`, `realtime`, `vault`, `extensions`, `cron`, `pgmq`, `supabase_*` | Componentes Supabase/Postgres | **Não tocar** |

---

# PARTE 4 — AS 50 ETAPAS

**Regras:** uma mudança estrutural por vez (migration versionada + staging); nenhuma etapa fecha sem aceite verificável; Onda 0 é bloqueante. `E`=esforço (P/M/G) · `R`=risco (🟢🟡🔴).

## 🛡️ ONDA 0 — SALVAGUARDAS (bloqueante)
1. **Staging + freeze de DDL em produção.** *Aceite:* DDL manual em prod bloqueado/alertado. `E:G·R:🟡`
2. **Baseline imutável** (`pg_dump --schema-only` + contagens em `docs/db/baseline/`). `E:P·R:🟢`
3. **Guardrail de DDL fora do fluxo** (`ops.fn_guardrails_check` bloqueante). `E:M·R:🟢`
4. **Congelar refatorações concorrentes.** `E:P·R:🟢`

## 🧭 ONDA 1 — FRONTEIRAS DE SCHEMA
5. **`docs/db/SCHEMA-CONTRACT.md`** normativo. `E:M·R:🟢`
6. **ADR destino do `public`** (A: API imutável · B: `PGRST_DB_SCHEMAS`). `E:M·R:🟡`
7. **Mover `public._wal_slot_guard_events` → `ops`.** `E:P·R:🟡`
8. **Realocar 9 extensões de `public` → `extensions`** (por último). `E:M·R:🔴`
9. **Repatriar ops do `evo` → `ops`** (`vps_*`, `ops_runbooks`, `migration_watermark`, `_secure_config`, `idx_usage_audit`, `_snapshot_version_state`; manter `contact_id_graveyard`). `E:M·R:🟡`
10. **Racionalizar 254 views `zapp→evo`** → contrato curado; espelho deprecated. `E:G·R:🟡`
11. **Governar cron da fachada** (`fn_ensure_evolution_backcompat_views` declarativo por allowlist). `E:M·R:🟡`
12. **ADR onde mora a lógica de pipeline Evolution** (`zapp.fn_*` WhatsApp). `E:G·R:🟡`
13. **Qualificar comandos de cron sem schema** (job 15). `E:P·R:🟢`
14. **Classificar as 145 funções do `public`.** `E:M·R:🟢`
15. **Consolidar schemas órfãos** (`_backups`, `parity_audit`). `E:M·R:🟡`

## 🗄️ ONDA 2 — TABELAS, TIPOS, CONSTRAINTS, RLS
16. **Baseline squash das migrations** (52×944; exige etapa 1). *Aceite:* diff zero. `E:G·R:🔴`
17. **Corrigir versões malformadas + gate de CI.** `E:P·R:🟡`
18. **Unificar as duas árvores** (`supabase/migrations` vs `infra/migrations`). `E:M·R:🟡`
19. **`DOMAIN jid` (JID×UUID)** + branded types. *Aceite:* 30 dias sem `22P02`. `E:G·R:🟡`
20. **Blindar 18 tabelas RLS-on-sem-policy** (`zapp._lgpd_payload` auditar PII). `E:M·R:🟡`
21. **Auditoria de FKs** nas quentes. `E:M·R:🟡`
22. **Reverter `whatsapp-media` público** → URLs assinadas + cache; parecer LGPD. `E:G·R:🔴`
23. **Contrato de erro** das 1.052 `zapp` + 69 `evo` (wrapper + lint). `E:G·R:🟡`
24. **Documentar/blindar particionamento** (proibir DDL em partição-filha). `E:M·R:🟡`

## ⚡ ONDA 3 — ÍNDICES E PERFORMANCE
25. **Baseline de índices + tuning** (`index_advisor`/`hypopg`). `E:M·R:🟢`
26. **Quarentena de índices não usados** (`zapp` 798, `evo` 684; nunca PK/unique/FK). `E:M·R:🟡`
27. **Remover 3 duplicatas.** `E:P·R:🟢`
28. **Índices faltantes (monitorado).** `E:P·R:🟢`
29. **Bloat & vacuum nas quentes.** `E:M·R:🟢`
30. **Governança de matviews** (unique index p/ refresh concurrent). `E:M·R:🟢`
31. **SLA de query lenta.** `E:M·R:🟢`

## ⏱️ ONDA 4 — CRONS E AUTOMAÇÃO
32. **`docs/db/CRONS.md`** (80+ jobs). `E:M·R:🟢`
33. **Nomenclatura + idempotência.** `E:M·R:🟢`
34. **Revisão de sobreposição** (offsets). `E:M·R:🟢`
35. **Alerta de falha + retenção.** `E:P·R:🟢`
36. **Dependências externas (pg_net/http).** `E:M·R:🟡`
37. **DR/backup crons.** `E:M·R:🟡`
38. **Observabilidade consolidada.** `E:M·R:🟢`

## 📚 ONDA 5 — DOCUMENTAÇÃO (✅ já entregue no PR #580, salvo indicado)
39. `docs/db/ARCHITECTURE.md` ✅ · 40. `docs/db/SCHEMA-CONTRACT.md` ✅ · 41. READMEs por schema ⏳ · 42. `docs/db/CRONS.md` ✅ · 43. `docs/db/FUNCTIONS.md` ✅ · 44. `docs/db/RLS-POLICIES.md` ✅ · 45. `docs/db/INDEXES.md` ✅ · 46. `docs/db/MIGRATIONS.md` ✅ · 47. `docs/db/BACKCOMPAT-VIEWS.md` ✅ · 48. `AGENTS.md` + `CLAUDE.md` (preservado) ✅ · 49. Tooling de auto-geração (SQL→MD) ⏳ `E:G·R:🟡` · 50. Governança contínua (PR template + checks) ⏳ `E:M·R:🟢`

---

# PARTE 5 — CAMINHO CRÍTICO

`1 (staging) → 16 (baseline) → 5/40 (contrato) → 11 (governar fachada) → 49/50 (auto-doc + governança)`

---

# PARTE 6 — KPIs

| # | Indicador | Hoje | Meta 30d | Meta 90d |
|---|---|---|---|---|
| K1 | Tabelas de negócio no `public` | 1 (+539 views) | 0 | 0 |
| K2 | Extensões em `public` | 9 | ≤2 | 0 |
| K3 | Objetos de ops vazados no `evo` | ~11 | 0 | 0 |
| K4 | Views `zapp→evo` (espelho) | 254 | contrato | ≤30 |
| K5 | Índices sem uso | 1.987 (91%) | inventariado | ≤30% |
| K6 | Índices duplicados | 3 | 0 | 0 |
| K7 | Migrations aplicadas × arquivos | 52×944 | baseline | reconciliado |
| K8 | Versões malformadas | 4 | 0 | 0 |
| K9 | RLS-on-sem-policy sem decisão | 18 | 0 | 0 |
| K10 | `whatsapp-media` público | sim | não | não |
| K11 | Crons não-qualificados | ≥1 | 0 | 0 |
| K13 | Docs de banco | 10 | 39–47 completos | auto-geradas |

---

# PARTE 7 — REGRAS DE ENGAJAMENTO (resumo)

Versão completa em `AGENTS.md` e `docs/db/`.

- Dado do **WhatsApp** → `evo`; do **app** → `zapp`; **`public` é só API** (views). Nunca criar tabela no `public`.
- Dependência: `public → domínios`; `zapp → evo` só via contrato. **`evo` nunca depende de `zapp`.**
- Toda mudança = migration versionada (`^\d{14}$`) + staging. Nunca DDL manual em produção.
- **NÃO MEXA:** partições-filhas; `fn_ensure_evolution_backcompat_views` + views de compat; crons de DR; `zapp._lgpd_payload`; schemas de plataforma; PK/unique/índice de FK.

---

*Documento de planejamento e diagnóstico. Nenhuma alteração foi feita no banco, storage ou serviço. Todas as consultas de apoio foram somente-leitura sobre o catálogo do PostgreSQL.*
