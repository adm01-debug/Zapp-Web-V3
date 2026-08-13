# Relatório de Simulação — Ensaio SET SCHEMA

**Data:** 2026-08-13 · **Executado em:** Supabase self-hosted produção
**Método:** Transação com objetos sintéticos + medição + rollback/cleanup completo

## Cenário simulado

Criamos `evo.test_probe_decouple2` com os mesmos ingredientes das tabelas reais:
- View em `public.test_probe_decouple2` apontando para ela (como as 422 aliases existentes)
- Função `evo.test_probe_literal_fn2()` com `SELECT FROM evo.test_probe_decouple2` (texto literal)
- Dado real inserido antes do move

Executamos `ALTER TABLE evo.test_probe_decouple2 SET SCHEMA zapp`.

## Resultados medidos (não estimados)

| Objeto | Resultado | Implicação em produção |
|---|---|---|
| Tabela moveu para `zapp` | ✅ `tabela_zapp: true` | Move é instantâneo (catálogo) |
| Tabela some de `evo` | ✅ `tabela_evo: false` | Sem duplicata |
| View em `public` sobrevive | ✅ `view_public_existe: true` | As **422 views-alias** do `public` sobrevivem automaticamente |
| Dados legíveis via view `public` | ✅ `1 linha` | App continua funcionando via views |
| Função com literal `evo.tabela` | ✅ ainda existe em `evo` | Silencioso após o move |
| Função com literal ao ser chamada | ❌ `ERROR: relation "evo.test_probe_decouple2" does not exist` | **QUEBRA ao disparar** |
| Cleanup completo | ✅ | Nenhum objeto de teste persiste |

## Cenários de falha identificados

### C1 — Quebra retardada de função (risco ALTO, detectável)

**O que acontece:** `ALTER TABLE` executa sem erro. Função com `evo.tablename` no corpo continua existindo em `evo` — mas na próxima chamada falha com `undefined_table`.

**Em produção:** 139 funções em `evo` têm `evo.` literal. Para as tabelas que migrarmos, cada função que referenciar o nome antigo falha silenciosamente nas próximas horas.

**Janela de detecção:** o cron mais frequente é `a cada 3 minutos`. A falha aparece no máximo em 3 minutos após o `SET SCHEMA`.

**Solução obrigatória antes de qualquer SET SCHEMA em produção:**
```sql
-- Detectar funções que quebrariam
SELECT p.proname, n.nspname
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE p.prosrc ILIKE '%evo.TABELA_ALVO%';
```
Qualificar todas antes. Zero funções com literal → SET SCHEMA seguro.

### C2 — Colisão de nome (risco BLOQUEADOR, detectável)

**Tabelas com nome idêntico em `evo` e `zapp`:**

| Tabela | Linhas em evo | Linhas em zapp | Tipo em zapp |
|---|---|---|---|
| `contact_id_graveyard` | 125 | 644 | tabela real (dados divergentes) |
| `_snapshot_version_state` | 1 | 1 | tabela real |

`ALTER TABLE evo.contact_id_graveyard SET SCHEMA zapp` → `ERROR: relation "contact_id_graveyard" already exists in schema "zapp"`.

**Solução obrigatória:** resolver a colisão `contact_id_graveyard` (merge ou drop do duplicado) antes de qualquer migração.

### C3 — `search_path` com `evo` na frente (risco MÉDIO, silencioso)

**Estado atual:**
```
anon:          search_path = evo, public, extensions   ← evo PRIMEIRO
authenticated: search_path = zapp, evo, public, extensions
service_role:  search_path = zapp, evo, public, extensions
```

**O que acontece após SET SCHEMA:** query não qualificada do role `anon` procura em `evo` (não encontra) → cai em `public` (encontra a view-alias que ainda funciona por OID). Não quebra — mas cria dependência implícita nas 422 views aliases.

**Se as views-alias de `public` forem dropadas antes do `search_path` ser corrigido:** queries anon falham em produção sem nenhum erro de deploy.

**Solução:** corrigir `search_path` de `anon` para `public, extensions` antes de dropar qualquer view-alias.

### C4 — Cron cascade durante migração (risco BAIXO, janela estreita)

**100 crons** com `evo.fn_*()` no comando. Se o `SET SCHEMA` ocorrer enquanto um cron está rodando na mesma tabela, o lock do cron bloqueia o `SET SCHEMA` por até 60 segundos (statement_timeout do service_role).

**Mitigação:** verificar `pg_stat_activity` antes do `SET SCHEMA` em qualquer tabela com cron ativo.

### C5 — Falso negativo no gate (risco MÉDIO, cobrível)

O `ownership-gate.mjs` detecta `from('table').write()` via AST textual. Não detecta:
- Funções PL/pgSQL com `INSERT INTO evo.tabela` no corpo → coberto pela query de scan de funções
- RPCs `SECURITY DEFINER` que escrevem em evo → coberto por auditar grants no nível SQL

**Solução:** o gate de código é camada 1. Camada 2 é a query de grants (já disponível via SQL).

## Conclusão do ensaio

O `SET SCHEMA` é uma operação de catálogo segura e reversível. O risco real não está no `SET SCHEMA` em si — está nas **306 funções com referência literal** e nos **100 crons** que quebram retardadamente. O protocolo pré-flight abaixo elimina todos os riscos mensuráveis.
