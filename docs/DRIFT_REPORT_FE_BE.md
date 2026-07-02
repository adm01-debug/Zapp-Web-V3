# Relatorio de Drift FE<->BE - zapp-web-v3 (2026-07-02)

Varredura estatica de **762 pontos de contato** do frontend (175 tabelas, 462 colunas, 42 embeds, 83 RPCs) cruzada com o schema real do banco canonico.

## Descoberta central
O drift nao e aleatorio: o repo tem **521 migrations**, mas o banco canonico recebeu so um **subconjunto** delas. Varias funcoes/views/FKs que o frontend usa **existem no Git** (migrations), apenas **nao foram aplicadas**. => A fonte da verdade existe; falta um **delta controlado**, nao recriar do zero.

---

## Corrigido e validado nesta sessao (HTTP 400 -> 200)

| Item | Correcao | Status |
|---|---|---|
| FK role_permissions -> permissions | criada (embed PostgREST) | OK 200 |
| Coluna user_settings.onboarding_completed | adicionada | OK 200 |
| 4 colunas em whatsapp_connections (tabela real) | adicionadas | OK |
| Cache do PostgREST | recarregado via restart do servico rest | OK |

## Pendente - Colunas faltantes em VIEWS (5)
Precisam de recriacao da view (a coluna vai na tabela-base + CREATE OR REPLACE VIEW):
email_accounts.token_expiry, email_threads.thread_id, email_threads.unread_count, salespeople.role, whisper_messages.whisper_thread_id.

## Pendente - FKs de embed faltantes (14 confirmadas, monitoradas pelo guard)
Cada uma quebra o embed correspondente (HTTP 400). Baseline em ops.check_critical_fks():
automation_executions->automation_rules, chatbot_executions->chatbot_flows, contact_tags->contacts, contact_tags->tags, conversation_events->profiles, conversation_events->queues, conversation_sla->contacts, followup_executions->followup_sequences, followup_sequences->followup_steps, sales_deals->contacts, sales_deals->profiles, team_conversation_members->profiles, team_messages->profiles, user_roles->profiles.
> Fix seguro exige, por caso: achar a coluna FK correta na base + checar orfaos + criar a FK. Reversivel e fail-safe.

## Pendente - RPCs faltantes (11)
Funcoes que o front chama via .rpc() e nao existem no banco:
fn_increment_meme_use*, get_contact_conversations, get_contact_notes, get_csat_stats, get_platform_health, get_sla_dashboard, log_security_event*, mark_follow_up_done, rpc_list_transfers_paginated*, rpc_upsert_whatsapp_provider, smart_assign_conversation.
> (*) ja existem nas migrations do repo - e aplicar. As demais precisam ser localizadas/reimplementadas.

## Dado, nao schema - RBAC sem seed
permissions = 0 linhas, role_permissions = 0 linhas (user_roles tem 15). Catalogo de permissoes nao populado. Nao causa 400, mas afeta o controle de acesso fino.

---

## Recomendacao de processo (o fix 10/10, controlado)
1. Delta-reconciliation: extrair das 521 migrations so os objetos ausentes e aplicar num bloco idempotente revisado (em vez de re-rodar tudo, que colidiria).
2. Ordem: colunas -> FKs (com checagem de orfaos) -> views -> funcoes -> seed RBAC.
3. A cada etapa: recarregar o PostgREST (restart do rest, pois NOTIFY nao surte efeito neste ambiente) e validar via curl.
4. Guardar: tudo versionado em migration no repo.

## KPIs sugeridos
| Indicador | Meta |
|---|---|
| Endpoints REST com 400 (amostra) | 0 |
| FKs criticas ausentes (ops.check_critical_fks) | 0 |
| RPCs do front sem funcao no banco | 0 |
| Colunas do front sem coluna no banco | 0 |
