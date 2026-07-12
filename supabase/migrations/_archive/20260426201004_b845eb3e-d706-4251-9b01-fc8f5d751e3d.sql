
INSERT INTO public.global_settings (key, value, description)
VALUES
  ('whatsapp_mode', 'unofficial', 'Modo ativo de WhatsApp: official (Cloud API) ou unofficial (Evolution API)'),
  ('whatsapp_cloud_display_phone', '', 'Número de telefone exibido (somente leitura, vem do Meta)'),
  ('whatsapp_cloud_waba_name', '', 'Nome do WhatsApp Business Account')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.rpc_get_whatsapp_mode()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT value FROM public.global_settings WHERE key = 'whatsapp_mode' LIMIT 1),
    'unofficial'
  );
$$;

GRANT EXECUTE ON FUNCTION public.rpc_get_whatsapp_mode() TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.rpc_set_whatsapp_mode(p_mode TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF NOT public.is_admin_or_supervisor(v_uid) THEN
    RAISE EXCEPTION 'forbidden: only admin/supervisor can change whatsapp_mode';
  END IF;

  IF p_mode NOT IN ('official', 'unofficial') THEN
    RAISE EXCEPTION 'invalid mode: % (allowed: official, unofficial)', p_mode;
  END IF;

  INSERT INTO public.global_settings (key, value, updated_by)
  VALUES ('whatsapp_mode', p_mode, v_uid)
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_by = EXCLUDED.updated_by,
        updated_at = now();

  RETURN p_mode;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_set_whatsapp_mode(TEXT) TO authenticated;
