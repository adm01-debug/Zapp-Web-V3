-- R28c: Criar profile para qa-final@promobrindes.test (E2E user do CI)
-- GAP detectado via validacao exaustiva: usuario existe em auth.users mas sem profile
-- Isso faria validate-e2e-user.yml falhar nos E2E tests na VPS

DO $$
DECLARE
  v_user_id uuid := '5ef9741e-a80f-489f-a6a1-06162737eda6';
  v_profile_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_user_id) THEN
    RAISE EXCEPTION 'ABORT: auth user qa-final nao encontrado';
  END IF;

  SELECT id INTO v_profile_id FROM zapp.profiles WHERE user_id = v_user_id;

  IF v_profile_id IS NOT NULL THEN
    RAISE NOTICE 'Profile ja existe: %', v_profile_id;
  ELSE
    INSERT INTO zapp.profiles (
      user_id, name, email, role, max_chats,
      department, is_online, access_level,
      can_download, is_active, onboarding_status,
      online_status, permissions, created_at, updated_at
    ) VALUES (
      v_user_id, 'CI E2E Bot', 'qa-final@promobrindes.test',
      'agent', 5, NULL, false, 'basic', false, true,
      'active', 'offline', '{}'::jsonb, NOW(), NOW()
    ) RETURNING id INTO v_profile_id;
    RAISE NOTICE 'Profile criado: %', v_profile_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM zapp.agent_stats WHERE profile_id = v_profile_id) THEN
    BEGIN
      INSERT INTO zapp.agent_stats (profile_id, created_at, updated_at)
      VALUES (v_profile_id, NOW(), NOW())
      ON CONFLICT (profile_id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'agent_stats skip: %', SQLERRM;
    END;
  END IF;
END $$;

SELECT u.email, p.id AS profile_id, p.role, p.is_active
FROM auth.users u
LEFT JOIN zapp.profiles p ON p.user_id = u.id
WHERE u.email = 'qa-final@promobrindes.test';
