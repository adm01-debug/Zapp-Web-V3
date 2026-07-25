# Arquitetura de Schemas Supabase - ZAPP WEB

## Visão Geral

O ZAPP WEB utiliza **3 schemas** no Supabase self-hosted:

### Schema `zapp` (PRINCIPAL)
Schema principal da aplicação, contém todas as tabelas de negócio.

#### Tabelas Principais:
| Tabela | Descrição | RLS | Realtime |
|--------|-----------|-----|----------|
| `warroom_alerts` | Alertas operacionais críticos | ✅ | ✅ |
| `conversation_sla` | Métricas de SLA | ✅ | ✅ |
| `sentiment_alerts` | Alertas de sentimento negativo | ✅ | ✅ |
| `security_alerts` | Alertas de segurança | ✅ | ✅ |
| `team_messages` | Mensagens do chat interno | ✅ | ✅ |
| `notifications` | Notificações push | ✅ | ✅ |
| `conversation_events` | Eventos de conversa | ✅ | ✅ |
| `conversation_transfers` | Transferências | ✅ | ✅ |
| `webhook_health_checks` | Health de webhooks | ✅ | ✅ |
| `audit_logs` | Logs de auditoria | ✅ | ✅ |
| `global_settings` | Configurações globais | ✅ | ❌ |
| `inbox_custom_scopes` | Escopos customizados | ✅ | ❌ |

### Schema `evo` (Evolution API)
Schema para integração com WhatsApp via Evolution API.

#### Tabelas:
| Tabela | Descrição |
|--------|-----------|
| `evolution_contacts` | Contatos sincronizados |
| `evolution_messages` | Mensagens do WhatsApp |
| `evolution_instances` | Instâncias ativas |
| `evolution_sessions` | Sessões de conexão |

### Schema `public` (Legacy)
Schema legado mantido para retrocompatibilidade.

#### Views Proxy:
| View | Aponta Para |
|------|-------------|
| `contacts` | Proxy para `zapp.contacts` (se existir) |
| `messages` | Proxy para `evo.evolution_messages` |
| `team_messages` | Proxy para `zapp.team_messages` |

## Padrões de Desenvolvimento

### 1. Queries via Client Tipado
```typescript
// ✅ CORRETO: Usar o cliente configurado com schema padrão
import { supabase } from '@/integrations/supabase/client';
const { data } = await supabase.from('warroom_alerts').select('*');
// PostgREST adiciona automaticamente Accept-Profile: zapp

// ❌ INCORRETO: hardcoded schema (exceto para Evolution)
const { data } = await supabase.schema('zapp').from('warroom_alerts').select('*');
```

### 2. Queries para Evolution (Schema evo)
```typescript
// ✅ CORRETO: Especificar schema 'evo' para tabelas Evolution
const { data } = await supabase.schema('evo').from('evolution_messages').select('*');

// ❌ INCORRETO: Sem especificar schema (vai para zapp, não existe)
const { data } = await supabase.from('evolution_messages').select('*');
```

### 3. Realtime Subscriptions
```typescript
// Schema 'zapp' (default)
supabase
  .channel('alerts')
  .on('postgres_changes', { event: '*', schema: 'zapp', table: 'warroom_alerts' }, handler)
  .subscribe();

// Schema 'evo' (WhatsApp)
supabase
  .channel('messages')
  .on('postgres_changes', { event: '*', schema: 'evo', table: 'evolution_messages' }, handler)
  .subscribe();
```

### 4. Movimentação de Tabelas
Quando mover uma tabela de `public` → `zapp`:

1. Usar DO blocks idempotentes para detectar estado atual
2. Criar VIEW proxy em `public` se necessário
3. Adicionar tabela à publication `supabase_realtime`
4. Recriar políticas RLS no novo schema
5. Atualizar imports no código frontend

## Histórico de Migrações

### 2026-07-24: Migrações de Correção
- `fix_evolution_tables_rls_policies.sql` - Corrige RLS das tabelas Evolution
- `fix_evo_schema_blanket_auth_policies.sql` - Remove políticas permissivas
- `move_team_messages_to_zapp.sql` - Move team_messages para zapp
- `move_security_alerts_to_zapp.sql` - Move security_alerts para zapp
- `fix_realtime_*` - Corrige publicações de realtime

### 2026-03-XX: Migrações de Funcionalidades
- Múltiplas migrations para chatbot, automações, gamificação
- RLS policies para cada nova tabela
- Índices otimizados para queries frequentes

## Troubleshooting

### Erro: "relation not found in schema cache" (PGRST205)
**Causa**: Tabela está em `public` mas client envia `Accept-Profile: zapp`

**Solução**: Mover tabela para `zapp` ou usar VIEW proxy

### Erro: "no publication entry"
**Causa**: Tabela não está na publication `supabase_realtime`

**Solução**: `ALTER PUBLICATION supabase_realtime ADD TABLE schema.table`

### Erro: "permission denied"
**Causa**: RLS bloqueando acesso

**Solução**: Verificar políticas RLS para o role usado (authenticated, service_role)
