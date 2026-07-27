# Schema `zapp` — App ZAPP Web

**Dono:** time do app  
**Criado:** histórico (2024)  
**Atualizado:** 27/07/2026

---

## Propósito

Schema principal do produto ZAPP Web. Contém todas as tabelas de negócio da aplicação, RPCs expostas via PostgREST, e lógica de produto. É o schema configurado como default no cliente Supabase (`db: { schema: 'zapp' }`).

---

## Estatísticas (2026-07-27)

| Objeto | Quantidade |
|---|---:|
| Tabelas base | 320 |
| Views | 406 |
| Matviews | 6 |
| Funções | 1.052 |
| Triggers | 219 |
| RLS habilitado | 100% das tabelas |

---

## Tabelas Principais

### Identidade e Acesso

| Tabela | Descrição | Volume |
|---|---|---:|
| `profiles` | Usuários da plataforma | 17 |
| `workspaces` | Workspaces / tenants | — |
| `workspace_members` | Membros por workspace | 15 |
| `user_roles` | Permissões de usuário | 14 |
| `departments` | Departamentos | — |

### WhatsApp / Operações

| Tabela | Descrição | Volume |
|---|---|---:|
| `whatsapp_connections` | Conexões WA ativas | 3 |
| `instance_registry` | Registro de instâncias | 23 |
| `failed_messages` | Mensagens com falha (DLQ) | — |
| `dispatch_error_logs` | Erros de despacho | — |
| `webhook_audit_log` | Audit de webhooks | 58.232 |
| `webhook_events_processed` | Eventos processados | 58.076 |

### CRM

| Tabela | Descrição | Volume |
|---|---|---:|
| `empresas` | Empresas / clientes | 51.688 |
| `contatos` | Contatos / leads | — |
| `contact_notes` | Notas de contato | — |
| `contact_audit_log` | Histórico de mudanças | — |

### Filas e Atendimento

| Tabela | Descrição | Volume |
|---|---|---:|
| `queues` | Filas de atendimento | — |
| `queue_members` | Atendentes na fila | — |
| `queue_positions` | Posições na fila | — |
| `queue_analytics` | Analytics de fila | — |

### Notificações e Alertas

| Tabela | Descrição | Volume |
|---|---|---:|
| `app_notifications` | Notificações gerais | 14.283 |
| `sentiment_alerts` | Alertas de sentimento | — |
| `warroom_alerts` | Alertas de war room | — |
| `audit_logs` | Logs de auditoria geral | 4.356 |

### IA e Embeddings

| Tabela | Descrição | Volume |
|---|---|---:|
| `evolution_sentiment_analysis` | Análise de sentimento | — |
| `contact_intelligence` | Inteligência de contato | — |

---

## Views de Contrato (zapp→evo)

O `zapp` mantém views curadas apontando para `evo`:
- `evolution_messages` → `evo.evolution_messages` (raiz particionada)
- `evolution_conversations` → `evo.evolution_conversations` (raiz particionada)
- `evolution_contacts` → `evo.evolution_contacts`
- `evolution_media` → `evo.evolution_media`
- `evolution_whatsapp_status` → `evo.evolution_whatsapp_status`
- `contact_id_graveyard` → `evo.contact_id_graveyard`

> ⚠️ Existem ~254 views `zapp→evo` total (a maioria auto-gerada pelo cron job 138). Ver ADR-DB-002 para plano de racionalização.

---

## Matviews (`zapp`)

| Matview | Atualização | Propósito |
|---|---|---|
| `mv_dashboard_kpis` | manual/cron | KPIs do dashboard principal |
| `mv_agent_performance` | diária | Performance por atendente |
| `mv_queue_stats` | horária | Estatísticas de fila |
| `mv_contact_summary` | diária | Resumo de contatos |
| `mv_campaign_stats` | horária | Resultados de campanha |
| `mv_workspace_usage` | diária | Uso por workspace |

---

## Dependências

- **Pode consumir:** `evo` (via contrato curado), `auth` (autenticação), `storage` (arquivos)
- **Não pode consumir:** schemas de domínio de outros módulos (bpm, financeiro, etc.) — use RPC de contrato
- **É consumido por:** `public` (via views security_invoker)

---

## Convenções

- Toda nova tabela precisa de RLS habilitado + pelo menos 1 policy
- Funções de negócio: prefixo `fn_*`; RPCs de API: prefixo `rpc_*`
- Tipos TypeScript: regenerar via `curl -s "http://supabase_meta:8080/generators/typescript?..."` após mudanças
- Ver SCHEMA-CONTRACT.md para regras completas
