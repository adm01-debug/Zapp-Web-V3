-- =============================================================================
-- Materializa zapp.fn_notify_sicoob_on_reply no repositório (plano-100, 2026-08-21)
-- — mesma classe de drift das migrations 20260821001500/20260821003000/
-- 20260807200000 desta sessão: DDL aplicada via MCP, nunca versionada.
--
-- CONTEXTO: src/__tests__/sprint1-security-hardening.test.ts (describe HIGH-3)
-- falhava com `def === ''` — a definição só existia em
-- docs/history/migrations-archive/20260815200008_decouple_i4_sicoob.sql
-- (arquivo histórico, fora de supabase/migrations/, não lido pelo helper
-- allMigrationsSql() do teste, cujo ARCHIVE_DIR aponta para
-- supabase/migrations/archive/ — path que não existe mais neste repo).
--
-- Optei por materializar (em vez de redirecionar ARCHIVE_DIR do teste) para
-- não arriscar trocar qual definição "vence" em latestDefinition() para OUTRAS
-- funções do mesmo describe (ex.: rpc_migrate_whatsapp_integration também
-- aparece em docs/history/migrations-archive/20260808110001_rpc_guards_wave.sql,
-- datado após o squash canônico — mesmo bug sistêmico da nota 7 do PR, não
-- auditado aqui).
--
-- Texto abaixo é EXATO ao catálogo vivo (pg_get_functiondef, 2026-08-21):
-- trigger function em zapp.messages (envia webhook ao Sicoob Bridge quando
-- a conversa está com lead_status='sicoob_gifts'). SECURITY DEFINER com
-- search_path fixo; EXCEPTION WHEN OTHERS silencioso (nunca aborta o INSERT
-- da mensagem); usa net.http_post (pg_net), não extensions.http_post.
--
-- ROLLBACK: DROP FUNCTION IF EXISTS zapp.fn_notify_sicoob_on_reply();
--   (não recomendado — é o trigger que despacha as respostas ao Sicoob Bridge;
--    dropar sem remover o trigger correspondente em zapp.messages quebra o
--    INSERT de mensagens, já que a função também está referenciada por trigger).
-- =============================================================================

CREATE OR REPLACE FUNCTION zapp.fn_notify_sicoob_on_reply()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_catalog'
AS $function$
DECLARE v_lead_status text; v_edge_url text;
BEGIN
  BEGIN
    v_edge_url := COALESCE(ops.fn_get_vault_secret('sicoob_bridge_edge_url'), 'http://functions:9000');
    SELECT lead_status INTO v_lead_status FROM zapp.evolution_contacts WHERE id = NEW.contact_id;
    IF v_lead_status = 'sicoob_gifts' THEN
      PERFORM net.http_post(
        url := v_edge_url || '/sicoob-bridge-reply',
        body := jsonb_build_object('contact_id', NEW.contact_id, 'content', NEW.content, 'message_id', NEW.id, 'created_at', NEW.created_at),
        headers := jsonb_build_object('Content-Type','application/json'));
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END $function$;
