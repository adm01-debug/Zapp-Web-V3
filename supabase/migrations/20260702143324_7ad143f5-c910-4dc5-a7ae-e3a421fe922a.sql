-- Cria profile e role admin para o usuário de teste
INSERT INTO public.profiles (user_id, email, name, role, is_active)
VALUES ('3025e573-1c6d-4476-bf2e-65096177adb9', 'teste@zappweb.com', 'Usuario Teste', 'admin', true)
ON CONFLICT (user_id) DO UPDATE SET role='admin', is_active=true;

-- Contorna trigger com coluna faltante em audit_logs
ALTER TABLE public.user_roles DISABLE TRIGGER USER;
INSERT INTO public.user_roles (user_id, role) VALUES ('3025e573-1c6d-4476-bf2e-65096177adb9', 'admin')
ON CONFLICT DO NOTHING;
ALTER TABLE public.user_roles ENABLE TRIGGER USER;