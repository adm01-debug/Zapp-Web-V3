-- Create audit function
CREATE OR REPLACE FUNCTION public.process_settings_audit()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'UPDATE') THEN
    INSERT INTO public.audit_logs (
      action,
      entity_type,
      entity_id,
      old_data,
      new_data,
      user_id
    ) VALUES (
      'UPDATE',
      'app_setting',
      NEW.id::text,
      row_to_json(OLD),
      row_to_json(NEW),
      auth.uid()
    );
    RETURN NEW;
  ELSIF (TG_OP = 'INSERT') THEN
    INSERT INTO public.audit_logs (
      action,
      entity_type,
      entity_id,
      new_data,
      user_id
    ) VALUES (
      'INSERT',
      'app_setting',
      NEW.id::text,
      row_to_json(NEW),
      auth.uid()
    );
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger
DROP TRIGGER IF EXISTS tr_audit_app_settings ON public.app_settings;
CREATE TRIGGER tr_audit_app_settings
AFTER INSERT OR UPDATE ON public.app_settings
FOR EACH ROW EXECUTE FUNCTION public.process_settings_audit();