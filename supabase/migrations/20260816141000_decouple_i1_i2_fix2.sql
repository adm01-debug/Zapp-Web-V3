-- decouple FIX-2: zerar I1/I2 restantes (pós aplicação da migration 20260816140000)
-- 2026-08-16 | Rota A | cirúrgico
--   a) evo.fn_backfill_contact_id: reescrever SEM comentário citando zapp.* e search_path SEM zapp
--   b) zapp.fn_repontar_filhas_graveyard: leitura do graveyard via RPC de contrato evo.rpc_boundary_*
--      (o gate I2 exclui evo.rpc_boundary_* por allowlist)

-- ============================================================
-- PASSO A: evo.fn_backfill_contact_id limpa (sem zapp no path, sem comentário)
-- ============================================================
CREATE OR REPLACE FUNCTION evo.fn_backfill_contact_id(p_batch integer DEFAULT 20000)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo', 'pg_catalog'
AS $function$
DECLARE v_n int;
BEGIN
  -- Backfill de contact_id em mensagens órfãs (dado físico em evo — Rota A).
  -- Acessa a tabela física (não a bridge view) para usar ctid + FOR UPDATE.
  UPDATE evo.evolution_messages_wpp2 m
  SET contact_id = sub.contact_id
  FROM (
    SELECT m2.ctid AS locked_ctid, ec2.id AS contact_id
    FROM evo.evolution_messages_wpp2 m2
    JOIN evo.evolution_contacts ec2
      ON ec2.remote_jid    = m2.remote_jid
     AND ec2.instance_name = m2.instance_name
    WHERE m2.contact_id IS NULL
    LIMIT p_batch
    FOR UPDATE OF m2 SKIP LOCKED
  ) sub
  WHERE m.ctid = sub.locked_ctid;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$;

-- ============================================================
-- PASSO B: RPCs de contrato do graveyard (schema evo, allowlist I2)
-- ============================================================
CREATE OR REPLACE FUNCTION evo.rpc_boundary_graveyard_pairs()
 RETURNS TABLE(deleted_contact_id uuid, merged_into_contact_id uuid, deleted_at timestamptz)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'evo', 'pg_catalog'
AS $function$
  SELECT g.deleted_contact_id, g.merged_into_contact_id, g.deleted_at
  FROM evo.contact_id_graveyard g
  WHERE g.merged_into_contact_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM evo.evolution_contacts c WHERE c.id = g.merged_into_contact_id)
  ORDER BY g.deleted_at, g.deleted_contact_id;
$function$;

CREATE OR REPLACE FUNCTION evo.rpc_boundary_graveyard_pending_count()
 RETURNS bigint
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'evo', 'pg_catalog'
AS $function$
  SELECT count(*) FROM evo.contact_id_graveyard g
  WHERE g.merged_into_contact_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM evo.evolution_contacts c WHERE c.id = g.merged_into_contact_id);
$function$;

-- ============================================================
-- PASSO C: zapp.fn_repontar_filhas_graveyard via RPCs de contrato
-- ============================================================
CREATE OR REPLACE FUNCTION zapp.fn_repontar_filhas_graveyard(p_dry_run boolean DEFAULT true)
 RETURNS TABLE(tabela text, linhas_afetadas bigint)
 LANGUAGE plpgsql
 SET search_path TO 'zapp', 'public', 'pg_catalog'
AS $function$
DECLARE
  v_g record; v_pares int := 0; v_pulados int := 0; v_n bigint;
  v_msgs bigint := 0; v_conv bigint := 0; v_notif bigint := 0; v_status bigint := 0; v_events bigint := 0;
BEGIN
  IF p_dry_run THEN RAISE NOTICE 'fn_repontar_filhas_graveyard: DRY RUN';
  ELSE RAISE NOTICE 'fn_repontar_filhas_graveyard: MODO REAL'; END IF;
  FOR v_g IN SELECT * FROM evo.rpc_boundary_graveyard_pairs()
  LOOP
    v_pares := v_pares + 1;
    IF p_dry_run THEN SELECT count(*) INTO v_n FROM zapp.evolution_messages WHERE contact_id=v_g.deleted_contact_id;
    ELSE UPDATE zapp.evolution_messages SET contact_id=v_g.merged_into_contact_id WHERE contact_id=v_g.deleted_contact_id; GET DIAGNOSTICS v_n = ROW_COUNT; END IF;
    v_msgs := v_msgs + v_n;
    IF p_dry_run THEN SELECT count(*) INTO v_n FROM zapp.evolution_conversations WHERE contact_id=v_g.deleted_contact_id;
    ELSE UPDATE zapp.evolution_conversations SET contact_id=v_g.merged_into_contact_id WHERE contact_id=v_g.deleted_contact_id; GET DIAGNOSTICS v_n = ROW_COUNT; END IF;
    v_conv := v_conv + v_n;
    IF p_dry_run THEN SELECT count(*) INTO v_n FROM zapp.evolution_notifications WHERE contact_id=v_g.deleted_contact_id;
    ELSE UPDATE zapp.evolution_notifications SET contact_id=v_g.merged_into_contact_id WHERE contact_id=v_g.deleted_contact_id; GET DIAGNOSTICS v_n = ROW_COUNT; END IF;
    v_notif := v_notif + v_n;
    IF p_dry_run THEN SELECT count(*) INTO v_n FROM zapp.evolution_whatsapp_status WHERE contact_id=v_g.deleted_contact_id;
    ELSE UPDATE zapp.evolution_whatsapp_status SET contact_id=v_g.merged_into_contact_id WHERE contact_id=v_g.deleted_contact_id; GET DIAGNOSTICS v_n = ROW_COUNT; END IF;
    v_status := v_status + v_n;
    IF p_dry_run THEN SELECT count(*) INTO v_n FROM zapp.conversation_events WHERE contact_id=v_g.deleted_contact_id;
    ELSE UPDATE zapp.conversation_events SET contact_id=v_g.merged_into_contact_id WHERE contact_id=v_g.deleted_contact_id; GET DIAGNOSTICS v_n = ROW_COUNT; END IF;
    v_events := v_events + v_n;
  END LOOP;
  SELECT evo.rpc_boundary_graveyard_pending_count() INTO v_pulados;
  IF v_pulados > 0 THEN RAISE NOTICE '  pares PULADOS: %', v_pulados; END IF;
  tabela := 'zapp.evolution_messages';       linhas_afetadas := v_msgs;   RETURN NEXT;
  tabela := 'zapp.evolution_conversations';  linhas_afetadas := v_conv;   RETURN NEXT;
  tabela := 'zapp.evolution_notifications'; linhas_afetadas := v_notif;  RETURN NEXT;
  tabela := 'zapp.evolution_whatsapp_status'; linhas_afetadas := v_status; RETURN NEXT;
  tabela := 'zapp.conversation_events';     linhas_afetadas := v_events; RETURN NEXT;
END; $function$;
