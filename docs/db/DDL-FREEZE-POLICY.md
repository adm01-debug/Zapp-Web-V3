# DDL FREEZE POLICY

> **Restrição de alterações estruturais no banco de dados — enforced by `ops.ddl_violations_live`**

---

## Regra central

**Uma alteração estrutural (DDL) por vez, com versionamento, staging primeiro.**

Qualquer mudança de schema (CREATE TABLE, ALTER TABLE, CREATE INDEX, etc.) deve seguir
este fluxo antes de ser aplicada em produção.

---

## O que é considerado DDL

| DDL | Exemplo |
|-----|---------|
| CREATE / ALTER / DROP TABLE | `CREATE TABLE foo (...)` |
| CREATE / DROP INDEX | `CREATE INDEX CONCURRENTLY` |
| CREATE / ALTER / DROP VIEW | `CREATE VIEW v_foo AS SELECT` |
| CREATE / REPLACE / DROP FUNCTION | `CREATE OR REPLACE FUNCTION fn_foo()` |
| CREATE / ALTER / DROP TRIGGER | `CREATE TRIGGER trg_foo` |
| ALTER TABLE ... ADD COLUMN | `ALTER TABLE t ADD c int` |
| ALTER TABLE ... ADD CONSTRAINT | `ALTER TABLE t ADD PRIMARY KEY` |
| CREATE / ALTER SCHEMA | `CREATE SCHEMA bar` |

---

## Fluxo obrigatório

```
1. branch dedicado (ex: feature/minha-mudanca)
2. criar migration em supabase/migrations/
   - nome: YYYYMMDDHHMMSS_descricao.sql
   - exemplo: 20260801000001_add_phone_to_contatos.sql
3. aplicar em staging primeiro
   - supabase db push
   - ou: psql -f migration.sql
4. validar:
   - smoke tests passam
   - RLS intacto (ops.v_ddl_violations_unresolved)
   - nenhuma regressão funcional
5. code review + merge para main
6. aplicar em produção
7. verificar pós-deploy: ops.v_ddl_violations_unresolved retorna 0 linhas
```

---

## O que NÃO é DDL

- `INSERT`, `UPDATE`, `DELETE` (DML)
- `VACUUM`, `ANALYZE` (manutenção)
- `GRANT`, `REVOKE` (perfis/pERMISSÕES)
- `COMMENT ON` (metadados)
- `NOTIFY` (triggers de evento via event trigger — mas não DDL do objeto)

---

## Governança: `ops.ddl_violations_live`

A tabela `ops.ddl_violations_live` é populada pelo trigger de evento `trg_ddl_violation_capture`
que intercepta DDL executado fora de migrations versionadas.

**Nunca ignore violações reportadas nessa tabela.**

```sql
-- Consultar violações
SELECT * FROM ops.v_ddl_violations_unresolved;

-- Resolver: criar migration retrospectiva para o DDL que foi executado diretamente
```

---

## Exceções documentadas

Apenasumulk operations documentadas em migration com prefixo `_BULK_` no nome:

```
supabase/migrations/20260801000001_BULK_cleanup_orphaned_rows.sql
```

---

## Padrão de nome de migration

```
YYYYMMDDHHMMSS_[descricao_curta_em_underscore].sql
```

- 14 dígitos obrigatórios
- Descrição: max 50 caracteres, apenas `a-z0-9_`
- Não usar pontos, espaços ou caracteres especiais
