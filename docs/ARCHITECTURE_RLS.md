# Arquitetura de Segurança RLS - ZAPP WEB

## Visão Geral

O ZAPP WEB utiliza **Row Level Security (RLS)** do PostgreSQL para garantir isolamento de dados entre tenants (workspaces).

## Métricas

| Métrica | Valor |
|---------|-------|
| Total de políticas RLS | **1.555+** |
| Migrações com RLS | **380** |
| Schemas protegidos | **3** (`public`, `zapp`, `evo`) |
| Roles | **4** (`authenticated`, `service_role`, `anon`, `postgres`) |

## Roles e Permissões

### 1. `authenticated` (usuários logados)
- Acesso via JWT token
- Políticas RLS controlam acesso
- Isolamento por `workspace_members`

### 2. `service_role` (Edge Functions)
- Acesso sem verificação RLS (bypass)
- Usado para writes em tabelas de sistema
- **NUNCA** exposto ao client

### 3. `anon` (usuários anônimos)
- Apenas para operações públicas
- Políticas RLS muito restritivas

## Schema `zapp` (Principal)

### Tabelas e Políticas Típicas

```sql
-- Exemplo: warroom_alerts
ALTER TABLE zapp.warroom_alerts ENABLE ROW LEVEL SECURITY;

-- Admin/supervisor vê tudo
CREATE POLICY "Admins can view all"
  ON zapp.warroom_alerts FOR SELECT
  TO authenticated
  USING (zapp.is_admin_or_supervisor(auth.uid()));

-- Usuário vê seus próprios alertas
CREATE POLICY "Users can view own"
  ON zapp.warroom_alerts FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Service role pode inserir
CREATE POLICY "Service role can insert"
  ON zapp.warroom_alerts FOR INSERT
  TO service_role
  WITH CHECK (true);
```

### Funções Helper RLS

```sql
-- Verifica se usuário é admin/supervisor
zapp.is_admin_or_supervisor(auth.uid())

-- Verifica se usuário é membro do workspace
EXISTS (
  SELECT 1 FROM zapp.workspace_members
  WHERE user_id = auth.uid()
)
```

## Schema `evo` (Evolution API)

### Padrões de Política

#### Service-managed Tables (logs, metrics, DLQ)
```sql
-- SELECT only para authenticated
CREATE POLICY "auth_read_%s" ON evo.%I
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM zapp.workspace_members WHERE user_id = auth.uid()
  ));

-- FULL access para service_role
-- (implícito - service_role ignora RLS)
```

#### User-configurable Tables (automations, notes, etc.)
```sql
-- CRUD completo com workspace isolation
CREATE POLICY "auth_workspace_all_%s" ON evo.%I
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM zapp.workspace_members WHERE user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM zapp.workspace_members WHERE user_id = auth.uid()
  ));
```

#### Message Partitions
```sql
-- INSERT + SELECT (não UPDATE/DELETE por users)
CREATE POLICY "authenticated_insert" ON evo.%I
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "auth_read_%s" ON evo.%I
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM zapp.workspace_members WHERE user_id = auth.uid()
  ));
```

#### Conversation Partitions
```sql
-- UPDATE + SELECT (não INSERT/DELETE por users)
CREATE POLICY "authenticated_update" ON evo.%I
  FOR UPDATE TO authenticated
  USING (true); -- Partitions herdam RLS da root table

CREATE POLICY "auth_read_%s" ON evo.%I
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM zapp.workspace_members WHERE user_id = auth.uid()
  ));
```

## Workspace Isolation

### Como funciona

1. Cada usuário pertence a um ou mais workspaces via `zapp.workspace_members`
2. Políticas RLS verificam `auth.uid()` contra `workspace_members.user_id`
3. Queries são automaticamente filtradas por workspace

### Tabelas de Isolamento

```sql
-- Tabela principal de associação
CREATE TABLE zapp.workspace_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES zapp.workspaces(id),
  user_id uuid REFERENCES auth.users(id),
  role text CHECK (role IN ('owner', 'admin', 'member')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(workspace_id, user_id)
);
```

## Boas Práticas

### 1. Sempre usar políticas específicas por role

```sql
-- ✅ CORRETO
CREATE POLICY "Users can view own data"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- ❌ INCORRETO
CREATE POLICY "Anyone can view" 
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);
```

### 2. Usar WITH CHECK para INSERT/UPDATE

```sql
-- WITH CHECK valida dados sendo inseridos/atualizados
CREATE POLICY "Users can update own data"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
```

### 3. Service-managed tables = SELECT-only para users

```sql
-- Logs e métricas não devem ser modificados por users
CREATE POLICY "Service logs read only"
  ON zapp.audit_logs FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM zapp.workspace_members WHERE user_id = auth.uid()
  ));
```

### 4. Idempotência em migrations

```sql
-- Sempre verificar antes de criar
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'zapp' AND tablename = 'my_table'
    AND policyname = 'my_policy'
  ) THEN
    CREATE POLICY "my_policy" ON zapp.my_table ...;
  END IF;
END $$;
```

## Troubleshooting

### Erro: "permission denied for table"
**Causa**: RLS bloqueando acesso

**Solução**: Verificar se:
1. Tabela tem RLS habilitado
2. Política existe para o role usado
3. Condição USING permite o acesso

### Erro: "no publication entry"
**Causa**: Tabela não está na publication `supabase_realtime`

**Solução**: `ALTER PUBLICATION supabase_realtime ADD TABLE schema.table`

### Erro: "cannot insert due to row-level security"
**Causa**: Política INSERT não existe ou WITH CHECK falha

**Solução**: Verificar política INSERT e condições WITH CHECK

## Auditoria

Políticas devem ser auditadas regularmente:

```sql
-- Listar todas as políticas do schema zapp
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  roles
FROM pg_policies
WHERE schemaname IN ('zapp', 'evo')
ORDER BY schemaname, tablename;

-- Verificar políticas sem USING (perigosas)
SELECT policyname, tablename
FROM pg_policies
WHERE schemaname IN ('zapp', 'evo')
AND (qual IS NULL OR qual = 'true');
```

## Histórico de Correções

### 2026-07-24: Codex Audit Fix
- **73+ tabelas** com `USING(true)` corrigidas
- Removido acesso de escrita anônimo
- Implementado workspace isolation

### 2026-05-02: RLS Hardening
- Removidas políticas redundantes
- Adicionado `WITH CHECK` em INSERT/UPDATE
- Verificação de grants

### 2026-04-12: Fix RLS Policies Security
- Corrigidas 9 tabelas com `auth_full_access`
- Implementado padrão workspace-scoped
