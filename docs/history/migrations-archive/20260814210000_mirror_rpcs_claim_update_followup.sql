-- =============================================================================
-- MIRROR DB→REPO (2026-08-14) — RPCs que existiam apenas no banco (DB-as-source)
--
-- Alinha o repo com o banco de produção: estas 5 RPCs foram criadas/alteradas
-- diretamente no self-hosted (fluxo DB-as-source) e não tinham CREATE versionado.
-- Detectadas na validação exaustiva V3/V6 (2026-08-14): risco PGRST202 para quem
-- confiar só no repo; agora o repo é o espelho canônico.
--
-- Corpos copiados via pg_get_functiondef do banco de produção em 2026-08-14.
-- IDEMPOTENTE: CREATE OR REPLACE — pode rodar quantas vezes.
-- =============================================================================

CREATE OR REPLACE FUNCTION zapp.rpc_claim_outbound_message(p_row_id uuid, p_message_id text, p_status text DEFAULT 'sent'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'public', 'pg_catalog'
AS $function$ DECLARE v_id uuid; BEGIN UPDATE zapp.evolution_messages SET status=p_status, message_id=p_message_id, status_at=now(), updated_at=now() WHERE id=p_row_id AND message_id IS NULL RETURNING id INTO v_id; RETURN jsonb_build_object('ok',true,'claimed_id',v_id,'claimed', v_id IS NOT NULL); EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok',false,'error',SQLERRM); END; $function$

CREATE OR REPLACE FUNCTION zapp.rpc_delete_followup_sequence(p_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'public', 'pg_catalog'
AS $function$ DECLARE v_count int; v_id uuid := p_id::uuid; BEGIN DELETE FROM zapp.evolution_followup_rules WHERE sequence_group=v_id OR (sequence_group IS NULL AND id=v_id); GET DIAGNOSTICS v_count = ROW_COUNT; RETURN jsonb_build_object('ok',true,'deleted',v_count); EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok',false,'error',SQLERRM); END; $function$

CREATE OR REPLACE FUNCTION zapp.rpc_insert_followup_sequence(p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'public', 'pg_catalog'
AS $function$ DECLARE v_count int; BEGIN INSERT INTO zapp.evolution_followup_rules (name, description, trigger_type, trigger_config, template_id, delay_hours, conditions, sequence_order, sequence_group, is_active) SELECT (r->>'name')::text, (r->>'description')::text, (r->>'trigger_type')::text, (r->>'trigger_config')::jsonb, (r->>'template_id')::uuid, (r->>'delay_hours')::integer, (r->>'conditions')::jsonb, (r->>'sequence_order')::integer, (r->>'sequence_group')::uuid, coalesce((r->>'is_active')::boolean, true) FROM jsonb_array_elements(p_rows) r; GET DIAGNOSTICS v_count = ROW_COUNT; RETURN jsonb_build_object('ok',true,'inserted',v_count); EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok',false,'error',SQLERRM); END; $function$

CREATE OR REPLACE FUNCTION zapp.rpc_toggle_followup_sequence(p_id text, p_is_active boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'public', 'pg_catalog'
AS $function$ DECLARE v_count int; v_id uuid := p_id::uuid; BEGIN UPDATE zapp.evolution_followup_rules SET is_active=p_is_active, updated_at=now() WHERE sequence_group=v_id OR (sequence_group IS NULL AND id=v_id); GET DIAGNOSTICS v_count = ROW_COUNT; RETURN jsonb_build_object('ok',true,'updated',v_count); EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok',false,'error',SQLERRM); END; $function$

CREATE OR REPLACE FUNCTION zapp.rpc_update_incoming_message(p_row_id uuid, p_contact_id uuid, p_content text, p_message_type text, p_media_url text DEFAULT NULL::text, p_media_bucket text DEFAULT NULL::text, p_media_path text DEFAULT NULL::text, p_media_status text DEFAULT NULL::text, p_from_me boolean DEFAULT false, p_direction text DEFAULT 'inbound'::text, p_status text DEFAULT 'received'::text, p_ingest_meta jsonb DEFAULT NULL::jsonb, p_quoted_message_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'public', 'pg_catalog'
AS $function$ BEGIN UPDATE zapp.evolution_messages SET contact_id=p_contact_id, content=p_content, message_type=p_message_type, media_url=p_media_url, media_bucket=p_media_bucket, media_path=p_media_path, media_status=p_media_status, from_me=p_from_me, direction=p_direction, status=CASE WHEN status IS NOT NULL AND status<>'received' THEN status ELSE p_status END, ingest_meta=coalesce(p_ingest_meta, ingest_meta), media_meta=coalesce(p_ingest_meta, media_meta), quoted_message_id=coalesce(p_quoted_message_id, quoted_message_id), updated_at=now() WHERE id=p_row_id; RETURN jsonb_build_object('ok',true); EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok',false,'error',SQLERRM); END; $function$

