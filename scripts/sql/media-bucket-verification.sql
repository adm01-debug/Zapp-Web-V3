-- =============================================================================
-- MEDIA-BUCKET-VERIFICATION - verificacao/monitoramento READ-ONLY do storage
-- =============================================================================
-- Contexto: incidente BUG-MEDIA-20260806 - bucket whatsapp-media ficou
-- privado por engano (migration LGPD P0-4, 20260801060001, aplicada 04/08);
-- media_urls publicas quebraram (18.494 objetos inacessiveis, storm de
-- refresh no frontend). Fix: migration 20260806193000_whatsapp_media_bucket_
-- public.sql (public=true + policy publica p/ anon + INSERT autenticado).
--
-- Este script congela o ESTADO ESPERADO pos-fix e permite detectar:
--   (a) regressao do flag public (bucket voltou a ser privado);
--   (b) drift de intencao em qualquer bucket conhecido;
--   (c) media_urls orfas (URL aponta para objeto inexistente no storage).
--
-- Estado esperado dos buckets (fonte: migrations 20260804000000 + BUG-38 +
-- fix 20260806193000):
--   public=true  (publicos por design): whatsapp-media, audio-messages,
--                 avatars, custom-emojis, recibos-entrega, stickers
--   public=false (privados por design): audio-memes, comprovantes-financeiro,
--                 email-attachments, etiquetas-remessa, fechamentos,
--                 quarantine, team-chat-files
--
-- NOTA: zapp.messages e uma VIEW (chain public.messages -> zapp.messages ->
-- evo.evolution_messages, security_invoker). Sem indice na view: as secoes
-- B/C fazem full scan de media_url - rodar sob demanda em horario de baixo
-- trafego. Para o guard periodico (cron), usar apenas a SECAO E (alerta) e a
-- SECAO G (gate fail-closed).
--
-- READ-ONLY: somente SELECT em storage.* e zapp.messages. Nenhum DML/DDL.
--
-- Uso:
--   Diagnostico completo (A-D):
--     psql "$SUPABASE_DB_URL" -f scripts/sql/media-bucket-verification.sql
--   Gate fail-closed (E+G, CI/guard):
--     psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/sql/media-bucket-verification.sql
--     -> exit != 0 + 'MEDIA_BUCKET_REGRESSION' se houver regressao.
--     -> 'MEDIA_BUCKET_VERIFICATION_OK' quando limpo.
-- =============================================================================

\set ON_ERROR_STOP on

-- =============================================================================
-- SECAO A - buckets: inventario completo + matriz esperado x real
-- =============================================================================

-- A1) Inventario: todos os buckets com flag public e limites.
SELECT b.name,
       b.public,
       b.file_size_limit,
       b.allowed_mime_types
FROM   storage.buckets b
ORDER  BY b.public DESC, b.name;

-- A2) Matriz de intencao: estado esperado x real por bucket conhecido.
--     status = OK | DRIFT (flag diverge da intencao) | MISSING (bucket nao existe)
--     DRIFT em bucket privado-por-design (public=true) = exposicao LGPD;
--     DRIFT em bucket publico-por-design (public=false) = regressao BUG-MEDIA.
WITH expected(name, should_be_public, intent) AS (
  VALUES
    ('whatsapp-media',          true,  'midia WhatsApp (imagens/videos/docs) - publico pos BUG-MEDIA fix 20260806193000'),
    ('audio-messages',          true,  'audios de mensagens - publico (BUG-38 re-aplicado 20260804000000)'),
    ('avatars',                 true,  'avatares de usuarios/contatos'),
    ('custom-emojis',           true,  'emojis customizados'),
    ('recibos-entrega',         true,  'recibos de entrega'),
    ('stickers',                true,  'stickers'),
    ('audio-memes',             false, 'privado por design'),
    ('comprovantes-financeiro', false, 'privado por design (LGPD)'),
    ('email-attachments',       false, 'privado por design (LGPD)'),
    ('etiquetas-remessa',       false, 'privado por design'),
    ('fechamentos',             false, 'privado por design'),
    ('quarantine',              false, 'privado por design (arquivos suspeitos)'),
    ('team-chat-files',         false, 'privado por design')
)
SELECT e.name,
       e.should_be_public AS expected_public,
       b.public           AS actual_public,
       CASE WHEN b.name IS NULL THEN 'MISSING'
            WHEN b.public IS DISTINCT FROM e.should_be_public THEN 'DRIFT'
            ELSE 'OK' END AS status,
       e.intent
FROM   expected e
LEFT   JOIN storage.buckets b ON b.name = e.name
ORDER  BY e.should_be_public DESC, e.name;

-- =============================================================================
-- SECAO B - mensagens com media_url: distribuicao por bucket e media_status
-- =============================================================================

-- B1) Mensagens com media_url, agrupadas por bucket extraido da URL.
--     Formato esperado: .../storage/v1/object/public/<bucket>/<path>
SELECT COALESCE(
         (regexp_match(m.media_url, '/object/(?:public|authenticated)/([^/]+)/'))[1],
         '(sem-bucket-reconhecido)'
       ) AS bucket,
       count(*) AS total_messages
FROM   zapp.messages m
WHERE  m.media_url IS NOT NULL
  AND  m.media_url <> ''
GROUP  BY 1
ORDER  BY 2 DESC;

-- B2) Mensagens com media_url, por media_status.
SELECT COALESCE(m.media_status, '(null)') AS media_status,
       count(*)                           AS total_messages
FROM   zapp.messages m
WHERE  m.media_url IS NOT NULL
  AND  m.media_url <> ''
GROUP  BY 1
ORDER  BY 2 DESC;

-- B3) media_status x bucket para os buckets de midia de conversa
--     (whatsapp-media / audio-messages) - leitura rapida de saude pos-fix.
SELECT COALESCE(
         (regexp_match(m.media_url, '/object/(?:public|authenticated)/([^/]+)/'))[1],
         '?'
       ) AS bucket,
       COALESCE(m.media_status, '(null)') AS media_status,
       count(*)                           AS total_messages
FROM   zapp.messages m
WHERE  m.media_url LIKE '%/whatsapp-media/%'
   OR  m.media_url LIKE '%/audio-messages/%'
GROUP  BY 1, 2
ORDER  BY 1, 3 DESC;

-- =============================================================================
-- SECAO C - media_urls orfas (URL referencia objeto inexistente no storage)
-- =============================================================================

-- C1) URLs do bucket whatsapp-media sem objeto correspondente em
--     storage.objects. Extrai o path apos /whatsapp-media/ na URL (query
--     string descartada via split_part) e faz LEFT JOIN por (bucket_id, name).
--     Orfa = arquivo deletado/movido/perdido. URLs signed (/object/sign/) e
--     CDN externa nao casam o padrao e caem fora (nao viram falso orfao).
--     0 linhas = saudavel.
WITH urls AS (
  SELECT m.id,
         m.whatsapp_message_id,
         m.instance_name,
         m.created_at,
         m.media_url,
         split_part(
           (regexp_match(m.media_url, '/object/(?:public|authenticated)/whatsapp-media/(.+)'))[1],
           '?', 1
         ) AS obj_path
  FROM   zapp.messages m
  WHERE  m.media_url LIKE '%/whatsapp-media/%'
)
SELECT u.id,
       u.whatsapp_message_id,
       u.instance_name,
       u.created_at,
       u.obj_path,
       u.media_url
FROM   urls u
LEFT   JOIN storage.objects o
       ON o.bucket_id = 'whatsapp-media'
      AND o.name = u.obj_path
WHERE  u.obj_path IS NOT NULL
  AND  o.name IS NULL
ORDER  BY u.created_at DESC
LIMIT  200;

-- C2) Resumo de orfaos por bucket (todos os buckets referenciados em URLs).
--     FULL SCAN pesado sobre media_url - rodar sob demanda (ex.: 1x/dia),
--     NAO no guard periodico de 15 min.
WITH urls AS (
  SELECT (regexp_match(m.media_url, '/object/(?:public|authenticated)/([^/]+)/(.+)'))[1] AS bucket,
         split_part(
           (regexp_match(m.media_url, '/object/(?:public|authenticated)/([^/]+)/(.+)'))[2],
           '?', 1
         ) AS obj_path
  FROM   zapp.messages m
  WHERE  m.media_url LIKE '%/storage/v1/object/%'
)
SELECT u.bucket,
       count(*) AS orphan_urls
FROM   urls u
LEFT   JOIN storage.objects o
       ON o.bucket_id = u.bucket
      AND o.name = u.obj_path
WHERE  u.obj_path IS NOT NULL
  AND  o.name IS NULL
GROUP  BY u.bucket
ORDER  BY 2 DESC;

-- =============================================================================
-- SECAO D - contagem de objetos por bucket
-- =============================================================================
SELECT b.name,
       b.public,
       count(o.id) AS object_count
FROM   storage.buckets b
LEFT   JOIN storage.objects o ON o.bucket_id = b.name
GROUP  BY b.name, b.public
ORDER  BY object_count DESC, b.name;

-- =============================================================================
-- SECAO E - QUERY DE ALERTA (regressao do fix BUG-MEDIA)
-- =============================================================================
-- Deve retornar 0 linhas. Se retornar nome(s) de bucket = REGRESSAO: o bucket
-- voltou a ser privado e toda media_url publica quebrou de novo.
SELECT name
FROM   storage.buckets
WHERE  public = false
  AND  name IN ('whatsapp-media', 'audio-messages');

-- =============================================================================
-- SECAO G - gate fail-closed (padrao da casa: check-reference-integrity.sql)
-- =============================================================================
-- Com ON_ERROR_STOP=1, o RAISE EXCEPTION aborta o script (exit != 0) quando a
-- SECAO E detectar regressao. Uso em CI/workflow ou guard container.
DO $$
DECLARE
  v_regressed text[];
BEGIN
  SELECT array_agg(name ORDER BY name)
    INTO v_regressed
  FROM   storage.buckets
  WHERE  public = false
    AND  name IN ('whatsapp-media', 'audio-messages');

  IF v_regressed IS NOT NULL THEN
    RAISE EXCEPTION 'MEDIA_BUCKET_REGRESSION: bucket(s) privado(s) indevidamente: %', array_to_string(v_regressed, ', ');
  END IF;

  RAISE NOTICE 'MEDIA_BUCKET_VERIFICATION: whatsapp-media e audio-messages estao public=true (OK)';
END $$;

SELECT 'MEDIA_BUCKET_VERIFICATION_OK' AS status;
