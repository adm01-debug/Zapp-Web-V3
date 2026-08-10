-- migration: 20260810120000_populate_media_bucket_path
-- autor: Claude / Sessão 2026-08-10
-- descrição: Popula media_bucket + media_path em evolution_messages_wpp2
--            e storage_bucket + storage_path_clean em evolution_media
--            a partir das URLs absolutas do Supabase Storage (ADR-001).
-- executado em prod: 2026-08-10 via supabase_db_batch_query
-- resultado: 6.697 linhas wpp2 + 7.602 linhas evolution_media populadas
--            + 7.102 media_status 'unknown' corrigidos para ready/expired
-- estado final: 8.517 ready | 8.702 expired | 0 unknown

-- 1) evolution_messages_wpp2: bucket + path
UPDATE evo.evolution_messages_wpp2
SET
  media_bucket = CASE
    WHEN media_url ILIKE '%supabase.atomicabr.com.br%/whatsapp-media/%' THEN 'whatsapp-media'
    WHEN media_url ILIKE '%supabase.atomicabr.com.br%/audio-messages/%' THEN 'audio-messages'
  END,
  media_path = CASE
    WHEN media_url ILIKE '%supabase.atomicabr.com.br%/whatsapp-media/%'
      THEN regexp_replace(media_url, '^.*?/whatsapp-media/', '')
    WHEN media_url ILIKE '%supabase.atomicabr.com.br%/audio-messages/%'
      THEN regexp_replace(media_url, '^.*?/audio-messages/', '')
  END
WHERE
  media_bucket IS NULL
  AND (
    media_url ILIKE '%supabase.atomicabr.com.br%/whatsapp-media/%'
    OR media_url ILIKE '%supabase.atomicabr.com.br%/audio-messages/%'
  );

-- 2) evolution_media: storage_bucket + storage_path_clean
UPDATE evo.evolution_media
SET
  storage_bucket = CASE
    WHEN storage_url ILIKE '%supabase.atomicabr.com.br%/whatsapp-media/%' THEN 'whatsapp-media'
    WHEN storage_url ILIKE '%supabase.atomicabr.com.br%/audio-messages/%' THEN 'audio-messages'
  END,
  storage_path_clean = CASE
    WHEN storage_url ILIKE '%supabase.atomicabr.com.br%/whatsapp-media/%'
      THEN regexp_replace(storage_url, '^.*?/whatsapp-media/', '')
    WHEN storage_url ILIKE '%supabase.atomicabr.com.br%/audio-messages/%'
      THEN regexp_replace(storage_url, '^.*?/audio-messages/', '')
  END
WHERE
  storage_bucket IS NULL
  AND (
    storage_url ILIKE '%supabase.atomicabr.com.br%/whatsapp-media/%'
    OR storage_url ILIKE '%supabase.atomicabr.com.br%/audio-messages/%'
  );

-- 3) Backfill media_status 'unknown'
UPDATE evo.evolution_media
SET media_status = CASE
  WHEN storage_url ILIKE '%mmg.whatsapp.net%'
    OR storage_url ILIKE '%pps.whatsapp.net%'
    OR storage_url ILIKE '%media.whatsapp.net%'
    THEN 'expired'
  WHEN storage_url ILIKE '%zapp-media-proxy%'
    OR storage_url ILIKE '%r2.cloudflarestorage%'
    THEN 'ready'
  ELSE 'expired'
END
WHERE media_status = 'unknown';
