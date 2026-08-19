-- ESPELHO repo×DB — migration aplicada via MCP (supabase_apply_migration) na auditoria Hermes 2026-08-06/07.
-- Registro em supabase_migrations.schema_migrations; este arquivo é o registro histórico (DB-as-source).
DO $$
DECLARE
  r record; def text; newdef text; res text;
  v_open integer; v_close integer; v_begin integer; v_tail text;
  nl text := chr(10);
  v_guard text := chr(10) || '  PERFORM zapp.fn_require_app_user();' || chr(10);
BEGIN
  FOR r IN SELECT p.oid, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'zapp' AND p.proname IN (
      'rpc_backfill_messages_contact_id','rpc_bulk_repair_dedup_hashes','rpc_change_deal_stage',
      'rpc_complete_media_download','rpc_contact_media_stats','rpc_contact_stats',
      'rpc_count_contact_media','rpc_dashboard_home','rpc_dashboard_init',
      'rpc_find_contact_by_phone','rpc_get_contact','rpc_get_conversation_media',
      'rpc_get_media_public_url','rpc_get_media_url','rpc_get_message_details',
      'rpc_get_metrics_dashboard','rpc_get_pipeline','rpc_inbox_preview_batch',
      'rpc_instance_stats','rpc_list_audit_log','rpc_list_calls',
      'rpc_list_contact_links','rpc_list_contact_media','rpc_list_contacts',
      'rpc_list_conversations','rpc_list_deals','rpc_list_media',
      'rpc_list_messages_all','rpc_mark_messages_as_read','rpc_media_dashboard',
      'rpc_message_stats','rpc_move_deal','rpc_resolve_instance_by_phone',
      'rpc_resolve_whatsapp_instance','rpc_schedule_follow_up','rpc_search_media',
      'rpc_search_messages','rpc_send_sticker','rpc_system_health',
      'rpc_toggle_message_important','rpc_toggle_message_star','rpc_unified_search',
      'rpc_upsert_contact','rpc_upsert_deal','rpc_zapp_dashboard',
      'rpc_zapp_health_check','rpc_get_contact_summary_batch')
  LOOP
    BEGIN
      def := pg_get_functiondef(r.oid);
      IF def LIKE '%fn_require_app_user%' THEN CONTINUE; END IF;
      res := pg_get_function_result(r.oid);
      v_open := position('$function$' in def);
      IF def LIKE '%LANGUAGE plpgsql%' THEN
        v_begin := v_open + 11 + position(nl || 'BEGIN' in substr(def, v_open + 11));
        IF position(nl || 'BEGIN' in substr(def, v_open + 11)) = 0 THEN
          v_begin := v_open + 11 + position('BEGIN' in substr(def, v_open + 11)) - 1;
        END IF;
        newdef := left(def, v_begin + 4) || v_guard || substr(def, v_begin + 5);
      ELSIF def LIKE '%LANGUAGE sql%' THEN
        newdef := replace(def, 'LANGUAGE sql', 'LANGUAGE plpgsql');
        v_open := position('$function$' in newdef);
        v_close := position('$function$' in substr(newdef, v_open + 11)) + v_open + 10;
        IF res LIKE 'SETOF%' OR res LIKE 'TABLE%' THEN
          newdef := left(newdef, v_close - 1) || nl || 'END;' || substr(newdef, v_close);
          newdef := left(newdef, v_open + 10) || nl || 'BEGIN' || v_guard || 'RETURN QUERY ' || substr(newdef, v_open + 11);
        ELSIF res = 'void' THEN
          newdef := left(newdef, v_close - 1) || nl || 'END;' || substr(newdef, v_close);
          newdef := left(newdef, v_open + 10) || nl || 'BEGIN' || v_guard || substr(newdef, v_open + 11);
        ELSE
          v_tail := rtrim(substr(newdef, 1, v_close - 1), ' ' || chr(9) || chr(10));
          IF length(v_tail) > 0 AND substr(v_tail, length(v_tail), 1) = ';' THEN
            v_tail := substr(v_tail, 1, length(v_tail) - 1);
          END IF;
          newdef := v_tail || ');' || nl || 'END;' || substr(newdef, v_close);
          newdef := left(newdef, v_open + 10) || nl || 'BEGIN' || v_guard || 'RETURN (' || substr(newdef, v_open + 11);
        END IF;
      END IF;
      EXECUTE newdef;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'guard FAIL %: %', r.proname, SQLERRM;
      RAISE;
    END;
  END LOOP;
END;
$$;
