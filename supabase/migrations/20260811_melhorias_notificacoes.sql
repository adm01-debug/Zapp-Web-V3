-- ============================================================================
-- 20260811_melhorias_notificacoes.sql
-- Frente C — PROCESSADOR DE NOTIFICAÇÕES (evo.evolution_notifications)
-- aplicado em produção 2026-08-11
-- ----------------------------------------------------------------------------
-- Problema: 8.664 notificações 100% 'pending' para sempre (nenhum processador
-- existia — só produção INSERT e cleanup/verify). 
-- Solução (100% ADDITIVE; única alteração em objeto existente: CHECK constraint
-- da evolution_notifications ampliada p/ novos status):
--   1. evo.evolution_notification_outbox (fila de canais externos p/ dispatcher)
--   2. zapp.fn_process_evolution_notifications(p_batch) — claim atômico
--      (FOR UPDATE SKIP LOCKED) por ordem de criação; in_app → 'delivered';
--      canais externos (email/slack/webhook/whatsapp_promo) → outbox + 'pending_external'
--   3. Cron 465 'process-evolution-notifications' a cada 2 min (200/lote)
--   4. CHECK status ampliado: pending|sent|read|failed|sending|delivered|pending_external
-- Dispatcher externo (email/slack/whatsapp) fica como pendência (drena a outbox).
-- ============================================================================

CREATE TABLE IF NOT EXISTS evo.evolution_notification_outbox (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    notification_id uuid NOT NULL REFERENCES evo.evolution_notifications(id) ON DELETE CASCADE,
    channel         text NOT NULL,
    payload         jsonb,
    status          text NOT NULL DEFAULT 'pending',
    created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE evo.evolution_notification_outbox ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'evo' AND tablename = 'evolution_notification_outbox' AND policyname = 'service_full_access'
    ) THEN
        CREATE POLICY "service_full_access" ON evo.evolution_notification_outbox
            FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON evo.evolution_notification_outbox TO service_role;
CREATE INDEX IF NOT EXISTS evo_outbox_pending_idx ON evo.evolution_notification_outbox (status, created_at);

ALTER TABLE evo.evolution_notifications DROP CONSTRAINT IF EXISTS evolution_notifications_status_check;
ALTER TABLE evo.evolution_notifications ADD CONSTRAINT evolution_notifications_status_check
    CHECK (status = ANY (ARRAY['pending'::text, 'sent'::text, 'read'::text, 'failed'::text,
                           'sending'::text, 'delivered'::text, 'pending_external'::text]));

CREATE OR REPLACE FUNCTION zapp.fn_process_evolution_notifications(p_batch int DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp, evo, public
AS $$
DECLARE
    v_claimed int := 0; v_delivered int := 0; v_external int := 0;
    v_rec record; v_ch text; v_payload jsonb;
BEGIN
    FOR v_rec IN
        SELECT id, title, message, channels_sent, notification_type, contact_id,
               conversation_id, deal_id, priority, metadata, created_at
          FROM evo.evolution_notifications
         WHERE status = 'pending'
         ORDER BY created_at ASC
         LIMIT p_batch
         FOR UPDATE SKIP LOCKED
    LOOP
        v_claimed := v_claimed + 1;
        v_payload := jsonb_build_object(
            'notification_id', v_rec.id, 'notification_type', v_rec.notification_type,
            'title', v_rec.title, 'message', v_rec.message,
            'contact_id', v_rec.contact_id, 'conversation_id', v_rec.conversation_id,
            'deal_id', v_rec.deal_id, 'priority', v_rec.priority,
            'metadata', v_rec.metadata, 'created_at', v_rec.created_at);
        IF v_rec.channels_sent IS NULL
           OR NOT (v_rec.channels_sent && ARRAY['email'::text, 'slack'::text, 'webhook'::text, 'whatsapp_promo'::text])
        THEN
            UPDATE evo.evolution_notifications SET status = 'delivered'
             WHERE id = v_rec.id AND status = 'pending';
            v_delivered := v_delivered + 1;
        ELSE
            FOREACH v_ch IN ARRAY v_rec.channels_sent LOOP
                IF v_ch IN ('email', 'slack', 'webhook', 'whatsapp_promo') THEN
                    INSERT INTO evo.evolution_notification_outbox (notification_id, channel, payload, status)
                    VALUES (v_rec.id, v_ch, v_payload, 'pending');
                END IF;
            END LOOP;
            UPDATE evo.evolution_notifications SET status = 'pending_external'
             WHERE id = v_rec.id AND status = 'pending';
            v_external := v_external + 1;
        END IF;
    END LOOP;
    RETURN jsonb_build_object('ok', true, 'claimed', v_claimed,
        'delivered_in_app', v_delivered, 'pending_external', v_external, 'executado_em', now());
END;
$$;

REVOKE ALL ON FUNCTION zapp.fn_process_evolution_notifications(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zapp.fn_process_evolution_notifications(int) TO service_role;

-- Cron criado em produção com jobid 465:
-- SELECT cron.schedule('process-evolution-notifications', '*/2 * * * *', $$SELECT zapp.fn_process_evolution_notifications(200)$$);

-- ============================================================================
-- Rollback (documentado — NÃO executar em prod sem avaliação):
--   SELECT cron.unschedule(465);
--   DROP FUNCTION zapp.fn_process_evolution_notifications(int);
--   DROP TABLE evo.evolution_notification_outbox;
--   ALTER TABLE evo.evolution_notifications DROP CONSTRAINT evolution_notifications_status_check;
--   ALTER TABLE evo.evolution_notifications ADD CONSTRAINT evolution_notifications_status_check
--       CHECK (status = ANY (ARRAY['pending','sent','read','failed']));
-- ============================================================================
