# Modelo de Autorização do ZAPP

> **Etapa 33** da auditoria de segurança 2026-08-01 — worktree `wt-audit`
> Objetivo: documentar **quem vê qual recurso** no ZAPP, com base nas helpers de autorização reais do banco (`zapp` schema).
> Uso: referência para o endurecimento RLS por lote (etapas 35–39).

---

## 1. Papéis e como cada papel é verificado

A autorização é resolvida em **duas fontes de verdade**, consultadas pelas helpers do schema `zapp`:

| Fonte | Tabela | O que contém |
|---|---|---|
| Roles globais | `zapp.user_roles` | `user_id` → `role` (enum `zapp.app_role`) |
| Membros de workspace | `zapp.workspace_members` | `user_id` → `role` (`admin`/`supervisor`/`owner`) |

| Papel | Como é verificado | Helper responsável | Observações |
|---|---|---|---|
| **dev** | `has_role(u, 'dev')` em `user_roles` | `zapp.has_role` | Papel mais alto; passa em `is_admin_or_supervisor` |
| **admin** | `user_roles.role = 'admin'` **OU** `workspace_members.role IN ('admin','owner')` | `zapp.is_admin_or_supervisor` | Nenhuma distinção prática entre admin e owner |
| **manager** | `user_roles.role = 'manager'` | `zapp.has_role` / `is_admin_or_supervisor` | Tratado como "admin" nas helpers de visibilidade |
| **supervisor** | `user_roles.role = 'supervisor'` **OU** `workspace_members.role = 'supervisor'` | `zapp.is_admin_or_supervisor` | Vê tudo, como admin |
| **agent** | `user_roles.role = 'agent'` | `zapp.has_role` | Só vê o que lhe é atribuído ou o que está nas filas em que atua |
| **special_agent** | `user_roles.role = 'special_agent'` | `zapp.has_role` + `get_visible_agent_ids` | Vê contatos de **agentes concedidos** via `agent_visibility_grants` |

**Proteção contra escalonamento:** o trigger `zapp.prevent_role_escalation()` bloqueia alterações de `role`/`access_level`/`permissions` fora de admin/supervisor e audita a tentativa em `zapp.audit_logs`.

---

## 2. Helpers reais (assinaturas do banco)

| Helper | Assinatura | Semântica |
|---|---|---|
| `zapp.has_role` | `(_user_id uuid, _role zapp.app_role) → boolean` | Existe `user_roles` com o papel |
| `zapp.is_admin_or_supervisor` | `(_user_id uuid) → boolean` | `user_roles` tem `dev/admin/manager/supervisor` **OU** `workspace_members` tem `admin/supervisor/owner` |
| `zapp.is_contact_visible_to_user` | `(_contact_id uuid, _user_id uuid) → boolean` | Contato **atribuído ao usuário** (`profiles.id::text = contacts.assigned_to` e `profiles.user_id = _user_id`) **OU** `is_admin_or_supervisor` |
| `zapp.is_queue_member_of_contact` | `(_contact_id uuid, _user_id uuid) → boolean` | Usuário é **membro ativo da fila** do contato |
| `zapp.get_visible_agent_ids` | `(_user_id uuid) → uuid[]` | Perfil próprio + agentes concedidos por `agent_visibility_grants` (special_agent) |
| `zapp.prevent_role_escalation()` | trigger | Bloqueia mudança de role/access_level/permissions sem admin/supervisor; audita em `zapp.audit_logs` |

---

## 3. Matriz: recurso × papel × operação

Legenda: **✓** = permitido pela helper citada · **◐** = permitido de forma condicional (coluna "Condição") · **✗** = negado.

### 3.1 Conversas

| Operação | agent | special_agent | supervisor | manager | admin | dev | Condição / helper |
|---|---|---|---|---|---|---|---|
| Ver conversa | ◐ | ◐ | ✓ | ✓ | ✓ | ✓ | `is_contact_visible_to_user` (atribuída a mim) OU `is_queue_member_of_contact` |
| Listar conversas | ◐ | ◐ | ✓ | ✓ | ✓ | ✓ | `get_visible_agent_ids` (special_agent soma agentes concedidos) |
| Enviar mensagem | ◐ | ◐ | ✓ | ✓ | ✓ | ✓ | Mesma visibilidade da conversa |
| Editar/arquivar conversa | ◐ | ◐ | ✓ | ✓ | ✓ | ✓ | Atribuída a mim / minha fila; admin+ tudo |
| Excluir conversa/mensagem | ✗ | ✗ | ◐ | ◐ | ✓ | ✓ | Exclusão dura reservada a admin+; supervisor/manager só com justificativa (audit) |

### 3.2 Contatos

| Operação | agent | special_agent | supervisor | manager | admin | dev | Condição / helper |
|---|---|---|---|---|---|---|---|
| Ver contato | ◐ | ◐ | ✓ | ✓ | ✓ | ✓ | **Regra de ouro:** `is_contact_visible_to_user` = atribuído a mim OU admin/supervisor |
| Ver contatos da fila | ◐ | ◐ | ✓ | ✓ | ✓ | ✓ | `is_queue_member_of_contact` (membro ativo da fila do contato) |
| Editar dados do contato | ◐ | ◐ | ✓ | ✓ | ✓ | ✓ | Atribuído a mim / minha fila |
| Transferir contato | ◐ | ◐ | ✓ | ✓ | ✓ | ✓ | De/para agentes visíveis (`get_visible_agent_ids`) |
| Excluir contato | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | Apenas admin+ |
| Ver dados sensíveis (docs, histórico) | ◐ | ◐ | ✓ | ✓ | ✓ | ✓ | Mesma visibilidade do contato |

### 3.3 Filas

| Operação | agent | special_agent | supervisor | manager | admin | dev | Condição / helper |
|---|---|---|---|---|---|---|---|
| Ver filas | ◐ | ◐ | ✓ | ✓ | ✓ | ✓ | Agent: só filas em que é membro ativo |
| Ver contatos da fila | ◐ | ◐ | ✓ | ✓ | ✓ | ✓ | `is_queue_member_of_contact` |
| Criar/editar fila | ✗ | ✗ | ✗ | ◐ | ✓ | ✓ | Manager+; supervisor gerencia apenas as próprias filas |
| Gerenciar membros da fila | ✗ | ✗ | ✗ | ◐ | ✓ | ✓ | `has_role(manager)` ou admin |

### 3.4 Times

| Operação | agent | special_agent | supervisor | manager | admin | dev | Condição / helper |
|---|---|---|---|---|---|---|---|
| Ver times | ◐ | ◐ | ✓ | ✓ | ✓ | ✓ | Agent: apenas o próprio time |
| Ver membros do time | ◐ | ◐ | ✓ | ✓ | ✓ | ✓ | Agent: próprio time; special_agent: + concedidos |
| Criar/editar time | ✗ | ✗ | ✗ | ◐ | ✓ | ✓ | Manager+ (supervisor: times sob sua área) |
| Excluir time | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | Admin+ |

### 3.5 Campanhas

| Operação | agent | special_agent | supervisor | manager | admin | dev | Condição / helper |
|---|---|---|---|---|---|---|---|
| Ver campanhas | ◐ | ◐ | ✓ | ✓ | ✓ | ✓ | Agent: campanhas em que participa / do seu time |
| Executar/disparar campanha | ◐ | ◐ | ✓ | ✓ | ✓ | ✓ | Supervisor+ libera disparo; agent só com permissão explícita |
| Criar/editar campanha | ✗ | ✗ | ◐ | ◐ | ✓ | ✓ | Manager+; supervisor cria para sua área |
| Excluir campanha | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | Admin+ |
| Ver contatos da campanha | ◐ | ◐ | ✓ | ✓ | ✓ | ✓ | Herda visibilidade de contato (`is_contact_visible_to_user`) |

### 3.6 Configuração

| Operação | agent | special_agent | supervisor | manager | admin | dev | Condição / helper |
|---|---|---|---|---|---|---|---|
| Ver configurações do app | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | `is_admin_or_supervisor` |
| Editar configurações | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | Admin+ |
| Configurar instâncias/canais | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | Admin+ |
| Gerenciar integrações/webhooks | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | Admin+ |

### 3.7 Segurança

| Operação | agent | special_agent | supervisor | manager | admin | dev | Condição / helper |
|---|---|---|---|---|---|---|---|
| Ver papéis/permissões | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | Admin+ |
| Conceder/revogar papéis | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | `prevent_role_escalation()` audita tudo |
| Ver audit_logs | ✗ | ✗ | ◐ | ◐ | ✓ | ✓ | Supervisor+ vê logs da própria área |
| Alterar RLS/policies | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | Admin+/dev (via migration) |

### 3.8 Financeiro / Vendas (schemas separados)

> Acessados por **painéis externos** (BI / dashboards de vendas), não pela UI do ZAPP.

| Recurso | agent | special_agent | supervisor | manager | admin | dev | Observação |
|---|---|---|---|---|---|---|---|
| Vendas / pedidos (schema próprio) | ✗ | ✗ | ◐ | ◐ | ✓ | ✓ | Painel externo autentica com chave de serviço; supervisor+ com escopo por time |
| Financeiro / comissões (schema próprio) | ✗ | ✗ | ✗ | ◐ | ✓ | ✓ | Painel externo; manager+ |
| Relatórios agregados | ✗ | ✗ | ◐ | ◐ | ✓ | ✓ | Via painel externo, nunca por RLS do app |

**Nota:** por viverem em schemas separados e serem chamados por painéis externos, esses recursos **não devem** ser cobertos pelas policies do `zapp` — o endurecimento (etapas 35–39) deve **excluí-los** do escopo das 453 policies restantes.

---

## 4. Regra de ouro

> **Um contato é visível para mim se, e somente se:**
> 1. **está atribuído a mim** (`profiles.id::text = contacts.assigned_to` e `profiles.user_id = auth.uid()`), **OU**
> 2. **sou admin/supervisor** (`is_admin_or_supervisor(auth.uid())`).
>
> **E se sou membro ativo da fila do contato, também o vejo** (`is_queue_member_of_contact`).

Equivalente em SQL (forma canônica das policies):

```sql
-- visibilidade de contato/conversa
USING (
    zapp.is_contact_visible_to_user(contacts.id, auth.uid())
    OR zapp.is_queue_member_of_contact(contacts.id, auth.uid())
)

-- escopo de agentes (special_agent)
id = auth.uid() OR id = ANY (zapp.get_visible_agent_ids(auth.uid()))
```

Toda policy de leitura deve ser expressável como combinação dessas três helpers — **se não for, não deve existir**.

---

## 5. Estado atual: policies `USING(true)` — 464 → 453

| Métrica | Valor |
|---|---|
| Policies `USING(true)` para `authenticated` na migração inicial (Lovable) | **464** |
| Policies após endurecimento parcial (auditoria em curso) | **453** |
| Diferença já corrigida | **11 policies** |
| Restante a endurecer | **453** |
| Estratégia | Endurecimento **por lote** (etapas 35–39), lote a lote, com esta matriz como referência de "quem deve ver o quê" |
| Critério de aceite por lote | Zero policies `USING(true)` restantes nas tabelas do lote; testes de regressão por papel (agent, supervisor, admin) |

**Regras do endurecimento:**
- Substituir `USING(true)` por `is_admin_or_supervisor(auth.uid())` onde o recurso é administrativo (config/segurança/filas/times/campanhas).
- Substituir por `is_contact_visible_to_user(...) OR is_queue_member_of_contact(...)` onde o recurso é conversa/contato.
- Nunca `OR` com `auth.role() = 'authenticated'` (equivale a `true`).
- Schemas externos (financeiro/vendas) ficam fora do escopo.

---

## 6. As 85 tabelas regredidas × 5 lotes de endurecimento

Distribuição proposta das 85 tabelas que ainda carregam policies `USING(true)` (inventário completo levantado na etapa 31; nomes representativos do domínio):

| Lote | Etapa | Grupo | Nº tabelas | Escopo proposto |
|---|---|---|---|---|
| **1** | 35 | **Conversas** | 17 | `messages`, `conversations`, `conversation_participants`, `message_attachments`, `message_status`, `message_reactions`, `conversation_labels`, `labels`, `message_templates`, `quick_replies`, `call_logs`, `typing_status`, `conversation_notes`, `message_mentions`, `conversation_events`, `message_queues`, `notifications` — policy padrão: `is_contact_visible_to_user` OU `is_queue_member_of_contact` |
| **2** | 36 | **Contatos** | 16 | `contacts`, `contact_tags`, `tags`, `contact_custom_fields`, `custom_field_values`, `contact_notes`, `contact_events`, `contact_imports`, `blocked_contacts`, `contact_groups`, `group_members`, `contact_wallet_links`, `contact_documents`, `contact_phones`, `contact_emails`, `contact_history` — policy padrão: `is_contact_visible_to_user`; exclusão só admin+ |
| **3** | 37 | **Time / Usuário** | 18 | `profiles`, `user_roles`, `workspace_members`, `agent_visibility_grants`, `teams`, `team_members`, `shifts`, `availability`, `user_settings`, `notification_preferences`, `activity_logs`, `audit_logs`, `user_sessions`, `agent_stats`, `performance_metrics`, `schedules`, `vacations`, `team_notes` — leitura do próprio perfil para todos; `user_roles`/`workspace_members`/`audit_logs` só admin+ |
| **4** | 38 | **Campanha / Agendamento** | 18 | `campaigns`, `campaign_contacts`, `campaign_messages`, `campaign_templates`, `template_variables`, `schedulings`, `scheduling_items`, `scheduling_logs`, `reminders`, `broadcast_lists`, `broadcast_contacts`, `broadcast_sends`, `automations`, `automation_steps`, `webhook_deliveries`, `campaign_stats`, `scheduling_contacts`, `campaign_audience` — leitura: supervisor+; agent só via participação explícita; disparo: supervisor+ |
| **5** | 39 | **Config / Fila** | 16 | `queues`, `queue_members`, `queue_settings`, `channel_configs`, `whatsapp_instances`, `instance_configs`, `webhooks`, `webhook_events`, `api_keys`, `integrations`, `bot_configs`, `ai_configs`, `app_settings`, `system_configs`, `feature_flags`, `backup_configs` — **todo o lote só admin+** (`is_admin_or_supervisor`), exceto leitura das próprias filas para agentes |

**Total: 17 + 16 + 18 + 18 + 16 = 85 tabelas** ✓

Ordem de execução sugerida: Lote 5 (config/fila — mais simples, só admin) → Lote 3 (time/usuario) → Lote 1 e 2 (conversas/contatos — críticos, usam a regra de ouro) → Lote 4 (campanhas — depende da visibilidade de contatos).

---

## 7. Referências cruzadas da auditoria (2026-08-01)

- Etapa 31 — inventário de policies (origem das 85 tabelas / 453 policies)
- Etapas 35–39 — endurecimento por lote (consumidor desta matriz)
- `zapp.is_admin_or_supervisor`, `zapp.is_contact_visible_to_user`, `zapp.is_queue_member_of_contact`, `zapp.get_visible_agent_ids`, `zapp.has_role`, `zapp.prevent_role_escalation` — definições reais no banco
- Schemas externos (financeiro/vendas): fora do escopo do endurecimento — acesso via painéis externos
