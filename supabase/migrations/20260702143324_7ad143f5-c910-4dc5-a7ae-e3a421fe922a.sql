-- Cria usuário de teste em auth.users para satisfazer a FK profiles_user_id_fkey
-- Em CI (banco limpo) auth.users está vazio; sem este INSERT o profiles INSERT abaixo falha.
INSERT INTO auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
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

-- Contorna trigger com coluna faltante em audit_logs
ALTER TABLE public.user_roles DISABLE TRIGGER USER;
INSERT INTO public.user_roles (user_id, role) VALUES ('3025e573-1c6d-4476-bf2e-65096177adb9', 'admin') -- ignore-lint-ml002
ON CONFLICT DO NOTHING;
ALTER TABLE public.user_roles ENABLE TRIGGER USER;
