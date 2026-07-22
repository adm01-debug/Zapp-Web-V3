# Auditoria de Migração — Lovable Cloud → Self-Hosted

## Data: 22/07/2026

## Resumo

Migração do Supabase Lovable Cloud (project `uqysyzndkfiwfztbqvsl`) para o Supabase Self-Hosted (`supabase.atomicabr.com.br`).

**Resultado: ✅ MIGRAÇÃO COMPLETA**

## Comparativo de Schemas

| Métrica | Lovable Cloud | Self-Hosted | Δ |
|---|---|---|---|
| Tabelas | ~147 | **317** | +170 (self-hosted expandido) |
| Funções | ~92 | **1034+** | +942 (extensivamente expandido) |
| RLS Policies | ~435 | **690** | +255 (mais segurança) |
| Edge Functions | 0 | **120** | Deploy manual na produção |

## Tabelas Core — Verificação

| Tabela | Lovable | Self-Hosted | Registros | Status |
|---|---|---|---|---|
| profiles | ✅ | ✅ | 17 | ✅ |
| workspaces | ✅ | ✅ | 1 | ✅ |
| workspace_members | ✅ | ✅ | 15 | ✅ |
| user_roles | ✅ | ✅ | 14 | ✅ |
| empresas | ✅ | ✅ | 51.688 | ✅ |
| contatos | ✅ | ✅ | 3.236 | ✅ |
| evolution_messages_wpp2 | — | ✅ (evo) | 41.091 | ✅ (novo) |
| evolution_contacts | — | ✅ (evo) | 20.563 | ✅ (novo) |
| app_notifications | ✅ | ✅ | 11.529 | ✅ |
| instance_registry | ✅ | ✅ | 22 | ✅ |
| whatsapp_connections | ✅ | ✅ | 3 | ✅ |
| webhook_audit_log | ✅ | ✅ | 78.763 | ✅ |
| webhook_events_processed | ✅ | ✅ | 78.618 | ✅ |
| audit_logs | ✅ | ✅ | 4.519 | ✅ |
| stickers | ✅ | ✅ | 498 | ✅ |
| whatsapp_groups | ✅ | ✅ | 27 | ✅ |

## Observações

1. O self-hosted tem SIGNIFICATIVAMENTE mais objetos que o Lovable Cloud — era esperado
2. Schema `zapp` foi criado como canônico (substituiu `public` do Lovable)
3. Schema `evo` foi adicionado para dados da Evolution API (não existia no Lovable)
4. 120 Edge Functions deployadas apenas no self-hosted
5. Migration tracking criado em `supabase_migrations.schema_migrations`
6. NENHUMA tabela core ficou para trás no Lovable Cloud
