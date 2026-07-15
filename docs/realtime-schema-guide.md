> Veja também: [SCHEMA_REFERENCE.md](SCHEMA_REFERENCE.md)

# Guia: Realtime Subscriptions — Schema Correto

## ⚠️ Por que isso importa?

O Supabase Realtime usa **WAL (Write-Ahead Logging)** do PostgreSQL para detectar mudanças.
**PostgreSQL Views NUNCA emitem eventos WAL.** Portanto:

> Uma subscription em `schema: 'public', table: 'contacts'` fica aberta, NÃO produz erro, mas **nunca dispara callbacks**.

Esse é um silent failure extremamente difícil de depurar.

## 🗺️ Mapa de Schemas — `public.*` vs Base Tables

### ✅ Tabelas BASE em `zapp` (subscription funciona com schema: 'zapp')

Estas são tabelas reais no schema `zapp` — WAL funciona quando `schema: 'zapp'` está no client:

| Tabela | Uso |
|--------|-----|
| `whatsapp_connections` | Conexões WhatsApp |
| `password_reset_requests` | Pedidos de reset de senha |
| `rate_limit_logs` | Logs de rate limiting |
| `security_alerts` | Alertas de segurança |
| `profiles` | Perfis de usuário |

### ❌ Views em `public` (subscription MORTA — nunca dispara)

Estas são **views** sobre tabelas em outros schemas:

| View em public (MORTA) | Base schema/table real | O que usar |
|---|---|---|
| `public.whisper_messages` | `zapp.whisper_messages` | `schema: 'zapp', table: 'whisper_messages'` |
| `public.team_messages` | `zapp.team_messages` | `schema: 'zapp', table: 'team_messages'` |
| `public.contacts` | `evo.evolution_contacts` | `schema: 'evo', table: 'evolution_contacts'` |
| `public.messages` | `evo.evolution_messages` | `schema: 'evo', table: 'evolution_messages'` |
| `public.evolution_messages` | `evo.evolution_messages` | `schema: 'evo', table: 'evolution_messages'` |

## ✅ Exemplo Correto

```typescript
// ✅ CORRETO — zapp.whisper_messages é a base table real
supabase
  .channel('whisper-123')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'zapp',        // <-- schema correto
    table: 'whisper_messages',
    filter: `contact_id=eq.${contactId}`,
  }, callback)
  .subscribe();
```

## ❌ Exemplo Errado

```typescript
// ❌ ERRADO — public.whisper_messages é VIEW, nunca dispara
supabase
  .channel('whisper-123')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',      // <-- ERRADO: public.whisper_messages é view
    table: 'whisper_messages',
  }, callback)
  .subscribe();
```

## 🔍 Como Verificar

Execute o CI guard localmente antes de abrir um PR:

```bash
bash scripts/check-realtime-dead-channels.sh
```

Ou consulte o DB diretamente:

```sql
-- Verificar se uma tabela em public é view ou base table
SELECT tablename, 'BASE TABLE' AS type FROM pg_tables WHERE schemaname = 'public' AND tablename = 'contacts'
UNION ALL
SELECT viewname, 'VIEW (DEAD)' AS type FROM pg_views WHERE schemaname = 'public' AND viewname = 'contacts';
```

## 🔁 Contexto Arquitetural

O `public.*` no zapp-web-v3 expõe **views com `security_invoker = true`** sobre tabelas reais em:
- `zapp.*` — mensagens internas (team_messages, whisper_messages, etc.)
- `evo.*` — dados da Evolution API (evolution_contacts, evolution_messages, etc.)
- `vendas.*` — dados de vendas
- `email_app.*` — dados de email

PostgREST resolve os `SELECT` através das views corretamente.
Mas o Realtime precisa das base tables — é por isso que o schema deve apontar para `zapp` ou `evo`.
