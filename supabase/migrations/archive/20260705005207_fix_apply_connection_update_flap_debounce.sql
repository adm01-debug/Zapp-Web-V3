-- FALHA CRÍTICA (auditoria sessão 6, 2026-07-05): public.fn_apply_connection_update()
-- é o "single-source-of-truth" chamado por handleConnectionUpdate() a CADA evento
-- `connection.update` do webhook, e marcava a instância 'connected'/health_status='ok'
-- IMEDIATAMENTE ao ver qualquer state que comece com 'open' — sem nenhum debounce.
--
-- Evidência ao vivo (instância wpp2, 2026-07-05 ~00:40-00:48 UTC):
--   * evo_status/fetchInstances (fonte autoritativa da Evolution): connectionStatus=close,
--     disconnectionReasonCode=401, disconnectionAt=2026-07-04T15:00:44Z — INALTERADO por
--     mais de 9 horas seguidas (a linha nunca voltou a autenticar de verdade).
--   * Mesmo assim, public.whatsapp_connections.status oscilou para 'connected' /
--     health_status='ok' repetidas vezes (ex.: disconnected_at=00:42:27Z seguido de
--     last_connected_at=00:44:44Z, ~2min17s depois) porque o Baileys emite um pulso de
--     `state:'open'` no início de CADA tentativa de handshake de reconexão — mesmo quando
--     a sessão foi invalidada (401 device_removed) e o handshake será rejeitado de novo
--     em seguida. Cada pulso isolado era tratado como "conectado e saudável".
--   * Consequência direta: fn_system_health_score() reportou "wpp2_connection: connected
--     20/20", Grade A (94,2%) às 23:49 UTC enquanto a linha estava offline há horas; e ao
--     menos um alerta crítico foi fechado com "auto-resolve: wpp2 connected via
--     phone-match reconcile" sem que a reconexão fosse real — o outage ficou invisível
--     para quem olhasse o dashboard/health-score/alertas.
--
-- Fix: exige que não tenha havido uma desconexão registrada (`disconnected_at`) nos
-- últimos 10 minutos antes de aceitar um `open` isolado como 'connected'; caso contrário,
-- rebaixa para 'connecting' (não confirmado) até um evento subsequente sem desconexão
-- recente confirmar estabilidade. Isso é uma mitigação, não uma garantia absoluta — ver
-- docs/EVOLUTION_API_AUDIT_2026-07-05_sessao6.md para a recomendação de médio prazo
-- (cross-check contra o poll periódico de fetchInstances em vez de confiar cegamente em
-- um único evento de webhook).

CREATE OR REPLACE FUNCTION public.fn_apply_connection_update(p_event jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'evo'
AS $function$
DECLARE
  v_instance_name text;
  v_evo_status    text;
  v_mapped_status text;
  v_owner         text;
  v_phone         text;
  v_profile       text;
  v_evo_id        text;
  v_db_status     text;
  v_disconnected_at timestamptz;
  v_action        text;
  v_debounced     boolean := false;
BEGIN
  v_instance_name := COALESCE(p_event->>'instance', p_event->>'name', p_event->'data'->>'instance');
  v_evo_status    := COALESCE(p_event->'data'->>'state', p_event->>'state', p_event->>'connectionStatus');
  v_owner         := COALESCE(p_event->'data'->>'wuid', p_event->>'ownerJid', p_event->'data'->>'ownerJid');
  v_profile       := COALESCE(p_event->'data'->>'profileName', p_event->>'profileName');
  v_evo_id        := COALESCE(p_event->>'instanceId', p_event->>'id', p_event->'data'->>'id');
  v_phone         := split_part(COALESCE(v_owner, ''), '@', 1);

  IF v_instance_name IS NULL THEN
    RETURN jsonb_build_object('action', 'rejected', 'reason', 'missing_instance_name');
  END IF;

  -- FIX S16: mapeamento defensivo com suporte a variantes Baileys
  -- Baileys retorna 'open' puro OU 'open_<timestamp>' OU 'open_<session>'
  -- Qualquer estado STARTING WITH 'open' significa conectado
  v_mapped_status := CASE
    WHEN v_evo_status IN ('open','CONNECTED','open_ready') OR v_evo_status LIKE 'open%'
      THEN 'connected'
    WHEN v_evo_status IN ('connecting','CONNECTING','reconnecting','RECONNECTING')
      OR v_evo_status LIKE 'connecting%'
      THEN 'connecting'
    WHEN v_evo_status IN ('close','CLOSE','disconnected','DISCONNECTED')
      THEN 'disconnected'
    WHEN v_evo_status IN ('qr_pending','qrcode','QR_CODE','QR_PENDING')
      THEN 'qr_pending'
    WHEN v_evo_status = 'banned'
      THEN 'banned'
    -- Estados de erro/transição → disconnected
    WHEN v_evo_status IN ('timeout','conflict','replaced','device_removed','multidevice_mismatch')
      THEN 'disconnected'
    -- Fallback seguro — nunca viola CHECK constraint
    ELSE 'disconnected'
  END;

  PERFORM set_config('app.reconcile_source', 'webhook_push', true);

  SELECT wc.status, wc.disconnected_at INTO v_db_status, v_disconnected_at
    FROM public.whatsapp_connections wc WHERE wc.instance_name = v_instance_name;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('action','skip_not_in_db','instance', v_instance_name, 'evo_status', v_evo_status);
  END IF;

  -- FIX 2026-07-05 (sessao 6): debounce contra pulso de 'open' transitorio pos-401.
  -- Um unico evento 'open' logo apos uma desconexao registrada nao prova que a sessao
  -- foi de fato reautenticada — Baileys emite esse pulso no INICIO do handshake, antes
  -- da rejeicao do WhatsApp chegar. So aceitamos 'connected' se nao houve desconexao
  -- nos ultimos 10 minutos; caso contrario, tratamos como 'connecting' (nao confirmado).
  IF v_mapped_status = 'connected'
     AND v_disconnected_at IS NOT NULL
     AND v_disconnected_at > now() - interval '10 minutes' THEN
    v_mapped_status := 'connecting';
    v_debounced := true;
  END IF;

  IF v_db_status IS DISTINCT FROM v_mapped_status THEN
    UPDATE public.whatsapp_connections wc
      SET status        = v_mapped_status,
          instance_id   = COALESCE(NULLIF(v_evo_id,''), wc.instance_id),
          phone_number  = COALESCE(NULLIF(v_phone, ''), wc.phone_number),
          owner_jid     = COALESCE(v_owner, wc.owner_jid),
          health_status = CASE v_mapped_status
                            WHEN 'connected'    THEN 'ok'
                            WHEN 'connecting'   THEN 'degraded'
                            WHEN 'disconnected' THEN 'down'
                            WHEN 'qr_pending'   THEN 'degraded'
                            WHEN 'banned'       THEN 'down'
                            ELSE 'unknown' END,
          health_reason = CASE
                            WHEN v_debounced THEN format('webhook push: evo_state=%s debounced (disconnected_at=%s < 10min ago)', v_evo_status, v_disconnected_at)
                            WHEN v_mapped_status = 'connected' THEN NULL
                            ELSE format('webhook push: evo_state=%s mapped=%s', v_evo_status, v_mapped_status) END,
          last_health_check = now(),
          last_connected_at = CASE WHEN v_mapped_status = 'connected' THEN now() ELSE wc.last_connected_at END,
          disconnected_at   = CASE WHEN v_mapped_status = 'disconnected' THEN now() ELSE wc.disconnected_at END,
          updated_at        = now()
    WHERE wc.instance_name = v_instance_name;
    v_action := 'updated';
  ELSE
    UPDATE public.whatsapp_connections wc
      SET last_health_check = now(),
          instance_id = COALESCE(NULLIF(v_evo_id,''), wc.instance_id)
    WHERE wc.instance_name = v_instance_name;
    v_action := 'no_change';
  END IF;

  RETURN jsonb_build_object(
    'action', v_action,
    'instance', v_instance_name,
    'old_status', v_db_status,
    'new_status', v_mapped_status,
    'evo_state', v_evo_status,
    'debounced', v_debounced,
    'profile', v_profile
  );
END;
$function$;
