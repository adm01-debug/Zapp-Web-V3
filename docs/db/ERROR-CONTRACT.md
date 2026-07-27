# ERROR CONTRACT

> Convenção de erros de negócio em PostgreSQL — para aplicação e database.

---

## SQLSTATEs de Negócio

| SQLSTATE | Significado | Uso |
|----------|-------------|-----|
| `P0001` | Business rule violation | `RAISE EXCEPTION USING ERRCODE = 'P0001'` |
| `42883` | Stub function (fail-open) | `RAISE EXCEPTION USING ERRCODE = '42883'` |
| `23505` | Unique violation | Conflito de chave |
| `23503` | Foreign key violation | Referência inválida |
| `23514` | Check constraint violation | Validação falhou |
| `22P02` | Invalid text representation | JSON/UUID malformado |

---

## Padrão de Erro Business (P0001)

```sql
-- Forma correta
RAISE EXCEPTION USING
    errcode  = 'P0001',
    message  = 'CONTACT_NOT_FOUND:O contato não existe',
    hint     = 'Verifique se o contact_id está correto';

-- Handling em TypeScript
try {
    await supabase.rpc('fn_create_contact', { p_name: 'João' });
} catch (err: any) {
    if (err.code === 'P0001') {
        const [code, ...rest] = err.message.split(':');
        // code = 'CONTACT_NOT_FOUND'
        // rest = ['O contato não existe']
    }
}
```

---

## Anti-patterns

### ❌ Retornar objeto em vez de RAISE
```sql
-- ERRADO: esconde o erro
CREATE OR REPLACE FUNCTION fn_bad(...)
RETURNS JSONB AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM contatos WHERE id = p_id) THEN
        RETURN '{"success": false, "error": "not_found"}'::JSONB;
    END IF;
END;
$$;
-- Problema: client pode não verificar retorno e assumir sucesso
```

### ✅ Usar RAISE EXCEPTION
```sql
-- CORRETO: falha audível
CREATE OR REPLACE FUNCTION fn_good(...)
RETURNS void AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM contatos WHERE id = p_id) THEN
        RAISE EXCEPTION USING
            errcode = 'P0001',
            message = 'CONTACT_NOT_FOUND:ID ' || p_id || ' não existe';
    END IF;
END;
$$;
```

---

## Funções Stub (fail-open)

| Função Stub | SQLSTATE | Motivo |
|-------------|----------|--------|
| `fn_create_contact` | 42883 | Substituir por implementação real |
| `fn_update_company` | 42883 | Substituir por implementação real |
| `fn_validate_token`  | 42883 | Implementação real em auth schema |

---

## Validação de parâmetros (ORDER BY dinâmico)

```sql
-- ✅ Prevenir SQL injection em ORDER BY
CREATE OR REPLACE FUNCTION fn_list_users(sort_col TEXT, sort_dir TEXT)
RETURNS TABLE(id UUID, name TEXT) AS $$
DECLARE
    valid_cols TEXT[] := ARRAY['id','name','created_at','email'];
BEGIN
    IF sort_col NOT IN (SELECT unnest(valid_cols)) THEN
        RAISE EXCEPTION USING errcode='P0001', message='INVALID_SORT_COL';
    END IF;
    IF sort_dir NOT IN ('asc','desc') THEN
        RAISE EXCEPTION USING errcode='P0001', message='INVALID_SORT_DIR';
    END IF;
    RETURN QUERY EXECUTE format(
        'SELECT id, name FROM zapp.users ORDER BY %I %s',
        sort_col, sort_dir
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```
