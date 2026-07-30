-- Migration: Fix #75 + #76 — encontrados em validação exaustiva rodada 3
-- Data: 2026-07-09

-- ══════════════════════════════════════════════════════════════════
-- FIX #75: messages_update_trigger + messages_instead_of_delete
-- Problema: UPDATE evo.evolution_messages WHERE id=OLD.id escaneia TODAS
-- as 23 partições (particionamento é por LIST(instance_name)).
-- Solução: adicionar AND instance_name=OLD.instance_name ao WHERE.
-- Resultado: 23 → 1 partição por trigger call (30x mais rápido).
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.messages_update_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'evo'
AS $function$
BEGIN
  UPDATE evo.evolution_messages
  SET
    is_read     = COALESCE(NEW.is_read, OLD.is_read),
    status      = CASE WHEN NEW.status IS DISTINCT FROM OLD.status THEN NEW.status ELSE status END,
    status_at   = CASE WHEN NEW.status IS DISTINCT FROM OLD.status THEN COALESCE(NEW.status_updated_at::timestamptz, now()) ELSE status_at END,
    content     = CASE WHEN NEW.content IS DISTINCT FROM OLD.content THEN NEW.content ELSE content END,
    deleted_at  = CASE
                    WHEN NEW.is_deleted = true AND (OLD.is_deleted IS NULL OR OLD.is_deleted = false) THEN COALESCE(NEW.whatsapp_timestamp, now())
                    WHEN NEW.is_deleted = false THEN NULL
                    ELSE deleted_at
                  END,
    updated_at  = now()
  WHERE id = OLD.id
    AND instance_name = OLD.instance_name;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.messages_instead_of_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'evo'
AS $function$
BEGIN
  UPDATE evo.evolution_messages
  SET deleted_at = now(), updated_at = now()
  WHERE id = OLD.id
    AND instance_name = OLD.instance_name;
  RETURN OLD;
END;
$function$;

-- ══════════════════════════════════════════════════════════════════
-- FIX #76: system_connections UNIQUE(name, provider)
-- Sem UNIQUE, saveCredentials() concorrentes inserem duplicatas.
-- ══════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.system_connections'::regclass
      AND conname = 'system_connections_name_provider_unique'
  ) THEN
    ALTER TABLE public.system_connections
      ADD CONSTRAINT system_connections_name_provider_unique UNIQUE (name, provider);
  END IF;
END $$;
