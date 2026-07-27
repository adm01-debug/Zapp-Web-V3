# Contrato de Erros — PostgreSQL Functions e RPCs

**Versão:** 1.0 · **Data:** 27/07/2026 · **Etapa 23 do plano DB.**

---

## Princípio

Toda função/RPC que pode falhar deve comunicar erros de forma **previsível e discriminável** pelo frontend. O cliente TypeScript captura `error.code` (SQLSTATE) e `error.message` para decidir o que mostrar ao usuário.

---

## Códigos SQLSTATE Utilizados

| Código | Categoria | Quando usar |
|---|---|---|
| `P0001` | Raised exception | Erro de negócio explícito: validação, não autorizado, recurso não encontrado |
| `42883` | Undefined function | Função não existe — usada por stubs para fail-open controlado |
| `23505` | Unique violation | Conflito de unicidade (INSERT duplicado) |
| `23503` | FK violation | Referência a registro inexistente |
| `22023` | Invalid parameter value | Parâmetro inválido (ex: sort_direction inválido) |
| `28000` | Invalid auth spec | Não autenticado |
| `42501` | Insufficient privilege | Sem permissão para executar a operação |

---

## Padrão de RAISE EXCEPTION para RPCs

```sql
-- Padrão aprovado: P0001 com mensagem estruturada
RAISE EXCEPTION 'error_code:mensagem_para_o_usuario'
    USING ERRCODE = 'P0001';

-- Exemplos reais:
RAISE EXCEPTION 'not_authorized:Usuário sem permissão de administrador'
    USING ERRCODE = 'P0001';

RAISE EXCEPTION 'resource_not_found:Workspace % não encontrado', p_workspace_id
    USING ERRCODE = 'P0001';

RAISE EXCEPTION 'validation_failed:sort_direction deve ser ASC ou DESC'
    USING ERRCODE = 'P0001';
```

---

## Padrão de Tratamento no Frontend

```typescript
// Padrão em hooks TypeScript:
const { data, error } = await supabase.rpc('fn_name', params);

if (error) {
  // Discriminar por código:
  if (error.code === '42883') {
    // Função não existe — fail-open, comportamento degradado
    console.warn('Feature não disponível:', error.message);
    return defaultValue;
  }
  if (error.code === 'P0001') {
    // Erro de negócio — mostrar ao usuário
    const [errorType, userMessage] = error.message.split(':');
    toast.error(userMessage || 'Erro na operação');
    return null;
  }
  // Erro inesperado — log + generic message
  console.error('DB error:', error);
  toast.error('Erro inesperado. Tente novamente.');
  return null;
}
```

---

## Stubs com Fail-Open Controlado

RPCs que ainda não foram implementadas (GAPs documentados em CLAUDE.md) usam o padrão `RAISE EXCEPTION` com `P0001` para indicar explicitamente que a feature não está disponível:

```sql
-- Padrão para stubs (GAP-*):
CREATE OR REPLACE FUNCTION zapp.initiate_gmail_oauth(...)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp, pg_catalog
AS $$
BEGIN
    RAISE EXCEPTION 'not_implemented:Autenticação Gmail não está disponível neste ambiente. Configure via painel OAuth.'
        USING ERRCODE = 'P0001';
END;
$$;
```

**Anti-padrão a evitar:**
```sql
-- ERRADO — retorna sucesso falso sem RAISE:
RETURN json_build_object('success', false, 'message', 'Not implemented');
-- Frontend não detecta como erro, pode fazer setIsAuthenticated(true) silenciosamente
```

---

## Erros de SQL Injection Prevention

```sql
-- Para parâmetros usados em ORDER BY dinâmico:
v_dir := UPPER(p_sort_direction);
IF v_dir NOT IN ('ASC','DESC') THEN
    RAISE EXCEPTION 'validation_failed:sort_direction deve ser ASC ou DESC, recebido: %', p_sort_direction
        USING ERRCODE = 'P0001';
END IF;
-- Usar v_dir (sanitizado) no SQL dinâmico, nunca p_sort_direction direto
```

---

## Registro de Stubs Ativos

| Função | SQLSTATE | Status | Etapa de implementação |
|---|---|---|---|
| `zapp.initiate_gmail_oauth` | P0001 | stub | GAP-2 — OAuth real pendente |
| `zapp.complete_gmail_oauth` | P0001 | stub | GAP-2 |
| `zapp.sync_to_crm` | P0001 | stub | GAP-3 |
| `zapp.export_user_data` | P0001 | stub parcial | GAP-4 |
| `zapp.import_user_data` | P0001 | stub | GAP-4 |
| `zapp.enrich_contact` | P0001 | stub | GAP-5 |
| `zapp.get_latest_analysis` | P0001 | stub | GAP-6 |
| `zapp.check_download_permission` | 42883 fail-open | corrigido BUG-9 | implementado |
