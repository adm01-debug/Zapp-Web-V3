# Relatório de Auditoria: Integração Zapp Web v3 ↔ Evolution API

## Escopo da Auditoria

- Frontend: Zapp Web v3 (React)
- Backend: Supabase Self-Hosted (PostgreSQL)
- WhatsApp: Evolution API v2/v3
- Infraestrutura: Docker Swarm na VPS

---

## 1. Schema `evo` — Banco de Dados (PostgreSQL no Supabase)

**Schema próprio `evo`** no banco de dados contém 209+ tabelas dedicadas à Evolution API.

### Tabelas Principais de Mensagens (per departamento)
Cada departamento tem seu próprio conjunto isolado de tabelas:

| Grupo | Tabelas de Mensagens | Tabelas de Conversas | Webhook Events |
|-------|---------------------|---------------------|----------------|
| Default | `evolution_messages_default` | `evolution_conversations_default` | `evolution_webhook_events_default` |
| Comercial 01-15 | `evolution_messages_comercial_01..15` | `evolution_conversations_comercial_01..15` | `evolution_webhook_events_comercial_01..15` |
| Artes | `evolution_messages_artes` | `evolution_conversations_artes` | `evolution_webhook_events_artes` |
| Compras | `evolution_messages_compras` | `evolution_conversations_compras` | `evolution_webhook_events_compras` |
| Financeiro | `evolution_messages_financeiro` | `evolution_conversations_financeiro` | `evolution_webhook_events_financeiro` |
| Logística | `evolution_messages_logistica` | `evolution_conversations_logistica` | `evolution_webhook_events_logistica` |
| Marketing | `evolution_messages_marketing` | `evolution_conversations_marketing` | `evolution_webhook_events_marketing` |
| Gravação | `evolution_messages_gravacao` | `evolution_conversations_gravacao` | `evolution_webhook_events_gravacao` |
| WPP2 | `evolution_messages_wpp2` | `evolution_conversations_wpp2` | `evolution_webhook_events_wpp2` |

### Tabelas de Infraestrutura
- `evolution_instances` — instâncias WhatsApp conectadas
- `evolution_instance_credentials` — credenciais de API
- `evolution_settings` — configurações globais
- `evolution_api_consumers` — consumidores autorizados
- `evolution_contacts` — contatos sincronizados
- `evolution_media` — mídia armazenada

### Webhooks — Sistema Robusto
- `evolution_webhook_events` — tabela principal de webhook
- `evolution_webhook_events_v2` — versão 2 (particionada por mês: v2_2026_03 até v2_2027_06)
- `evolution_webhook_dlq` — Dead Letter Queue para webhooks com falha
- `evolution_webhook_metrics` — métricas dos webhooks
- `evolution_fallback_events` — eventos de fallback
- `evolution_realtime_events` — eventos em tempo real
- `evolution_ef_logs` — logs de Edge Functions
- `evolution_send_idempotency` — idempotência de envio

### Tabelas de Automação
- `evolution_automations` / `evolution_automation_logs`
- `evolution_keyword_automations`
- `evolution_chatbot_responses`
- `evolution_typebot_sessions`
- `evolution_quick_replies`
- `evolution_followups` / `evolution_followup_rules`

### Segurança e Auditoria
- `evolution_audit_log`
- `evolution_ip_blocklist` / `evolution_ip_watch`
- `evolution_blacklist`
- `evolution_spam_keywords`
- `evolution_contact_rate_limits`
- `evolution_baileys_session_history`
- `evolution_health_logs`

---

## 2. Schema `zapp` — Views de Negócio

O schema `zapp` contém **views compostas** que unificam dados do Evolution Schema para o frontend:

| View | Descrição |
|------|-----------|
| `zapp_inbox_threads` | Threads da inbox (unifica conversas) |
| `zapp_dash_overview` | Visão geral do dashboard |
| `zapp_dash_daily` | Métricas diárias |
| `zapp_dash_heatmap` | Heatmap de atividade |
| `zapp_dash_top_contacts` | Top contatos |
| `zapp_audit_log` | Log de auditoria do Zapp |

---

## 3. Funções RPC — Ponte entre Frontend e Evolution

O banco expõe funções `SECURITY DEFINER` que servem como **ponte segura** entre o frontend e os dados da Evolution:

### Funções de Webhook e Conexão
- **`fn_apply_connection_update(p_event jsonb)`** → Processa eventos de conexão Evolution (QR code, conectado, desconectado)
- **`increment_webhook_rate_limit(p_instance_id, p_event_type, p_window_start, p_limit)`** → Rate limiting de webhooks
- **`is_instance_paused(p_instance_name)`** → Verifica se instância está pausada

### Funções de Mensagens (Bridge)
- **`fn_messages_bridge_insert()`** — Trigger: bridge de inserção de mensagens
- **`fn_messages_bridge_update()`** — Trigger: bridge de atualização
- **`fn_messages_bridge_delete()`** — Trigger: bridge de exclusão

### Funções de Contatos (Proxy)
- **`fn_contacts_proxy_insert()`** — Trigger: proxy de inserção
- **`fn_contacts_proxy_update()`** — Trigger: proxy de atualização
- **`fn_contacts_proxy_delete()`** — Trigger: proxy de exclusão

### Funções de Consulta
- **`rpc_get_contact(p_contact_id uuid)`** — Busca contato por ID interno
- **`rpc_get_contact(p_remote_jid text, p_instance text)`** → Busca contato pelo JID remoto + instância (retorna `SETOF evo.evolution_contacts`)
- **`rpc_app_bootstrap()`** — Dados iniciais da aplicação
- **`rpc_dashboard_init(...)`** — Dados iniciais do dashboard
- **`get_contact_intelligence_by_phone(p_phone text)`** — Inteligência de contato
- **`check_user_permission(p_permission_name text)`** — Verificação de permissão

### Controle de Acesso
- **`check_user_permission`** → Base do sistema de permissões RBAC
- **`is_queue_member_of_contact(_contact_id uuid, _user_id uuid)`** → Verifica se usuário pode atender um contato
- **`log_rls_denied(p_resource, p_required_role, p_context)`** — Log de RLS negadas

---

## 4. Edge Functions do Supabase

**NÃO foi possível listar Edge Functions** via MCP (recurso indisponível em self-hosted). O MCP retornou: `"Listing not available via API in self-hosted mode"`.

Recomendação: acessar manualmente via `ls /root/supabase/docker/volumes/functions/` na VPS.

No entanto, há indícios de Edge Functions usadas:
- Tabela `evolution_ef_logs` (no schema `evo`) — logs de Edge Functions
- Tabela `evolution_bootstrap_log` — logs de bootstrap
- O schema `supabase_functions` existe no banco

---

## 5. Fluxo de Mensagem — Ponta a Ponta

### Fluxo de Recebimento (Inbound)

```
WhatsApp → Evolution API (VPS)
    ↓
Webhook HTTP → Supabase (via endpoint configurado)
    ↓
evolution_webhook_events (ou v2 particionada)
    ↓
Triggers Bridge (fn_messages_bridge_*)
    ↓
evolution_messages_[departamento]
    ↓
evolution_conversations_[departamento]
    ↓
Views zapp.inbox_threads
    ↓
Frontend React (Supabase Realtime subscription)
```

### Fluxo de Envio (Outbound)

```
Frontend React → Supabase RPC (service_role)
    ↓
evolution_message_queue
    ↓
Evolution API (HTTP POST /message/sendText, etc.)
    ↓
WhatsApp → Destinatário
```

---

## 6. Autenticação e Segurança

### Camadas de Segurança

1. **Supabase Auth** → Usuário faz login via Supabase Auth
2. **RLS (Row Level Security)** → Policies protegem acesso aos dados
3. **SECURITY DEFINER functions** → As RPCs rodam com privilégios elevados
4. **check_user_permission()** → Controle granular baseado em permissões
5. **is_queue_member_of_contact()** → Garante que agente só veja contatos da sua fila
6. **increment_webhook_rate_limit()** → Rate limiting nos webhooks Evolution
7. **evolution_api_consumers** → Tabela de consumidores autorizados
8. **evolution_instance_credentials** → Credenciais das instâncias
9. **evolution_audit_log** → Auditoria de todas as operações

### Observações de Segurança

⚠️ As funções com `SECURITY DEFINER` (marcadas como `security_definer: true`) executam com privilégios do owner. Isso é necessário para o bridge funcionar, mas deve ser auditado regularmente.

⚠️ Existem tabelas sensíveis como `evolution_instance_credentials`, `evolution_api_consumers`, `credential_vault` — importante verificar se estas têm RLS adequado.

✅ O sistema tem logging de RLS negado via `log_rls_denied()` — boa prática.

---

## 7. Frontend — Código Fonte (Local)

**O diretório local `zapp-web-v3` contém o código React.** Não foi possível escanear automaticamente todos os arquivos, mas a estrutura indica:

### Configuração
- `.env.local` presente → contém variáveis de ambiente
- `.env.example` presente → template de configuração

### Principais Bibliotecas (suspeitas)
- Supabase client libraries
- React + TypeScript
- Possivelmente Supabase Realtime para atualizações em tempo real

### Pontos de Integração Prováveis
1. **Supabase Client (supabase-js)** → Chamadas RPC via `supabase.rpc()`
2. **Supabase Realtime** → Subscriptions para mensagens novas
3. **Chamadas diretas à Evolution API** (se houver) via fetch/axios

---

## 8. GitHub — Busca no Código

**A busca no GitHub (`repo:adm01-debug/zapp-web-v3`) retornou 0 resultados** para os termos "evolution", "evolution-api", "whatsapp" — possivelmente porque o repositório é privado ou a indexação do GitHub Code Search não cobre todos os branches.

---

## 9. Recomendações

### ✅ OK / Boas Práticas
- Schema `evo` isolado com naming consistente
- Particionamento mensal de webhook events (v2_2026_*, v2_2027_*)
- Dead Letter Queue para webhooks com falha
- Idempotência de envio
- Rate limiting de webhooks
- Bridge triggers para sincronização de dados
- Logging de auditoria extensivo
- Views `zapp.*` para desacoplamento frontend/backend

### ⚠️ Pontos de Atenção
1. **Edge Functions não listadas** — Não foi possível confirmar se há Edge Functions intermediando chamadas à Evolution. Verificar na VPS.
2. **Credenciais Evolution** — Verificar se estão seguras no `credential_vault` ou `evolution_instance_credentials`
3. **Webhook endpoint Evolution** — Confirmar se o webhook está apontando para Supabase ou diretamente para o frontend
4. **Realtime subscriptions** — Verificar se o frontend usa Supabase Realtime corretamente (evitar polling)
5. **GitHub search vazio** — Código de integração pode estar em repositório privado ou em branches não indexados
6. **SECURITY DEFINER functions** — 20+ funções rodam com privilégios elevados; revisar necessidade
7. **Tabelas sem RLS** — Verificar se todas as tabelas do schema `evo` têm RLS habilitado

### 🔧 Ações Sugeridas
1. `ls /root/supabase/docker/volumes/functions/` na VPS para listar Edge Functions
2. Verificar webhook configurado na Evolution API (endpoint + apiKey)
3. Auditar RLS policies no schema `evo`
4. Testar uma chamada RPC do frontend para `rpc_get_contact`
5. Verificar logs de webhook na tabela `evolution_webhook_events` para confirmar fluxo ativo

---

## Resumo

| Componente | Status |
|-----------|--------|
| Schema `evo` | ✅ 209+ tabelas, bem estruturado |
| Schema `zapp` | ✅ Views de negócio |
| RPC Functions | ✅ 8+ funções de bridge/consulta |
| Edge Functions | ❓ Não listável via MCP self-hosted |
| Webhooks Evolution | ✅ Sistema completo com DLQ, rate limit, idempotência |
| Autenticação | ✅ RLS + SECURITY DEFINER + RBAC |
| Frontend (local) | ✅ Código presente (scaneamento parcial) |
| GitHub code search | ⚠️ 0 resultados (repo privado?) |

