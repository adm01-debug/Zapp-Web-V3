CREATE OR REPLACE FUNCTION audit_role_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(),
      'role_created',
      'user_roles',
      NEW.id,
      jsonb_build_object('user_id', NEW.user_id, 'role', NEW.role)
    );
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(),
      'role_deleted',
      'user_roles',
      OLD.id,
      jsonb_build_object('user_id', OLD.user_id, 'role', OLD.role)
    );
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;