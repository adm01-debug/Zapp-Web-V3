-- 20260820180000 — f011_drop_evo_fn_filter_canary_messages — REGISTRO RETROATIVO, NAO REAPLICAR (F-011/I2)
-- =============================================================================
-- Ultimo residuo do invariante I2 do desacoplamento (funcao em evo referenciando
-- zapp.* fora do padrao rpc_boundary_*): evo.fn_filter_canary_messages.
-- ACAO (2026-08-20, plano 100 etapas etapa 92): funcao movida de evo para zapp
-- (quem escreve em zapp.evolution_audit_log deve viver em zapp), triggers das 3
-- relacoes de mensagens reapontados, e a versao evo dropada.
-- VALIDACAO: query I2 (prosrc ILIKE '%zapp.%' em evo, excluindo rpc_boundary) = 0 linhas.
--
-- Rollback: recriar a funcao em evo com o mesmo corpo + reapontar os triggers.

CREATE OR REPLACE FUNCTION zapp.fn_filter_canary_messages()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'pg_catalog'
AS $function$
BEGIN
  -- [ORIGINAL] Padrão exato: "wd-canary " seguido de 1+ dígitos (epoch unix do watchdog-canary v1)
  IF NEW.content ~ '^wd-canary [0-9]+$' THEN
    BEGIN
      INSERT INTO zapp.evolution_audit_log (
        action, entity_type, entity_id, new_values, metadata, performed_by, created_at
      ) VALUES (
        'canary_filtered', 'evolution_messages_wpp2', gen_random_uuid(),
        jsonb_build_object('message_id', NEW.message_id, 'content', NEW.content,
                           'from_me', NEW.from_me, 'remote_jid', NEW.remote_jid),
        jsonb_build_object('filtered_at', now(), 'push_name', NEW.push_name),
        'watchdog-canary', now()
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RETURN NULL;
  END IF;

  -- [100PLAN A4] pg-cron canary: @localhost JID = mensagem sintética de health check
  -- Redireciona para evo.pipeline_canary_log em vez de contaminar evolution_messages_wpp2
  IF NEW.remote_jid LIKE '%@localhost' THEN
    BEGIN
      INSERT INTO evo.pipeline_canary_log (message_id, remote_jid, content, created_at)
      VALUES (
        COALESCE(NEW.message_id, 'unknown-' || extract(epoch from now())::text),
        NEW.remote_jid,
        left(COALESCE(NEW.content, ''), 500),
        COALESCE(NEW.created_at, now())
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RETURN NULL;  -- bloqueia INSERT na tabela de produção
  END IF;

  RETURN NEW;
END;
$function$;

-- Reapontar os triggers (raiz particionada + partic. quentes) e remover a versao evo
DROP TRIGGER IF EXISTS trg_filter_canary_messages ON evo.evolution_messages;
CREATE TRIGGER trg_filter_canary_messages BEFORE INSERT ON evo.evolution_messages
  FOR EACH ROW EXECUTE FUNCTION zapp.fn_filter_canary_messages();

DROP TRIGGER IF EXISTS trg_filter_canary_messages ON evo.evolution_messages_wpp2;
CREATE TRIGGER trg_filter_canary_messages BEFORE INSERT ON evo.evolution_messages_wpp2
  FOR EACH ROW EXECUTE FUNCTION zapp.fn_filter_canary_messages();

DROP TRIGGER IF EXISTS trg_filter_canary_messages ON evo.evolution_messages_default;
CREATE TRIGGER trg_filter_canary_messages BEFORE INSERT ON evo.evolution_messages_default
  FOR EACH ROW EXECUTE FUNCTION zapp.fn_filter_canary_messages();

DROP FUNCTION IF EXISTS evo.fn_filter_canary_messages();
