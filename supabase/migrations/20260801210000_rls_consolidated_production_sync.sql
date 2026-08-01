-- 20260801210000_rls_consolidated_production_sync.sql
-- Migration consolidada: sincroniza repo com estado real de producao (2026-08-01)
-- Tudo que foi aplicado via DDL direto e NAO estava versionado no repo.
-- Se rodar migrations from scratch, este arquivo garante que o banco
-- fique identico ao estado de producao de 2026-08-01.

-- ============================================================
-- PARTE 1: Guards SECURITY DEFINER (PR #684 — deletado do repo)
-- ============================================================

-- 1.1 rpc_insert_message (guard anti-IDOR — aplicado em producao)
DROP FUNCTION IF EXISTS zapp.rpc_insert_message(text, text, text, boolean, text, text, text);
CREATE FUNCTION zapp.rpc_insert_message(
  p_remote_jid text, p_instance text, p_message_id text,
  p_from_me boolean, p_direction text, p_message_type text, p_content text
) RETURNS evo.evolution_messages
LANGUAGE plpgsql SECURITY DEFINER SET search_path = zapp, evo, public
AS $$
DECLARE v_contact_id uuid; v_row evo.evolution_messages;
BEGIN
  SELECT id INTO v_contact_id FROM evo.evolution_contacts
  WHERE remote_jid=p_remote_jid AND instance_name=p_instance LIMIT 1;
  IF NOT (zapp.is_admin_or_supervisor()
          OR (v_contact_id IS NOT NULL AND zapp.is_contact_visible_to_user(v_contact_id, auth.uid()))) THEN
    RAISE EXCEPTION 'forbidden: contato nao visivel' USING ERRCODE = '42501';
  END IF;
  INSERT INTO evo.evolution_messages(
    message_id, remote_jid, from_me, direction, message_type, content,
    instance_name, contact_id, status, created_at
  ) VALUES (
    p_message_id, p_remote_jid, p_from_me, p_direction, p_message_type,
    p_content, p_instance, v_contact_id,
    CASE WHEN p_from_me THEN 'sent' ELSE 'received' END, now()
  ) RETURNING * INTO v_row;
  UPDATE evo.evolution_contacts SET last_message_at=now(), total_messages=COALESCE(total_messages,0)+1 WHERE id=v_contact_id;
  RETURN v_row;
END;
$$;
GRANT EXECUTE ON FUNCTION zapp.rpc_insert_message(text, text, text, boolean, text, text, text) TO authenticated;

-- 1.2 add_contact_note (guard de visibilidade)
DROP FUNCTION IF EXISTS zapp.add_contact_note(uuid, text, text, boolean);
CREATE FUNCTION zapp.add_contact_note(
  p_contact_id uuid, p_content text, p_note_type text DEFAULT 'general'::text, p_is_pinned boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = zapp, public
AS $$
DECLARE v_profile_id uuid; v_id uuid;
BEGIN
  v_profile_id := zapp.get_profile_id_for_user(auth.uid());
  IF NOT (zapp.is_admin_or_supervisor()
          OR (p_contact_id IS NOT NULL AND zapp.is_contact_visible_to_user(p_contact_id, auth.uid()))) THEN
    RAISE EXCEPTION 'forbidden: contato nao visivel' USING ERRCODE = '42501';
  END IF;
  INSERT INTO zapp.contact_notes (contact_id, author_id, content)
  VALUES (p_contact_id, v_profile_id, p_content) RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'contact_id', p_contact_id);
END;
$$;
GRANT EXECUTE ON FUNCTION zapp.add_contact_note(uuid, text, text, boolean) TO authenticated;

-- 1.3 bulk_add_tag (admin-only)
DROP FUNCTION IF EXISTS zapp.bulk_add_tag(uuid[], text);
CREATE FUNCTION zapp.bulk_add_tag(p_contact_ids uuid[], p_tag text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = zapp, public
AS $$
DECLARE v_tag_id uuid; v_added integer := 0;
BEGIN
  IF NOT zapp.is_admin_or_supervisor() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT id INTO v_tag_id FROM zapp.tags WHERE name = p_tag LIMIT 1;
  IF v_tag_id IS NULL THEN INSERT INTO zapp.tags (name) VALUES (p_tag) RETURNING id INTO v_tag_id; END IF;
  INSERT INTO zapp.contact_tags (contact_id, tag_id)
  SELECT cid, v_tag_id FROM unnest(p_contact_ids) AS cid WHERE NOT EXISTS (SELECT 1 FROM zapp.contact_tags ct WHERE ct.contact_id = cid AND ct.tag_id = v_tag_id);
  GET DIAGNOSTICS v_added = ROW_COUNT;
  RETURN jsonb_build_object('added', v_added, 'tag_id', v_tag_id);
END;
$$;
GRANT EXECUTE ON FUNCTION zapp.bulk_add_tag(uuid[], text) TO authenticated;

-- 1.4 find_duplicate_contacts (admin-only)
DROP FUNCTION IF EXISTS zapp.find_duplicate_contacts(text, integer);
CREATE FUNCTION zapp.find_duplicate_contacts(
  p_workspace_id text DEFAULT NULL::text, p_limit integer DEFAULT 100
) RETURNS TABLE(phone text, contact_ids uuid[], instance_names text[], total integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = zapp, evo, public
AS $$
BEGIN
  IF NOT zapp.is_admin_or_supervisor() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT ec.phone_number, array_agg(ec.id)::uuid[], array_agg(ec.instance_name)::text[], count(*)::integer
  FROM evo.evolution_contacts ec WHERE ec.phone_number IS NOT NULL AND ec.phone_number <> ''
    AND (p_workspace_id IS NULL OR ec.instance_name = p_workspace_id)
  GROUP BY ec.phone_number HAVING count(*) > 1 ORDER BY count(*) DESC LIMIT p_limit;
END;
$$;
GRANT EXECUTE ON FUNCTION zapp.find_duplicate_contacts(text, integer) TO authenticated;

-- 1.5 merge_contacts (admin-only stub)
DROP FUNCTION IF EXISTS zapp.merge_contacts(uuid, uuid, jsonb);
CREATE FUNCTION zapp.merge_contacts(
  p_primary_id uuid, p_secondary_id uuid, p_merged_fields jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = zapp, evo, public
AS $$
BEGIN
  IF NOT zapp.is_admin_or_supervisor() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RAISE EXCEPTION 'merge_contacts: implementacao pendente (etapa 30)' USING ERRCODE = '0A000';
END;
$$;
GRANT EXECUTE ON FUNCTION zapp.merge_contacts(uuid, uuid, jsonb) TO authenticated;

-- ============================================================
-- PARTE 2: 67 politicas endurecidas (2a rodada de validacao)
-- ============================================================

-- Credenciais / segredos (admin-only)
DROP POLICY IF EXISTS "auth_full_access" ON ai.hf_config;
CREATE POLICY auth_secure_146 ON ai.hf_config FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "auth_full_access" ON ai.mcp_servers;
CREATE POLICY auth_secure_147 ON ai.mcp_servers FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "auth_full_access" ON ai.tool_integrations;
CREATE POLICY auth_secure_148 ON ai.tool_integrations FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "auth_full_access" ON zapp.deploy_connections;
CREATE POLICY auth_secure_149 ON zapp.deploy_connections FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "service_role_all" ON zapp.n8n_variables;
CREATE POLICY auth_secure_150 ON zapp.n8n_variables FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "auth_access" ON zapp.alert_channels;
CREATE POLICY auth_secure_151 ON zapp.alert_channels FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "auth_full_access" ON zapp.notification_channels_config;
CREATE POLICY auth_secure_152 ON zapp.notification_channels_config FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "auth_rw" ON zapp.integration_profiles;
CREATE POLICY auth_secure_153 ON zapp.integration_profiles FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());

-- PII / financeiro (admin-only)
DROP POLICY IF EXISTS "auth_full_access" ON zapp.consent_records;
CREATE POLICY auth_secure_154 ON zapp.consent_records FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "auth_full_access" ON zapp.solicitacoes_vale;
CREATE POLICY auth_secure_155 ON zapp.solicitacoes_vale FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "auth_full_access" ON zapp.budgets;
CREATE POLICY auth_secure_156 ON zapp.budgets FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());

-- Agentes / estado / conteudo (admin-only)
DROP POLICY IF EXISTS "auth_agents_access" ON zapp.agents;
CREATE POLICY auth_secure_157 ON zapp.agents FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "auth_access" ON zapp.agent_memories;
CREATE POLICY auth_secure_158 ON zapp.agent_memories FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "auth_full_access" ON zapp.agent_traces;
CREATE POLICY auth_secure_159 ON zapp.agent_traces FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "auth_full_access" ON zapp.agent_usage;
CREATE POLICY auth_secure_160 ON zapp.agent_usage FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "auth_full_access" ON zapp.agent_versions;
CREATE POLICY auth_secure_161 ON zapp.agent_versions FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "auth_full_access" ON zapp.agent_permissions;
CREATE POLICY auth_secure_162 ON zapp.agent_permissions FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "auth_full_access" ON zapp.agent_templates;
CREATE POLICY auth_secure_163 ON zapp.agent_templates FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "auth_full_access" ON zapp.agent_installed_skills;
CREATE POLICY auth_secure_164 ON zapp.agent_installed_skills FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "auth_access" ON zapp.documents;
CREATE POLICY auth_secure_165 ON zapp.documents FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "auth_full_access" ON zapp.companies;
CREATE POLICY auth_secure_166 ON zapp.companies FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "auth_full_access" ON zapp.conversation_summaries;
CREATE POLICY auth_secure_167 ON zapp.conversation_summaries FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "auth_full_access" ON evo.evolution_campaigns;
CREATE POLICY auth_secure_168 ON evo.evolution_campaigns FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "auth_rw" ON zapp.outbox_events;
CREATE POLICY auth_secure_169 ON zapp.outbox_events FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "auth_rw" ON zapp.sticky_assignments;
CREATE POLICY auth_secure_170 ON zapp.sticky_assignments FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "auth_full_access" ON zapp.roles;
CREATE POLICY auth_secure_171 ON zapp.roles FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "auth_full_access" ON zapp.system_settings;
CREATE POLICY auth_secure_172 ON zapp.system_settings FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "auth_full_access" ON zapp.tenants;
CREATE POLICY auth_secure_173 ON zapp.tenants FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "auth_access" ON zapp.security_events;
CREATE POLICY auth_secure_174 ON zapp.security_events FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());

-- RBAC: permissions (leitura ampla mantida, escrita admin)
DROP POLICY IF EXISTS "auth_full_access" ON zapp.permissions;
CREATE POLICY auth_secure_175 ON zapp.permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_secure_176 ON zapp.permissions FOR ALL TO authenticated USING (zapp.is_admin_or_supervisor()) WITH CHECK (zapp.is_admin_or_supervisor());

-- Infra / admin (admin-only)
DROP POLICY IF EXISTS "outbound_update" ON zapp.outbound_message_queue;
DROP POLICY IF EXISTS "outbound_select" ON zapp.outbound_message_queue;
CREATE POLICY auth_secure_177 ON zapp.outbound_message_queue FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "qr_modify" ON zapp.queue_routing_rules;
DROP POLICY IF EXISTS "qr_select" ON zapp.queue_routing_rules;
CREATE POLICY auth_secure_178 ON zapp.queue_routing_rules FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "sla_pol_modify" ON zapp.sla_policies;
DROP POLICY IF EXISTS "sla_pol_select" ON zapp.sla_policies;
CREATE POLICY auth_secure_179 ON zapp.sla_policies FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "auth_rw" ON zapp.webhook_audit_log;
DROP POLICY IF EXISTS "authenticated can read webhook_audit_log" ON zapp.webhook_audit_log;
CREATE POLICY auth_secure_180 ON zapp.webhook_audit_log FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "auth_rw" ON zapp.webhook_event_dedup;
CREATE POLICY auth_secure_181 ON zapp.webhook_event_dedup FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "auth_rw" ON zapp.webhook_events_processed;
CREATE POLICY auth_secure_182 ON zapp.webhook_events_processed FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "auth_rw" ON zapp.webhook_rate_limits;
CREATE POLICY auth_secure_183 ON zapp.webhook_rate_limits FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "auth_rw" ON zapp.scheduled_job_log;
CREATE POLICY auth_secure_184 ON zapp.scheduled_job_log FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "auth_rw" ON zapp.reprocess_jobs;
CREATE POLICY auth_secure_185 ON zapp.reprocess_jobs FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "auth_rw" ON zapp.proxy_alerts;
CREATE POLICY auth_secure_186 ON zapp.proxy_alerts FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "auth_rw" ON zapp.proxy_metrics;
CREATE POLICY auth_secure_187 ON zapp.proxy_metrics FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "auth_rw" ON zapp.media_storage_config;
CREATE POLICY auth_secure_188 ON zapp.media_storage_config FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "auth_rw" ON zapp.contact_export_log;
CREATE POLICY auth_secure_189 ON zapp.contact_export_log FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "segments_auth_all" ON zapp.contact_segments;
CREATE POLICY auth_secure_190 ON zapp.contact_segments FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "auth_full_access" ON zapp.conversation_pins;
CREATE POLICY auth_secure_191 ON zapp.conversation_pins FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());

DROP POLICY IF EXISTS "auth_access" ON zapp.batch_jobs;
CREATE POLICY auth_secure_192 ON zapp.batch_jobs FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "auth_full_access" ON zapp.chunks;
CREATE POLICY auth_secure_193 ON zapp.chunks FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "auth_full_access" ON zapp.collections;
CREATE POLICY auth_secure_194 ON zapp.collections FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "auth_full_access" ON zapp.embedding_configs;
CREATE POLICY auth_secure_195 ON zapp.embedding_configs FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "auth_full_access" ON zapp.environments;
CREATE POLICY auth_secure_196 ON zapp.environments FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "extensions_auth_all" ON zapp.extensions;
CREATE POLICY auth_secure_197 ON zapp.extensions FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "auth_full_access" ON zapp.finetune_jobs;
CREATE POLICY auth_secure_198 ON zapp.finetune_jobs FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "auth_full_access" ON zapp.stress_test_runs;
CREATE POLICY auth_secure_199 ON zapp.stress_test_runs FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "auth_full_access" ON zapp.supabase_projects;
CREATE POLICY auth_secure_200 ON zapp.supabase_projects FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "auth_full_access" ON zapp.task_queues;
CREATE POLICY auth_secure_201 ON zapp.task_queues FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "auth_full_access" ON zapp.test_cases;
CREATE POLICY auth_secure_202 ON zapp.test_cases FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "auth_full_access" ON zapp.constraint_changelog;
CREATE POLICY auth_secure_203 ON zapp.constraint_changelog FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "auth_full_access" ON zapp.engineering_principles;
CREATE POLICY auth_secure_204 ON zapp.engineering_principles FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "auth_full_access" ON zapp.evaluation_datasets;
CREATE POLICY auth_secure_205 ON zapp.evaluation_datasets FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "auth_full_access" ON zapp.evaluation_runs;
CREATE POLICY auth_secure_206 ON zapp.evaluation_runs FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "auth_full_access" ON zapp.audit_log_tables;
CREATE POLICY auth_secure_207 ON zapp.audit_log_tables FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "auth_full_access" ON zapp.audit_results;
CREATE POLICY auth_secure_208 ON zapp.audit_results FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "auth_full_access" ON zapp.cron_schedules;
CREATE POLICY auth_secure_209 ON zapp.cron_schedules FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
DROP POLICY IF EXISTS "auth_full_access" ON zapp.cron_schedule_executions;
CREATE POLICY auth_secure_210 ON zapp.cron_schedule_executions FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());

-- Avatars: leitura/escrita propria + admin
DROP POLICY IF EXISTS "auth_full_access" ON zapp.avatars;
CREATE POLICY auth_secure_211 ON zapp.avatars FOR ALL TO authenticated
  USING (user_id = auth.uid() OR zapp.is_admin_or_supervisor())
  WITH CHECK (user_id = auth.uid() OR zapp.is_admin_or_supervisor());

-- Inbox custom scopes: leitura ampla mantida
DROP POLICY IF EXISTS "Custom scopes are viewable by everyone" ON zapp.inbox_custom_scopes;
CREATE POLICY auth_secure_212 ON zapp.inbox_custom_scopes FOR SELECT TO authenticated USING (true);

-- ============================================================
-- PARTE 3: Fixes avulsos
-- ============================================================

-- REVOKE de funcao sem uso (dispatch_error_stats — coluna acao corrompida no CSV)
REVOKE EXECUTE ON FUNCTION zapp.rpc_dispatch_error_stats(p_hours integer) FROM authenticated;

-- profiles: DELETE table-level revogado (nunca deveria existir para authenticated)
REVOKE DELETE ON zapp.profiles FROM authenticated;
