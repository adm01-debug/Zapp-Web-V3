# Relatório de Auditoria RLS — Schemas `zapp` e `evo`

**Data:** 30/07/2026
**Ferramenta:** `mcp__supabase__supabase_meta_list_policies`
**Contexto:** Supabase Self-Hosted, multi-schema

---

## Resumo Geral

| Métrica | zapp | evo |
|---|---|---|
| Total de políticas RLS | **701** (401 únicas por tabela) | **411** (355 únicas por tabela) |
| Tabelas com RLS | **199** | **163** |
| Políticas com filtro por usuário (auth.uid, user_id, tenant, owner, assigned_to) | 73 (18.2%) | 82 (23.1%) |
| Políticas com `USING true` irrestritas (ALL ou SELECT) | **308** | **221** |
| Tabelas com ONLY service_role ALL irrestrito | **8** | **17** |

---

## 1. Contagem de Políticas por Tabela

### Schema `zapp` — Top tabelas com mais políticas

| Tabela | Total | ALL | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|---|---|
| instance_processing_pauses | 6 | 1 | 2 | 1 | 1 | 1 |
| password_reset_requests | 5 | 1 | 1 | 1 | 1 | 1 |
| channel_connections | 5 | 1 | 1 | 1 | 1 | 1 |
| conversation_snoozes | 5 | 1 | 1 | 1 | 1 | 1 |
| profiles | 4 | 1 | 1 | 1 | 1 | 0 |
| integration_profiles | 4 | 3 | 1 | 0 | 0 | 0 |
| crisis_room_alerts | 4 | 0 | 1 | 1 | 1 | 1 |
| outbox_events | 4 | 3 | 1 | 0 | 0 | 0 |
| ... | | | | | | |
| **(~191 tabelas restantes)** | 2-3 cada | | | | | |

### Schema `evo` — Top tabelas com mais políticas

| Tabela | Total | ALL | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|---|---|
| evolution_alerts | 3 | 2 | 1 | 0 | 0 | 0 |
| evolution_conversations* (×18) | 3 cada | 1 | 1 | 0 | 1 | 0 |
| evolution_messages* (×21) | 3 cada | 1 | 1 | 1 | 0 | 0 |
| evolution_health_logs | 3 | 1 | 1 | 1 | 0 | 0 |
| evolution_media | 3 | 1 | 1 | 1 | 0 | 0 |
| evolution_pipeline_health_log | 3 | 2 | 1 | 0 | 0 | 0 |
| **(~145 tabelas restantes)** | 1-2 cada | | | | | |

> `*` — Múltiplas tabelas por departamento (comercial_01..15, artes, compras, default, etc.)

---

## 2. Verificação de Políticas Críticas

### 2.1 `assigned_to IS NULL` — ❌ NÃO ENCONTRADO em nenhum schema

Não existe **nenhuma** política RLS com referência a `assigned_to` em nenhuma tabela de nenhum dos dois schemas. Isso significa que não há proteção de "fila de atendimento" (apenas agentes logados veem contatos/mensagens sem dono) via RLS.

### 2.2 Tabelas de Contato

**zapp.contatos:** `auth_access [ALL] roles={authenticated} using=true` — TODO authenticated pode ver e alterar todos os contatos.
**evo.evolution_contacts:** `authenticated_read_contacts [SELECT] roles={authenticated} using=true` — TODO authenticated pode ler todos os contatos.

### 2.3 Tabelas de Mensagem

**zapp:** Nenhuma tabela `messages` no schema zapp; as mensagens estão em `conversation_threads`, `forwarded_messages`, `failed_messages`, `outbound_message_queue` etc.

- `conversation_threads`: 3 políticas — admin (has_role), supervisor (is_admin_or_supervisor), self (via participant check) ✅ Boa granularidade
- `forwarded_messages`: `auth_select_forwarded_messages [SELECT] using=true` — irrestrito p/ authenticated
- `failed_messages`: `auth_full_access [ALL] using=true` — irrestrito p/ authenticated

**evo.evolution_messages:** Filtradas por `instance_name IN ('wpp2', 'wppmkt')` — há alguma segmentação por instância, mas sem filtro por usuário ou assigned_to.

### 2.4 Tabelas de Conversa

**zapp:** Usa `conversation_participants` + `conversation_threads` com controle granulado (admin, supervisor, self) — bom design.

**evo.evolution_conversations:** Apenas `USING true` irrestrito para authenticated.

### 2.5 Perfis e Empresas

**zapp.profiles:** 4 políticas bem desenhadas — SELECT público autenticado, INSERT próprio (`auth.uid() = user_id`), UPDATE próprio, service_role total ✅
**zapp.empresas:** `auth_access [ALL] using=true` — TODO authenticated pode CRUD todas empresas ⚠️

---

## 3. Problemas Encontrados

| # | Severidade | Schema | Tabela | Problema |
|---|---|---|---|---|
| 1 | 🔴 ALTO | zapp | contatos | `auth_access [ALL] using=true` — qualquer usuário autenticado acessa/todos contatos |
| 2 | 🔴 ALTO | zapp | empresas | `auth_access [ALL] using=true` — qualquer usuário autenticado gerencia todas empresas |
| 3 | 🔴 ALTO | evo | evolution_contacts | `authenticated_read_contacts [SELECT] using=true` — sem filtro por tenant/usuário |
| 4 | 🔴 ALTO | evo | evolution_conversations | `authenticated_read [SELECT] using=true` — sem filtro por tenant/usuário |
| 5 | 🟠 MÉDIO | zapp | contact_assignments | SELECT e ALL irrestritos p/ authenticated |
| 6 | 🟠 MÉDIO | zapp | contact_phones | SELECT irrestrito p/ authenticated |
| 7 | 🟠 MÉDIO | zapp | forwarded_messages | SELECT irrestrito p/ authenticated |
| 8 | 🟠 MÉDIO | zapp | failed_messages | ALL irrestrito p/ authenticated |
| 9 | 🟠 MÉDIO | evo | evolution_messages | Filtro por instance_name apenas, sem granularidade por usuário |
| 10 | 🟡 BAIXO | evo | evolution_conversations_wpp2 | Apenas UPDATE e SELECT (sem ALL) — mas ainda irrestrito |

### Ausência de `assigned_to IS NULL`

Nenhuma tabela em nenhum schema implementa a cláusula `assigned_to IS NULL` em políticas RLS. Isso é um **gap de segurança** para sistemas de ticket/distribuição onde agentes devem ver apenas registros não-assinados. A separação de dados por responsável (se existir) está sendo feita em **camada de aplicação**, não no banco.

### Políticas com `USING true` para `authenticated`

- **zapp:** 308 políticas com `USING true` irrestrito no total (ALL ou SELECT)
- **evo:** 221 políticas com `USING true` irrestrito no total (ALL ou SELECT)

A maioria é pareada com uma política `service_role_full_access` paralela — indicando que o padrão é "todo authenticated pode tudo". Isso é adequado para sistemas onde o backend confia em todos os usuários autenticados, mas **inadequado** para multi-tenant ou ambientes com diferentes níveis de acesso.

---

## 4. Recomendações

1. **Adicionar `assigned_to IS NULL`** nas tabelas de contato e mensagem se houver conceito de fila de atendimento (suporte ao cliente).
2. **Implementar tenant isolation** — adicionar `tenant_id = (SELECT tenant_id FROM profiles WHERE user_id = auth.uid())` nas políticas de tabelas de dados (contatos, mensagens, empresas, conversas).
3. **Revisar `empresas` e `contatos`** no schema zapp — atualmente ANY authenticated pode fazer CRUD completo.
4. **Adicionar políticas de INSERT com verificação** nas tabelas evo que só têm `service_role_all` [ALL] sem contraparte authenticated — verificar se o fluxo de inserção realmente passa só pelo service_role.
5. **Eliminar redundância** — muitas tabelas têm par `service_role_full_access` + `auth_access/basic_access` com `USING true` idênticos. Se a intenção é permitir ambos, uma única política com `roles={authenticated,service_role}` seria suficiente.

---

## 5. Tabelas com ONLY service_role (sem acesso authenticated)

### Schema `zapp` (8 tabelas)
`_audit_sim_results`, `_consumer_dlq`, `_db_size_snapshots`, `credential_vault`, `email_health_logs`, `fn_health_score_cache`, `media_scan_log`, `media_security_config`, `migration_audit`

### Schema `evo` (17 tabelas)
`_secure_config`, `_snapshot_version_state`, `contact_id_graveyard`, `evolution_alert_cooldown`, `evolution_api_consumers`, `evolution_bootstrap_log`, `evolution_burnin_tracker`, `evolution_guardian_heartbeat`, `evolution_incident_runbook`, `evolution_instance_credentials`, `evolution_ip_blocklist`, `evolution_ip_watch`, `evolution_logpatch_audit`, `evolution_monthly_audit_log`, `evolution_settings`, `evolution_status_auto_rules`

✅ Apropriado — são tabelas de configuração interna e auditoria que não devem ser expostas a usuários comuns.

---

## Conclusão

Ambos os schemas têm cobertura RLS **ampla** (toda tabela tem pelo menos uma política), mas a **qualidade** é baixa — a maioria das políticas usa `USING true` irrestrito, delegando o controle de acesso à aplicação. Não há políticas baseadas em `assigned_to`, e tabelas críticas como `contatos` e `evolution_contacts` estão abertas para leitura completa por qualquer usuário autenticado. O schema `zapp` tem melhor granularidade em tabelas de conversa/participantes (com funções `has_role`, `is_admin_or_supervisor`), mas o schema `evo` é praticamente plano — todo authenticated vê tudo.
