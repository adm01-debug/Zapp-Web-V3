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
--
-- ACHADO (review CodeRabbit, PR #1354, não corrigido aqui de propósito):
-- a chamada net.http_post abaixo manda só Content-Type — sem Authorization.
-- supabase/functions/sicoob-bridge-reply/index.ts exige OU um JWT de usuário
-- OU um bearer que bata com SUPABASE_SERVICE_ROLE_KEY (modo "internal caller
-- — Postgres trigger", comentário no próprio handler). Sem esse header, TODA
-- chamada desta trigger recebe 401 do handler — engolido pelo EXCEPTION WHEN
-- OTHERS silencioso logo abaixo, então o INSERT de mensagem nunca falha e
-- ninguém percebe. Ou seja: como está, esta integração (notificar Sicoob
-- Gifts quando o agente responde) está provavelmente NO-OP em produção desde
-- que este padrão de auth foi introduzido no handler. `vault.secrets` tem
-- `supabase_service_role_key` (confirmado ao vivo) — candidato óbvio pra
-- `Authorization: Bearer <valor>` no header do PERFORM. NÃO apliquei esse
-- fix aqui: essa migration materializa o texto EXATO do catálogo vivo (o
-- objetivo é fechar o drift arquivo↔DB, não mudar comportamento de uma
-- integração de cliente real sem sign-off do dono). Documentado como achado
-- separado no corpo do PR — decisão de correção fica para o dono.
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

-- Hardening (review CodeRabbit, PR #1354): função nova ganha EXECUTE p/ PUBLIC
-- por padrão; CREATE OR REPLACE preserva grants explícitos já existentes (ao
-- vivo: authenticated também tem EXECUTE — confirmado via pg_proc.proacl,
-- 2026-08-21). Na prática authenticated executar isto diretamente é inócuo —
-- Postgres recusa invocar função RETURNS trigger fora de contexto de trigger
-- — mas é SECURITY DEFINER + acessa vault + abre conexão de rede, então
-- reduzir a superfície é a postura certa mesmo sem exploit conhecido.
REVOKE ALL ON FUNCTION zapp.fn_notify_sicoob_on_reply() FROM PUBLIC, anon, authenticated;
