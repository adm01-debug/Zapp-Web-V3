# Inventário de Tabelas — Lovable Cloud (schema `public`)

> **Arquitetura atual**: Supabase Self-Hosted (`supabase.atomicabr.com.br`), schema `zapp`. Veja [SCHEMA_REFERENCE.md](SCHEMA_REFERENCE.md).


> Gerado por introspecção read-only do banco vivo. Total: **146 tabelas**.

## Sumário Executivo

- **Tabelas totais**: 146
- **Com RLS habilitado**: 146 (100%)
- **Sem RLS**: 0
- **Com pelo menos 1 policy**: 146
- **RLS ligado mas sem policies (bloqueio total)**: 0
- **Total de FKs mapeadas**: 194

## Índice por Domínio

- **🔐 Auth & Segurança** (21 tabelas) — Autenticação, autorização, MFA, geo-blocking, auditoria e trilha de segurança.
- **💬 Inbox & Conversas** (12 tabelas) — Núcleo do atendimento: contatos, mensagens, eventos, transferências e análises de conversa.
- **📱 WhatsApp / Evolution** (19 tabelas) — Conexões WhatsApp (Evolution API + Cloud), instâncias, QR, health e DLQ de webhooks.
- **📧 Email / Gmail** (5 tabelas) — Contas de e-mail conectadas, threads, mensagens e labels Gmail.
- **👥 Filas, Times & Departamentos** (12 tabelas) — Filas de atendimento, membros, metas de fila, times internos e mensagens de equipe.
- **🎯 Roteamento, SLA & Skills** (9 tabelas) — Canais, regras de roteamento, carteira de clientes, SLA, horário comercial e ausência.
- **📊 CRM / Vendas / Contatos** (13 tabelas) — CRM: negócios, pipeline, produtos, compras, tags, notas e campos custom.
- **🤖 IA, Chatbot & Automação** (15 tabelas) — Provedores de IA, uso, chatbot flows, automações, follow-ups, base de conhecimento e templates.
- **📣 Campanhas & Talk X** (6 tabelas) — Campanhas outbound, A/B tests, Talk X (envio humanizado) e blacklist.
- **📈 Métricas, Gamificação & Pesquisas** (11 tabelas) — Estatísticas de agente, achievements, snapshots de performance, CSAT/NPS e reputação de número.
- **🎨 Mídia (Memes, Stickers, Emojis)** (4 tabelas) — Bibliotecas de mídia reutilizável no chat.
- **⚙️ Configurações, Notificações & Relatórios** (11 tabelas) — Preferências globais/usuário, dispositivos, notificações, relatórios agendados e treinamentos.
- **🚨 War Room / Crise** (2 tabelas) — Alertas de sala de crise e war room.
- **🔒 Integrações & Rate Limiting** (5 tabelas) — Integrações específicas (Sicoob), visibilidade cross-agente e rate limiting.
- **📦 Não classificadas** (1 tabelas) — Tabelas ainda não agrupadas em domínio.


---

## 🔐 Auth & Segurança

_Autenticação, autorização, MFA, geo-blocking, auditoria e trilha de segurança._

### `user_roles`
**Função:** Vínculo usuário → role (fonte de verdade para autorização).  
**RLS:** 🟢 on · **Policies:** 2 · **Linhas:** 7 · **Colunas:** 4  
**Colunas:** `id` (uuid) _PK/NN_, `user_id` (uuid) _FK→auth.users/NN_, `role` (USER-DEFINED) _NN_, `created_at` (timestamp with time zone) _NN_

### `profiles`
**Função:** Perfil público do usuário (não conter roles).  
**RLS:** 🟢 on · **Policies:** 6 · **Linhas:** 3 · **Colunas:** 24  
**Colunas:** `id` (uuid) _PK/NN_, `user_id` (uuid) _FK→auth.users/NN_, `name` (text) _NN_, `email` (text), `avatar_url` (text), `role` (text), `max_chats` (integer), `created_at` (timestamp with time zone) _NN_, `updated_at` (timestamp with time zone) _NN_, `job_title` (text), `department` (text), `phone` (text), `access_level` (text), `permissions` (jsonb), `is_active` (boolean), `session_invalidated_at` (timestamp with time zone), `birthday` (date), `nickname` (text), `signature` (text), `can_download` (boolean) _NN_, `department_id` (uuid) _FK→departments_, `_admin_user_id` (uuid), `last_seen` (timestamp with time zone), `online_status` (text)

### `login_attempts`
**Função:** Tentativas de login para rate-limit e lockout progressivo.  
**RLS:** 🟢 on · **Policies:** 4 · **Linhas:** 2 · **Colunas:** 9  
**Colunas:** `id` (uuid) _PK/NN_, `email` (text) _NN_, `ip_address` (text), `user_agent` (text), `attempt_count` (integer) _NN_, `last_attempt_at` (timestamp with time zone) _NN_, `locked_until` (timestamp with time zone), `created_at` (timestamp with time zone) _NN_, `updated_at` (timestamp with time zone) _NN_

### `mfa_sessions`
**Função:** Sessões MFA temporárias durante fluxo de login 2FA.  
**RLS:** 🟢 on · **Policies:** 1 · **Linhas:** 0 · **Colunas:** 6  
**Colunas:** `id` (uuid) _PK/NN_, `user_id` (uuid) _FK→auth.users/NN_, `factor_id` (text) _NN_, `verified_at` (timestamp with time zone), `created_at` (timestamp with time zone) _NN_, `expires_at` (timestamp with time zone) _NN_

### `passkey_credentials`
**Função:** Credenciais WebAuthn/passkey por usuário.  
**RLS:** 🟢 on · **Policies:** 4 · **Linhas:** 0 · **Colunas:** 11  
**Colunas:** `id` (uuid) _PK/NN_, `user_id` (uuid) _FK→auth.users/NN_, `credential_id` (text) _NN_, `public_key` (text) _NN_, `counter` (bigint) _NN_, `device_type` (text), `backed_up` (boolean), `transports` (ARRAY), `friendly_name` (text), `created_at` (timestamp with time zone) _NN_, `last_used_at` (timestamp with time zone)

### `webauthn_challenges`
**Função:** Challenges WebAuthn temporários (expiram).  
**RLS:** 🟢 on · **Policies:** 2 · **Linhas:** 0 · **Colunas:** 6  
**Colunas:** `id` (uuid) _PK/NN_, `user_id` (uuid), `challenge` (text) _NN_, `type` (text) _NN_, `created_at` (timestamp with time zone) _NN_, `expires_at` (timestamp with time zone) _NN_

### `blocked_ips`
**Função:** IPs bloqueados para login (com expiração opcional).  
**RLS:** 🟢 on · **Policies:** 4 · **Linhas:** 0 · **Colunas:** 10  
**Colunas:** `id` (uuid) _PK/NN_, `ip_address` (text) _NN_, `reason` (text) _NN_, `blocked_by` (uuid) _FK→auth.users_, `blocked_at` (timestamp with time zone) _NN_, `expires_at` (timestamp with time zone), `is_permanent` (boolean), `request_count` (integer), `last_attempt_at` (timestamp with time zone), `created_at` (timestamp with time zone) _NN_

### `blocked_countries`
**Função:** Blacklist de países quando geo_blocking em modo blacklist.  
**RLS:** 🟢 on · **Policies:** 3 · **Linhas:** 0 · **Colunas:** 6  
**Colunas:** `id` (uuid) _PK/NN_, `country_code` (text) _NN_, `country_name` (text) _NN_, `reason` (text), `blocked_by` (uuid) _FK→auth.users_, `created_at` (timestamp with time zone) _NN_

### `allowed_countries`
**Função:** Whitelist de países quando geo_blocking em modo whitelist.  
**RLS:** 🟢 on · **Policies:** 3 · **Linhas:** 0 · **Colunas:** 5  
**Colunas:** `id` (uuid) _PK/NN_, `country_code` (text) _NN_, `country_name` (text) _NN_, `added_by` (uuid) _FK→auth.users_, `created_at` (timestamp with time zone) _NN_

### `ip_whitelist`
**Função:** IPs em whitelist (bypass de bloqueios).  
**RLS:** 🟢 on · **Policies:** 2 · **Linhas:** 0 · **Colunas:** 5  
**Colunas:** `id` (uuid) _PK/NN_, `ip_address` (text) _NN_, `description` (text), `added_by` (uuid) _FK→auth.users_, `created_at` (timestamp with time zone) _NN_

### `geo_blocking_settings`
**Função:** Modo geo-blocking global (disabled/whitelist/blacklist).  
**RLS:** 🟢 on · **Policies:** 2 · **Linhas:** 0 · **Colunas:** 5  
**Colunas:** `id` (uuid) _PK/NN_, `mode` (text) _NN_, `updated_by` (uuid) _FK→auth.users_, `created_at` (timestamp with time zone) _NN_, `updated_at` (timestamp with time zone) _NN_

### `password_reset_requests`
**Função:** Solicitações de reset de senha (fluxo admin-approve).  
**RLS:** 🟢 on · **Policies:** 4 · **Linhas:** 0 · **Colunas:** 13  
**Colunas:** `id` (uuid) _PK/NN_, `user_id` (uuid) _FK→auth.users/NN_, `email` (text) _NN_, `reason` (text), `status` (text) _NN_, `reviewed_by` (uuid) _FK→auth.users_, `reviewed_at` (timestamp with time zone), `rejection_reason` (text), `token_expires_at` (timestamp with time zone), `ip_address` (text), `user_agent` (text), `created_at` (timestamp with time zone) _NN_, `updated_at` (timestamp with time zone) _NN_

### `security_alerts`
**Função:** Alertas de segurança gerados pelo sistema.  
**RLS:** 🟢 on · **Policies:** 2 · **Linhas:** 0 · **Colunas:** 12  
**Colunas:** `id` (uuid) _PK/NN_, `alert_type` (text) _NN_, `severity` (text) _NN_, `title` (text) _NN_, `description` (text), `ip_address` (text), `user_id` (uuid) _FK→auth.users_, `metadata` (jsonb), `is_resolved` (boolean), `resolved_by` (uuid) _FK→auth.users_, `resolved_at` (timestamp with time zone), `created_at` (timestamp with time zone) _NN_

### `security_audit_logs`
**Função:** Auditoria específica de eventos de segurança.  
**RLS:** 🟢 on · **Policies:** 5 · **Linhas:** 1 · **Colunas:** 10  
**Colunas:** `id` (uuid) _PK/NN_, `user_id` (uuid) _FK→auth.users_, `event_type` (text) _NN_, `resource` (text), `action` (text), `status` (text) _NN_, `details` (jsonb), `ip_address` (text), `user_agent` (text), `created_at` (timestamp with time zone)

### `audit_logs`
**Função:** Trilha de auditoria genérica (ações de usuário sobre entidades).  
**RLS:** 🟢 on · **Policies:** 5 · **Linhas:** 29 · **Colunas:** 9  
**Colunas:** `id` (uuid) _PK/NN_, `user_id` (uuid) _FK→auth.users_, `action` (text) _NN_, `entity_type` (text), `entity_id` (uuid), `details` (jsonb), `ip_address` (text), `user_agent` (text), `created_at` (timestamp with time zone) _NN_

### `rls_denied_log`
**Função:** Log estruturado de acessos negados por RLS (observabilidade).  
**RLS:** 🟢 on · **Policies:** 1 · **Linhas:** 0 · **Colunas:** 6  
**Colunas:** `id` (uuid) _PK/NN_, `user_id` (uuid), `resource` (text) _NN_, `required_role` (text), `context` (jsonb) _NN_, `created_at` (timestamp with time zone) _NN_

### `permissions`
**Função:** Catálogo de permissões nomeadas.  
**RLS:** 🟢 on · **Policies:** 3 · **Linhas:** 12 · **Colunas:** 5  
**Colunas:** `id` (uuid) _PK/NN_, `name` (text) _NN_, `description` (text), `category` (text) _NN_, `created_at` (timestamp with time zone) _NN_

### `role_permissions`
**Função:** Vínculo role → permissions.  
**RLS:** 🟢 on · **Policies:** 3 · **Linhas:** 47 · **Colunas:** 4  
**Colunas:** `id` (uuid) _PK/NN_, `role` (USER-DEFINED) _NN_, `permission_id` (uuid) _FK→permissions/NN_, `created_at` (timestamp with time zone) _NN_

### `route_permissions`
**Função:** Permissões por rota de frontend.  
**RLS:** 🟢 on · **Policies:** 2 · **Linhas:** 3 · **Colunas:** 6  
**Colunas:** `path` (text) _NN_, `allowed_roles` (ARRAY) _NN_, `description` (text), `is_system` (boolean) _NN_, `created_at` (timestamp with time zone) _NN_, `updated_at` (timestamp with time zone) _NN_

### `user_sessions`
**Função:** Sessões ativas por usuário (multi-dispositivo).  
**RLS:** 🟢 on · **Policies:** 4 · **Linhas:** 0 · **Colunas:** 10  
**Colunas:** `id` (uuid) _PK/NN_, `user_id` (uuid) _NN_, `device_id` (uuid) _FK→user_devices_, `ip_address` (text), `user_agent` (text), `is_active` (boolean), `started_at` (timestamp with time zone) _NN_, `last_activity_at` (timestamp with time zone) _NN_, `expires_at` (timestamp with time zone) _NN_, `ended_at` (timestamp with time zone)

### `user_devices`
**Função:** Dispositivos registrados por usuário (push, MFA).  
**RLS:** 🟢 on · **Policies:** 5 · **Linhas:** 0 · **Colunas:** 13  
**Colunas:** `id` (uuid) _PK/NN_, `user_id` (uuid) _NN_, `device_fingerprint` (text) _NN_, `device_name` (text), `browser` (text), `os` (text), `ip_address` (text), `city` (text), `country` (text), `is_trusted` (boolean), `first_seen_at` (timestamp with time zone) _NN_, `last_seen_at` (timestamp with time zone) _NN_, `created_at` (timestamp with time zone) _NN_


---

## 💬 Inbox & Conversas

_Núcleo do atendimento: contatos, mensagens, eventos, transferências e análises de conversa._

### `contacts`
**Função:** Contatos/conversas do inbox (cerne do produto).  
**RLS:** 🟢 on · **Policies:** 3 · **Linhas:** 0 · **Colunas:** 26  
**Colunas:** `id` (uuid) _PK/NN_, `name` (text) _NN_, `phone` (text) _NN_, `email` (text), `avatar_url` (text), `assigned_to` (uuid) _FK→profiles_, `whatsapp_connection_id` (uuid) _FK→whatsapp_connections_, `tags` (ARRAY), `notes` (text), `created_at` (timestamp with time zone) _NN_, `updated_at` (timestamp with time zone) _NN_, `nickname` (text), `surname` (text), `job_title` (text), `company` (text), `queue_id` (uuid) _FK→queues_, `contact_type` (text), `ai_priority` (text), `ai_sentiment` (text), `channel_type` (text), `channel_connection_id` (uuid) _FK→channel_connections_, `group_category` (text), `lead_score` (integer), `risk_score` (integer), `lead_origin` (text), `consent_status` (text)

### `messages`
**Função:** Mensagens individuais das conversas (inbound/outbound).  
**RLS:** 🟢 on · **Policies:** 6 · **Linhas:** 0 · **Colunas:** 26  
**Colunas:** `id` (uuid) _PK/NN_, `contact_id` (uuid) _FK→contacts_, `whatsapp_connection_id` (uuid) _FK→whatsapp_connections_, `sender` (text) _NN_, `content` (text) _NN_, `message_type` (text) _NN_, `media_url` (text), `is_read` (boolean), `agent_id` (uuid) _FK→profiles_, `external_id` (text), `created_at` (timestamp with time zone) _NN_, `updated_at` (timestamp with time zone) _NN_, `transcription` (text), `transcription_status` (text), `status` (text), `status_updated_at` (timestamp with time zone), `is_deleted` (boolean), `channel_type` (text), `channel_connection_id` (uuid) _FK→channel_connections_, `is_edited` (boolean) _NN_, `media_meta` (jsonb), `media_type` (text), `media_mimetype` (text), `link_preview` (jsonb), `reply_to_id` (uuid) _FK→messages_, `deleted_at` (timestamp with time zone)

### `message_reactions`
**Função:** Reações (emoji) em mensagens (WhatsApp reactions).  
**RLS:** 🟢 on · **Policies:** 7 · **Linhas:** 0 · **Colunas:** 6  
**Colunas:** `id` (uuid) _PK/NN_, `message_id` (uuid) _FK→messages/NN_, `user_id` (uuid) _FK→profiles_, `contact_id` (uuid) _FK→contacts_, `emoji` (text) _NN_, `created_at` (timestamp with time zone) _NN_

### `conversation_events`
**Função:** Eventos de linha do tempo (transfer, assign, note, etc).  
**RLS:** 🟢 on · **Policies:** 2 · **Linhas:** 0 · **Colunas:** 10  
**Colunas:** `id` (uuid) _PK/NN_, `contact_id` (uuid) _FK→contacts/NN_, `event_type` (text) _NN_, `from_agent_id` (uuid) _FK→profiles_, `to_agent_id` (uuid) _FK→profiles_, `from_queue_id` (uuid) _FK→queues_, `to_queue_id` (uuid) _FK→queues_, `metadata` (jsonb), `performed_by` (uuid) _FK→profiles_, `created_at` (timestamp with time zone) _NN_

### `conversation_transfers`
**Função:** Transferências de conversa entre agentes/times/instâncias.  
**RLS:** 🟢 on · **Policies:** 2 · **Linhas:** 0 · **Colunas:** 34  
**Colunas:** `id` (uuid) _PK/NN_, `source_conversation_id` (uuid) _NN_, `from_agent_id` (uuid) _FK→profiles_, `to_agent_id` (uuid) _FK→profiles_, `from_queue_id` (uuid), `to_queue_id` (uuid), `status` (text) _NN_, `transfer_type` (text) _NN_, `priority` (integer), `sla_deadline` (timestamp with time zone), `context_summary` (text), `return_reason` (text), `ticket_number` (text) _NN_, `metadata` (jsonb), `created_at` (timestamp with time zone), `accepted_at` (timestamp with time zone), `completed_at` (timestamp with time zone), `updated_at` (timestamp with time zone), `source_instance` (text), `source_message_id` (uuid), `source_operator` (text), `target_instance` (text), `target_conversation_id` (uuid), `target_operator` (text), `contact_id` (uuid) _FK→contacts_, `remote_jid` (text), `contact_name` (text), `category` (text), `reason` (text), `context_messages` (jsonb), `tags` (ARRAY), `expires_at` (timestamp with time zone), `resolution_notes` (text), `resolution_type` (text)

### `transfer_comments`
**Função:** Comentários numa transferência de conversa.  
**RLS:** 🟢 on · **Policies:** 2 · **Linhas:** 0 · **Colunas:** 8  
**Colunas:** `id` (uuid) _PK/NN_, `transfer_id` (uuid) _FK→conversation_transfers/NN_, `agent_id` (uuid) _FK→profiles/NN_, `content` (text) _NN_, `metadata` (jsonb), `created_at` (timestamp with time zone), `author_name` (text), `author_instance` (text)

### `conversation_snoozes`
**Função:** Conversas 'silenciadas' até timestamp.  
**RLS:** 🟢 on · **Policies:** 3 · **Linhas:** 0 · **Colunas:** 6  
**Colunas:** `id` (uuid) _PK/NN_, `contact_id` (uuid) _FK→contacts/NN_, `snoozed_by` (uuid) _FK→profiles/NN_, `snooze_until` (timestamp with time zone) _NN_, `reason` (text), `created_at` (timestamp with time zone) _NN_

### `conversation_tasks`
**Função:** Tarefas atreladas a uma conversa (follow-up manual).  
**RLS:** 🟢 on · **Policies:** 4 · **Linhas:** 0 · **Colunas:** 12  
**Colunas:** `id` (uuid) _PK/NN_, `contact_id` (uuid) _FK→contacts_, `title` (text) _NN_, `description` (text), `assigned_to` (uuid) _FK→profiles_, `created_by` (uuid) _FK→profiles_, `due_date` (timestamp with time zone), `priority` (text) _NN_, `status` (text) _NN_, `completed_at` (timestamp with time zone), `created_at` (timestamp with time zone) _NN_, `updated_at` (timestamp with time zone) _NN_

### `conversation_closures`
**Função:** Motivo/detalhes de encerramento de conversa.  
**RLS:** 🟢 on · **Policies:** 2 · **Linhas:** 0 · **Colunas:** 8  
**Colunas:** `id` (uuid) _PK/NN_, `contact_id` (uuid) _FK→contacts/NN_, `closed_by` (uuid) _FK→profiles_, `close_reason` (text) _NN_, `outcome` (text), `classification` (text), `notes` (text), `created_at` (timestamp with time zone) _NN_

### `conversation_memory`
**Função:** Memória contextual persistida para IA por conversa.  
**RLS:** 🟢 on · **Policies:** 3 · **Linhas:** 0 · **Colunas:** 11  
**Colunas:** `id` (uuid) _PK/NN_, `contact_id` (uuid) _FK→contacts/NN_, `facts` (jsonb), `objections_handled` (jsonb), `promises_made` (jsonb), `pending_items` (jsonb), `commercial_summary` (text), `cumulative_summary` (text), `updated_by` (uuid) _FK→profiles_, `created_at` (timestamp with time zone) _NN_, `updated_at` (timestamp with time zone) _NN_

### `conversation_analyses`
**Função:** Análises de IA por conversa (sentimento, resumo, badges).  
**RLS:** 🟢 on · **Policies:** 2 · **Linhas:** 0 · **Colunas:** 16  
**Colunas:** `id` (uuid) _PK/NN_, `contact_id` (uuid) _FK→contacts/NN_, `analyzed_by` (uuid) _FK→profiles_, `summary` (text) _NN_, `status` (text) _NN_, `key_points` (ARRAY), `next_steps` (ARRAY), `sentiment` (text) _NN_, `sentiment_score` (integer), `topics` (ARRAY), `urgency` (text), `customer_satisfaction` (integer), `message_count` (integer), `created_at` (timestamp with time zone) _NN_, `department` (text), `relationship_type` (text)

### `conversation_sla`
**Função:** Estado SLA por conversa (deadlines, breaches).  
**RLS:** 🟢 on · **Policies:** 3 · **Linhas:** 0 · **Colunas:** 10  
**Colunas:** `id` (uuid) _PK/NN_, `contact_id` (uuid) _FK→contacts_, `sla_configuration_id` (uuid) _FK→sla_configurations_, `first_message_at` (timestamp with time zone) _NN_, `first_response_at` (timestamp with time zone), `resolved_at` (timestamp with time zone), `first_response_breached` (boolean), `resolution_breached` (boolean), `created_at` (timestamp with time zone) _NN_, `updated_at` (timestamp with time zone) _NN_


---

## 📱 WhatsApp / Evolution

_Conexões WhatsApp (Evolution API + Cloud), instâncias, QR, health e DLQ de webhooks._

### `whatsapp_connections`
**Função:** Conexões WhatsApp (Evolution + Cloud), estado, QR, agente.  
**RLS:** 🟢 on · **Policies:** 5 · **Linhas:** 0 · **Colunas:** 26  
**Colunas:** `id` (uuid) _PK/NN_, `name` (text) _NN_, `phone_number` (text) _NN_, `instance_id` (text), `status` (text), `qr_code` (text), `is_default` (boolean), `created_by` (uuid) _FK→profiles_, `created_at` (timestamp with time zone) _NN_, `updated_at` (timestamp with time zone) _NN_, `farewell_message` (text), `farewell_enabled` (boolean), `battery_level` (integer), `is_plugged` (boolean), `retry_count` (integer), `max_retries` (integer), `last_health_check` (timestamp with time zone), `health_status` (text), `health_response_ms` (integer), `auto_reconnect_enabled` (boolean), `reconnect_interval_seconds` (integer), `max_reconnect_attempts` (integer), `loop_protection_active` (boolean), `health_reason` (text), `degraded_at` (timestamp with time zone), `owner_jid` (text)

### `whatsapp_connection_queues`
**Função:** Vínculo conexão WhatsApp ↔ fila.  
**RLS:** 🟢 on · **Policies:** 2 · **Linhas:** 0 · **Colunas:** 4  
**Colunas:** `id` (uuid) _PK/NN_, `whatsapp_connection_id` (uuid) _FK→whatsapp_connections/NN_, `queue_id` (uuid) _FK→queues/NN_, `created_at` (timestamp with time zone) _NN_

### `whatsapp_groups`
**Função:** Grupos WhatsApp sincronizados.  
**RLS:** 🟢 on · **Policies:** 2 · **Linhas:** 0 · **Colunas:** 11  
**Colunas:** `id` (uuid) _PK/NN_, `whatsapp_connection_id` (uuid) _FK→whatsapp_connections_, `group_id` (text) _NN_, `name` (text) _NN_, `description` (text), `participant_count` (integer), `avatar_url` (text), `is_admin` (boolean), `created_at` (timestamp with time zone) _NN_, `updated_at` (timestamp with time zone) _NN_, `category` (text)

### `whatsapp_flows`
**Função:** WhatsApp Flows (formulários interativos).  
**RLS:** 🟢 on · **Policies:** 2 · **Linhas:** 0 · **Colunas:** 12  
**Colunas:** `id` (uuid) _PK/NN_, `name` (text) _NN_, `description` (text), `flow_json` (jsonb) _NN_, `screens` (jsonb) _NN_, `status` (text), `whatsapp_flow_id` (text), `whatsapp_connection_id` (uuid) _FK→whatsapp_connections_, `created_by` (uuid) _FK→profiles_, `published_at` (timestamp with time zone), `created_at` (timestamp with time zone), `updated_at` (timestamp with time zone)

### `whatsapp_templates`
**Função:** Templates aprovados WhatsApp Cloud (HSM).  
**RLS:** 🟢 on · **Policies:** 3 · **Linhas:** 0 · **Colunas:** 14  
**Colunas:** `id` (uuid) _PK/NN_, `name` (text) _NN_, `category` (text) _NN_, `language` (text) _NN_, `content` (text) _NN_, `header_text` (text), `footer_text` (text), `buttons` (jsonb), `variables` (ARRAY), `status` (text) _NN_, `whatsapp_connection_id` (uuid) _FK→whatsapp_connections_, `created_by` (uuid), `created_at` (timestamp with time zone) _NN_, `updated_at` (timestamp with time zone) _NN_

### `whatsapp_cloud_webhook_pings`
**Função:** Pings recebidos do WhatsApp Cloud API (health).  
**RLS:** 🟢 on · **Policies:** 1 · **Linhas:** 0 · **Colunas:** 4  
**Colunas:** `id` (uuid) _PK/NN_, `kind` (text) _NN_, `meta` (jsonb), `created_at` (timestamp with time zone)

### `whatsapp_official_credentials`
**Função:** Credenciais WhatsApp Cloud (token, phone_id).  
**RLS:** 🟢 on · **Policies:** 5 · **Linhas:** 0 · **Colunas:** 9  
**Colunas:** `id` (uuid) _PK/NN_, `connection_id` (uuid) _FK→whatsapp_connections_, `app_id` (text), `app_secret` (text), `access_token` (text), `phone_number_id` (text), `waba_id` (text), `created_at` (timestamp with time zone), `updated_at` (timestamp with time zone)

### `evolution_health_logs`
**Função:** Health-check das instâncias Evolution API.  
**RLS:** 🟢 on · **Policies:** 2 · **Linhas:** 0 · **Colunas:** 12  
**Colunas:** `id` (uuid) _PK/NN_, `connection_id` (uuid) _FK→whatsapp_connections_, `instance_name` (text), `status` (text), `response_time_ms` (integer), `error_count` (integer), `success_count` (integer), `created_at` (timestamp with time zone), `error_message` (text), `online_instances` (integer), `total_instances` (integer), `performed_at` (timestamp with time zone)

### `evolution_instance_credentials`
**Função:** Credenciais das instâncias Evolution (criptografadas).  
**RLS:** 🟢 on · **Policies:** 1 · **Linhas:** 0 · **Colunas:** 12  
**Colunas:** `id` (uuid) _PK/NN_, `connection_id` (uuid) _FK→whatsapp_connections_, `instance_name` (text) _NN_, `instance_token` (text), `webhook_url` (text), `created_at` (timestamp with time zone), `updated_at` (timestamp with time zone), `api_url` (text), `api_key` (text), `is_active` (boolean), `health_status` (text), `last_health_check` (timestamp with time zone)

### `evolution_retry_metrics`
**Função:** Métricas de retry/reconexão da Evolution.  
**RLS:** 🟢 on · **Policies:** 2 · **Linhas:** 483 · **Colunas:** 11  
**Colunas:** `id` (uuid) _PK/NN_, `action` (text) _NN_, `method` (text), `instance_name` (text), `idempotency_key` (text), `attempt_count` (integer), `final_status` (text), `final_http_status` (integer), `retry_reasons` (jsonb), `total_duration_ms` (integer), `created_at` (timestamp with time zone)

### `instance_auth_events`
**Função:** Eventos de autenticação de instância (success/failure/401/403).  
**RLS:** 🟢 on · **Policies:** 1 · **Linhas:** 0 · **Colunas:** 6  
**Colunas:** `id` (uuid) _PK/NN_, `instance_name` (text) _NN_, `event_type` (text) _NN_, `status_code` (integer), `meta` (jsonb), `created_at` (timestamp with time zone)

### `instance_processing_pauses`
**Função:** Pausas manuais/automáticas de processamento por instância.  
**RLS:** 🟢 on · **Policies:** 2 · **Linhas:** 0 · **Colunas:** 6  
**Colunas:** `id` (uuid) _PK/NN_, `instance_name` (text) _NN_, `paused_until` (timestamp with time zone) _NN_, `reason` (text), `trigger_count` (integer), `created_at` (timestamp with time zone)

### `instance_registry`
**Função:** Registro central de instâncias Evolution/WhatsApp Cloud.  
**RLS:** 🟢 on · **Policies:** 1 · **Linhas:** 0 · **Colunas:** 43  
**Colunas:** `id` (uuid) _PK/NN_, `instance_name` (character varying) _NN_, `display_name` (character varying), `owner_id` (uuid) _FK→profiles_, `status` (text), `connection_status` (text), `api_key` (text), `api_url` (text), `webhook_url` (text), `webhook_enabled` (boolean), `phone_number` (character varying), `profile_picture` (text), `is_master` (boolean), `proxy_host` (text), `proxy_port` (text), `proxy_user` (text), `proxy_pass` (text), `settings` (jsonb), `last_connected_at` (timestamp with time zone), `message_count_sent` (integer), `message_count_received` (integer), `error_logs` (text), `metadata` (jsonb), `created_at` (timestamp with time zone), `updated_at` (timestamp with time zone), `slot_name` (character varying), `department` (character varying), `usage_type` (character varying), `operator_name` (character varying), `operator_email` (character varying), `operator_since` (timestamp with time zone), `operator_phone` (character varying), `is_active` (boolean), `max_concurrent_chats` (integer), `sla_first_response_minutes` (integer), `sla_resolution_hours` (integer), `auto_reply_enabled` (boolean), `auto_reply_message` (text), `business_hours_enabled` (boolean), `bitrix_integration` (jsonb), `n8n_workflows` (jsonb), `config` (jsonb), `notes` (text)

### `reconnection_logs`
**Função:** Log de tentativas de reconexão de instância.  
**RLS:** 🟢 on · **Policies:** 2 · **Linhas:** 0 · **Colunas:** 6  
**Colunas:** `id` (uuid) _PK/NN_, `connection_id` (uuid) _FK→whatsapp_connections_, `attempt_number` (integer), `status` (text), `error_message` (text), `created_at` (timestamp with time zone)

### `qr_attempts`
**Função:** Tentativas de leitura de QR code por instância.  
**RLS:** 🟢 on · **Policies:** 2 · **Linhas:** 0 · **Colunas:** 12  
**Colunas:** `id` (uuid) _PK/NN_, `connection_id` (uuid) _FK→whatsapp_connections_, `status` (text), `error_code` (text), `metadata` (jsonb), `connected_at` (timestamp with time zone), `created_at` (timestamp with time zone), `expired_at` (timestamp with time zone), `error_message` (text), `instance_id` (text), `connection_name` (text), `requested_by` (uuid) _FK→auth.users_

### `processed_webhook_events`
**Função:** Idempotência: webhooks já processados.  
**RLS:** 🟢 on · **Policies:** 1 · **Linhas:** 0 · **Colunas:** 4  
**Colunas:** `event_id` (text) _NN_, `instance` (text), `event_type` (text), `processed_at` (timestamp with time zone)

### `failed_messages`
**Função:** Dead-letter queue de mensagens que falharam ao enviar.  
**RLS:** 🟢 on · **Policies:** 1 · **Linhas:** 0 · **Colunas:** 8  
**Colunas:** `id` (uuid) _PK/NN_, `instance_name` (text), `message_id` (text), `error_message` (text), `retry_count` (integer), `next_retry_at` (timestamp with time zone), `status` (text), `created_at` (timestamp with time zone)

### `dispatch_error_logs`
**Função:** Erros de despacho de mensagens (log operacional).  
**RLS:** 🟢 on · **Policies:** 1 · **Linhas:** 0 · **Colunas:** 6  
**Colunas:** `id` (uuid) _PK/NN_, `instance_name` (text), `error_type` (text), `error_message` (text), `metadata` (jsonb), `created_at` (timestamp with time zone)

### `dlq_audit_log`
**Função:** Auditoria de ações no DLQ (retry/abandon de failed_messages).  
**RLS:** 🟢 on · **Policies:** 1 · **Linhas:** 0 · **Colunas:** 6  
**Colunas:** `id` (uuid) _PK/NN_, `action` (text), `item_id` (uuid), `performed_by` (uuid) _FK→auth.users_, `reason` (text), `created_at` (timestamp with time zone)


---

## 📧 Email / Gmail

_Contas de e-mail conectadas, threads, mensagens e labels Gmail._

### `email_accounts`
**Função:** Contas de e-mail conectadas (agnóstico de provedor).  
**RLS:** 🟢 on · **Policies:** 1 · **Linhas:** 0 · **Colunas:** 9  
**Colunas:** `id` (uuid) _PK/NN_, `user_id` (uuid) _FK→auth.users/NN_, `email_address` (text) _NN_, `display_name` (text), `picture_url` (text), `token_expires_at` (timestamp with time zone), `is_active` (boolean), `created_at` (timestamp with time zone), `updated_at` (timestamp with time zone)

### `email_labels`
**Função:** Labels/pastas de e-mail sincronizados.  
**RLS:** 🟢 on · **Policies:** 2 · **Linhas:** 0 · **Colunas:** 9  
**Colunas:** `id` (uuid) _PK/NN_, `gmail_account_id` (uuid) _FK→gmail_accounts/NN_, `gmail_label_id` (text) _NN_, `name` (text) _NN_, `label_type` (text) _NN_, `color` (text), `message_count` (integer) _NN_, `unread_count` (integer) _NN_, `created_at` (timestamp with time zone) _NN_

### `email_messages`
**Função:** Mensagens de e-mail individuais.  
**RLS:** 🟢 on · **Policies:** 3 · **Linhas:** 0 · **Colunas:** 23  
**Colunas:** `id` (uuid) _PK/NN_, `thread_id` (uuid) _FK→email_threads/NN_, `gmail_message_id` (text) _NN_, `gmail_account_id` (uuid) _FK→gmail_accounts/NN_, `from_address` (text) _NN_, `from_name` (text), `to_addresses` (ARRAY) _NN_, `cc_addresses` (ARRAY) _NN_, `bcc_addresses` (ARRAY) _NN_, `reply_to_address` (text), `subject` (text) _NN_, `body_text` (text) _NN_, `body_html` (text) _NN_, `snippet` (text) _NN_, `label_ids` (ARRAY) _NN_, `is_read` (boolean) _NN_, `is_starred` (boolean) _NN_, `has_attachments` (boolean) _NN_, `in_reply_to` (text), `references_header` (text), `internal_date` (timestamp with time zone) _NN_, `direction` (text) _NN_, `created_at` (timestamp with time zone) _NN_

### `email_threads`
**Função:** Threads/conversas de e-mail.  
**RLS:** 🟢 on · **Policies:** 4 · **Linhas:** 0 · **Colunas:** 18  
**Colunas:** `id` (uuid) _PK/NN_, `gmail_account_id` (uuid) _FK→gmail_accounts/NN_, `gmail_thread_id` (text) _NN_, `contact_id` (uuid) _FK→contacts_, `subject` (text) _NN_, `snippet` (text) _NN_, `label_ids` (ARRAY) _NN_, `message_count` (integer) _NN_, `is_unread` (boolean) _NN_, `is_starred` (boolean) _NN_, `is_important` (boolean) _NN_, `last_message_at` (timestamp with time zone) _NN_, `assigned_to` (uuid), `status` (text) _NN_, `priority` (text) _NN_, `tags` (ARRAY) _NN_, `created_at` (timestamp with time zone) _NN_, `updated_at` (timestamp with time zone) _NN_

### `gmail_accounts`
**Função:** Contas Gmail conectadas via OAuth (tokens criptografados).  
**RLS:** 🟢 on · **Policies:** 5 · **Linhas:** 0 · **Colunas:** 12  
**Colunas:** `id` (uuid) _PK/NN_, `user_id` (uuid) _NN_, `email_address` (text) _NN_, `is_active` (boolean) _NN_, `sync_status` (text) _NN_, `last_sync_at` (timestamp with time zone), `last_error` (text), `token_expires_at` (timestamp with time zone), `created_at` (timestamp with time zone) _NN_, `updated_at` (timestamp with time zone) _NN_, `access_token_encrypted` (bytea), `refresh_token_encrypted` (bytea)


---

## 👥 Filas, Times & Departamentos

_Filas de atendimento, membros, metas de fila, times internos e mensagens de equipe._

### `queues`
**Função:** Filas de atendimento.  
**RLS:** 🟢 on · **Policies:** 2 · **Linhas:** 0 · **Colunas:** 9  
**Colunas:** `id` (uuid) _PK/NN_, `name` (text) _NN_, `description` (text), `color` (text) _NN_, `is_active` (boolean), `max_wait_time_minutes` (integer), `priority` (integer), `created_at` (timestamp with time zone) _NN_, `updated_at` (timestamp with time zone) _NN_

### `queue_members`
**Função:** Membros ativos de cada fila.  
**RLS:** 🟢 on · **Policies:** 2 · **Linhas:** 0 · **Colunas:** 5  
**Colunas:** `id` (uuid) _PK/NN_, `queue_id` (uuid) _FK→queues/NN_, `profile_id` (uuid) _FK→profiles/NN_, `is_active` (boolean), `created_at` (timestamp with time zone) _NN_

### `queue_goals`
**Função:** Metas por fila.  
**RLS:** 🟢 on · **Policies:** 2 · **Linhas:** 0 · **Colunas:** 9  
**Colunas:** `id` (uuid) _PK/NN_, `queue_id` (uuid) _FK→queues/NN_, `max_waiting_contacts` (integer), `max_avg_wait_minutes` (integer), `min_assignment_rate` (integer), `max_messages_pending` (integer), `alerts_enabled` (boolean), `created_at` (timestamp with time zone) _NN_, `updated_at` (timestamp with time zone) _NN_

### `queue_positions`
**Função:** Posição de conversas na fila.  
**RLS:** 🟢 on · **Policies:** 2 · **Linhas:** 0 · **Colunas:** 8  
**Colunas:** `id` (uuid) _PK/NN_, `contact_id` (uuid) _FK→contacts/NN_, `queue_id` (uuid) _FK→queues/NN_, `position` (integer) _NN_, `estimated_wait_minutes` (integer), `entered_at` (timestamp with time zone), `notified` (boolean), `created_at` (timestamp with time zone)

### `queue_skill_requirements`
**Função:** Skills mínimas exigidas por fila (roteamento).  
**RLS:** 🟢 on · **Policies:** 2 · **Linhas:** 0 · **Colunas:** 5  
**Colunas:** `id` (uuid) _PK/NN_, `queue_id` (uuid) _FK→queues/NN_, `skill_name` (text) _NN_, `min_level` (integer), `created_at` (timestamp with time zone)

### `departments`
**Função:** Departamentos organizacionais.  
**RLS:** 🟢 on · **Policies:** 2 · **Linhas:** 0 · **Colunas:** 9  
**Colunas:** `id` (uuid) _PK/NN_, `name` (text) _NN_, `description` (text), `whatsapp_mode` (text), `whatsapp_api_key` (text), `created_at` (timestamp with time zone), `updated_at` (timestamp with time zone), `whatsapp_instance_id` (text), `is_active` (boolean)

### `department_invitations`
**Função:** Convites pendentes para entrar num departamento.  
**RLS:** 🟢 on · **Policies:** 1 · **Linhas:** 0 · **Colunas:** 11  
**Colunas:** `id` (uuid) _PK/NN_, `department_id` (uuid) _FK→departments_, `email` (text) _NN_, `role` (text) _NN_, `status` (text), `invited_by` (uuid) _FK→auth.users_, `created_at` (timestamp with time zone), `updated_at` (timestamp with time zone), `created_by` (uuid) _FK→auth.users_, `code` (text), `expires_at` (timestamp with time zone)

### `team_conversations`
**Função:** Conversas internas (chat entre agentes).  
**RLS:** 🟢 on · **Policies:** 3 · **Linhas:** 0 · **Colunas:** 7  
**Colunas:** `id` (uuid) _PK/NN_, `type` (text) _NN_, `name` (text), `avatar_url` (text), `created_by` (uuid) _FK→profiles_, `created_at` (timestamp with time zone) _NN_, `updated_at` (timestamp with time zone) _NN_

### `team_conversation_members`
**Função:** Membros de uma conversa interna de time.  
**RLS:** 🟢 on · **Policies:** 4 · **Linhas:** 0 · **Colunas:** 6  
**Colunas:** `id` (uuid) _PK/NN_, `conversation_id` (uuid) _FK→team_conversations/NN_, `profile_id` (uuid) _FK→profiles/NN_, `joined_at` (timestamp with time zone) _NN_, `last_read_at` (timestamp with time zone), `is_muted` (boolean)

### `team_messages`
**Função:** Mensagens do chat interno de time.  
**RLS:** 🟢 on · **Policies:** 4 · **Linhas:** 0 · **Colunas:** 11  
**Colunas:** `id` (uuid) _PK/NN_, `conversation_id` (uuid) _FK→team_conversations/NN_, `sender_id` (uuid) _FK→profiles/NN_, `content` (text) _NN_, `message_type` (text) _NN_, `reply_to_id` (uuid) _FK→team_messages_, `is_edited` (boolean), `created_at` (timestamp with time zone) _NN_, `updated_at` (timestamp with time zone) _NN_, `media_url` (text), `media_type` (text)

### `team_message_receipts`
**Função:** Recibos de leitura de mensagens internas.  
**RLS:** 🟢 on · **Policies:** 2 · **Linhas:** 0 · **Colunas:** 5  
**Colunas:** `id` (uuid) _PK/NN_, `message_id` (uuid) _FK→team_messages_, `profile_id` (uuid) _FK→profiles_, `read_at` (timestamp with time zone), `created_at` (timestamp with time zone)

### `whisper_messages`
**Função:** Mensagens whisper (agente↔supervisor durante atendimento).  
**RLS:** 🟢 on · **Policies:** 4 · **Linhas:** 0 · **Colunas:** 7  
**Colunas:** `id` (uuid) _PK/NN_, `contact_id` (uuid) _FK→contacts/NN_, `sender_id` (uuid) _FK→profiles/NN_, `target_agent_id` (uuid) _FK→profiles/NN_, `content` (text) _NN_, `is_read` (boolean), `created_at` (timestamp with time zone)


---

## 🎯 Roteamento, SLA & Skills

_Canais, regras de roteamento, carteira de clientes, SLA, horário comercial e ausência._

### `channel_connections`
**Função:** Conexões de canais (WhatsApp, Email, etc). Credenciais sensíveis.  
**RLS:** 🟢 on · **Policies:** 1 · **Linhas:** 0 · **Colunas:** 14  
**Colunas:** `id` (uuid) _PK/NN_, `channel_type` (USER-DEFINED) _NN_, `name` (text) _NN_, `status` (text) _NN_, `config` (jsonb), `credentials` (jsonb), `webhook_url` (text), `is_active` (boolean), `created_by` (uuid) _FK→profiles_, `created_at` (timestamp with time zone) _NN_, `updated_at` (timestamp with time zone) _NN_, `whatsapp_connection_id` (uuid) _FK→whatsapp_connections_, `external_account_id` (text), `external_page_id` (text)

### `channel_routing_rules`
**Função:** Regras para rotear mensagens de canais para filas/agentes.  
**RLS:** 🟢 on · **Policies:** 2 · **Linhas:** 0 · **Colunas:** 8  
**Colunas:** `id` (uuid) _PK/NN_, `channel_type` (USER-DEFINED) _NN_, `channel_connection_id` (uuid) _FK→channel_connections_, `queue_id` (uuid) _FK→queues_, `priority` (integer), `conditions` (jsonb), `is_active` (boolean), `created_at` (timestamp with time zone) _NN_

### `client_wallet_rules`
**Função:** Regras de carteira: qual agente atende contatos de qual conexão.  
**RLS:** 🟢 on · **Policies:** 2 · **Linhas:** 0 · **Colunas:** 7  
**Colunas:** `id` (uuid) _PK/NN_, `name` (text) _NN_, `agent_id` (uuid) _FK→profiles/NN_, `whatsapp_connection_id` (uuid) _FK→whatsapp_connections_, `priority` (integer), `is_active` (boolean), `created_at` (timestamp with time zone) _NN_

### `sla_configurations`
**Função:** Configurações genéricas de SLA.  
**RLS:** 🟢 on · **Policies:** 2 · **Linhas:** 0 · **Colunas:** 9  
**Colunas:** `id` (uuid) _PK/NN_, `name` (text) _NN_, `first_response_minutes` (integer) _NN_, `resolution_minutes` (integer) _NN_, `priority` (text) _NN_, `is_default` (boolean), `is_active` (boolean), `created_at` (timestamp with time zone) _NN_, `updated_at` (timestamp with time zone) _NN_

### `sla_rules`
**Função:** Regras específicas de SLA (aplicação e severidade).  
**RLS:** 🟢 on · **Policies:** 4 · **Linhas:** 0 · **Colunas:** 15  
**Colunas:** `id` (uuid) _PK/NN_, `name` (text) _NN_, `first_response_minutes` (integer) _NN_, `resolution_minutes` (integer) _NN_, `priority` (integer) _NN_, `contact_id` (uuid) _FK→contacts_, `company` (text), `job_title` (text), `contact_type` (text), `queue_id` (uuid) _FK→queues_, `agent_id` (uuid) _FK→profiles_, `is_active` (boolean) _NN_, `created_at` (timestamp with time zone) _NN_, `updated_at` (timestamp with time zone) _NN_, `metadata` (jsonb)

### `agent_skills`
**Função:** Skills do agente e nível — usado por roteamento skill-based.  
**RLS:** 🟢 on · **Policies:** 2 · **Linhas:** 0 · **Colunas:** 5  
**Colunas:** `id` (uuid) _PK/NN_, `profile_id` (uuid) _FK→profiles/NN_, `skill_name` (text) _NN_, `skill_level` (integer), `created_at` (timestamp with time zone)

### `business_hours`
**Função:** Horário comercial por conexão WhatsApp e dia da semana.  
**RLS:** 🟢 on · **Policies:** 2 · **Linhas:** 0 · **Colunas:** 8  
**Colunas:** `id` (uuid) _PK/NN_, `whatsapp_connection_id` (uuid) _FK→whatsapp_connections/NN_, `day_of_week` (integer) _NN_, `is_open` (boolean), `open_time` (time without time zone), `close_time` (time without time zone), `created_at` (timestamp with time zone) _NN_, `updated_at` (timestamp with time zone) _NN_

### `away_messages`
**Função:** Mensagens automáticas de ausência por conexão/agente.  
**RLS:** 🟢 on · **Policies:** 2 · **Linhas:** 0 · **Colunas:** 6  
**Colunas:** `id` (uuid) _PK/NN_, `whatsapp_connection_id` (uuid) _FK→whatsapp_connections/NN_, `content` (text), `is_enabled` (boolean), `created_at` (timestamp with time zone) _NN_, `updated_at` (timestamp with time zone) _NN_

### `auto_close_config`
**Função:** Regras de encerramento automático de conversas por inatividade.  
**RLS:** 🟢 on · **Policies:** 2 · **Linhas:** 0 · **Colunas:** 7  
**Colunas:** `id` (uuid) _PK/NN_, `inactivity_hours` (integer) _NN_, `is_enabled` (boolean) _NN_, `close_message` (text), `updated_by` (uuid) _FK→profiles_, `created_at` (timestamp with time zone) _NN_, `updated_at` (timestamp with time zone) _NN_


---

## 📊 CRM / Vendas / Contatos

_CRM: negócios, pipeline, produtos, compras, tags, notas e campos custom._

### `sales_deals`
**Função:** Negócios/deals do pipeline de vendas.  
**RLS:** 🟢 on · **Policies:** 4 · **Linhas:** 0 · **Colunas:** 17  
**Colunas:** `id` (uuid) _PK/NN_, `title` (text) _NN_, `value` (numeric), `currency` (text), `stage_id` (uuid) _FK→sales_pipeline_stages_, `contact_id` (uuid) _FK→contacts_, `assigned_to` (uuid) _FK→profiles_, `priority` (text), `expected_close_date` (date), `notes` (text), `tags` (ARRAY), `status` (text), `won_at` (timestamp with time zone), `lost_at` (timestamp with time zone), `lost_reason` (text), `created_at` (timestamp with time zone), `updated_at` (timestamp with time zone)

### `sales_pipeline_stages`
**Função:** Estágios do pipeline de vendas (kanban).  
**RLS:** 🟢 on · **Policies:** 2 · **Linhas:** 0 · **Colunas:** 7  
**Colunas:** `id` (uuid) _PK/NN_, `name` (text) _NN_, `color` (text) _NN_, `position` (integer) _NN_, `is_active` (boolean), `created_at` (timestamp with time zone), `updated_at` (timestamp with time zone)

### `deal_activities`
**Função:** Atividades registradas num negócio (deal) do CRM.  
**RLS:** 🟢 on · **Policies:** 3 · **Linhas:** 0 · **Colunas:** 6  
**Colunas:** `id` (uuid) _PK/NN_, `deal_id` (uuid) _FK→sales_deals/NN_, `activity_type` (text) _NN_, `description` (text), `performed_by` (uuid) _FK→profiles_, `created_at` (timestamp with time zone)

### `products`
**Função:** Catálogo de produtos (usado em deals/campanhas).  
**RLS:** 🟢 on · **Policies:** 3 · **Linhas:** 0 · **Colunas:** 14  
**Colunas:** `id` (uuid) _PK/NN_, `name` (text) _NN_, `description` (text), `price` (numeric) _NN_, `currency` (text) _NN_, `image_url` (text), `category` (text), `sku` (text), `stock_quantity` (integer), `is_active` (boolean), `retailer_id` (text), `whatsapp_connection_id` (uuid) _FK→whatsapp_connections_, `created_at` (timestamp with time zone) _NN_, `updated_at` (timestamp with time zone) _NN_

### `contact_purchases`
**Função:** Histórico de compras associado a um contato.  
**RLS:** 🟢 on · **Policies:** 4 · **Linhas:** 0 · **Colunas:** 13  
**Colunas:** `id` (uuid) _PK/NN_, `contact_id` (uuid) _FK→contacts/NN_, `title` (text) _NN_, `description` (text), `amount` (numeric), `currency` (text), `status` (text), `purchase_type` (text), `deal_id` (uuid) _FK→sales_deals_, `created_by` (uuid) _FK→profiles_, `purchased_at` (timestamp with time zone), `created_at` (timestamp with time zone) _NN_, `updated_at` (timestamp with time zone) _NN_

### `contact_notes`
**Função:** Anotações internas dos agentes sobre um contato.  
**RLS:** 🟢 on · **Policies:** 4 · **Linhas:** 0 · **Colunas:** 6  
**Colunas:** `id` (uuid) _PK/NN_, `contact_id` (uuid) _FK→contacts/NN_, `author_id` (uuid) _FK→profiles/NN_, `content` (text) _NN_, `created_at` (timestamp with time zone) _NN_, `updated_at` (timestamp with time zone) _NN_

### `contact_tags`
**Função:** Relação N:N contatos ↔ tags.  
**RLS:** 🟢 on · **Policies:** 3 · **Linhas:** 0 · **Colunas:** 4  
**Colunas:** `id` (uuid) _PK/NN_, `contact_id` (uuid) _FK→contacts/NN_, `tag_id` (uuid) _FK→tags/NN_, `created_at` (timestamp with time zone) _NN_

### `contact_custom_fields`
**Função:** Campos customizados por contato (chave/valor).  
**RLS:** 🟢 on · **Policies:** 4 · **Linhas:** 0 · **Colunas:** 7  
**Colunas:** `id` (uuid) _PK/NN_, `contact_id` (uuid) _FK→contacts/NN_, `field_name` (text) _NN_, `field_value` (text), `field_type` (text) _NN_, `created_at` (timestamp with time zone) _NN_, `updated_at` (timestamp with time zone) _NN_

### `tags`
**Função:** Catálogo de tags (aplicáveis a contatos/deals/etc).  
**RLS:** 🟢 on · **Policies:** 3 · **Linhas:** 0 · **Colunas:** 7  
**Colunas:** `id` (uuid) _PK/NN_, `name` (text) _NN_, `color` (text) _NN_, `description` (text), `created_by` (uuid) _FK→profiles_, `created_at` (timestamp with time zone) _NN_, `updated_at` (timestamp with time zone) _NN_

### `favorite_contacts`
**Função:** Contatos marcados como favoritos por usuário.  
**RLS:** 🟢 on · **Policies:** 1 · **Linhas:** 0 · **Colunas:** 4  
**Colunas:** `id` (uuid) _PK/NN_, `contact_id` (uuid) _FK→contacts/NN_, `user_id` (uuid) _FK→auth.users/NN_, `created_at` (timestamp with time zone) _NN_

### `pinned_conversations`
**Função:** Conversas fixadas no topo por usuário.  
**RLS:** 🟢 on · **Policies:** 1 · **Linhas:** 0 · **Colunas:** 5  
**Colunas:** `id` (uuid) _PK/NN_, `contact_id` (uuid) _FK→contacts/NN_, `pinned_by` (uuid) _FK→profiles/NN_, `position` (integer) _NN_, `created_at` (timestamp with time zone) _NN_

### `payment_links`
**Função:** Links de pagamento gerados (checkout).  
**RLS:** 🟢 on · **Policies:** 4 · **Linhas:** 0 · **Colunas:** 16  
**Colunas:** `id` (uuid) _PK/NN_, `title` (text) _NN_, `description` (text), `amount` (numeric) _NN_, `currency` (text), `status` (text), `payment_method` (text), `payment_url` (text), `external_id` (text), `contact_id` (uuid) _FK→contacts_, `deal_id` (uuid) _FK→sales_deals_, `created_by` (uuid) _FK→profiles_, `paid_at` (timestamp with time zone), `expires_at` (timestamp with time zone), `created_at` (timestamp with time zone), `updated_at` (timestamp with time zone)

### `meta_capi_events`
**Função:** Eventos enviados ao Meta Conversions API.  
**RLS:** 🟢 on · **Policies:** 2 · **Linhas:** 0 · **Colunas:** 11  
**Colunas:** `id` (uuid) _PK/NN_, `event_name` (text) _NN_, `event_time` (timestamp with time zone), `contact_id` (uuid) _FK→contacts_, `pixel_id` (text), `event_source_url` (text), `action_source` (text), `custom_data` (jsonb), `sent_to_meta` (boolean), `meta_response` (jsonb), `created_at` (timestamp with time zone)


---

## 🤖 IA, Chatbot & Automação

_Provedores de IA, uso, chatbot flows, automações, follow-ups, base de conhecimento e templates._

### `ai_providers`
**Função:** Provedores de IA cadastrados (OpenAI, Anthropic, Lovable AI).  
**RLS:** 🟢 on · **Policies:** 4 · **Linhas:** 0 · **Colunas:** 15  
**Colunas:** `id` (uuid) _PK/NN_, `name` (text) _NN_, `description` (text), `provider_type` (USER-DEFINED) _NN_, `api_endpoint` (text), `api_key_secret_name` (text), `model` (text), `system_prompt` (text), `config` (jsonb), `is_active` (boolean) _NN_, `is_default` (boolean) _NN_, `use_for` (ARRAY) _NN_, `created_by` (uuid) _FK→profiles_, `created_at` (timestamp with time zone) _NN_, `updated_at` (timestamp with time zone) _NN_

### `ai_usage_logs`
**Função:** Uso/consumo de tokens por chamada de IA (custos e auditoria).  
**RLS:** 🟢 on · **Policies:** 3 · **Linhas:** 0 · **Colunas:** 13  
**Colunas:** `id` (uuid) _PK/NN_, `user_id` (uuid), `profile_id` (uuid) _FK→profiles_, `function_name` (text) _NN_, `model` (text), `input_tokens` (integer), `output_tokens` (integer), `total_tokens` (integer), `duration_ms` (integer), `status` (text) _NN_, `error_message` (text), `metadata` (jsonb), `created_at` (timestamp with time zone) _NN_

### `ai_conversation_tags`
**Função:** Tags atribuídas por IA a conversas (sentimento, intenção).  
**RLS:** 🟢 on · **Policies:** 5 · **Linhas:** 0 · **Colunas:** 6  
**Colunas:** `id` (uuid) _PK/NN_, `contact_id` (uuid) _FK→contacts/NN_, `tag_name` (text) _NN_, `confidence` (numeric), `source` (text), `created_at` (timestamp with time zone)

### `chatbot_flows`
**Função:** Definições de fluxos de chatbot.  
**RLS:** 🟢 on · **Policies:** 3 · **Linhas:** 0 · **Colunas:** 15  
**Colunas:** `id` (uuid) _PK/NN_, `name` (text) _NN_, `description` (text), `is_active` (boolean), `trigger_type` (text) _NN_, `trigger_value` (text), `nodes` (jsonb) _NN_, `edges` (jsonb) _NN_, `variables` (jsonb), `whatsapp_connection_id` (uuid) _FK→whatsapp_connections_, `created_by` (uuid) _FK→profiles_, `execution_count` (integer), `last_executed_at` (timestamp with time zone), `created_at` (timestamp with time zone) _NN_, `updated_at` (timestamp with time zone) _NN_

### `chatbot_executions`
**Função:** Execuções (runs) de flows de chatbot.  
**RLS:** 🟢 on · **Policies:** 2 · **Linhas:** 0 · **Colunas:** 10  
**Colunas:** `id` (uuid) _PK/NN_, `flow_id` (uuid) _FK→chatbot_flows/NN_, `contact_id` (uuid) _FK→contacts/NN_, `current_node_id` (text), `status` (text) _NN_, `variables` (jsonb), `started_at` (timestamp with time zone) _NN_, `completed_at` (timestamp with time zone), `error_message` (text), `created_at` (timestamp with time zone) _NN_

### `automations`
**Função:** Automações configuráveis (gatilho → ação) sobre eventos do sistema.  
**RLS:** 🟢 on · **Policies:** 4 · **Linhas:** 0 · **Colunas:** 12  
**Colunas:** `id` (uuid) _PK/NN_, `name` (text) _NN_, `description` (text), `is_active` (boolean) _NN_, `trigger_type` (text) _NN_, `trigger_config` (jsonb) _NN_, `actions` (jsonb) _NN_, `created_by` (uuid) _FK→profiles_, `last_triggered_at` (timestamp with time zone), `trigger_count` (integer) _NN_, `created_at` (timestamp with time zone) _NN_, `updated_at` (timestamp with time zone) _NN_

### `followup_sequences`
**Função:** Sequências de follow-up configuradas.  
**RLS:** 🟢 on · **Policies:** 2 · **Linhas:** 0 · **Colunas:** 8  
**Colunas:** `id` (uuid) _PK/NN_, `name` (text) _NN_, `trigger_event` (text) _NN_, `is_active` (boolean), `whatsapp_connection_id` (uuid) _FK→whatsapp_connections_, `created_by` (uuid) _FK→profiles_, `created_at` (timestamp with time zone), `updated_at` (timestamp with time zone)

### `followup_steps`
**Função:** Passos individuais de uma sequência de follow-up.  
**RLS:** 🟢 on · **Policies:** 2 · **Linhas:** 0 · **Colunas:** 8  
**Colunas:** `id` (uuid) _PK/NN_, `sequence_id` (uuid) _FK→followup_sequences/NN_, `step_order` (integer) _NN_, `delay_hours` (integer) _NN_, `message_template` (text) _NN_, `message_type` (text) _NN_, `is_active` (boolean), `created_at` (timestamp with time zone)

### `followup_executions`
**Função:** Execuções (runs) de passos de sequência de follow-up.  
**RLS:** 🟢 on · **Policies:** 2 · **Linhas:** 0 · **Colunas:** 9  
**Colunas:** `id` (uuid) _PK/NN_, `sequence_id` (uuid) _FK→followup_sequences/NN_, `contact_id` (uuid) _FK→contacts/NN_, `current_step` (integer), `status` (text) _NN_, `started_at` (timestamp with time zone), `next_step_at` (timestamp with time zone), `completed_at` (timestamp with time zone), `created_at` (timestamp with time zone)

### `knowledge_base_articles`
**Função:** Artigos da base de conhecimento (busca full-text PT).  
**RLS:** 🟢 on · **Policies:** 2 · **Linhas:** 0 · **Colunas:** 11  
**Colunas:** `id` (uuid) _PK/NN_, `title` (text) _NN_, `content` (text) _NN_, `category` (text), `tags` (ARRAY), `is_published` (boolean), `embedding_status` (text), `created_by` (uuid) _FK→profiles_, `updated_at` (timestamp with time zone), `created_at` (timestamp with time zone), `search_vector` (tsvector)

### `knowledge_base_files`
**Função:** Arquivos anexados aos artigos da KB.  
**RLS:** 🟢 on · **Policies:** 2 · **Linhas:** 0 · **Colunas:** 9  
**Colunas:** `id` (uuid) _PK/NN_, `article_id` (uuid) _FK→knowledge_base_articles_, `file_name` (text) _NN_, `file_url` (text) _NN_, `file_type` (text), `file_size` (integer), `processing_status` (text), `extracted_text` (text), `created_at` (timestamp with time zone)

### `playbooks`
**Função:** Playbooks/roteiros de atendimento.  
**RLS:** 🟢 on · **Policies:** 4 · **Linhas:** 0 · **Colunas:** 9  
**Colunas:** `id` (uuid) _PK/NN_, `name` (text) _NN_, `description` (text), `category` (text) _NN_, `steps` (jsonb) _NN_, `is_active` (boolean) _NN_, `created_by` (uuid) _FK→profiles_, `created_at` (timestamp with time zone) _NN_, `updated_at` (timestamp with time zone) _NN_

### `scheduled_messages`
**Função:** Mensagens agendadas para envio futuro.  
**RLS:** 🟢 on · **Policies:** 4 · **Linhas:** 0 · **Colunas:** 13  
**Colunas:** `id` (uuid) _PK/NN_, `contact_id` (uuid) _FK→contacts/NN_, `content` (text) _NN_, `message_type` (text) _NN_, `media_url` (text), `scheduled_at` (timestamp with time zone) _NN_, `status` (text) _NN_, `sent_at` (timestamp with time zone), `error_message` (text), `created_by` (uuid) _FK→profiles_, `whatsapp_connection_id` (uuid) _FK→whatsapp_connections_, `created_at` (timestamp with time zone) _NN_, `updated_at` (timestamp with time zone) _NN_

### `message_templates`
**Função:** Templates de mensagem reutilizáveis (respostas rápidas).  
**RLS:** 🟢 on · **Policies:** 4 · **Linhas:** 0 · **Colunas:** 10  
**Colunas:** `id` (uuid) _PK/NN_, `user_id` (uuid) _NN_, `title` (text) _NN_, `content` (text) _NN_, `shortcut` (text), `category` (text), `is_global` (boolean), `use_count` (integer), `created_at` (timestamp with time zone) _NN_, `updated_at` (timestamp with time zone) _NN_

### `voice_command_logs`
**Função:** Logs de comandos por voz (voice AI).  
**RLS:** 🟢 on · **Policies:** 2 · **Linhas:** 0 · **Colunas:** 9  
**Colunas:** `id` (uuid) _PK/NN_, `user_id` (uuid) _NN_, `transcript` (text) _NN_, `action` (text) _NN_, `response` (text), `data` (jsonb), `duration_ms` (integer), `success` (boolean), `created_at` (timestamp with time zone)


---

## 📣 Campanhas & Talk X

_Campanhas outbound, A/B tests, Talk X (envio humanizado) e blacklist._

### `campaigns`
**Função:** Campanhas outbound (broadcast) com agendamento e métricas.  
**RLS:** 🟢 on · **Policies:** 3 · **Linhas:** 0 · **Colunas:** 22  
**Colunas:** `id` (uuid) _PK/NN_, `name` (text) _NN_, `description` (text), `message_content` (text) _NN_, `message_type` (text) _NN_, `media_url` (text), `status` (text) _NN_, `scheduled_at` (timestamp with time zone), `started_at` (timestamp with time zone), `completed_at` (timestamp with time zone), `total_contacts` (integer) _NN_, `sent_count` (integer) _NN_, `delivered_count` (integer) _NN_, `read_count` (integer) _NN_, `failed_count` (integer) _NN_, `whatsapp_connection_id` (uuid) _FK→whatsapp_connections_, `created_by` (uuid) _FK→profiles_, `target_type` (text) _NN_, `target_filter` (jsonb), `send_interval_seconds` (integer), `created_at` (timestamp with time zone) _NN_, `updated_at` (timestamp with time zone) _NN_

### `campaign_contacts`
**Função:** Contatos-alvo de uma campanha e status de envio.  
**RLS:** 🟢 on · **Policies:** 3 · **Linhas:** 0 · **Colunas:** 8  
**Colunas:** `id` (uuid) _PK/NN_, `campaign_id` (uuid) _FK→campaigns/NN_, `contact_id` (uuid) _FK→contacts/NN_, `status` (text) _NN_, `sent_at` (timestamp with time zone), `error_message` (text), `external_id` (text), `created_at` (timestamp with time zone) _NN_

### `campaign_ab_variants`
**Função:** Variantes A/B de uma campanha.  
**RLS:** 🟢 on · **Policies:** 4 · **Linhas:** 0 · **Colunas:** 11  
**Colunas:** `id` (uuid) _PK/NN_, `campaign_id` (uuid) _FK→campaigns/NN_, `variant_name` (text) _NN_, `message_content` (text) _NN_, `media_url` (text), `send_count` (integer), `delivered_count` (integer), `read_count` (integer), `response_count` (integer), `is_winner` (boolean), `created_at` (timestamp with time zone) _NN_

### `talkx_campaigns`
**Função:** Campanhas Talk X (envio humanizado, variáveis dinâmicas).  
**RLS:** 🟢 on · **Policies:** 5 · **Linhas:** 0 · **Colunas:** 22  
**Colunas:** `id` (uuid) _PK/NN_, `name` (text) _NN_, `message_template` (text) _NN_, `variables_config` (jsonb) _NN_, `typing_delay_min` (integer) _NN_, `typing_delay_max` (integer) _NN_, `send_interval_min` (integer) _NN_, `send_interval_max` (integer) _NN_, `status` (text) _NN_, `total_recipients` (integer) _NN_, `sent_count` (integer) _NN_, `failed_count` (integer) _NN_, `delivered_count` (integer) _NN_, `whatsapp_connection_id` (uuid) _FK→whatsapp_connections_, `created_by` (uuid) _FK→profiles_, `started_at` (timestamp with time zone), `completed_at` (timestamp with time zone), `created_at` (timestamp with time zone) _NN_, `updated_at` (timestamp with time zone) _NN_, `media_url` (text), `media_type` (text), `scheduled_at` (timestamp with time zone)

### `talkx_recipients`
**Função:** Destinatários de uma campanha Talk X.  
**RLS:** 🟢 on · **Policies:** 4 · **Linhas:** 0 · **Colunas:** 10  
**Colunas:** `id` (uuid) _PK/NN_, `campaign_id` (uuid) _FK→talkx_campaigns/NN_, `contact_id` (uuid) _FK→contacts/NN_, `personalized_message` (text), `status` (text) _NN_, `sent_at` (timestamp with time zone), `delivered_at` (timestamp with time zone), `error_message` (text), `created_at` (timestamp with time zone) _NN_, `updated_at` (timestamp with time zone) _NN_

### `talkx_blacklist`
**Função:** Blacklist de números para envios Talk X.  
**RLS:** 🟢 on · **Policies:** 3 · **Linhas:** 0 · **Colunas:** 5  
**Colunas:** `id` (uuid) _PK/NN_, `contact_id` (uuid) _FK→contacts/NN_, `reason` (text), `blocked_by` (uuid) _FK→profiles_, `created_at` (timestamp with time zone) _NN_


---

## 📈 Métricas, Gamificação & Pesquisas

_Estatísticas de agente, achievements, snapshots de performance, CSAT/NPS e reputação de número._

### `agent_stats`
**Função:** Estatísticas agregadas por agente (XP, level, atendimentos).  
**RLS:** 🟢 on · **Policies:** 3 · **Linhas:** 3 · **Colunas:** 14  
**Colunas:** `id` (uuid) _PK/NN_, `profile_id` (uuid) _FK→profiles/NN_, `xp` (integer) _NN_, `level` (integer) _NN_, `achievements_count` (integer) _NN_, `messages_sent` (integer) _NN_, `messages_received` (integer) _NN_, `conversations_resolved` (integer) _NN_, `avg_response_time_seconds` (integer), `customer_satisfaction_score` (numeric), `current_streak` (integer) _NN_, `best_streak` (integer) _NN_, `created_at` (timestamp with time zone) _NN_, `updated_at` (timestamp with time zone) _NN_

### `agent_achievements`
**Função:** Conquistas/badges desbloqueadas por agente (gamificação).  
**RLS:** 🟢 on · **Policies:** 2 · **Linhas:** 0 · **Colunas:** 7  
**Colunas:** `id` (uuid) _PK/NN_, `profile_id` (uuid) _FK→profiles/NN_, `achievement_type` (text) _NN_, `achievement_name` (text) _NN_, `achievement_description` (text), `xp_earned` (integer) _NN_, `earned_at` (timestamp with time zone) _NN_

### `performance_snapshots`
**Função:** Snapshots periódicos de performance de agente.  
**RLS:** 🟢 on · **Policies:** 4 · **Linhas:** 0 · **Colunas:** 14  
**Colunas:** `id` (uuid) _PK/NN_, `profile_id` (uuid) _NN_, `fcp` (integer), `page_load` (integer), `dom_ready` (integer), `ttfb` (integer), `memory_used` (integer), `memory_total` (integer), `dom_nodes` (integer), `network_type` (text), `rtt` (integer), `overall_score` (integer), `user_agent` (text), `created_at` (timestamp with time zone) _NN_

### `goals_configurations`
**Função:** Metas configuráveis (individual, fila, empresa).  
**RLS:** 🟢 on · **Policies:** 2 · **Linhas:** 0 · **Colunas:** 10  
**Colunas:** `id` (uuid) _PK/NN_, `profile_id` (uuid) _FK→profiles_, `queue_id` (uuid) _FK→queues_, `goal_type` (text) _NN_, `daily_target` (integer) _NN_, `weekly_target` (integer) _NN_, `monthly_target` (integer) _NN_, `is_active` (boolean), `created_at` (timestamp with time zone) _NN_, `updated_at` (timestamp with time zone) _NN_

### `csat_surveys`
**Função:** Respostas CSAT (satisfação) coletadas do cliente.  
**RLS:** 🟢 on · **Policies:** 2 · **Linhas:** 0 · **Colunas:** 7  
**Colunas:** `id` (uuid) _PK/NN_, `contact_id` (uuid) _FK→contacts/NN_, `agent_id` (uuid) _FK→profiles/NN_, `rating` (integer) _NN_, `feedback` (text), `conversation_resolved_at` (timestamp with time zone), `created_at` (timestamp with time zone) _NN_

### `csat_auto_config`
**Função:** Config de envio automático de pesquisa CSAT.  
**RLS:** 🟢 on · **Policies:** 2 · **Linhas:** 0 · **Colunas:** 8  
**Colunas:** `id` (uuid) _PK/NN_, `is_enabled` (boolean), `delay_minutes` (integer), `message_template` (text), `whatsapp_connection_id` (uuid) _FK→whatsapp_connections_, `updated_by` (uuid) _FK→profiles_, `created_at` (timestamp with time zone), `updated_at` (timestamp with time zone)

### `nps_surveys`
**Função:** Respostas de pesquisa NPS.  
**RLS:** 🟢 on · **Policies:** 4 · **Linhas:** 0 · **Colunas:** 7  
**Colunas:** `id` (uuid) _PK/NN_, `contact_id` (uuid) _FK→contacts/NN_, `agent_id` (uuid) _FK→profiles_, `score` (integer) _NN_, `feedback` (text), `survey_type` (text) _NN_, `created_at` (timestamp with time zone) _NN_

### `number_reputation`
**Função:** Reputação de números (spam score, bloqueios).  
**RLS:** 🟢 on · **Policies:** 3 · **Linhas:** 0 · **Colunas:** 12  
**Colunas:** `id` (uuid) _PK/NN_, `whatsapp_connection_id` (uuid) _FK→whatsapp_connections/NN_, `health_score` (integer) _NN_, `messages_sent_today` (integer) _NN_, `failures_today` (integer) _NN_, `complaints_count` (integer) _NN_, `warmup_status` (text) _NN_, `warmup_day` (integer), `daily_limit` (integer), `last_reset_at` (timestamp with time zone), `created_at` (timestamp with time zone) _NN_, `updated_at` (timestamp with time zone) _NN_

### `query_telemetry`
**Função:** Telemetria de queries do frontend (latência, hits).  
**RLS:** 🟢 on · **Policies:** 3 · **Linhas:** 88 · **Colunas:** 13  
**Colunas:** `id` (uuid) _PK/NN_, `operation` (text) _NN_, `table_name` (text), `rpc_name` (text), `duration_ms` (integer) _NN_, `record_count` (integer), `query_limit` (integer), `query_offset` (integer), `count_mode` (text), `severity` (text) _NN_, `error_message` (text), `user_id` (uuid), `created_at` (timestamp with time zone) _NN_

### `connection_health_logs`
**Função:** Histórico de health-check das conexões.  
**RLS:** 🟢 on · **Policies:** 3 · **Linhas:** 0 · **Colunas:** 7  
**Colunas:** `id` (uuid) _PK/NN_, `connection_id` (uuid) _FK→whatsapp_connections/NN_, `instance_id` (text) _NN_, `status` (text) _NN_, `response_time_ms` (integer), `error_message` (text), `checked_at` (timestamp with time zone) _NN_

### `connection_alert_preferences`
**Função:** Preferências de alerta por conexão WhatsApp.  
**RLS:** 🟢 on · **Policies:** 1 · **Linhas:** 0 · **Colunas:** 7  
**Colunas:** `user_id` (uuid) _FK→auth.users/NN_, `push_enabled` (boolean), `email_enabled` (boolean), `alert_on_degraded` (boolean), `alert_on_disconnected` (boolean), `created_at` (timestamp with time zone), `updated_at` (timestamp with time zone)


---

## 🎨 Mídia (Memes, Stickers, Emojis)

_Bibliotecas de mídia reutilizável no chat._

### `audio_memes`
**Função:** Biblioteca compartilhada de memes de áudio para chat.  
**RLS:** 🟢 on · **Policies:** 4 · **Linhas:** 0 · **Colunas:** 9  
**Colunas:** `id` (uuid) _PK/NN_, `name` (text) _NN_, `audio_url` (text) _NN_, `category` (text) _NN_, `duration_seconds` (numeric), `is_favorite` (boolean) _NN_, `use_count` (integer) _NN_, `uploaded_by` (uuid) _FK→auth.users_, `created_at` (timestamp with time zone) _NN_

### `audio_meme_favorites`
**Função:** Memes de áudio favoritados por cada usuário.  
**RLS:** 🟢 on · **Policies:** 1 · **Linhas:** 0 · **Colunas:** 4  
**Colunas:** `id` (uuid) _PK/NN_, `user_id` (uuid) _FK→auth.users/NN_, `meme_id` (uuid) _FK→audio_memes/NN_, `created_at` (timestamp with time zone) _NN_

### `stickers`
**Função:** Stickers customizados enviáveis no chat.  
**RLS:** 🟢 on · **Policies:** 4 · **Linhas:** 0 · **Colunas:** 10  
**Colunas:** `id` (uuid) _PK/NN_, `name` (text), `image_url` (text) _NN_, `category` (text), `uploaded_by` (text), `is_favorite` (boolean), `use_count` (integer), `created_at` (timestamp with time zone), `updated_at` (timestamp with time zone), `owner_id` (uuid) _FK→profiles_

### `custom_emojis`
**Função:** Emojis customizados subidos por usuários.  
**RLS:** 🟢 on · **Policies:** 4 · **Linhas:** 0 · **Colunas:** 9  
**Colunas:** `id` (uuid) _PK/NN_, `name` (text) _NN_, `image_url` (text) _NN_, `category` (text), `is_favorite` (boolean), `use_count` (integer), `uploaded_by` (uuid), `created_at` (timestamp with time zone), `updated_at` (timestamp with time zone)


---

## ⚙️ Configurações, Notificações & Relatórios

_Preferências globais/usuário, dispositivos, notificações, relatórios agendados e treinamentos._

### `global_settings`
**Função:** Configurações globais chave/valor do sistema.  
**RLS:** 🟢 on · **Policies:** 3 · **Linhas:** 0 · **Colunas:** 7  
**Colunas:** `id` (uuid) _PK/NN_, `key` (text) _NN_, `value` (text), `description` (text), `updated_by` (uuid), `created_at` (timestamp with time zone) _NN_, `updated_at` (timestamp with time zone) _NN_

### `user_settings`
**Função:** Preferências individuais do usuário (onboarding, UI, etc).  
**RLS:** 🟢 on · **Policies:** 3 · **Linhas:** 1 · **Colunas:** 35  
**Colunas:** `id` (uuid) _PK/NN_, `user_id` (uuid) _FK→auth.users/NN_, `business_hours_enabled` (boolean), `business_hours_start` (text), `business_hours_end` (text), `work_days` (ARRAY), `welcome_message` (text), `away_message` (text), `closing_message` (text), `auto_assignment_enabled` (boolean), `auto_assignment_method` (text), `inactivity_timeout` (integer), `sound_enabled` (boolean), `browser_notifications_enabled` (boolean), `quiet_hours_enabled` (boolean), `quiet_hours_start` (text), `quiet_hours_end` (text), `theme` (text), `language` (text), `compact_mode` (boolean), `created_at` (timestamp with time zone) _NN_, `updated_at` (timestamp with time zone) _NN_, `sentiment_alert_threshold` (integer), `sentiment_alert_enabled` (boolean), `sentiment_consecutive_count` (integer), `tts_voice_id` (text), `tts_speed` (numeric), `auto_transcription_enabled` (boolean), `transcription_notification_enabled` (boolean), `message_sound_type` (text), `mention_sound_type` (text), `sla_sound_type` (text), `goal_sound_type` (text), `transcription_sound_type` (text), `onboarding_completed` (boolean)

### `user_service_accounts`
**Função:** Contas de serviço de terceiros vinculadas ao usuário (read-only).  
**RLS:** 🟢 on · **Policies:** 5 · **Linhas:** 0 · **Colunas:** 7  
**Colunas:** `id` (uuid) _PK/NN_, `user_id` (uuid) _NN_, `service_type` (USER-DEFINED) _NN_, `account_email` (text) _NN_, `is_active` (boolean) _NN_, `created_at` (timestamp with time zone) _NN_, `updated_at` (timestamp with time zone) _NN_

### `notifications`
**Função:** Notificações in-app por usuário.  
**RLS:** 🟢 on · **Policies:** 4 · **Linhas:** 0 · **Colunas:** 9  
**Colunas:** `id` (uuid) _PK/NN_, `user_id` (uuid) _NN_, `title` (text) _NN_, `message` (text) _NN_, `type` (text) _NN_, `is_read` (boolean), `metadata` (jsonb), `created_at` (timestamp with time zone) _NN_, `read_at` (timestamp with time zone)

### `reminders`
**Função:** Lembretes agendados por usuário.  
**RLS:** 🟢 on · **Policies:** 1 · **Linhas:** 0 · **Colunas:** 8  
**Colunas:** `id` (uuid) _PK/NN_, `contact_id` (uuid) _FK→contacts_, `profile_id` (uuid) _FK→profiles/NN_, `title` (text) _NN_, `description` (text), `remind_at` (timestamp with time zone) _NN_, `is_dismissed` (boolean) _NN_, `created_at` (timestamp with time zone) _NN_

### `saved_filters`
**Função:** Filtros salvos por usuário/entidade (com default único).  
**RLS:** 🟢 on · **Policies:** 5 · **Linhas:** 0 · **Colunas:** 9  
**Colunas:** `id` (uuid) _PK/NN_, `user_id` (uuid) _NN_, `entity_type` (text) _NN_, `name` (text) _NN_, `filters` (jsonb) _NN_, `is_default` (boolean), `created_at` (timestamp with time zone) _NN_, `updated_at` (timestamp with time zone) _NN_, `is_shared` (boolean)

### `inbox_custom_scopes`
**Função:** Scopes/filtros salvos do inbox por usuário.  
**RLS:** 🟢 on · **Policies:** 2 · **Linhas:** 0 · **Colunas:** 9  
**Colunas:** `id` (uuid) _PK/NN_, `name` (text) _NN_, `label` (text) _NN_, `description` (text), `icon` (text), `filter_criteria` (jsonb) _NN_, `is_active` (boolean), `created_at` (timestamp with time zone) _NN_, `updated_at` (timestamp with time zone) _NN_

### `entity_versions`
**Função:** Snapshots versionados de entidades para histórico/rollback.  
**RLS:** 🟢 on · **Policies:** 2 · **Linhas:** 0 · **Colunas:** 8  
**Colunas:** `id` (uuid) _PK/NN_, `entity_type` (text) _NN_, `entity_id` (uuid) _NN_, `version_number` (integer) _NN_, `data` (jsonb) _NN_, `changed_by` (uuid), `change_summary` (text), `created_at` (timestamp with time zone) _NN_

### `scheduled_reports`
**Função:** Instâncias geradas de relatórios agendados.  
**RLS:** 🟢 on · **Policies:** 3 · **Linhas:** 0 · **Colunas:** 12  
**Colunas:** `id` (uuid) _PK/NN_, `name` (text) _NN_, `report_type` (text) _NN_, `frequency` (text) _NN_, `recipients` (ARRAY) _NN_, `format` (text) _NN_, `is_active` (boolean), `next_send_at` (timestamp with time zone), `last_sent_at` (timestamp with time zone), `created_by` (uuid), `created_at` (timestamp with time zone) _NN_, `updated_at` (timestamp with time zone) _NN_

### `scheduled_report_configs`
**Função:** Configurações de relatórios recorrentes.  
**RLS:** 🟢 on · **Policies:** 4 · **Linhas:** 0 · **Colunas:** 12  
**Colunas:** `id` (uuid) _PK/NN_, `name` (text) _NN_, `report_type` (text) _NN_, `frequency` (text) _NN_, `recipients` (ARRAY) _NN_, `is_active` (boolean) _NN_, `last_sent_at` (timestamp with time zone), `next_send_at` (timestamp with time zone), `created_by` (uuid) _FK→profiles_, `config` (jsonb) _NN_, `created_at` (timestamp with time zone) _NN_, `updated_at` (timestamp with time zone) _NN_

### `training_sessions`
**Função:** Sessões de treinamento/onboarding registradas.  
**RLS:** 🟢 on · **Policies:** 4 · **Linhas:** 0 · **Colunas:** 11  
**Colunas:** `id` (uuid) _PK/NN_, `profile_id` (uuid) _FK→profiles/NN_, `scenario_name` (text) _NN_, `scenario_type` (text), `messages` (jsonb), `score` (integer), `feedback` (text), `status` (text), `started_at` (timestamp with time zone) _NN_, `completed_at` (timestamp with time zone), `created_at` (timestamp with time zone) _NN_


---

## 🚨 War Room / Crise

_Alertas de sala de crise e war room._

### `warroom_alerts`
**Função:** Alertas do war room operacional.  
**RLS:** 🟢 on · **Policies:** 4 · **Linhas:** 0 · **Colunas:** 8  
**Colunas:** `id` (uuid) _PK/NN_, `alert_type` (text) _NN_, `title` (text) _NN_, `message` (text) _NN_, `source` (text), `is_read` (boolean), `dismissed_by` (uuid) _FK→profiles_, `created_at` (timestamp with time zone)

### `crisis_room_alerts`
**Função:** Alertas críticos da sala de crise (SLAs graves, downtime).  
**RLS:** 🟢 on · **Policies:** 4 · **Linhas:** 0 · **Colunas:** 10  
**Colunas:** `id` (uuid) _PK/NN_, `severity` (text) _NN_, `metric_name` (text) _NN_, `metric_value` (numeric), `threshold` (numeric), `message` (text) _NN_, `is_active` (boolean), `acknowledged_by` (uuid) _FK→profiles_, `acknowledged_at` (timestamp with time zone), `created_at` (timestamp with time zone) _NN_


---

## 🔒 Integrações & Rate Limiting

_Integrações específicas (Sicoob), visibilidade cross-agente e rate limiting._

### `sicoob_contact_mapping`
**Função:** Mapeamento de contatos para bridge Sicoob Brindes.  
**RLS:** 🟢 on · **Policies:** 3 · **Linhas:** 0 · **Colunas:** 7  
**Colunas:** `id` (uuid) _PK/NN_, `contact_id` (uuid) _FK→contacts/NN_, `sicoob_user_id` (text) _NN_, `sicoob_vendedor_id` (text) _NN_, `sicoob_singular_id` (text) _NN_, `zappweb_agent_id` (uuid) _FK→profiles_, `created_at` (timestamp with time zone)

### `agent_visibility_grants`
**Função:** Concede a special_agent visibilidade sobre outros agentes.  
**RLS:** 🟢 on · **Policies:** 2 · **Linhas:** 0 · **Colunas:** 5  
**Colunas:** `id` (uuid) _PK/NN_, `agent_id` (uuid) _FK→profiles/NN_, `can_see_agent_id` (uuid) _FK→profiles/NN_, `granted_by` (uuid) _FK→profiles_, `created_at` (timestamp with time zone) _NN_

### `rate_limit_configs`
**Função:** Configs de rate-limit por endpoint/ação.  
**RLS:** 🟢 on · **Policies:** 2 · **Linhas:** 0 · **Colunas:** 9  
**Colunas:** `id` (uuid) _PK/NN_, `name` (text) _NN_, `endpoint_pattern` (text) _NN_, `max_requests` (integer) _NN_, `window_seconds` (integer) _NN_, `block_duration_minutes` (integer) _NN_, `is_active` (boolean), `created_at` (timestamp with time zone) _NN_, `updated_at` (timestamp with time zone) _NN_

### `rate_limit_logs`
**Função:** Log de acionamentos de rate-limit.  
**RLS:** 🟢 on · **Policies:** 2 · **Linhas:** 0 · **Colunas:** 10  
**Colunas:** `id` (uuid) _PK/NN_, `ip_address` (text) _NN_, `endpoint` (text) _NN_, `user_id` (uuid) _FK→auth.users_, `request_count` (integer) _NN_, `blocked` (boolean), `user_agent` (text), `country` (text), `city` (text), `created_at` (timestamp with time zone) _NN_

### `webhook_rate_limits`
**Função:** Rate-limits específicos por webhook origem.  
**RLS:** 🟢 on · **Policies:** 4 · **Linhas:** 0 · **Colunas:** 6  
**Colunas:** `id` (uuid) _PK/NN_, `instance_id` (text) _NN_, `event_type` (text) _NN_, `event_count` (integer) _NN_, `window_start` (timestamp with time zone) _NN_, `created_at` (timestamp with time zone) _NN_


---

## 📦 Não classificadas

_Tabelas ainda não agrupadas em domínio._

### `calls`
**Função:** Registro de chamadas de voz (VoIP/WhatsApp).  
**RLS:** 🟢 on · **Policies:** 3 · **Linhas:** 0 · **Colunas:** 13  
**Colunas:** `id` (uuid) _PK/NN_, `contact_id` (uuid) _FK→contacts_, `agent_id` (uuid) _FK→profiles_, `whatsapp_connection_id` (uuid) _FK→whatsapp_connections_, `direction` (text) _NN_, `status` (text) _NN_, `started_at` (timestamp with time zone) _NN_, `answered_at` (timestamp with time zone), `ended_at` (timestamp with time zone), `duration_seconds` (integer), `recording_url` (text), `notes` (text), `created_at` (timestamp with time zone) _NN_
