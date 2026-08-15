# E46 — Auditoria de `search_path` em funções SECURITY DEFINER (SEARCHPATH_AUDIT)

**Arquivo:** `docs/decouple/SEARCHPATH_AUDIT_20260815.md`
**Data da medição:** 2026-08-15
**Onda:** Fase 3 — Dono único do schema `evo` (E39–E48) · worker W5 (E46)
**Fonte dos dados:** medição direta em `pg_catalog` (produção, leitura read-only) + espelho em `.hermes/fase3/dados-reais.json`
**Escopo:** schemas `evo` e `zapp`, funções `SECURITY DEFINER` (`p.prosecdef = true`, `p.prokind = 'f'`)
**Status:** ✅ medido — **nada foi executado/alterado** (documento 100% read-only; zero DDL)

---

## 1. Objetivo

Medir e documentar o estado atual do `search_path` das funções `SECURITY DEFINER` dos schemas
`evo` e `zapp`, como base para a meta do plano **E46**: *"Alinhar o `search_path` das funções para
um padrão único e explícito"* (`PLANO_INDEPENDENCIA_100_ETAPAS_20260815.md`, linha 180).

**Por que isso importa:** em função `SECURITY DEFINER` o `search_path` é um vetor de ataque
clássico (hijack de objetos não qualificados) e uma fonte de acoplamento entre schemas. A
convenção da casa (`AGENTS.md`) já manda: *"sempre fixe `search_path` em função `SECURITY
DEFINER`"*. Esta medição verifica o quanto o banco real desvia dessa convenção e quantas
variantes de `search_path` existem hoje.

Os números alimentam as etapas seguintes do plano:

| Etapa | Meta (query de conformidade = 0 desvios) |
|---|---|
| **E46** (esta) | Padrão único e explícito de `search_path` para todas as funções SECDEF |
| **E47** | Nenhuma função residente em `evo` com `zapp` no `search_path` |
| **E48** | Nenhuma função residente em `zapp` com `evo` no `search_path` |

---

## 2. Metodologia

1. **Fonte:** `pg_catalog.pg_proc` (join com `pg_namespace`), leitura read-only — nenhuma
   escrita, nenhum DDL, nenhuma função alterada.
2. **Filtro:** funções (`prokind = 'f'`) com `prosecdef = true` residentes em `evo` ou `zapp`
   (`pronamespace`).
3. **Variável medida:** `p.proconfig` — o array de cláusulas `SET` persistidas na função.
   `search_path` aparece como elemento do tipo `search_path=<lista>`; `NULL`/ausência de
   elemento = função **sem** `SET search_path` explícito (depende do default da sessão/role —
   também conta como desvio da convenção).
4. **Agregação:** total de funções, total SECDEF e nº de **variantes** de `search_path`
   (valores distintos de `proconfig`) por schema.
5. **Reprodutibilidade:** a query da seção 3 roda em qualquer instância (produção/staging) e
   deve reproduzir os números da seção 4.

---

## 3. Query reproduzível (medição E46)

```sql
-- E46 — search_path de funções SECURITY DEFINER em evo/zapp
-- Uso: psql / MCP read-only / qualquer role com SELECT em pg_catalog
SELECT n.nspname, p.proname, p.proconfig
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('evo','zapp')
  AND p.prosecdef
  AND p.prokind = 'f'
ORDER BY 1, 2;
```

### Query de resumo (variantes por schema — usada na medição)

```sql
-- Contagem: funções totais, SECDEF e variantes de search_path por schema
SELECT n.nspname,
       count(*)                                                       AS fns_totais,
       count(*) FILTER (WHERE p.prosecdef)                            AS fns_security_definer,
       count(DISTINCT p.proconfig) FILTER (WHERE p.prosecdef)         AS variantes_searchpath
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('evo','zapp')
  AND p.prokind = 'f'
GROUP BY 1
ORDER BY 1;
```

> Nota de interpretação: `count(DISTINCT p.proconfig)` conta cada valor distinto do array
> (incluindo `NULL` = função sem `SET` explícito). É essa contagem que produz as 5/10
> variantes reportadas na seção 4.

---

## 4. Resultados reais (medidos 2026-08-15)

| Schema | Funções totais | SECURITY DEFINER | Variantes de `search_path` |
|---|---:|---:|---:|
| `evo` | 157 | **120** | **5** |
| `zapp` | 898 | **727** | **10** |
| **Total** | **1.055** | **847** | **15 (5 + 10)** |

Fonte: medição via `pg_catalog` em 2026-08-15; espelhado em `.hermes/fase3/dados-reais.json`
(`schema_fns`). Consistente com `docs/decouple/ANALISE_FRONTEIRA_EVO_ZAPP_20260815.md`.

**Leitura dos números:**

- **847 funções SECDEF** (80% das 1.055 funções dos dois schemas) — a convenção
  "sempre fixe `search_path`" se aplica a todas elas.
- **15 variantes** de `search_path` no total — longe do padrão único da meta E46. Dentro de
  `zapp` há 10 variantes; dentro de `evo`, 5. A medição T0 do plano citava 11 variantes em
  escopo menor (77 funções); esta medição cobre o **universo atual completo** dos dois
  schemas e é o baseline oficial para E47/E48.
- A existência de variantes com `search_path = evo, zapp` / `zapp, evo` (listadas pela query
  da seção 3) é exatamente o acoplamento que E47/E48 eliminam.

---

## 5. Query de conformidade-alvo (E47/E48 — futuras)

Meta: **0 desvios**. Função residente em `evo` **não pode** ter `zapp` no `search_path`;
função residente em `zapp` **não pode** ter `evo` no `search_path`. A conformidade é medida
com a mesma query da seção 3 + predicado de violação:

```sql
-- Conformidade E47/E48: lista as VIOLAÇÕES (meta = 0 linhas)
-- E47: funções de evo com zapp no search_path  |  E48: funções de zapp com evo no search_path
SELECT n.nspname AS schema_residente, p.proname, p.proconfig
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('evo','zapp')
  AND p.prosecdef
  AND p.prokind = 'f'
  AND EXISTS (
        SELECT 1
        FROM unnest(p.proconfig) AS cfg
        WHERE cfg LIKE 'search_path=%'
          AND (
                (n.nspname = 'evo'  AND cfg LIKE 'search_path=%zapp%')  -- E47
             OR (n.nspname = 'zapp' AND cfg LIKE 'search_path=%evo%')   -- E48
              )
      )
ORDER BY 1, 2;
```

**Uso como gate (futuro, E46–E48):** rodar a query em CI/medição periódica; `exit 1` se o
resultado não for vazio. `NULL`/ausência de `SET search_path` explícito em função SECDEF
também deve ser tratado como desvio de conformidade no padrão único (lista separada via
`p.proconfig IS NULL OR NOT EXISTS (... search_path ...)`).

> **Caveat de falso-positivo documentado:** o match `LIKE '%evo%'`/`'%zapp%'` é textual —
> um schema com nome que contenha a substring (ex.: `evolution_*` no path de `zapp`)
> apareceria como violação. Antes de virar gate rígido, validar contra a lista real de
> variantes (seção 3) e, se necessário, restringir o match ao **elemento exato** da lista
> (split por vírgula, trim, igualdade com `evo`/`zapp`).

---

## 6. Recomendação — padrão único proposto (E46)

**Padrão-alvo sugerido (a ser executado em etapa própria, NÃO nesta):**

- Função residente em `evo` → `SET search_path = evo, pg_catalog`
- Função residente em `zapp` → `SET search_path = zapp, pg_catalog`

Justificativa: `pg_catalog` no fim do path preserva a resolução de built-ins; apenas o schema
dono no início garante previsibilidade e elimina acoplamento cruzado (E47/E48) sem quebrar
resolução de objetos internos do próprio schema. Qualquer objeto de outro schema passa a ser
**obrigatoriamente qualificado** no corpo da função (convenção já existente em
`AGENTS.md`/`CLAUDE.md`).

**Rollback documentado (sem executar nada agora):**

1. **E46 (esta medição)** é read-only — rollback não se aplica; nenhuma mudança foi feita.
2. Para a futura correção (E47/E48): antes de aplicar `ALTER FUNCTION ... SET search_path`,
   capturar o estado anterior com a query da seção 3 (coluna `p.proconfig` é o backup
   exato por função). Rollback = reaplicar `SET search_path = <valor_original_capturado>`
   nas mesmas funções, com o mesmo mecanismo versionado (migration `YYYYMMDDHHMMSS` +
   registro em `supabase_migrations.schema_migrations`), nunca DDL solto.
3. Validação pós-rollback: rodar novamente a query da seção 3 e comparar com o baseline
   capturado — a diff de `proconfig` por função deve ser zero.

**Ordem no plano:** E46 (baseline, esta) → E47/E48 (correção por schema, 0 desvios) →
E59 (reescrita de corpo de função), conforme `PLANO_INDEPENDENCIA_100_ETAPAS_20260815.md`
(linhas 180–182, 471: E46–E48 junto com E59).

---

## 7. Referências

- `.hermes/fase3/worker-rules.md` — regras da onda (read-only, sem git, sem DDL)
- `.hermes/fase3/dados-reais.json` — `schema_fns` (fonte dos números)
- `docs/decouple/PLANO_INDEPENDENCIA_100_ETAPAS_20260815.md` — E46 (linha 180), E47 (181), E48 (182)
- `.hermes/plans/fase3-plan.md` — W5 (E46) · artefato: `docs/decouple/SEARCHPATH_AUDIT_20260815.md`
- `AGENTS.md` / `CLAUDE.md` — convenção "sempre fixe `search_path` em função SECURITY DEFINER"
- `docs/decouple/ANALISE_FRONTEIRA_EVO_ZAPP_20260815.md` — análise de fronteira correlata
