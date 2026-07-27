# ADR-DB-003 — Mover Extensões de `public` para `extensions`

**Status:** PLANEJADO — aguarda staging  
**Data:** 27/07/2026  
**Etapa 8 do Plano DB — risco ALTO.**

---

## Contexto

As seguintes 9 extensões estão instaladas no schema `public`, o que é contraindicado pelas boas práticas do Supabase (recomendação oficial: usar schema `extensions`):

| Extensão | Versão | Uso |
|---|---|---|
| `amcheck` | 1.3 | Verificação de integridade de índices B-tree |
| `btree_gin` | 1.3 | Índices GIN para tipos escalares |
| `dblink` | 1.2 | Conexões cross-database (ops) |
| `hypopg` | 1.4 | Índices hipotéticos para análise de planos |
| `index_advisor` | 0.2 | Recomendações automáticas de índices |
| `pg_buffercache` | 1.3 | Inspeção do buffer cache do Postgres |
| `pg_trgm` | 1.6 | Busca trigram (MUITO usada em buscas de texto) |
| `unaccent` | 1.1 | Remoção de acentos em buscas |
| `vector` | 0.8 | Embeddings vetoriais (IA — `ai` schema) |

---

## Risco de mover extensões

### Por que é ALTO RISCO

Mover uma extensão de `public` para `extensions` altera onde as funções e tipos da extensão ficam. **Qualquer referência não-qualificada** a uma função de extensão depende do `search_path`. Se o `search_path` de uma função não incluir `extensions`, a função quebra.

### Casos críticos

1. **`pg_trgm`** — extensão trigram. Usada em:
   - Índices GIN trigram (`CREATE INDEX ... USING gin(col gin_trgm_ops)`)
   - Funções `similarity()`, `ilike()` com índice
   - `~50%` das buscas de texto do app provavelmente dependem disso
   - **Impacto:** se `search_path` não incluir `extensions`, todo índice trigram para de funcionar

2. **`vector`** — embeddings de IA. Usada em:
   - `ai` schema: colunas `embedding vector(1536)`
   - Funções de similarity search
   - **Impacto:** queries de busca vetorial falham

3. **`unaccent`** — remoção de acentos. Usada em:
   - Funções de busca de texto em `zapp` (contatos, empresas)
   - **Impacto:** buscas com acentos param de funcionar

4. **`dblink`** — conexões cross-database. Usada em:
   - Funções de `ops` para verificações de integridade
   - **Impacto:** verificações de ops falham silenciosamente

---

## Abordagem segura (pré-requisitos)

1. **Confirmar versão do Supabase** — versões < 1.0.0 do Supabase self-hosted têm bugs ao mover extensões
2. **Mapear TODAS as referências não-qualificadas** a funções das 9 extensões nas 1.400+ funções
3. **Staging obrigatório** com benchmark de queries antes e depois
4. **Executar por extensão**, uma de cada vez, em ordem de menor para maior risco:
   - Baixo risco: `amcheck`, `hypopg`, `pg_buffercache`, `index_advisor`
   - Médio risco: `btree_gin`, `dblink`
   - ALTO risco (fazer por último): `pg_trgm`, `unaccent`, `vector`

---

## Procedimento por extensão (quando staging estiver pronto)

```sql
-- Para cada extensão (substituir NOME_EXT):
ALTER EXTENSION NOME_EXT SET SCHEMA extensions;

-- Depois, ajustar search_path de todas as funções afetadas:
-- 1. Encontrar funções que referenciam a extensão
SELECT p.proname, n.nspname, p.prosrc
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.prosrc ILIKE '%similarity%'  -- para pg_trgm, por exemplo
  AND n.nspname IN ('zapp','evo','ops','public');

-- 2. Para cada função encontrada, garantir que extensions esteja no search_path:
-- search_path = zapp, extensions, pg_catalog
```

---

## Decisão

**Esta etapa é adiada até:**
1. ✓ Staging provisionado (etapa 1)
2. ✓ Baseline squash validado (etapa 16)
3. ✓ Mapeamento completo de referências não-qualificadas feito

Enquanto não executada, as 9 extensões ficam em `public` com **comentário de aviso**. O CI-02 (ver SCHEMA-CONTRACT.md) alerta mas não bloqueia enquanto a migração não for feita.

---

## Migration (placeholder — aplicar só após staging)

Ver `supabase/migrations/20260727300008_move_extensions_to_extensions_schema.sql` (não aplicar sem staging).
