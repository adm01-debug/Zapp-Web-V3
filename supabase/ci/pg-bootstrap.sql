-- =============================================================================
-- Supabase compatibility bootstrap for CI migration smoke tests
--
-- Simulates the Supabase platform prerequisites so migrations can run
-- against a vanilla Postgres 16 container without the full GoTrue / Kong /
-- Storage stack. Goal: catch SQL errors (syntax, missing tables, wrong column
-- names, bad constraints) before they reach the production database.
--
-- This is NOT a replacement for testing against the real Supabase instance.
-- It is a fast, offline gate to stop obvious breakage early.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Core extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- pg_cron and pg_net are Supabase-specific and may not be available in
-- vanilla Postgres. Create stub schemas so migrations that reference them
-- gracefully skip rather than aborting with "extension not found".
CREATE SCHEMA IF NOT EXISTS cron;
CREATE SCHEMA IF NOT EXISTS net;

-- Minimal cron.job stub (some migrations CREATE OR REPLACE on this)
CREATE TABLE IF NOT EXISTS cron.job (
  jobid    bigint PRIMARY KEY,
  schedule text,
  command  text,
  nodename text,
  nodeport int,
  database text,
  username text,
  active   bool,
  jobname  text
);

-- ---------------------------------------------------------------------------
-- 2. Supabase roles (GoTrue / PostgREST / Storage roles)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    CREATE ROLE supabase_admin NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    CREATE ROLE supabase_auth_admin NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_storage_admin') THEN
    CREATE ROLE supabase_storage_admin NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dashboard_user') THEN
    CREATE ROLE dashboard_user NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pgsodium_keyholder') THEN
    CREATE ROLE pgsodium_keyholder NOLOGIN NOINHERIT;
  END IF;
END;
$$;

GRANT anon TO postgres;
GRANT authenticated TO postgres;
GRANT service_role TO postgres;

-- ---------------------------------------------------------------------------
-- 3. auth schema — minimal GoTrue compatibility surface
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS auth;

-- Minimal auth.users table (GoTrue owns this in production)
CREATE TABLE IF NOT EXISTS auth.users (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text        UNIQUE,
  encrypted_password text,
  email_confirmed_at timestamptz,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  raw_app_meta_data  jsonb    DEFAULT '{}'::jsonb,
  raw_user_meta_data jsonb    DEFAULT '{}'::jsonb,
  is_super_admin  bool        DEFAULT false,
  role            text        DEFAULT 'authenticated',
  aud             text        DEFAULT 'authenticated'
);

-- auth.uid() — returns NULL (no active session in migrations)
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULL::uuid; $$;

-- auth.role() — returns 'anon' (no active session)
CREATE OR REPLACE FUNCTION auth.role() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT 'anon'::text; $$;

-- auth.email() — returns NULL
CREATE OR REPLACE FUNCTION auth.email() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT NULL::text; $$;

-- auth.jwt() — returns empty JSONB
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
  LANGUAGE sql STABLE
  AS $$ SELECT '{}'::jsonb; $$;

-- ---------------------------------------------------------------------------
-- 4. extensions schema (Supabase puts some extensions here)
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS extensions;

-- ---------------------------------------------------------------------------
-- 5. storage schema stub (referenced by some RLS policies)
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets (
  id                  text PRIMARY KEY,
  name                text NOT NULL,
  public              bool NOT NULL DEFAULT false,
  file_size_limit     bigint,
  allowed_mime_types  text[],
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  owner               uuid,
  owner_id            text
);
CREATE TABLE IF NOT EXISTS storage.objects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id   text REFERENCES storage.buckets(id),
  name        text,
  owner       uuid,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  metadata    jsonb
);
CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[]
  LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array(name, '/'); $$;
CREATE OR REPLACE FUNCTION storage.filename(name text) RETURNS text
  LANGUAGE sql IMMUTABLE AS $$ SELECT (string_to_array(name, '/') )[array_length(string_to_array(name, '/'), 1)]; $$;
CREATE OR REPLACE FUNCTION storage.extension(name text) RETURNS text
  LANGUAGE sql IMMUTABLE AS $$ SELECT reverse(split_part(reverse(name), '.', 1)); $$;

-- ---------------------------------------------------------------------------
-- 6. Grant usage on commonly granted schemas
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Migrations may create cron.schedule() calls. Stub it so they don't abort.
CREATE OR REPLACE FUNCTION cron.schedule(schedule_name text, schedule text, command text)
  RETURNS bigint LANGUAGE sql AS $$ SELECT 0::bigint; $$;
CREATE OR REPLACE FUNCTION cron.schedule(schedule text, command text)
  RETURNS bigint LANGUAGE sql AS $$ SELECT 0::bigint; $$;
CREATE OR REPLACE FUNCTION cron.unschedule(schedule_name text)
  RETURNS bool LANGUAGE sql AS $$ SELECT true; $$;
CREATE OR REPLACE FUNCTION cron.unschedule(jobid bigint)
  RETURNS bool LANGUAGE sql AS $$ SELECT true; $$;

-- net.http_post stub (pg_net calls in migrations)
CREATE OR REPLACE FUNCTION net.http_post(url text, body jsonb DEFAULT NULL, headers jsonb DEFAULT NULL, timeout_milliseconds int DEFAULT 5000)
  RETURNS bigint LANGUAGE sql AS $$ SELECT 0::bigint; $$;

-- ---------------------------------------------------------------------------
-- 7. Supabase Realtime publication stub
-- ---------------------------------------------------------------------------
-- Migrations use ALTER PUBLICATION supabase_realtime ADD TABLE ...
-- This publication doesn't exist in vanilla Postgres 16.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'logflare_pub') THEN
    CREATE PUBLICATION logflare_pub;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. pgsodium stub (some migrations reference pgsodium.create_key etc.)
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS pgsodium;
CREATE OR REPLACE FUNCTION pgsodium.create_key(key_type text DEFAULT 'aead-det', name text DEFAULT NULL, raw_key bytea DEFAULT NULL, raw_key_nonce bytea DEFAULT NULL, parent_key uuid DEFAULT NULL, comment text DEFAULT NULL, expires timestamptz DEFAULT NULL, associated_data text DEFAULT '')
  RETURNS TABLE(id uuid, name text, status text, key_type text, key_id bigint, key_context bytea, created timestamptz, expires timestamptz, comment text)
  LANGUAGE sql AS $$ SELECT gen_random_uuid(), '', 'valid', 'aead-det', 1, ''::bytea, now(), NULL::timestamptz, ''; $$;
CREATE OR REPLACE FUNCTION pgsodium.server_key_id() RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid(); $$;
