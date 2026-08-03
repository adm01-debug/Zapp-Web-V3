# PostgREST Exposure Audit — zapp-web-v3 (2026-08-03)

**Escopo:** funções com GRANT EXECUTE para `authenticated`/`anon` acessíveis via PostgREST (schema expostos: `public, zapp, storage, graphql_public, artes, vendas, financeiro` — confirmado no env do serviço `supabase_rest` v14.12). `evo` **NÃO** está em PGRST_DB_SCHEMAS (não exposto via REST).

## 1. Inventário de exposição (live DB, has_function_privilege)

| Schema | Expostas (auth) | SECDEF expostas | anon | PUBLIC | Notas |
|---|---|---|---|---|---|
| zapp | 469 | 120 | 0 | 0 | núcleo do app |
| public | 133 | 13 | 0 | 0 | maioria pg_trgm/vector (benignas) |
| artes | 11 | 11 | 0 | 0 | app fechamento-artes |
| financeiro | 38 | 26 | 0 | 0 | app painel-financeiro |
| vendas | 6 | 5 | 0 | 0 | app painel-cotacoes |
| evo | 7 | 0 | 0 | 0 | NÃO exposto via REST |
| storage | 17 | 0 | 17 | 17 | API padrão Supabase (normal) |
| graphql_public | 1 | 0 | 1 | 1 | graphql() padrão (normal) |

**Total via REST: ~658 funções executáveis por qualquer usuário authenticated** (0 para anon fora do storage/graphql padrão — bom).

## 2. 🔴 CRÍTICO — financeiro.* (26 SECDEF, 100% SEM autorização)

Nenhuma função chama `auth.uid()`, `fn_is_admin()` ou `fn_app_role()` no corpo. RLS está ATIVO nas tabelas (emprestimos, vales, notas_fiscais, vendas_parcelas, vendas_unificadas) mas **SECURITY DEFINER bypassa RLS** (owner=postgres). Qualquer usuário authenticated do zapp pode:

- `liquidar_parcela(id, valor, ...)` / `pagar_parcela_emprestimo` / `liquidar_vale` — liquidar financeiro alheio
- `apagar_nota_fiscal(id)` — DELETAR NF + reverter qtd_enviada em vendas.ordens_compra
- `bulk_insert_parcelas(payload)` / `sync_parcela_planilha(p)` / `upsert_venda_unificada` — escrever parcelas/pagamentos arbitrários
- `unificar_pedidos(ids, lider, usuario)` / `desfazer_unificacao` / `prorrogar_parcela` / `adicionar_parcelas` / `remover_parcelas` — manipular empréstimos/pedidos
- Leitura: `ranking_vendas_*`, `vendedores_acima_50k_hoje`, `empresas_reativadas_ou_novas_hoje`, `listar_irmaos_faturaveis`, `get_nome_usuario` — dados financeiros de todos

`fn_is_admin`/`fn_is_admin_diretor` EXISTEM mas não são chamadas pelas funções de DML. **Fix mínimo: `IF NOT financeiro.fn_is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;` em cada uma (ou REVOKE se painel-financeiro usar service_role).**

## 3. 🔴 CRÍTICO — vendas.* (5 SECDEF)

- `aplicar_envio_cotacao` — DML sem auth (UPDATE ordens_compra + INSERT envios_cotacao)
- `fn_registrar_ncm_descoberto` — DML sem auth (INSERT produtos_ncm_mapa)
- `fn_listar_produtos_para_ia_ncm` — read sem auth (dados de produtos/fornecedores)
- `eh_admin`/`registrar_acesso` — OK (usam auth)

## 4. 🟠 ALTO — artes.* (11 SECDEF)

- Guardadas com `artes.is_admin()`: admin_* (criar/remover/resetar senha/atualizar), set_fechamento, set_fechamento_arquivo, is_admin, me ✓
- **`salvar_fechamento_completo`** — DML SEM guard (INSERT/UPDATE fechamentos + vendas)
- **`listar_pedidos_novos`** — read SEM guard (vendas.ordens_compra inteiro)

## 5. 🟠 ALTO — zapp.* (120 SECDEF expostas)

### Unguarded DML (qualquer authenticated):
- `rpc_upsert_contact` (2 overloads) — upsert contactos em evo.evolution_contacts / zapp.contacts
- `rpc_insert_message` (overload 2 SEM guard; overload 1 TEM guard visibility) — inserir mensagens falsas
- `rpc_delete_contact` — soft-delete por remote_jid/instance (qualquer contato)
- `bulk_soft_delete_contacts` — soft-delete até 500 contatos
- `reassign_absent_agents` / `reassign_overloaded_agents` — reatribuição em massa de conversas
- `rpc_migrate_whatsapp_integration` — **reescreve global_settings + integration_profiles** (troca o provider WhatsApp!)
- `rpc_run_full_test_suite` — insere em sts_troubleshooting_report/stress_test_metrics (poluição)
- `rpc_register_automation_execution` — insere executions (pode disparar automações)
- `record_voice_telemetry`, `fn_test_alert_channel`, `rpc_log_email_health`, `rpc_log_outbound_event`, `rpc_update_email_health_state`, `increment_webhook_rate_limit`, `rpc_email_register_open/click` (pixels — por design sem auth, chamados via edge functions email-track-*; exposição direta é risco menor)
- `rpc_email_archive_thread` / `rpc_email_assign_thread` / `rpc_email_mark_thread_read` / `rpc_email_star_thread` — UPDATE em email_app.email_threads de QUALQUER thread (sem checagem de ownership!)

### Unguarded READ (RLS bypass total — dump do CRM):
- `rpc_list_contacts`, `rpc_list_conversations`, `rpc_list_messages`, `rpc_list_messages_lite`, `rpc_list_deals`, `rpc_list_calls`, `rpc_list_media`, **`rpc_list_audit_log`** (auditoria completa!)
- `rpc_global_search` (busca em TODAS as mensagens/contatos/deals), `search_contacts_advanced`
- `rpc_get_contact` ×2, `rpc_get_message_details`, `rpc_dashboard_home`, `rpc_contact_stats`, `rpc_instance_auth_event_summary`, `rpc_get_whatsapp_mode`, `rpc_get_email_health_summary`, `rpc_get_active_integration_profile`
- **`get_team_profiles`** — retorna TODOS os profiles (email, role, avatar) — sem auth!
- `get_visible_agent_ids`, `find_duplicate_contacts`, `get_duplicate_report`, `get_avatars_by_jids_batch`, `enrich_contact` (stub), `export_user_data` (stub), `contacts_count_by_type`, `rpc_dr_health_check`, `search_knowledge_base`

### Guardadas ✓ (não revogar):
- `bulk_add_tag` (is_admin_or_supervisor), `rpc_dlq_stats` (has_role admin), `rpc_insert_message` overload-1 (visibility), `rpc_email_token_status` (auth.uid scope), `get_own_email_accounts` (auth.uid scope), `add_contact_note`, `add_contacts_to_campaign`, `unpause_instance`, `update_own_profile`, `restore_contact`, `mark_pause_investigated`, `pause_instance`, `merge_contacts`, `rpc_dlq_*`, `rpc_email_search_threads`, `rpc_evolution_fallback_stats`, `rpc_disable_service_channel`
- **Policy helpers (usados por RLS — NUNCA revogar):** `has_role`, `is_admin_or_supervisor` (×2), `is_contact_visible_to_user`, `get_profile_id_for_user`, `current_user_is_privileged`, `is_admin_painel`, `is_team_conversation_member`, `is_within_business_hours`, `is_instance_paused`, `get_connection_id_for_instance`, `get_default_workspace_id`, `user_has_permission`
- Trigger functions (executadas pelo owner, não por RPC): `log_assignment_change`, `notify_sicoob_on_reply`, `prevent_role_escalation`, `update_*_updated_at`, `handle_new_user_settings`, `on_role_change`, `trg_fn_set_transfer_ticket`

## 6. 🟡 BAIXO — public.* (13 SECDEF)
Wrappers delegando a zapp (`generate_transfer_ticket` — gera ticket TRF- sequencial, sem dado sensível), triggers, rate-limit helpers, `log_rls_denied`. `rpc_get_contact` ×2 duplicam a leitura sem auth do zapp. `get_companies_by_phones_batch`/`get_contact_intelligence_by_phone` têm guard de workspace ✓.

## 7. Search path & injection
- **100% das SECDEF expostas têm `SET search_path` fixo** (0 sem) ✓
- Nenhum corpo revisado usa EXECUTE dinâmico com concatenação (só `jsonb_set`, casts tipados) — sem vetor de SQL injection encontrado ✓
- `prorrogar_parcela` usa `(num::TEXT || ' months')::INTERVAL` — cast seguro, não execução.

## 8. Frontend/edge usage cross-check (repo zapp-web-v3)
- Chamadas reais: rpc_upsert_contact (external-db-proxy, whatsapp-cloud-webhook, useAutomationSuggestions, useAutomations), rpc_insert_message (edge functions), rpc_email_register_* (email-track-pixel/link), rpc_migrate_whatsapp_integration (IntegrationMigrationMount, WhatsAppModeSetting), rpc_run_full_test_suite (evoApiHealth), fn_test_alert_channel, reassign_absent_agents (useAgentReassignment), record_voice_telemetry (VoiceChanger), rpc_register_automation_execution (useAutomations/useAutomationManagement), bulk_add_tag (external-db-proxy)
- financeiro/artes/vendas: **0 call-sites neste repo** — são consumidos por outros apps (painel-financeiro, fechamento-artes, painel-cotacoes) no MESMO PostgREST/auth → qualquer usuário authenticated de qualquer app consegue chamá-las (escalada cross-app).

## 9. Recomendações prioritárias
1. **financeiro**: adicionar guard `fn_is_admin()` (ou REVOKE authenticated → service_role) nas 26 SECDEF — hoje qualquer usuário autenticado liquida empréstimos/NFs.
2. **vendas**: guard `eh_admin()` em aplicar_envio_cotacao, fn_registrar_ncm_descoberto, fn_listar_produtos_para_ia_ncm.
3. **artes**: guard is_admin/usuário ativo em `salvar_fechamento_completo` e `listar_pedidos_novos`.
4. **zapp leituras**: adicionar `auth.uid()`/visibility em rpc_list_*, rpc_global_search, search_contacts_advanced, get_team_profiles, rpc_get_contact, rpc_get_message_details, rpc_list_audit_log — hoje = dump completo do CRM.
5. **zapp DML**: guard em rpc_upsert_contact, rpc_delete_contact, bulk_soft_delete_contacts, reassign_*, rpc_migrate_whatsapp_integration (admin!), rpc_email_*_thread (ownership: thread.user_id = auth.uid()).
6. **Não revogar**: policy helpers (has_role, is_admin_or_supervisor, is_contact_visible_to_user, get_profile_id_for_user, current_user_is_privileged, is_admin_painel), triggers, storage.* (padrão).

*Auditoria executada via Supabase MCP (postgres) + inspeção do serviço supabase_rest no Portainer. Nenhuma alteração aplicada.*
