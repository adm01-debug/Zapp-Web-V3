-- 20260801020001 — Dedup: merge de contatos duplicados (auditoria etapas 28-31)
-- Aplicado em producao: 2026-08-01
-- Contexto: 502 grupos de (phone_number, instance_name) duplicados — pares remote_jid @s.whatsapp.net (canonico)
-- vs @lid (business identity). Survivor = linha @s (nome presente, criacao mais antiga).
-- Dry-run: 502 survivors, 503 linhas a mergear.
-- Backup: evo._evolution_contacts_backup_20260801
-- Rollback: script inverso em _contact_merge_map_20260801 (UPDATE contact_id=merged_id FROM map) + reinsert dos contatos do backup

BEGIN;

-- 1. Backup completo
CREATE TABLE IF NOT EXISTS evo._evolution_contacts_backup_20260801 AS SELECT * FROM evo.evolution_contacts;

-- 2. Merge map (PK = merged_id: cada merged tem 1 survivor — grupos de 3+ linhas
--    geram multiplos merged para o MESMO survivor, entao survivor_id nao e unico)
CREATE TABLE IF NOT EXISTS zapp._contact_merge_map_20260801 (
  merged_id   uuid PRIMARY KEY,
  survivor_id uuid NOT NULL,
  phone_number text,
  instance_name text,
  merged_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE zapp._contact_merge_map_20260801 ENABLE ROW LEVEL SECURITY;

INSERT INTO zapp._contact_merge_map_20260801 (survivor_id, merged_id, phone_number, instance_name)
WITH dup AS (
  SELECT phone_number, instance_name
  FROM evo.evolution_contacts
  WHERE phone_number IS NOT NULL
  GROUP BY phone_number, instance_name
  HAVING count(*) > 1
),
ranked AS (
  SELECT c.id, c.phone_number, c.instance_name,
    row_number() OVER (PARTITION BY c.phone_number, c.instance_name
      ORDER BY (c.remote_jid LIKE '%@s.whatsapp.net') DESC, c.created_at ASC) AS rn
  FROM evo.evolution_contacts c
  JOIN dup d ON d.phone_number = c.phone_number AND d.instance_name = c.instance_name
)
SELECT survivor.id AS survivor_id, merged.id AS merged_id, survivor.phone_number, survivor.instance_name
FROM ranked survivor
JOIN ranked merged ON merged.phone_number = survivor.phone_number
  AND merged.instance_name = survivor.instance_name
  AND survivor.rn = 1 AND merged.rn > 1;

-- 3. Reapontar dependentes (SQL dinamico por FK)
DO $$
DECLARE
  rec record;
  uk record;
  extra_cols text;
BEGIN
  FOR rec IN (
    SELECT DISTINCT n.nspname AS schemaname, c.relname AS tablename, c.relkind
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.contype = 'f' AND con.confrelid = 'evo.evolution_contacts'::regclass
      AND NOT EXISTS (SELECT 1 FROM pg_inherits i WHERE i.inhrelid = c.oid) -- so raizes/nao-particoes
  ) LOOP
    -- 3a. Tabelas com UNIQUE envolvendo contact_id: deletar colisoes (linha do merged cuja chave composta ja existe no survivor)
    FOR uk IN (
      SELECT i.indkey::smallint[] AS attnums
      FROM pg_index i
      WHERE i.indrelid = (rec.schemaname || '.' || rec.tablename)::regclass
        AND i.indisunique AND NOT i.indisprimary
    ) LOOP
      SELECT string_agg('t1.' || quote_ident(a.attname) || ' IS NOT DISTINCT FROM t2.' || quote_ident(a.attname), ' AND ')
      INTO extra_cols
      FROM unnest(uk.attnums) WITH ORDINALITY AS u(attnum, ord)
      JOIN pg_attribute a ON a.attrelid = (rec.schemaname || '.' || rec.tablename)::regclass AND a.attnum = u.attnum
      WHERE a.attname <> 'contact_id';
      IF extra_cols IS NOT NULL AND extra_cols <> '' THEN
        EXECUTE format('DELETE FROM %I.%I t1 USING zapp._contact_merge_map_20260801 m, %I.%I t2 WHERE t1.contact_id = m.merged_id AND t2.contact_id = m.survivor_id AND (%s)',
          rec.schemaname, rec.tablename, rec.schemaname, rec.tablename, extra_cols);
      ELSE
        EXECUTE format('DELETE FROM %I.%I t1 USING zapp._contact_merge_map_20260801 m WHERE t1.contact_id = m.merged_id AND EXISTS (SELECT 1 FROM %I.%I t2 WHERE t2.contact_id = m.survivor_id)',
          rec.schemaname, rec.tablename, rec.schemaname, rec.tablename);
      END IF;
    END LOOP;

    -- 3b. Reapontar
    EXECUTE format('UPDATE %I.%I t SET contact_id = m.survivor_id FROM zapp._contact_merge_map_20260801 m WHERE t.contact_id = m.merged_id',
      rec.schemaname, rec.tablename);
    RAISE NOTICE 'Mergeado: %.%', rec.schemaname, rec.tablename;
  END LOOP;
END $$;

-- 4. Graveyard
INSERT INTO zapp.contact_id_graveyard (deleted_contact_id, original_workspace_id, deleted_at, expiration_date, reason)
SELECT merged_id, survivor_id, now(), now() + interval '90 days', 'dedup_20260801'
FROM zapp._contact_merge_map_20260801;

-- 5. Deletar merged (nenhum dependente aponta mais — FKs satisfeitas)
DELETE FROM evo.evolution_contacts c USING zapp._contact_merge_map_20260801 m WHERE c.id = m.merged_id;

COMMIT;

-- Validacao pos-aplicacao:
-- SELECT count(*) FROM evo.evolution_contacts;  -- = antes - 503
-- SELECT count(*) FROM zapp._contact_merge_map_20260801;  -- = 503 (ou 502)
-- SELECT count(*) FROM evo.evolution_contacts c
--   JOIN zapp._contact_merge_map_20260801 m ON c.id = m.merged_id;  -- = 0
