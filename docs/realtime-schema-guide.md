# Guia de Realtime com Tabelas Particionadas — ZAPP-WEB

**Auditado**: 2026-07-16  
**Relevante para**: hooks de mensagens/conversas WhatsApp, qualquer subscription evo.*

---

## TL;DR

```
publish_via_partition_root = true
```

Significa: assine a **tabela raiz**, nunca a partição. Subscriptions em partições não recebem eventos.

---

## Configuração do Banco

A publicação `supabase_realtime` no Supabase self-hosted (AtomicaBR) tem:

```sql
-- Confirmado em produção (2026-07-15 audit)
SELECT pubviaroot FROM pg_publication WHERE pubname = 'supabase_realtime';
-- pubviaroot = true
```

Com `pubviaroot = true`, o PostgreSQL publica eventos CDC usando o OID da **tabela raiz particionada**, não das partições filhas. Portanto, um listener na partição `evolution_messages_wpp2` nunca receberá eventos — mesmo que as linhas sejam inseridas nessa partição.

---

## Mapeamento Correto: Partition → Root

| Partição (NÃO usar em realtime) | Raiz (usar em realtime) | Schema |
|--------------------------------|------------------------|--------|
| `evolution_messages_wpp2` | `evolution_messages` | `evo` |
| `evolution_messages_comercial_01` | `evolution_messages` | `evo` |
| `evolution_conversations_wpp2` | `evolution_conversations` | `evo` |
| `evolution_webhook_events_v2_2026_07` | `evolution_webhook_events_v2` | `evo` |

---

## Padrão Correto (React Hook)

```typescript
// CORRETO — assina a tabela raiz
const channel = supabase.channel('messages:conv:123')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'evo',
    table: 'evolution_messages',         // raiz, não partição
    filter: `instance_name=eq.${instance}`,
  }, handler)
  .subscribe();
```

```typescript
// ERRADO — partição silenciosa com publish_via_partition_root=true
const channel = supabase.channel('messages:conv:123')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'evo',
    table: 'evolution_messages_wpp2',    // nunca recebe eventos
    filter: `instance_name=eq.${instance}`,
  }, handler)
  .subscribe();
```

---

## SELECT de Dados (diferente do Realtime)

Para **leitura de dados**, você pode usar a partição ou a raiz — ambos funcionam:

```typescript
// OK para SELECT
await supabase.schema('evo').from('evolution_messages_wpp2').select(...)
await supabase.schema('evo').from('evolution_messages').select(...)

// Preferido (via view zapp) — não precisa de .schema('evo')
await supabase.from('evolution_messages').select(...)
```

A view `zapp.evolution_messages` é auto-updatable (`security_invoker=on`) e faz a consulta na raiz do schema `evo`.

---

## Views `zapp.evolution_*`

No schema `zapp`, existem views que espelham as tabelas do schema `evo`:

Essas views têm `security_invoker=on`, então o RLS da tabela base é aplicado com as credenciais do usuário atual. São **auto-updatable** (INSERT/UPDATE/DELETE funcionam).

**Consequência**: `supabase.from('evolution_messages')` (com default schema `zapp`) funciona corretamente e não precisa de `.schema('evo')`.

---

## Diagnóstico de Canais Mortos

```bash
bash scripts/check-realtime-dead-channels.sh
```

O script detecta:
- `schema: 'public'` (sempre errado neste projeto)
- `schema: 'evo'` com tabela que termina em padrão de partição (`_wpp2`, `_comercial_*`, `_v2_20*`)

---

## Referências

- PostgreSQL docs: Logical Replication and Partitioned Tables
- `scripts/check-realtime-dead-channels.sh` — guard de CI
- `src/integrations/zappweb/hooks/useZappMessages.ts` — implementação de referência
