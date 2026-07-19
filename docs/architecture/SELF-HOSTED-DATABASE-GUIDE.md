# ZAPP Web — Guia Definitivo: Banco de Dados Self-Hosted

> **ATENÇÃO LOVABLE AI**: Este documento define a arquitetura oficial de dados do ZAPP Web.
> O banco de dados de mensagens, contatos e conversas NÃO está no Supabase Lovable.
> Está em um **Supabase Self-Hosted** na VPS AtomicaBR.
> NUNCA crie tabelas `evolution_*` no Supabase Lovable. Elas já existem no self-hosted.

---

> **Atualização 2026-07-15**: O projeto foi consolidado para um ÚNICO Supabase Self-Hosted.
> Schema principal: `zapp`. Veja [../SCHEMA_REFERENCE.md](../SCHEMA_REFERENCE.md).

## 1. Arquitetura de Dados

O ZAPP Web usa **um único Supabase Self-Hosted** com múltiplos schemas:

| Banco | Tipo | URL | Função |
|-------|------|-----|--------|
| **Lovable Supabase** | Cloud (Lovable) | `allrjhkpuscmgbsnmjlv.supabase.co` | Auth, profiles, whatsapp_connections, UI state |
| **Self-Hosted Supabase** | VPS AtomicaBR | `supabase.atomicabr.com.br` | WhatsApp: mensagens, contatos, conversas, CRM, pipeline |

### Regra de ouro:
- **Lovable Supabase** = dados do aplicativo (auth, configurações, conexões)
- **Self-Hosted Supabase** = dados do WhatsApp (todas as tabelas `evolution_*`)

---

## 2. Credenciais do Self-Hosted

```
URL:       https://supabase.atomicabr.com.br
Anon Key:  eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogImFub24iLAogICJpc3MiOiAic3VwYWJhc2UiLAogICJpYXQiOiAxNzE1MDUwODAwLAogICJleHAiOiAxODcyODE3MjAwCn0.rvamc0XHuSCYB1glBwOCCxgfd9yxWVYLnhFzg5-7TRk
```

Estas credenciais já estão hardcoded no arquivo:
`src/integrations/supabase/externalClient.ts`

---

## 3. Como o Frontend Acessa o Self-Hosted

O arquivo `src/integrations/supabase/externalClient.ts` exporta:

```typescript
import { externalSupabase, isExternalConfigured } from '@/integrations/supabase/externalClient';

// Uso:
const { data } = await externalSupabase!.rpc('rpc_list_messages_lite', {
  p_remote_jid: '5511999990000@s.whatsapp.net',
  p_instance: 'wpp2',
  p_limit: 50
});
```

**IMPORTANTE**: Quando precisar ler mensagens, contatos, conversas ou qualquer dado `evolution_*`, use `externalSupabase` — NUNCA `supabase` (que é o client Lovable).

---

## 4. Tabelas Principais no Self-Hosted

### 4.1 evolution_messages (1.837.215 registros, 3.9 GB)
**Particionada por `instance_name`** (LIST partitioning).

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid (PK) | ID único |
| message_id | text | ID da mensagem no WhatsApp |
| remote_jid | text | JID do contato (ex: `5511999990000@s.whatsapp.net`) |
| from_me | boolean | `true` = enviada, `false` = recebida |
| message_type | varchar | `text`, `image`, `video`, `audio`, `ptt`, `document`, `sticker`, `contact`, `location`, `reaction`, `poll` |
| content | text | Conteúdo textual da mensagem |
| media_url | text | URL da mídia no S3/MinIO |
| media_mimetype | text | MIME type da mídia |
| media_filename | varchar | Nome do arquivo |
| media_size | int | Tamanho em bytes |
| caption | text | Legenda de imagem/vídeo |
| quoted_message_id | text | ID da mensagem citada |
| status | varchar | `pending`, `sent`, `delivered`, `read`, `failed` |
| status_at | timestamptz | Quando o status mudou |
| push_name | text | Nome do remetente no WhatsApp |
| instance_name | varchar | `wpp2`, `wpp_pink_test`, etc. |
| contact_id | uuid (FK) | Referência ao evolution_contacts |
| conversation_id | uuid (FK) | Referência ao evolution_conversations |
| direction | varchar | `inbound` ou `outbound` |
| is_starred | boolean | Mensagem favorita |
| is_important | boolean | Marcada como importante |
| category | text | Categoria IA |
| sentiment | text | Análise de sentimento |
| tags | text[] | Tags manuais |
| notes | text | Notas do agente |
| follow_up_at | timestamptz | Data de follow-up |
| follow_up_done | boolean | Follow-up concluído |
| sent_by_bot | boolean | Enviada por bot/automação |
| template_name | varchar | Nome do template HSM |
| payload | jsonb | Payload original completo |
| raw_data | jsonb | Dados brutos do webhook |
| deleted_at | timestamptz | Soft delete |
| created_at | timestamptz | Data de criação |

**Partições existentes:**
- `evolution_messages_wpp2` (3.9 GB — produção principal)
- `evolution_messages_wpp_pink_test` (18 MB)
- `evolution_messages_default`
- `evolution_messages_vendedor_01` a `_07`
- `evolution_messages_financeiro`, `_compras`, `_logistica`, `_sac`, `_diretoria`, `_marketing`

**Índices:**
- `idx_evo_msgs_remote_jid_created` — busca mensagens de um contato
- `idx_evo_msgs_instance_created` — busca por instância
- `idx_evo_msgs_message_id` — busca por ID
- GIN `idx_messages_content_search` — full-text search em português

---

### 4.2 evolution_contacts (12.754 registros, 15 MB)

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid (PK) | ID único |
| remote_jid | varchar (UNIQUE) | JID do contato |
| phone_number | varchar | Número normalizado (só dígitos) |
| push_name | varchar | Nome no WhatsApp |
| profile_picture_url | text | URL da foto de perfil |
| full_name | varchar | Nome completo (editável) |
| email | varchar | Email |
| company | varchar | Empresa |
| role_title | varchar | Cargo |
| lead_status | varchar | `new`, `contacted`, `qualified`, `proposal`, `customer`, `lost` |
| lead_source | varchar | Origem do lead |
| lead_score | int | Score do lead (0-100) |
| whatsapp_labels | text[] | Labels do WhatsApp |
| tags | text[] | Tags customizadas |
| assigned_to | varchar | Agente responsável |
| first_contact_at | timestamptz | Primeiro contato |
| last_message_at | timestamptz | Última mensagem |
| total_messages | int | Total de mensagens |
| total_purchases | numeric | Total de compras |
| notes | text | Notas |
| instance_name | varchar | Instância WhatsApp |
| message_count | int | Contador de mensagens |
| created_at | timestamptz | Criação |
| updated_at | timestamptz | Atualização |
| deleted_at | timestamptz | Soft delete |

---

### 4.3 evolution_conversations (1.802 registros)
**Particionada por `instance_name`.**

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid (PK) | ID único |
| contact_id | uuid (FK) | Referência ao contato |
| remote_jid | varchar | JID do contato/grupo |
| status | varchar | `open`, `pending`, `resolved`, `archived` |
| assigned_to | varchar | Agente responsável |
| department | varchar | Departamento |
| subject | varchar | Assunto |
| priority | varchar | `low`, `normal`, `high`, `urgent` |
| labels | text[] | Labels |
| message_count | int | Total de mensagens |
| first_message_at | timestamptz | Primeira mensagem |
| last_message_at | timestamptz | Última mensagem |
| last_inbound_at | timestamptz | Última recebida |
| last_outbound_at | timestamptz | Última enviada |
| first_response_at | timestamptz | Primeiro response |
| first_response_seconds | int | SLA: tempo até resposta |
| resolution_at | timestamptz | Quando resolveu |
| resolution_seconds | int | SLA: tempo até resolução |
| is_bot_active | boolean | Bot ativo nesta conversa |
| satisfaction_score | int | CSAT (1-5) |
| instance_name | varchar | Instância WhatsApp |
| unread_count | int | Mensagens não lidas |
| last_message_content | text | Preview da última msg |
| last_message_type | text | Tipo da última msg |

---

### 4.4 Outras Tabelas Importantes

| Tabela | Registros | Descrição |
|--------|-----------|----------|
| `evolution_groups` | 25 | Grupos WhatsApp |
| `evolution_calls` | 20 | Chamadas recebidas/perdidas |
| `evolution_labels` | 9 | Labels do WhatsApp |
| `evolution_label_associations` | — | Associação label - contato |
| `evolution_deals` | 9 | Negócios no CRM pipeline |
| `evolution_tasks` | 10 | Tarefas de follow-up |
| `evolution_quick_replies` | — | Respostas rápidas |
| `evolution_message_templates` | — | Templates HSM |
| `evolution_tags` | — | Tags customizadas |
| `evolution_settings` | — | Configurações do sistema |
| `evolution_webhook_events` | ~22K | Log de todos os eventos |
| `evolution_dlq` | 0 | Dead Letter Queue |
| `evolution_notifications` | — | Notificações do sistema |
| `evolution_alerts` | — | Alertas de conexão |
| `evolution_blacklist` | — | Números bloqueados |
| `evolution_business_hours` | — | Horário de atendimento |
| `evolution_broadcasts` | — | Listas de transmissão |
| `evolution_campaigns` | — | Campanhas |
| `evolution_sentiment_analysis` | — | Análise de sentimento IA |
| `evolution_audit_log` | — | Log de auditoria |
| `evolution_daily_metrics` | — | Métricas diárias |

**Total: 97+ tabelas `evolution_*` com ~4.2 GB de dados.**

---

## 5. RPCs Disponíveis (47 funções)

Todas acessíveis via `externalSupabase!.rpc('nome', { params })`

### Mensagens
| RPC | Descrição |
|-----|-----------|
| `rpc_list_messages_lite(p_remote_jid, p_instance, p_limit, p_before_date)` | Lista mensagens de um contato (paginação por cursor) |
| `rpc_list_messages(p_remote_jid, p_instance, p_limit, p_before_date)` | Lista mensagens (completa) |
| `rpc_list_messages_all(p_instance, p_contact_id, p_conversation_id, p_direction, p_message_type, p_search, p_limit, p_offset)` | Busca avançada |
| `rpc_search_messages(p_query, p_instance, p_limit)` | Full-text search em português |
| `rpc_insert_message(p_remote_jid, p_content, p_message_type, p_message_id, p_from_me, p_direction, p_instance)` | Inserir mensagem |
| `rpc_message_stats(p_instance, p_days_back, p_assigned_to)` | Estatísticas |

### Contatos
| RPC | Descrição |
|-----|-----------|
| `rpc_list_contacts(p_instance, p_lead_status, p_assigned_to, p_search, p_limit, p_offset)` | Lista contatos com filtros |
| `rpc_get_contact(p_remote_jid, p_instance)` | Busca contato por JID |
| `rpc_get_contact(p_contact_id)` | Busca contato por ID |
| `rpc_upsert_contact(p_remote_jid, p_instance, p_push_name, p_full_name, ...)` | Criar/atualizar contato |
| `rpc_delete_contact(p_remote_jid, p_instance, p_performed_by)` | Soft delete contato |

### Conversas
| RPC | Descrição |
|-----|-----------|
| `rpc_list_conversations(p_instance, p_status, p_assigned_to, p_limit)` | Lista conversas |

### CRM / Pipeline
| RPC | Descrição |
|-----|-----------|
| `rpc_list_deals(p_stage, p_assigned_to, p_contact_id, p_instance, p_limit, p_offset)` | Lista negócios |
| `rpc_upsert_deal(p_title, p_id, p_contact_id, ...)` | Criar/atualizar deal |
| `rpc_change_deal_stage(p_id, p_new_stage, p_performed_by, ...)` | Mover deal no pipeline |
| `rpc_get_pipeline()` | Dados do pipeline |

### Labels / Tags
| RPC | Descrição |
|-----|-----------|
| `rpc_list_labels(p_instance, p_type, p_search, p_limit, p_offset)` | Lista labels |
| `rpc_upsert_label(p_name, p_id, p_label_id, p_color, ...)` | Criar/atualizar label |
| `rpc_associate_label(p_label_id, p_entity_type, p_entity_id, p_action)` | Associar/desassociar label |

### Tasks
| RPC | Descrição |
|-----|-----------|
| `rpc_list_tasks(p_assigned_to, p_status, p_contact_id, ...)` | Lista tarefas |
| `rpc_create_task(p_title, p_contact_id, p_deal_id, ...)` | Criar tarefa |
| `rpc_complete_task(p_id, p_completed_by, p_notes)` | Completar tarefa |

### Outros
| RPC | Descrição |
|-----|-----------|
| `rpc_list_groups(p_instance, p_search, p_limit, p_offset)` | Lista grupos |
| `rpc_list_calls(p_remote_jid, p_instance, p_limit)` | Lista chamadas |
| `rpc_list_media(p_remote_jid, p_media_type, p_limit, p_offset)` | Lista mídias |
| `rpc_global_search(p_query, p_instance, p_limit)` | Busca global |
| `rpc_instance_stats(p_instance)` | Estatísticas da instância |
| `rpc_get_metrics_dashboard()` | Dashboard de métricas |
| `rpc_refresh_metrics(p_dummy)` | Refresh da view materializada |
| `rpc_webhook_health_monitor()` | Saúde do webhook |

---

## 6. Pipeline de Dados (WhatsApp para Frontend)

```
WhatsApp (celular)
  -> WebSocket (Baileys)
Evolution API (evolution.atomicabr.com.br)
  -> Webhook direto + RabbitMQ (dual-path)
  -> supabase.atomicabr.com.br/functions/v1/evolution-webhook
  -> Edge function v2.1 (INSERT raw)
  -> evolution_webhook_events (INSERT)
  -> 9 TRIGGERS processam automaticamente:
     -> trg_auto_process_messages  = evolution_messages
     -> trg_auto_process_contacts  = evolution_contacts
     -> trg_auto_process_chats     = evolution_conversations
     -> trg_auto_process_connection = evolution_settings + alerts
     -> trg_auto_process_msg_update = evolution_messages (status)
     -> trg_auto_process_msg_delete = evolution_messages (deleted_at)
     -> trg_auto_sync_group        = evolution_groups
     -> trg_alert_connection       = evolution_alerts
     -> trg_track_connection       = session history
  -> Supabase Realtime (pubviaroot=true)
  -> WebSocket push
  -> Frontend ZAPP Web (externalSupabase)
```

---

## 7. Realtime (Tabelas com Push Notifications)

O Realtime está configurado com `publish_via_partition_root = true`.

Tabelas no Realtime: evolution_messages, evolution_contacts, evolution_conversations, evolution_alerts, evolution_calls, evolution_deals, evolution_labels, evolution_label_associations, evolution_realtime_events, evolution_settings, evolution_tasks

**Exemplo de subscribe:**
```typescript
externalSupabase!.channel('new-messages')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'evolution_messages',
    filter: `instance_name=eq.wpp2`
  }, (payload) => {
    addMessage(payload.new);
  })
  .subscribe();
```

---

## 8. View Materializada (Dashboard de Métricas)

```sql
SELECT * FROM mv_instance_metrics
-- Colunas: instance_name, total_messages, msgs_24h, msgs_7d,
--          sent, received, unique_contacts, active_contacts_24h,
--          last_message_at, first_message_at

-- Refresh via RPC:
externalSupabase!.rpc('rpc_refresh_metrics', { p_dummy: 'refresh' })
```

---

## 9. RLS (Row Level Security)

Todas as tabelas `evolution_*` têm RLS habilitado.
- `anon` = SELECT (leitura)
- `authenticated` = SELECT, INSERT
- `service_role` = ALL

Todas as RPCs têm `GRANT EXECUTE TO anon, authenticated`.

---

## 10. Regras para o Lovable AI

### FAÇA:
- Use `externalSupabase` de `@/integrations/supabase/externalClient` para ler/escrever dados de WhatsApp
- Use as RPCs listadas acima (são otimizadas e seguras)
- Use `externalSupabase.channel()` para Realtime em tabelas `evolution_*`
- Filtre sempre por `instance_name` (ex: `p_instance: 'wpp2'`)
- Use `rpc_list_messages_lite` para carregar mensagens no chat
- Use `rpc_search_messages` para busca full-text
- Use `rpc_get_contact` para buscar contato por JID

### NÃO FAÇA:
- NUNCA crie tabelas `evolution_*` no Supabase Lovable
- NUNCA use `supabase` (Lovable client) para acessar mensagens/contatos
- NUNCA migre dados do self-hosted para o Lovable
- NUNCA duplique RPCs no Supabase Lovable
- NUNCA altere `externalClient.ts` sem autorização
- NUNCA use o FATOR X cloud (tdprnylgyrogbbhgdoik) — foi descontinuado

### Qual banco usar para cada feature:

| Feature | Banco | Client |
|---------|-------|--------|
| Login/Auth | Lovable | `supabase` |
| Profiles | Lovable | `supabase` |
| whatsapp_connections | Lovable | `supabase` |
| user_settings | Lovable | `supabase` |
| Edge functions (evolution-api) | Lovable | `supabase.functions.invoke` |
| **Mensagens WhatsApp** | **Self-Hosted** | `externalSupabase` |
| **Contatos WhatsApp** | **Self-Hosted** | `externalSupabase` |
| **Conversas** | **Self-Hosted** | `externalSupabase` |
| **CRM/Pipeline** | **Self-Hosted** | `externalSupabase` |
| **Labels/Tags** | **Self-Hosted** | `externalSupabase` |
| **Tasks** | **Self-Hosted** | `externalSupabase` |
| **Groups** | **Self-Hosted** | `externalSupabase` |
| **Calls** | **Self-Hosted** | `externalSupabase` |
| **Media Library** | **Self-Hosted** | `externalSupabase` |
| **Quick Replies** | **Self-Hosted** | `externalSupabase` |
| **Templates** | **Self-Hosted** | `externalSupabase` |
| **Broadcasts** | **Self-Hosted** | `externalSupabase` |
| **Audit Log** | **Self-Hosted** | `externalSupabase` |
| **Notifications** | **Self-Hosted** | `externalSupabase` |

---

## 11. Evolution API

```
URL:     https://evolution.atomicabr.com.br
API Key: Salva pelo usuario em Integracoes > Evolution API (localStorage)
```

O frontend chama a Evolution API diretamente via `evolutionDirectClient.ts` quando a config está salva no localStorage.

Instâncias:
- `wpp2` — Promo Brindes (+55 11 4637-5517) — produção principal
- `wpp_pink_test` — Brindes (+55 64 8445-0900) — teste

---

## 12. Números Importantes

| Métrica | Valor |
|---------|-------|
| Tamanho total do banco | 4.2 GB |
| Total de mensagens | 1.837.215 |
| Total de contatos | 12.754 |
| Total de conversas | 1.802 |
| Total de tabelas | 97+ |
| Total de RPCs | 47 |
| Total de triggers | 9 |
| Latência do webhook | ~50ms |

---

*Última atualização: 2026-05-02*
