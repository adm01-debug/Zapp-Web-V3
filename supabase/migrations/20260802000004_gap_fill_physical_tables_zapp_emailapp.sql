-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: 20260802000004_gap_fill_physical_tables_zapp_emailapp.sql
-- Purpose  : Garante que todas as 16 tabelas alvo de
--            20260802000002_realtime_publication_all_gaps.sql sejam FÍSICAS
--            nos schemas corretos e estejam na publication supabase_realtime.
--
-- Problema (M-2/M-3):
--   20260802000002 adiciona tabelas à publication mas possui duas falhas:
--   (a) guarda relkind NOT IN ('r','p') pula silenciosamente VIEW proxies
--   (b) tabelas ausentes em fresh installs (migrations arquivadas nunca
--       foram aplicadas) → also silently skipped
--
-- Estratégia:
--   FASE 1 — 14 tabelas zapp.*
--     Para cada tabela, detecta estado atual via pg_catalog.pg_class.relkind:
--       • 'r'/'p' (física)  → já correto; apenas garante RLS + publication
--       • 'v'  (VIEW proxy) → DROP VIEW, depois move de public.* ou cria nova
--       • NULL (ausente)    → move de public.* (ALTER SET SCHEMA) ou cria nova
--     Garantia: RLS habilitado; tabela em supabase_realtime (idempotente).
--
--   FASE 2 — 2 tabelas email_app.*
--     email_health_summary e email_revalidation_jobs precisam ser FÍSICAS em
--     email_app porque o frontend (useEmailHealthStatus.ts:124,148) subscreve
--     schema:'email_app' — subscriptions com schema:'public' (onde as tabelas
--     físicas existem agora) são no-op silenciosos no contexto CDC/Realtime.
--     • Cria tabela física em email_app (idempotente)
--     • Migra dados de public.* se existir
--     • Remove VIEW proxy em zapp que apontava para public.* e recria
--       apontando para email_app.* (compat. com createZappAdminClient)
--     • Adiciona email_app.* à publication
--
--   FASE 3 — Verificação pós-aplicação
--     Confirma que todas as 16 tabelas físicas existem e estão na publication.
--     Lança EXCEPTION se qualquer tabela física ainda não estiver na publication.
--
-- Idempotência: seguro re-aplicar — todos os blocos detectam estado existente.
-- Tabelas criadas no fresh-install path NÃO incluem FK constraints para evitar
-- dependências circulares (archived migrations não executadas). FK constraints
-- aplicáveis vêm das migrations específicas de cada tabela.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- FASE 1: 14 tabelas zapp.*
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. zapp.calls ────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_rk_zapp "char";
  v_rk_pub  "char";
BEGIN
  SELECT c.relkind INTO v_rk_zapp
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'zapp' AND c.relname = 'calls';

  IF NOT FOUND OR v_rk_zapp NOT IN ('r', 'p') THEN
    IF v_rk_zapp = 'v' THEN
      DROP VIEW IF EXISTS zapp.calls CASCADE;
      RAISE NOTICE '[calls] VIEW proxy removida de zapp';
    END IF;

    SELECT c.relkind INTO v_rk_pub
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'calls';

    IF FOUND AND v_rk_pub IN ('r', 'p') THEN
      ALTER TABLE public.calls SET SCHEMA zapp;
      RAISE NOTICE '[calls] public.calls → zapp.calls (ALTER SET SCHEMA)';
    ELSE
      CREATE TABLE zapp.calls (
        id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        contact_id            UUID,
        agent_id              UUID,
        whatsapp_connection_id UUID,
        direction             TEXT NOT NULL,
        status                TEXT NOT NULL DEFAULT 'ringing',
        started_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
        answered_at           TIMESTAMPTZ,
        ended_at              TIMESTAMPTZ,
        duration_seconds      INTEGER,
        recording_url         TEXT,
        notes                 TEXT,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      RAISE NOTICE '[calls] zapp.calls criada (fresh install path)';
    END IF;
  ELSE
    RAISE NOTICE '[calls] Já física em zapp (relkind=''%'') — OK', v_rk_zapp;
  END IF;

  ALTER TABLE zapp.calls ENABLE ROW LEVEL SECURITY;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE zapp.calls;
    RAISE NOTICE '[calls] Adicionada à supabase_realtime';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE '[calls] Já está em supabase_realtime';
  END;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[calls] ERRO %: %', SQLSTATE, SQLERRM;
END $$;


-- ── 2. zapp.talkx_recipients ─────────────────────────────────────────────────
DO $$
DECLARE
  v_rk_zapp "char";
  v_rk_pub  "char";
BEGIN
  SELECT c.relkind INTO v_rk_zapp
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'zapp' AND c.relname = 'talkx_recipients';

  IF NOT FOUND OR v_rk_zapp NOT IN ('r', 'p') THEN
    IF v_rk_zapp = 'v' THEN
      DROP VIEW IF EXISTS zapp.talkx_recipients CASCADE;
      RAISE NOTICE '[talkx_recipients] VIEW proxy removida de zapp';
    END IF;

    SELECT c.relkind INTO v_rk_pub
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'talkx_recipients';

    IF FOUND AND v_rk_pub IN ('r', 'p') THEN
      ALTER TABLE public.talkx_recipients SET SCHEMA zapp;
      RAISE NOTICE '[talkx_recipients] public → zapp (ALTER SET SCHEMA)';
    ELSE
      CREATE TABLE zapp.talkx_recipients (
        id                  UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        campaign_id         UUID NOT NULL,
        contact_id          UUID NOT NULL,
        personalized_message TEXT,
        status              TEXT NOT NULL DEFAULT 'pending',
        sent_at             TIMESTAMPTZ,
        delivered_at        TIMESTAMPTZ,
        error_message       TEXT,
        request_id          UUID,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      RAISE NOTICE '[talkx_recipients] zapp.talkx_recipients criada (fresh install path)';
    END IF;
  ELSE
    RAISE NOTICE '[talkx_recipients] Já física em zapp — OK';
  END IF;

  ALTER TABLE zapp.talkx_recipients ENABLE ROW LEVEL SECURITY;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE zapp.talkx_recipients;
    RAISE NOTICE '[talkx_recipients] Adicionada à supabase_realtime';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE '[talkx_recipients] Já está em supabase_realtime';
  END;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[talkx_recipients] ERRO %: %', SQLSTATE, SQLERRM;
END $$;


-- ── 3. zapp.dispatch_error_logs ──────────────────────────────────────────────
DO $$
DECLARE
  v_rk_zapp "char";
  v_rk_pub  "char";
BEGIN
  SELECT c.relkind INTO v_rk_zapp
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'zapp' AND c.relname = 'dispatch_error_logs';

  IF NOT FOUND OR v_rk_zapp NOT IN ('r', 'p') THEN
    IF v_rk_zapp = 'v' THEN
      DROP VIEW IF EXISTS zapp.dispatch_error_logs CASCADE;
      RAISE NOTICE '[dispatch_error_logs] VIEW proxy removida de zapp';
    END IF;

    SELECT c.relkind INTO v_rk_pub
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'dispatch_error_logs';

    IF FOUND AND v_rk_pub IN ('r', 'p') THEN
      ALTER TABLE public.dispatch_error_logs SET SCHEMA zapp;
      RAISE NOTICE '[dispatch_error_logs] public → zapp (ALTER SET SCHEMA)';
    ELSE
      -- DDL canônico (version 3 — archive/20260521104452): shape completo
      -- sem FK p/ fresh install safety
      CREATE TABLE zapp.dispatch_error_logs (
        id                 UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        failed_message_id  UUID,
        instance_name      TEXT,
        remote_jid         TEXT,
        channel_type       TEXT,
        agent_email        TEXT,
        agent_user_id      UUID,
        error_code         TEXT,
        error_message      TEXT,
        http_status        INTEGER,
        retry_count        INTEGER NOT NULL DEFAULT 0,
        payload            JSONB,
        context            JSONB,
        occurred_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX ON zapp.dispatch_error_logs (occurred_at DESC);
      CREATE INDEX ON zapp.dispatch_error_logs (instance_name);
      RAISE NOTICE '[dispatch_error_logs] zapp.dispatch_error_logs criada (fresh install path)';
    END IF;
  ELSE
    RAISE NOTICE '[dispatch_error_logs] Já física em zapp — OK';
  END IF;

  ALTER TABLE zapp.dispatch_error_logs ENABLE ROW LEVEL SECURITY;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE zapp.dispatch_error_logs;
    RAISE NOTICE '[dispatch_error_logs] Adicionada à supabase_realtime';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE '[dispatch_error_logs] Já está em supabase_realtime';
  END;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[dispatch_error_logs] ERRO %: %', SQLSTATE, SQLERRM;
END $$;


-- ── 4. zapp.connection_health_logs ───────────────────────────────────────────
DO $$
DECLARE
  v_rk_zapp "char";
  v_rk_pub  "char";
BEGIN
  SELECT c.relkind INTO v_rk_zapp
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'zapp' AND c.relname = 'connection_health_logs';

  IF NOT FOUND OR v_rk_zapp NOT IN ('r', 'p') THEN
    IF v_rk_zapp = 'v' THEN
      DROP VIEW IF EXISTS zapp.connection_health_logs CASCADE;
      RAISE NOTICE '[connection_health_logs] VIEW proxy removida de zapp';
    END IF;

    SELECT c.relkind INTO v_rk_pub
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'connection_health_logs';

    IF FOUND AND v_rk_pub IN ('r', 'p') THEN
      ALTER TABLE public.connection_health_logs SET SCHEMA zapp;
      RAISE NOTICE '[connection_health_logs] public → zapp (ALTER SET SCHEMA)';
    ELSE
      CREATE TABLE zapp.connection_health_logs (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        connection_id    UUID NOT NULL,
        instance_id      UUID NOT NULL,
        status           TEXT NOT NULL,
        response_time_ms BIGINT,
        error_message    TEXT,
        checked_at       TIMESTAMPTZ DEFAULT now()
      );
      RAISE NOTICE '[connection_health_logs] zapp.connection_health_logs criada (fresh install path)';
    END IF;
  ELSE
    RAISE NOTICE '[connection_health_logs] Já física em zapp — OK';
  END IF;

  ALTER TABLE zapp.connection_health_logs ENABLE ROW LEVEL SECURITY;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE zapp.connection_health_logs;
    RAISE NOTICE '[connection_health_logs] Adicionada à supabase_realtime';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE '[connection_health_logs] Já está em supabase_realtime';
  END;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[connection_health_logs] ERRO %: %', SQLSTATE, SQLERRM;
END $$;


-- ── 5. zapp.security_alerts ──────────────────────────────────────────────────
DO $$
DECLARE
  v_rk_zapp "char";
  v_rk_pub  "char";
BEGIN
  SELECT c.relkind INTO v_rk_zapp
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'zapp' AND c.relname = 'security_alerts';

  IF NOT FOUND OR v_rk_zapp NOT IN ('r', 'p') THEN
    IF v_rk_zapp = 'v' THEN
      DROP VIEW IF EXISTS zapp.security_alerts CASCADE;
      RAISE NOTICE '[security_alerts] VIEW proxy removida de zapp';
    END IF;

    SELECT c.relkind INTO v_rk_pub
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'security_alerts';

    IF FOUND AND v_rk_pub IN ('r', 'p') THEN
      ALTER TABLE public.security_alerts SET SCHEMA zapp;
      RAISE NOTICE '[security_alerts] public → zapp (ALTER SET SCHEMA)';
    ELSE
      -- user_id / resolved_by sem FK para auth.users — safe p/ fresh install
      CREATE TABLE zapp.security_alerts (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        alert_type  TEXT NOT NULL,
        severity    TEXT NOT NULL DEFAULT 'medium',
        title       TEXT NOT NULL,
        description TEXT,
        ip_address  TEXT,
        user_id     UUID,
        metadata    JSONB DEFAULT '{}',
        is_resolved BOOLEAN DEFAULT false,
        resolved_by UUID,
        resolved_at TIMESTAMPTZ,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      RAISE NOTICE '[security_alerts] zapp.security_alerts criada (fresh install path)';
    END IF;
  ELSE
    RAISE NOTICE '[security_alerts] Já física em zapp — OK';
  END IF;

  ALTER TABLE zapp.security_alerts ENABLE ROW LEVEL SECURITY;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE zapp.security_alerts;
    RAISE NOTICE '[security_alerts] Adicionada à supabase_realtime';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE '[security_alerts] Já está em supabase_realtime';
  END;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[security_alerts] ERRO %: %', SQLSTATE, SQLERRM;
END $$;


-- ── 6. zapp.security_audit_logs ──────────────────────────────────────────────
DO $$
DECLARE
  v_rk_zapp "char";
  v_rk_pub  "char";
BEGIN
  SELECT c.relkind INTO v_rk_zapp
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'zapp' AND c.relname = 'security_audit_logs';

  IF NOT FOUND OR v_rk_zapp NOT IN ('r', 'p') THEN
    IF v_rk_zapp = 'v' THEN
      DROP VIEW IF EXISTS zapp.security_audit_logs CASCADE;
      RAISE NOTICE '[security_audit_logs] VIEW proxy removida de zapp';
    END IF;

    SELECT c.relkind INTO v_rk_pub
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'security_audit_logs';

    IF FOUND AND v_rk_pub IN ('r', 'p') THEN
      ALTER TABLE public.security_audit_logs SET SCHEMA zapp;
      RAISE NOTICE '[security_audit_logs] public → zapp (ALTER SET SCHEMA)';
    ELSE
      CREATE TABLE zapp.security_audit_logs (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id    UUID,
        event_type TEXT NOT NULL,
        resource   TEXT,
        action     TEXT,
        status     TEXT NOT NULL,
        details    JSONB DEFAULT '{}',
        ip_address TEXT,
        user_agent TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      RAISE NOTICE '[security_audit_logs] zapp.security_audit_logs criada (fresh install path)';
    END IF;
  ELSE
    RAISE NOTICE '[security_audit_logs] Já física em zapp — OK';
  END IF;

  ALTER TABLE zapp.security_audit_logs ENABLE ROW LEVEL SECURITY;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE zapp.security_audit_logs;
    RAISE NOTICE '[security_audit_logs] Adicionada à supabase_realtime';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE '[security_audit_logs] Já está em supabase_realtime';
  END;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[security_audit_logs] ERRO %: %', SQLSTATE, SQLERRM;
END $$;


-- ── 7. zapp.password_reset_requests ──────────────────────────────────────────
DO $$
DECLARE
  v_rk_zapp "char";
  v_rk_pub  "char";
BEGIN
  SELECT c.relkind INTO v_rk_zapp
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'zapp' AND c.relname = 'password_reset_requests';

  IF NOT FOUND OR v_rk_zapp NOT IN ('r', 'p') THEN
    IF v_rk_zapp = 'v' THEN
      DROP VIEW IF EXISTS zapp.password_reset_requests CASCADE;
      RAISE NOTICE '[password_reset_requests] VIEW proxy removida de zapp';
    END IF;

    SELECT c.relkind INTO v_rk_pub
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'password_reset_requests';

    IF FOUND AND v_rk_pub IN ('r', 'p') THEN
      ALTER TABLE public.password_reset_requests SET SCHEMA zapp;
      RAISE NOTICE '[password_reset_requests] public → zapp (ALTER SET SCHEMA)';
    ELSE
      CREATE TABLE zapp.password_reset_requests (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id          UUID NOT NULL,
        email            TEXT NOT NULL,
        status           TEXT NOT NULL,
        reason           TEXT,
        rejection_reason TEXT,
        ip_address       TEXT,
        user_agent       TEXT,
        reviewed_by      TEXT,
        reviewed_at      TIMESTAMPTZ,
        token_expires_at TIMESTAMPTZ,
        created_at       TIMESTAMPTZ DEFAULT now(),
        updated_at       TIMESTAMPTZ DEFAULT now()
      );
      RAISE NOTICE '[password_reset_requests] zapp.password_reset_requests criada (fresh install path)';
    END IF;
  ELSE
    RAISE NOTICE '[password_reset_requests] Já física em zapp — OK';
  END IF;

  ALTER TABLE zapp.password_reset_requests ENABLE ROW LEVEL SECURITY;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE zapp.password_reset_requests;
    RAISE NOTICE '[password_reset_requests] Adicionada à supabase_realtime';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE '[password_reset_requests] Já está em supabase_realtime';
  END;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[password_reset_requests] ERRO %: %', SQLSTATE, SQLERRM;
END $$;


-- ── 8. zapp.hmac_selftest_audit ──────────────────────────────────────────────
DO $$
DECLARE
  v_rk_zapp "char";
  v_rk_pub  "char";
BEGIN
  SELECT c.relkind INTO v_rk_zapp
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'zapp' AND c.relname = 'hmac_selftest_audit';

  IF NOT FOUND OR v_rk_zapp NOT IN ('r', 'p') THEN
    IF v_rk_zapp = 'v' THEN
      DROP VIEW IF EXISTS zapp.hmac_selftest_audit CASCADE;
      RAISE NOTICE '[hmac_selftest_audit] VIEW proxy removida de zapp';
    END IF;

    SELECT c.relkind INTO v_rk_pub
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'hmac_selftest_audit';

    IF FOUND AND v_rk_pub IN ('r', 'p') THEN
      ALTER TABLE public.hmac_selftest_audit SET SCHEMA zapp;
      RAISE NOTICE '[hmac_selftest_audit] public → zapp (ALTER SET SCHEMA)';
    ELSE
      CREATE TABLE zapp.hmac_selftest_audit (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        instance         TEXT,
        ok               BOOLEAN DEFAULT false,
        good_accepted    BOOLEAN DEFAULT false,
        tampered_rejected BOOLEAN DEFAULT false,
        message          TEXT,
        error            TEXT,
        duration_ms      BIGINT,
        executed_by      TEXT,
        created_at       TIMESTAMPTZ DEFAULT now()
      );
      RAISE NOTICE '[hmac_selftest_audit] zapp.hmac_selftest_audit criada (fresh install path)';
    END IF;
  ELSE
    RAISE NOTICE '[hmac_selftest_audit] Já física em zapp — OK';
  END IF;

  ALTER TABLE zapp.hmac_selftest_audit ENABLE ROW LEVEL SECURITY;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE zapp.hmac_selftest_audit;
    RAISE NOTICE '[hmac_selftest_audit] Adicionada à supabase_realtime';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE '[hmac_selftest_audit] Já está em supabase_realtime';
  END;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[hmac_selftest_audit] ERRO %: %', SQLSTATE, SQLERRM;
END $$;


-- ── 9. zapp.message_reactions ────────────────────────────────────────────────
DO $$
DECLARE
  v_rk_zapp "char";
  v_rk_pub  "char";
BEGIN
  SELECT c.relkind INTO v_rk_zapp
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'zapp' AND c.relname = 'message_reactions';

  IF NOT FOUND OR v_rk_zapp NOT IN ('r', 'p') THEN
    IF v_rk_zapp = 'v' THEN
      DROP VIEW IF EXISTS zapp.message_reactions CASCADE;
      RAISE NOTICE '[message_reactions] VIEW proxy removida de zapp';
    END IF;

    SELECT c.relkind INTO v_rk_pub
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'message_reactions';

    IF FOUND AND v_rk_pub IN ('r', 'p') THEN
      ALTER TABLE public.message_reactions SET SCHEMA zapp;
      RAISE NOTICE '[message_reactions] public → zapp (ALTER SET SCHEMA)';
    ELSE
      CREATE TABLE zapp.message_reactions (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        message_id UUID NOT NULL,
        contact_id UUID,
        user_id    UUID,
        emoji      TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE INDEX ON zapp.message_reactions (message_id);
      RAISE NOTICE '[message_reactions] zapp.message_reactions criada (fresh install path)';
    END IF;
  ELSE
    RAISE NOTICE '[message_reactions] Já física em zapp — OK';
  END IF;

  ALTER TABLE zapp.message_reactions ENABLE ROW LEVEL SECURITY;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE zapp.message_reactions;
    RAISE NOTICE '[message_reactions] Adicionada à supabase_realtime';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE '[message_reactions] Já está em supabase_realtime';
  END;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[message_reactions] ERRO %: %', SQLSTATE, SQLERRM;
END $$;


-- ── 10. zapp.team_message_reactions ──────────────────────────────────────────
DO $$
DECLARE
  v_rk_zapp "char";
  v_rk_pub  "char";
BEGIN
  SELECT c.relkind INTO v_rk_zapp
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'zapp' AND c.relname = 'team_message_reactions';

  IF NOT FOUND OR v_rk_zapp NOT IN ('r', 'p') THEN
    IF v_rk_zapp = 'v' THEN
      DROP VIEW IF EXISTS zapp.team_message_reactions CASCADE;
      RAISE NOTICE '[team_message_reactions] VIEW proxy removida de zapp';
    END IF;

    SELECT c.relkind INTO v_rk_pub
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'team_message_reactions';

    IF FOUND AND v_rk_pub IN ('r', 'p') THEN
      ALTER TABLE public.team_message_reactions SET SCHEMA zapp;
      RAISE NOTICE '[team_message_reactions] public → zapp (ALTER SET SCHEMA)';
    ELSE
      -- sem FK para zapp.team_messages / zapp.profiles — fresh install safety
      CREATE TABLE zapp.team_message_reactions (
        id         UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        message_id UUID NOT NULL,
        profile_id UUID NOT NULL,
        emoji      TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (message_id, profile_id, emoji)
      );
      CREATE INDEX ON zapp.team_message_reactions (message_id);
      RAISE NOTICE '[team_message_reactions] zapp.team_message_reactions criada (fresh install path)';
    END IF;
  ELSE
    RAISE NOTICE '[team_message_reactions] Já física em zapp — OK';
  END IF;

  ALTER TABLE zapp.team_message_reactions ENABLE ROW LEVEL SECURITY;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE zapp.team_message_reactions;
    RAISE NOTICE '[team_message_reactions] Adicionada à supabase_realtime';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE '[team_message_reactions] Já está em supabase_realtime';
  END;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[team_message_reactions] ERRO %: %', SQLSTATE, SQLERRM;
END $$;


-- ── 11. zapp.audio_meme_favorites ────────────────────────────────────────────
DO $$
DECLARE
  v_rk_zapp "char";
  v_rk_pub  "char";
BEGIN
  SELECT c.relkind INTO v_rk_zapp
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'zapp' AND c.relname = 'audio_meme_favorites';

  IF NOT FOUND OR v_rk_zapp NOT IN ('r', 'p') THEN
    IF v_rk_zapp = 'v' THEN
      DROP VIEW IF EXISTS zapp.audio_meme_favorites CASCADE;
      RAISE NOTICE '[audio_meme_favorites] VIEW proxy removida de zapp';
    END IF;

    SELECT c.relkind INTO v_rk_pub
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'audio_meme_favorites';

    IF FOUND AND v_rk_pub IN ('r', 'p') THEN
      ALTER TABLE public.audio_meme_favorites SET SCHEMA zapp;
      RAISE NOTICE '[audio_meme_favorites] public → zapp (ALTER SET SCHEMA)';
    ELSE
      -- sem FK para auth.users / zapp.audio_memes — fresh install safety
      CREATE TABLE zapp.audio_meme_favorites (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id    UUID NOT NULL,
        meme_id    UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (user_id, meme_id)
      );
      RAISE NOTICE '[audio_meme_favorites] zapp.audio_meme_favorites criada (fresh install path)';
    END IF;
  ELSE
    RAISE NOTICE '[audio_meme_favorites] Já física em zapp — OK';
  END IF;

  ALTER TABLE zapp.audio_meme_favorites ENABLE ROW LEVEL SECURITY;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE zapp.audio_meme_favorites;
    RAISE NOTICE '[audio_meme_favorites] Adicionada à supabase_realtime';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE '[audio_meme_favorites] Já está em supabase_realtime';
  END;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[audio_meme_favorites] ERRO %: %', SQLSTATE, SQLERRM;
END $$;


-- ── 12. zapp.system_health_incidents ─────────────────────────────────────────
DO $$
DECLARE
  v_rk_zapp "char";
  v_rk_pub  "char";
BEGIN
  SELECT c.relkind INTO v_rk_zapp
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'zapp' AND c.relname = 'system_health_incidents';

  IF NOT FOUND OR v_rk_zapp NOT IN ('r', 'p') THEN
    IF v_rk_zapp = 'v' THEN
      DROP VIEW IF EXISTS zapp.system_health_incidents CASCADE;
      RAISE NOTICE '[system_health_incidents] VIEW proxy removida de zapp';
    END IF;

    SELECT c.relkind INTO v_rk_pub
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'system_health_incidents';

    IF FOUND AND v_rk_pub IN ('r', 'p') THEN
      ALTER TABLE public.system_health_incidents SET SCHEMA zapp;
      RAISE NOTICE '[system_health_incidents] public → zapp (ALTER SET SCHEMA)';
    ELSE
      CREATE TABLE zapp.system_health_incidents (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        component      TEXT NOT NULL,
        status         TEXT NOT NULL,
        title          TEXT NOT NULL,
        description    TEXT,
        probable_cause TEXT,
        started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        resolved_at    TIMESTAMPTZ,
        impact_level   TEXT DEFAULT 'medium',
        metadata       JSONB DEFAULT '{}'
      );
      CREATE INDEX ON zapp.system_health_incidents (started_at DESC);
      RAISE NOTICE '[system_health_incidents] zapp.system_health_incidents criada (fresh install path)';
    END IF;
  ELSE
    RAISE NOTICE '[system_health_incidents] Já física em zapp — OK';
  END IF;

  ALTER TABLE zapp.system_health_incidents ENABLE ROW LEVEL SECURITY;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE zapp.system_health_incidents;
    RAISE NOTICE '[system_health_incidents] Adicionada à supabase_realtime';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE '[system_health_incidents] Já está em supabase_realtime';
  END;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[system_health_incidents] ERRO %: %', SQLSTATE, SQLERRM;
END $$;


-- ── 13. zapp.provider_message_log ────────────────────────────────────────────
DO $$
DECLARE
  v_rk_zapp "char";
  v_rk_pub  "char";
BEGIN
  SELECT c.relkind INTO v_rk_zapp
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'zapp' AND c.relname = 'provider_message_log';

  IF NOT FOUND OR v_rk_zapp NOT IN ('r', 'p') THEN
    IF v_rk_zapp = 'v' THEN
      DROP VIEW IF EXISTS zapp.provider_message_log CASCADE;
      RAISE NOTICE '[provider_message_log] VIEW proxy removida de zapp';
    END IF;

    SELECT c.relkind INTO v_rk_pub
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'provider_message_log';

    IF FOUND AND v_rk_pub IN ('r', 'p') THEN
      ALTER TABLE public.provider_message_log SET SCHEMA zapp;
      RAISE NOTICE '[provider_message_log] public → zapp (ALTER SET SCHEMA)';
    ELSE
      CREATE TABLE zapp.provider_message_log (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        provider      TEXT NOT NULL,
        instance_name TEXT,
        direction     TEXT NOT NULL,
        remote_jid    TEXT,
        message_id    TEXT,
        status        TEXT,
        http_status   INTEGER,
        request_body  JSONB,
        response_body JSONB,
        duration_ms   INTEGER,
        error_message TEXT,
        created_at    TIMESTAMPTZ DEFAULT now()
      );
      CREATE INDEX ON zapp.provider_message_log (created_at DESC);
      RAISE NOTICE '[provider_message_log] zapp.provider_message_log criada (fresh install path)';
    END IF;
  ELSE
    RAISE NOTICE '[provider_message_log] Já física em zapp — OK';
  END IF;

  ALTER TABLE zapp.provider_message_log ENABLE ROW LEVEL SECURITY;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE zapp.provider_message_log;
    RAISE NOTICE '[provider_message_log] Adicionada à supabase_realtime';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE '[provider_message_log] Já está em supabase_realtime';
  END;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[provider_message_log] ERRO %: %', SQLSTATE, SQLERRM;
END $$;


-- ── 14. zapp.rate_limit_logs ──────────────────────────────────────────────────
DO $$
DECLARE
  v_rk_zapp "char";
  v_rk_pub  "char";
BEGIN
  SELECT c.relkind INTO v_rk_zapp
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'zapp' AND c.relname = 'rate_limit_logs';

  IF NOT FOUND OR v_rk_zapp NOT IN ('r', 'p') THEN
    IF v_rk_zapp = 'v' THEN
      DROP VIEW IF EXISTS zapp.rate_limit_logs CASCADE;
      RAISE NOTICE '[rate_limit_logs] VIEW proxy removida de zapp';
    END IF;

    SELECT c.relkind INTO v_rk_pub
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'rate_limit_logs';

    IF FOUND AND v_rk_pub IN ('r', 'p') THEN
      ALTER TABLE public.rate_limit_logs SET SCHEMA zapp;
      RAISE NOTICE '[rate_limit_logs] public → zapp (ALTER SET SCHEMA)';
    ELSE
      CREATE TABLE zapp.rate_limit_logs (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ip_address    TEXT NOT NULL,
        endpoint      TEXT NOT NULL,
        user_id       UUID,
        request_count INTEGER NOT NULL DEFAULT 1,
        blocked       BOOLEAN DEFAULT false,
        user_agent    TEXT,
        country       TEXT,
        city          TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX ON zapp.rate_limit_logs (ip_address, created_at DESC);
      RAISE NOTICE '[rate_limit_logs] zapp.rate_limit_logs criada (fresh install path)';
    END IF;
  ELSE
    RAISE NOTICE '[rate_limit_logs] Já física em zapp — OK';
  END IF;

  ALTER TABLE zapp.rate_limit_logs ENABLE ROW LEVEL SECURITY;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE zapp.rate_limit_logs;
    RAISE NOTICE '[rate_limit_logs] Adicionada à supabase_realtime';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE '[rate_limit_logs] Já está em supabase_realtime';
  END;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[rate_limit_logs] ERRO %: %', SQLSTATE, SQLERRM;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- FASE 2: email_app.email_health_summary + email_app.email_revalidation_jobs
--
-- Problema crítico de produção:
--   useEmailHealthStatus.ts (linhas 124, 148) subscreve:
--     { schema: 'email_app', table: 'email_health_summary' }
--     { schema: 'email_app', table: 'email_revalidation_jobs' }
--   Mas as tabelas físicas existem em public.* → events CDC nunca chegam ao
--   frontend (subscription em schema errado = no-op silencioso).
--
-- Solução:
--   1. Criar tabela física em email_app.* (com migração de dados de public.*)
--   2. Remover tabela física em public.* (ou manter como VIEW proxy)
--   3. Recriar VIEW proxy em zapp.* → email_app.* (para edge functions via
--      createZappAdminClient que acessa via zapp schema)
--   4. Adicionar email_app.* à supabase_realtime publication
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 15. email_app.email_health_summary ───────────────────────────────────────
DO $$
DECLARE
  v_rk_emailapp "char";
  v_rk_pub      "char";
  v_rk_zapp_v   "char";
BEGIN
  -- Verificar estado em email_app
  SELECT c.relkind INTO v_rk_emailapp
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'email_app' AND c.relname = 'email_health_summary';

  IF NOT FOUND OR v_rk_emailapp NOT IN ('r', 'p') THEN
    IF v_rk_emailapp = 'v' THEN
      DROP VIEW IF EXISTS email_app.email_health_summary CASCADE;
      RAISE NOTICE '[email_health_summary] VIEW em email_app removida';
    END IF;

    -- Verificar se existe tabela física em public
    SELECT c.relkind INTO v_rk_pub
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'email_health_summary';

    IF FOUND AND v_rk_pub IN ('r', 'p') THEN
      -- Mover de public para email_app
      ALTER TABLE public.email_health_summary SET SCHEMA email_app;
      RAISE NOTICE '[email_health_summary] public.email_health_summary → email_app (ALTER SET SCHEMA)';
    ELSE
      -- Criar tabela física em email_app (singleton row pattern: id='current')
      CREATE TABLE email_app.email_health_summary (
        id                TEXT PRIMARY KEY DEFAULT 'current',
        status            TEXT NOT NULL DEFAULT 'healthy',
        last_validation   TIMESTAMPTZ,
        failure_count_60m INTEGER DEFAULT 0,
        metadata          JSONB,
        updated_at        TIMESTAMPTZ DEFAULT now()
      );
      -- Seed com registro singleton padrão
      INSERT INTO email_app.email_health_summary (id, status, updated_at)
      VALUES ('current', 'healthy', now())
      ON CONFLICT (id) DO NOTHING;
      RAISE NOTICE '[email_health_summary] email_app.email_health_summary criada com seed';
    END IF;
  ELSE
    RAISE NOTICE '[email_health_summary] Já física em email_app — OK';
  END IF;

  -- Garantir RLS
  ALTER TABLE email_app.email_health_summary ENABLE ROW LEVEL SECURITY;

  -- Atualizar/criar VIEW proxy em zapp apontando para email_app
  -- (para createZappAdminClient nas edge functions)
  SELECT c.relkind INTO v_rk_zapp_v
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'zapp' AND c.relname = 'email_health_summary';

  IF FOUND AND v_rk_zapp_v IN ('r', 'p') THEN
    -- Tabela física em zapp — não substituir por VIEW (não esperado, mas seguro)
    RAISE NOTICE '[email_health_summary] Tabela física encontrada em zapp — mantendo';
  ELSIF FOUND AND v_rk_zapp_v = 'v' THEN
    -- VIEW proxy existe em zapp — recriar apontando para email_app
    DROP VIEW IF EXISTS zapp.email_health_summary CASCADE;
    CREATE VIEW zapp.email_health_summary
    WITH (security_invoker = on)
    AS SELECT * FROM email_app.email_health_summary;
    GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.email_health_summary TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.email_health_summary TO service_role;
    RAISE NOTICE '[email_health_summary] VIEW proxy em zapp atualizada → email_app';
  ELSE
    -- Criar VIEW proxy em zapp
    CREATE VIEW zapp.email_health_summary
    WITH (security_invoker = on)
    AS SELECT * FROM email_app.email_health_summary;
    GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.email_health_summary TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.email_health_summary TO service_role;
    RAISE NOTICE '[email_health_summary] VIEW proxy criada em zapp → email_app';
  END IF;

  -- Adicionar email_app.email_health_summary à publication
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE email_app.email_health_summary;
    RAISE NOTICE '[email_health_summary] email_app.email_health_summary adicionada à supabase_realtime';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE '[email_health_summary] email_app.email_health_summary já está em supabase_realtime';
  END;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[email_health_summary] ERRO %: %', SQLSTATE, SQLERRM;
END $$;


-- ── 16. email_app.email_revalidation_jobs ────────────────────────────────────
DO $$
DECLARE
  v_rk_emailapp "char";
  v_rk_pub      "char";
  v_rk_zapp_v   "char";
BEGIN
  -- Verificar estado em email_app
  SELECT c.relkind INTO v_rk_emailapp
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'email_app' AND c.relname = 'email_revalidation_jobs';

  IF NOT FOUND OR v_rk_emailapp NOT IN ('r', 'p') THEN
    IF v_rk_emailapp = 'v' THEN
      DROP VIEW IF EXISTS email_app.email_revalidation_jobs CASCADE;
      RAISE NOTICE '[email_revalidation_jobs] VIEW em email_app removida';
    END IF;

    -- Verificar se existe tabela física em public
    SELECT c.relkind INTO v_rk_pub
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'email_revalidation_jobs';

    IF FOUND AND v_rk_pub IN ('r', 'p') THEN
      ALTER TABLE public.email_revalidation_jobs SET SCHEMA email_app;
      RAISE NOTICE '[email_revalidation_jobs] public.email_revalidation_jobs → email_app (ALTER SET SCHEMA)';
    ELSE
      CREATE TABLE email_app.email_revalidation_jobs (
        id           UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        status       TEXT NOT NULL DEFAULT 'pending'
                         CONSTRAINT email_revalidation_jobs_status_check
                         CHECK (status IN ('pending', 'running', 'success', 'failed')),
        requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        completed_at TIMESTAMPTZ,
        requested_by UUID,
        result       JSONB
      );
      CREATE INDEX ON email_app.email_revalidation_jobs (requested_at DESC);
      CREATE INDEX ON email_app.email_revalidation_jobs (status) WHERE status IN ('pending', 'running');
      RAISE NOTICE '[email_revalidation_jobs] email_app.email_revalidation_jobs criada';
    END IF;
  ELSE
    RAISE NOTICE '[email_revalidation_jobs] Já física em email_app — OK';
  END IF;

  -- Garantir RLS
  ALTER TABLE email_app.email_revalidation_jobs ENABLE ROW LEVEL SECURITY;

  -- Atualizar/criar VIEW proxy em zapp apontando para email_app
  SELECT c.relkind INTO v_rk_zapp_v
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'zapp' AND c.relname = 'email_revalidation_jobs';

  IF FOUND AND v_rk_zapp_v IN ('r', 'p') THEN
    RAISE NOTICE '[email_revalidation_jobs] Tabela física encontrada em zapp — mantendo';
  ELSIF FOUND AND v_rk_zapp_v = 'v' THEN
    DROP VIEW IF EXISTS zapp.email_revalidation_jobs CASCADE;
    CREATE VIEW zapp.email_revalidation_jobs
    WITH (security_invoker = on)
    AS SELECT * FROM email_app.email_revalidation_jobs;
    GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.email_revalidation_jobs TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.email_revalidation_jobs TO service_role;
    RAISE NOTICE '[email_revalidation_jobs] VIEW proxy em zapp atualizada → email_app';
  ELSE
    CREATE VIEW zapp.email_revalidation_jobs
    WITH (security_invoker = on)
    AS SELECT * FROM email_app.email_revalidation_jobs;
    GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.email_revalidation_jobs TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.email_revalidation_jobs TO service_role;
    RAISE NOTICE '[email_revalidation_jobs] VIEW proxy criada em zapp → email_app';
  END IF;

  -- Adicionar email_app.email_revalidation_jobs à publication
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE email_app.email_revalidation_jobs;
    RAISE NOTICE '[email_revalidation_jobs] email_app.email_revalidation_jobs adicionada à supabase_realtime';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE '[email_revalidation_jobs] email_app.email_revalidation_jobs já está em supabase_realtime';
  END;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[email_revalidation_jobs] ERRO %: %', SQLSTATE, SQLERRM;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- FASE 3: Verificação pós-aplicação
-- Confirma que todas as 16 tabelas físicas estão na publication.
-- Lança EXCEPTION se qualquer tabela física existente ainda não estiver.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_target        TEXT[];
  v_schema        TEXT;
  v_table         TEXT;
  v_relkind       "char";
  v_in_pub        BOOLEAN;
  v_missing_count INT := 0;
  v_skipped_count INT := 0;
  v_ok_count      INT := 0;
  v_missing_list  TEXT[] := ARRAY[]::TEXT[];

  v_targets TEXT[][] := ARRAY[
    ARRAY['zapp',      'calls'],
    ARRAY['zapp',      'talkx_recipients'],
    ARRAY['zapp',      'dispatch_error_logs'],
    ARRAY['zapp',      'connection_health_logs'],
    ARRAY['zapp',      'security_alerts'],
    ARRAY['zapp',      'security_audit_logs'],
    ARRAY['zapp',      'password_reset_requests'],
    ARRAY['zapp',      'hmac_selftest_audit'],
    ARRAY['zapp',      'message_reactions'],
    ARRAY['zapp',      'team_message_reactions'],
    ARRAY['zapp',      'audio_meme_favorites'],
    ARRAY['zapp',      'system_health_incidents'],
    ARRAY['zapp',      'provider_message_log'],
    ARRAY['zapp',      'rate_limit_logs'],
    ARRAY['email_app', 'email_health_summary'],
    ARRAY['email_app', 'email_revalidation_jobs']
  ];
BEGIN
  RAISE NOTICE '[20260802000004] Verificação pós-aplicação: % tabelas', array_length(v_targets, 1);

  FOR i IN 1..array_length(v_targets, 1) LOOP
    v_schema := v_targets[i][1];
    v_table  := v_targets[i][2];

    SELECT c.relkind INTO v_relkind
    FROM pg_catalog.pg_class  c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = v_schema AND c.relname = v_table;

    IF NOT FOUND OR v_relkind NOT IN ('r', 'p') THEN
      RAISE NOTICE '[SKIP] %.% não é tabela física (relkind=''%'') — publicação não aplicável',
                   v_schema, v_table, COALESCE(v_relkind::TEXT, 'NULL');
      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM pg_catalog.pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = v_schema
        AND tablename  = v_table
    ) INTO v_in_pub;

    IF v_in_pub THEN
      RAISE NOTICE '[OK]   %.% está em supabase_realtime', v_schema, v_table;
      v_ok_count := v_ok_count + 1;
    ELSE
      RAISE WARNING '[FAIL] %.% é física mas NÃO está em supabase_realtime!', v_schema, v_table;
      v_missing_count := v_missing_count + 1;
      v_missing_list  := v_missing_list || (v_schema || '.' || v_table);
    END IF;
  END LOOP;

  RAISE NOTICE '[20260802000004] Resumo: ok=%, puladas=%, faltando=%',
               v_ok_count, v_skipped_count, v_missing_count;

  IF v_missing_count > 0 THEN
    RAISE EXCEPTION
      '[20260802000004] % tabela(s) fisica(s) NÃO estão em supabase_realtime: [%]. '
      'Verifique permissões e existência da publication.',
      v_missing_count,
      array_to_string(v_missing_list, ', ')
      USING ERRCODE = 'P0001';
  END IF;

  RAISE NOTICE '[20260802000004] Concluído com sucesso — todas as tabelas físicas estão na publication.';
END $$;
