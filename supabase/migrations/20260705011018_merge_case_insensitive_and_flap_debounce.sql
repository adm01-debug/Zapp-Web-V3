-- Colisão de edição concorrente (auditoria sessão 6, 2026-07-05): durante esta mesma
-- sessão de auditoria, outra sessão/processo aplicou diretamente no banco ao vivo um fix
-- de case-insensitivity em `public.fn_apply_connection_update()` ("Bug #69" — o mapeamento
-- de estado usava comparação case-sensitive contra variantes como 'OPEN'/'Open_xyz' vindas
-- do Baileys), SEM o debounce anti-flap adicionado na migração
-- `20260705005207_fix_apply_connection_update_flap_debounce.sql` desta mesma sessão —
-- ou seja, a versão deployada por aquele processo revertia silenciosamente o fix do S6-2
-- ao substituir a função inteira sem incorporar a mudança concorrente.
--
-- Detectado ao vivo: uma chamada de simulação a `fn_apply_connection_update` teve seu
-- retorno JSON sem a chave `debounced` (que só existe na versão com meu fix) — comparar
-- `pg_get_functiondef` a seguir confirmou que a função ao vivo era outra revisão,
-- reconhecível pelo comentário "FIX S16+: mapeamento CASE-INSENSITIVE... (Bug #69)" e pela
-- variável `v_evo_upper`, sem qualquer traço do debounce.
--
-- Esta migração reconcilia as duas mudanças: preserva o mapeamento case-insensitive
-- (`UPPER(v_evo_status) LIKE 'OPEN%'` etc. — correto e necessário, resolve o Bug #69) E
-- reintroduz o debounce de 10 minutos contra o pulso `open` transitório pós-401
-- (S6-2, ver docs/EVOLUTION_API_AUDIT_2026-07-05_sessao6.md). Reverificado com a mesma
-- bateria de cenários da migração anterior, incluindo variantes de case ('OPEN', 'Open_xyz').
--
-- Lição de processo: edições diretas e concorrentes na mesma função ao vivo, sem
-- coordenação, se pisam silenciosamente — quem aplica por último "vence" e apaga o fix
-- anterior sem erro nem aviso. Recomendação: qualquer sessão de auditoria/hotfix que
-- edite uma função compartilhada deveria reler `pg_get_functiondef` imediatamente antes
-- de escrever, e novamente logo depois, para detectar esse tipo de corrida.

CREATE OR REPLACE FUNCTION public.fn_apply_connection_update(p_event jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'evo'
AS $function$
DECLARE
  v_instance_name text;
  v_evo_status    text;
  v_evo_upper     text;  -- versao uppercase para comparacao (Bug #69)
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
  v_evo_upper     := UPPER(COALESCE(v_evo_status, ''));

  IF v_instance_name IS NULL THEN
    RETURN jsonb_build_object('action', 'rejected', 'reason', 'missing_instance_name');
  END IF;

  -- FIX S16+: mapeamento CASE-INSENSITIVE com suporte a variantes Baileys
  -- LIKE usa UPPER() para evitar bug de case-sensitivity (Bug #69)
  v_mapped_status := CASE
    WHEN v_evo_upper LIKE 'OPEN%' OR v_evo_upper = 'CONNECTED'
      THEN 'connected'
    WHEN v_evo_upper LIKE 'CONNECTING%' OR v_evo_upper LIKE 'RECONNECTING%'
      THEN 'connecting'
    WHEN v_evo_upper IN ('CLOSE', 'DISCONNECTED')
      THEN 'disconnected'
    WHEN v_evo_upper IN ('QR_PENDING', 'QRCODE', 'QR_CODE')
      THEN 'qr_pending'
    WHEN v_evo_upper = 'BANNED'
      THEN 'banned'
    WHEN v_evo_upper IN ('TIMEOUT', 'CONFLICT', 'REPLACED', 'DEVICE_REMOVED', 'MULTIDEVICE_MISMATCH', 'STREAM_ERROR')
      THEN 'disconnected'
    ELSE 'disconnected'
  END;

  PERFORM set_config('app.reconcile_source', 'webhook_push', true);

  SELECT wc.status, wc.disconnected_at INTO v_db_status, v_disconnected_at
    FROM public.whatsapp_connections wc WHERE wc.instance_name = v_instance_name;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('action','skip_not_in_db','instance', v_instance_name, 'evo_status', v_evo_status);
  END IF;

  -- FIX 2026-07-05 (sessao 6): debounce contra pulso de 'open' transitorio pos-401.
  -- Reaplicado apos colisao com edicao concorrente que removeu esta guarda ao adicionar
  -- o fix de case-insensitivity (Bug #69) — ver docs/EVOLUTION_API_AUDIT_2026-07-05_sessao6.md.
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
