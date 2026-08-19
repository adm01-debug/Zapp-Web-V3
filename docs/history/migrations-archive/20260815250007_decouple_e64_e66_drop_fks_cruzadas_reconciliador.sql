-- E64-E66 (PLANO_INDEPENDENCIA_100_ETAPAS_20260815): elimina as 6 FKs cruzadas
-- evo -> zapp (I3). Na pratica sao 2 constraints reais; as outras 4 sao filhas
-- por particao (conparentid) e caem junto.
-- E64: evo.fn_reconcile_media_fk_orphans() substitui o ON DELETE CASCADE -
--      deleta mdq orfa (mensagem-mae sumiu) e conta mlr orfa (auditoria, FK era
--      NO ACTION e nunca deletou). Agendada no pg_cron a cada 15 min
--      (jobname evo-reconcile-media-fk-orphans). Baseline pre-drop: 0/0.
-- E66: prova de erasure - orfa sintetica inserida apos o drop foi deletada
--      pelo job (residuo 0). O erasure LGPD segue funcional com atraso <= 15min.
-- JA APLICADA em producao. I3: 6 -> 0.
--
-- ROLLBACK (recria as FKs originais; exige zero orfaos antes):
--   ALTER TABLE evo.media_download_queue ADD CONSTRAINT fk_mdq_message
--     FOREIGN KEY (message_id, instance_name)
--     REFERENCES zapp.evolution_messages(message_id, instance_name) ON DELETE CASCADE;
--   ALTER TABLE evo.media_loss_registry ADD CONSTRAINT fk_mlr_message_uuid_instance
--     FOREIGN KEY (message_uuid, instance_name)
--     REFERENCES zapp.evolution_messages(id, instance_name);
--   SELECT cron.unschedule('evo-reconcile-media-fk-orphans');
--   DROP FUNCTION evo.fn_reconcile_media_fk_orphans();

CREATE OR REPLACE FUNCTION evo.fn_reconcile_media_fk_orphans()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = evo, pg_catalog, pg_temp
AS $$
DECLARE
  v_mdq_deleted int;
  v_mlr_orphans int;
BEGIN
  DELETE FROM evo.media_download_queue q
  WHERE NOT EXISTS (
    SELECT 1 FROM zapp.evolution_messages m
    WHERE m.message_id = q.message_id AND m.instance_name = q.instance_name
  );
  GET DIAGNOSTICS v_mdq_deleted = ROW_COUNT;

  SELECT count(*) INTO v_mlr_orphans
  FROM evo.media_loss_registry r
  WHERE r.message_uuid IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM zapp.evolution_messages m
      WHERE m.id = r.message_uuid AND m.instance_name = r.instance_name
    );

  RETURN jsonb_build_object(
    'ok', true, 'ran_at', now(),
    'mdq_orphans_deleted', v_mdq_deleted,
    'mlr_orphans_detected', v_mlr_orphans
  );
END;
$$;
REVOKE ALL ON FUNCTION evo.fn_reconcile_media_fk_orphans() FROM PUBLIC;

ALTER TABLE evo.media_download_queue DROP CONSTRAINT IF EXISTS fk_mdq_message;
ALTER TABLE evo.media_loss_registry DROP CONSTRAINT IF EXISTS fk_mlr_message_uuid_instance;

SELECT cron.schedule('evo-reconcile-media-fk-orphans', '*/15 * * * *',
  $$SELECT evo.fn_reconcile_media_fk_orphans()$$);
