-- ============================================================================
-- REPLAY CONVERGENTE — materializado retroativamente em 2026-08-16 a partir de
-- supabase_migrations.schema_migrations (version=20260815250017), sem arquivo
-- correspondente neste repo. Ver convencao completa em 20260815250008_*.sql.
--
-- Fonte: docs/decouple/LOTE5_LOG.md, secao "Move normalize_jid — hot path".
-- Corpos: pg_get_functiondef em producao 2026-08-15 pos-Lote5. Triggers:
-- pg_get_triggerdef em producao (confirmam a fn atual ja vinculada).
--
-- Contexto: fn_normalize_remote_jid / fn_normalize_conversation_jid sao
-- SECURITY DEFINER owner postgres — as views invoker E78 resolvem com
-- privilegios do owner, entao mover a fn para zapp sem trocar a view de
-- leitura (public.evo_contact_identity / public.evo_lid_phone_map) e seguro
-- (risco de ACL temido no Lote 4 nao existe nesse arranjo).
-- Validacao original: particoes staging efemeras + seeds fake + switch
-- transacional dos triggers (DROP+CREATE sem janela) + canario real na wpp2,
-- tudo em uma unica transacao com rollback dos artefatos de teste — nao e
-- DDL persistente, nao reproduzido aqui (ver LOTE5_LOG.md para o roteiro).
-- ============================================================================

CREATE OR REPLACE FUNCTION zapp.fn_normalize_remote_jid()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_catalog'
AS $function$
  DECLARE v_phone text; v_lid_local text;
  BEGIN
    IF TG_OP = 'INSERT' AND NEW.remote_jid IS NOT NULL AND NEW.remote_jid_original IS NULL THEN
      NEW.remote_jid_original := NEW.remote_jid;
    END IF;
    IF NEW.remote_jid IS NOT NULL AND NEW.remote_jid LIKE '%:%@%' THEN
      NEW.remote_jid := regexp_replace(lower(NEW.remote_jid), ':([0-9]+)@', '@', 'g');
    END IF;
    IF NEW.remote_jid IS NULL OR NEW.remote_jid = '' THEN
      IF NEW.status = 'deleted' OR NEW.content = '[Mensagem apagada]' THEN
        NEW.remote_jid := 'unknown@deleted';
      ELSIF NEW.message_id LIKE 'smoke-%' OR NEW.message_id LIKE 'test-%'
         OR NEW.message_id LIKE 'pg-cron-canary-%' OR NEW.message_id LIKE 'sentinel-%' THEN
        NEW.remote_jid := 'smoke-test@localhost';
      ELSE
        NEW.remote_jid := 'unknown@s.whatsapp.net';
      END IF;
      RETURN NEW;
    END IF;
    IF NEW.remote_jid LIKE '%@lid' THEN
      v_lid_local := split_part(lower(NEW.remote_jid), '@', 1);
      SELECT lpm.phone_number INTO v_phone
      FROM public.evo_lid_phone_map lpm
      WHERE lower(lpm.lid_jid) = lower(NEW.remote_jid)
        AND lpm.instance_name = COALESCE(NEW.instance_name, 'wpp2')
        AND lpm.phone_number IS NOT NULL
        AND lpm.confidence NOT IN ('none', 'bootstrap_invalid')
        AND lpm.phone_number <> v_lid_local
      LIMIT 1;
      IF v_phone IS NULL THEN
        SELECT ci.phone_number INTO v_phone
        FROM public.evo_contact_identity ci
        WHERE ci.lid_jid = lower(NEW.remote_jid)
          AND ci.instance_name = COALESCE(NEW.instance_name, 'wpp2')
          AND ci.phone_number IS NOT NULL
          AND ci.phone_number <> v_lid_local
          AND length(ci.phone_number) <= 13
        LIMIT 1;
      END IF;
      IF v_phone IS NULL THEN
        SELECT ec.phone_number INTO v_phone
        FROM zapp.evolution_contacts ec
        WHERE lower(ec.remote_jid) = lower(NEW.remote_jid)
          AND ec.phone_number ~ '^[0-9]+$'
          AND length(ec.phone_number) <= 13
          AND ec.phone_number <> v_lid_local
          AND ec.deleted_at IS NULL
        LIMIT 1;
      END IF;
      IF v_phone IS NOT NULL THEN
        NEW.remote_jid := v_phone || '@s.whatsapp.net';
      END IF;
      RETURN NEW;
    END IF;
    RETURN NEW;
  END $function$;

CREATE OR REPLACE FUNCTION zapp.fn_normalize_conversation_jid()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_catalog'
AS $function$
  DECLARE v_phone text; v_lid_local text;
  BEGIN
    NEW.remote_jid := regexp_replace(lower(NEW.remote_jid), ':([0-9]+)@', '@', 'g');
    IF lower(NEW.remote_jid) ~ '^[0-9]+@lid$' THEN
      v_lid_local := split_part(lower(NEW.remote_jid), '@', 1);
      SELECT ci.phone_number INTO v_phone
      FROM public.evo_contact_identity ci
      WHERE ci.lid_jid = lower(NEW.remote_jid)
        AND ci.instance_name = COALESCE(NEW.instance_name, 'wpp2')
        AND ci.phone_number IS NOT NULL
        AND ci.phone_number <> v_lid_local
        AND length(ci.phone_number) <= 13
      LIMIT 1;
      IF v_phone IS NULL THEN
        SELECT ec.phone_number INTO v_phone
        FROM zapp.evolution_contacts ec
        WHERE lower(ec.remote_jid) = lower(NEW.remote_jid)
          AND ec.phone_number ~ '^[0-9]+$'
          AND length(ec.phone_number) <= 13
          AND ec.phone_number <> v_lid_local
          AND ec.deleted_at IS NULL
        ORDER BY ec.updated_at DESC
        LIMIT 1;
      END IF;
      IF v_phone IS NOT NULL THEN
        NEW.remote_jid := v_phone || '@s.whatsapp.net';
      END IF;
    END IF;
    RETURN NEW;
  END $function$;

-- Switch transacional dos triggers na wpp2 (DROP + CREATE, sem janela — no
-- mesmo passo a fn evo antiga e a fn zapp nova coexistem no catalogo ate o
-- DROP FUNCTION final abaixo).

DROP TRIGGER IF EXISTS trg_normalize_remote_jid ON zapp.evolution_messages_wpp2;
CREATE TRIGGER trg_normalize_remote_jid
  BEFORE INSERT OR UPDATE ON zapp.evolution_messages_wpp2
  FOR EACH ROW EXECUTE FUNCTION zapp.fn_normalize_remote_jid();

DROP TRIGGER IF EXISTS trg_normalize_conversation_jid ON zapp.evolution_conversations_wpp2;
CREATE TRIGGER trg_normalize_conversation_jid
  BEFORE INSERT ON zapp.evolution_conversations_wpp2
  FOR EACH ROW EXECUTE FUNCTION zapp.fn_normalize_conversation_jid();

-- Drop das fns evo.* antigas (LOTE5_LOG.md: "drop das fns evo + canario real
-- na wpp2 ... Mensagens fluindo pos-switch"). Mesmas assinaturas (trigger-fn,
-- sem args) das novas em zapp.
DROP FUNCTION IF EXISTS evo.fn_normalize_remote_jid();
DROP FUNCTION IF EXISTS evo.fn_normalize_conversation_jid();
