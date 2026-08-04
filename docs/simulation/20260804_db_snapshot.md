# Snapshot DB pré-fix — 2026-08-04T12:52 BRT

> Capturado via pg_catalog antes da migration `20260804150000_integration_schema_zapp_fixes`.
> Uso: referência para rollback/reconstrução de definições originais.

## Funções originais (definições-chave)

### public.rpc_app_bootstrap()
SECURITY DEFINER, SET search_path = public, zapp, pg_catalog. Guard: `auth.uid() IS NULL → {error:not_authenticated}`. Retorna profile/roles/permissions/role_permissions/global_settings/departments/unread_notifications. Grants originais: anon=false, authenticated=true, service_role=true.

### public.rpc_dashboard_init(uuid,uuid,timestamptz,timestamptz)
SECURITY DEFINER, SET search_path = public, zapp, pg_catalog. Guard: auth.uid(). Retorna agents/contacts/queues/filters. Params têm DEFAULTS (p_agent_id DEFAULT NULL, p_queue_id DEFAULT NULL, p_date_from DEFAULT date_trunc('day',now()), p_date_to DEFAULT +1 day). Grants originais: anon=false, authenticated=true, service_role=true.

### zapp.fn_safe_audit_log(text,text,uuid DEFAULT NULL,text DEFAULT 'system',text DEFAULT 'system',jsonb DEFAULT NULL,jsonb DEFAULT NULL,jsonb DEFAULT NULL,text DEFAULT NULL)
SECURITY DEFINER, SET search_path = zapp, evo, monitoring. SEM guard (motivo do fix H-01). Insere em evolution_audit_log com fallback check_violation → action_not_in_vocabulary. Grants originais: sem EXECUTE p/ authenticated.

### zapp.import_user_data(jsonb)
SECURITY DEFINER, search_path zapp. STUB: `RETURN jsonb_build_object('imported', false, 'error', 'Data import not yet implemented')`.

### zapp.fn_toggle_user_meme_favorite(uuid) / (uuid,uuid)
1-arg: guard auth.uid(), scoped ao próprio usuário. 2-arg: SEM guard (p_user_id arbitrário) — NÃO grantado (decisão GAP-H).

### zapp.rpc_list_failed_messages(text[],text,text,timestamptz,timestamptz,integer,integer)
SECURITY DEFINER, search_path zapp. Guard interno: has_role(admin|supervisor) + log_rls_denied. Params com DEFAULTS (p_status DEFAULT NULL ... p_limit DEFAULT 50, p_offset DEFAULT 0).

### zapp.fn_increment_meme_use(uuid)
SECURITY DEFINER, search_path zapp. `UPDATE zapp.audio_memes SET use_count = use_count + 1 WHERE id = p_meme_id`.

## Views zapp (definições)

- `zapp.evolution_conversations_wpp2` = SELECT * de evo.evolution_conversations_wpp2 (29 colunas, incl. last_message_content/type/unread_count). security_invoker=on.
- `zapp.evolution_messages_wpp2` = SELECT * de evo.evolution_messages_wpp2 (42 colunas, incl. audio_meme_id/sticker_id/link_preview/is_read). security_invoker=on.
- `zapp.evolution_instance_credentials` = SELECT de evo (15 colunas: id, instance_name, api_url, display_name, department, health_status, last_health_check, online_instances, total_instances, notes, is_active, created_at, updated_at, connection_id, webhook_url) — SEM api_key/instance_token. security_invoker=on.
- `zapp.evolution_instances` = SELECT de evolution_instances_public (10 colunas). security_invoker=on.
- `zapp.evolution_health_logs` = SELECT de evo.evolution_health_logs (15 colunas). security_invoker=on.

## Realtime (publicação supabase_realtime) — relações físicas relevantes

- zapp.voice_conversion_queue (relkind r) — subscription DEVE usar schema zapp.
- evo.evolution_retry_metrics (relkind r) — subscription DEVE usar schema evo (policy SELECT authenticated: auth_read_evolution_retry_metrics).
- evo.evolution_messages (relkind p, particionada) — subscription schema evo (policies authenticated: messages_select_scoped etc.).
- evo.evolution_conversations (relkind p) — policies authenticated SELECT/UPDATE.

## Estrutura user_roles (IMPORTANTE para guards)

zapp.user_roles: id, user_id, role_key, workspace_id, assigned_by, created_at, role (app_role). NÃO tem role_id.
zapp.roles: id, key, name, description, level, color, icon, is_system, is_active, created_at, updated_at.
zapp.is_admin_or_supervisor(): 2 overloads — () delega para (uuid); (uuid) checa user_roles.role::text IN (dev,admin,manager,supervisor) OR workspace_members.

## Infra

- PGRST_DB_SCHEMAS = public,zapp,storage,graphql_public,artes,vendas,financeiro (INTOCADO).
- supabase_meta: recriado 2026-08-04 12:09 BRT, mem 512MB, NODE_OPTIONS=--max-old-space-size=400, healthy, RestartCount=0 (I-01 remediado antes deste PR).
- evo.evolution_instance_credentials: RLS on, única policy = evo_creds_service_role_only ALL {service_role}. UNIQUE(instance_name), UNIQUE(connection_id), PK(id).
- evo.evolution_health_logs: RLS on, policies para role public (evo_health_insert/select/all).
