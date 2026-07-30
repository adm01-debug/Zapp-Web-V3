-- Contorna trigger com coluna faltante em audit_logs:
-- o INSERT em auth.users dispara handle_new_user_role() → on_role_change() →
-- log_security_event() → INSERT audit_logs(event_type,...) — coluna ausente nesta etapa.
ALTER TABLE public.user_roles DISABLE TRIGGER USER;

-- Cria usuário de teste em auth.users para satisfazer a FK profiles_user_id_fkey
-- Em CI (banco limpo) auth.users está vazio; sem este INSERT o profiles INSERT abaixo falha.
-- instance_id omitido: não existe no bootstrap de CI (pg-bootstrap.sql) e é nullable no GoTrue real.
INSERT INTO auth.users (
  id, aud, role, email,
  encrypted_password, email_confirmed_at,
  created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
)
VALUES (
  '3025e573-1c6d-4476-bf2e-65096177adb9',
  'authenticated',
  'authenticated',
  'teste@zappweb.com',
  '',
  now(),
  now(),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- Cria profile e role admin para o usuário de teste
INSERT INTO public.profiles (user_id, email, name, role, is_active) -- ignore-lint-ml002
VALUES ('3025e573-1c6d-4476-bf2e-65096177adb9', 'teste@zappweb.com', 'Usuario Teste', 'admin', true)
ON CONFLICT (user_id) DO UPDATE SET role='admin', is_active=true;

INSERT INTO public.user_roles (user_id, role) VALUES ('3025e573-1c6d-4476-bf2e-65096177adb9', 'admin') -- ignore-lint-ml002
ON CONFLICT DO NOTHING;

ALTER TABLE public.user_roles ENABLE TRIGGER USER;
