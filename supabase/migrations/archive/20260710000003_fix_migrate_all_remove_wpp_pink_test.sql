-- Fix evo.fn_migrate_all_message_tables: remove dropped table 'wpp_pink_test' from hardcoded arrays.
--
-- The table evolution_messages_wpp_pink_test was dropped from the evo schema (session 3/4).
-- fn_migrate_all_message_tables still references it in both v_tables[] and v_instances[].
-- The function guards against non-existent tables via `IF NOT EXISTS (...)`, so this is latent
-- (won't crash), but the stale reference is misleading and should be cleaned up.
--
-- Change: remove index 2 ('evolution_messages_wpp_pink_test' / 'wpp_pink_test') from both arrays.

CREATE OR REPLACE FUNCTION evo.fn_migrate_all_message_tables(
  p_batch_size integer DEFAULT 5000,
  p_max_batches integer DEFAULT 9999
)
RETURNS TABLE(source_table text, instance_name text, total_migrated bigint, batches_ran integer, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'evo', 'monitoring', 'extensions'
AS $function$
DECLARE
  v_tables TEXT[] := ARRAY[
    'evolution_messages_wpp2',
    'evolution_messages_default',
    'evolution_messages_artes',
    'evolution_messages_compras',
    'evolution_messages_financeiro',
    'evolution_messages_gravacao',
    'evolution_messages_logistica',
    'evolution_messages_marketing',
    'evolution_messages',
    'evolution_messages_comercial_01',
    'evolution_messages_comercial_02',
    'evolution_messages_comercial_03',
    'evolution_messages_comercial_04',
    'evolution_messages_comercial_05',
    'evolution_messages_comercial_06',
    'evolution_messages_comercial_07',
    'evolution_messages_comercial_08',
    'evolution_messages_comercial_09',
    'evolution_messages_comercial_10',
    'evolution_messages_comercial_11',
    'evolution_messages_comercial_12',
    'evolution_messages_comercial_13',
    'evolution_messages_comercial_14',
    'evolution_messages_comercial_15'
  ];
  v_instances TEXT[] := ARRAY[
    'wpp2',
    'default',
    'artes',
    'compras',
    'financeiro',
    'gravacao',
    'logistica',
    'marketing',
    'main',
    'comercial_01',
    'comercial_02',
    'comercial_03',
    'comercial_04',
    'comercial_05',
    'comercial_06',
    'comercial_07',
    'comercial_08',
    'comercial_09',
    'comercial_10',
    'comercial_11',
    'comercial_12',
    'comercial_13',
    'comercial_14',
    'comercial_15'
  ];
  i INT;
  v_offset BIGINT;
  v_batch_ct INT;
  v_total BIGINT;
  v_migrated INT;
  v_next_off BIGINT;
  v_dur INT;
  v_stat TEXT;
BEGIN
  FOR i IN 1..array_length(v_tables,1) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema='evo' AND table_name=v_tables[i]
    ) THEN
      RETURN QUERY SELECT v_tables[i], v_instances[i], 0::BIGINT, 0, '⏭️ inexistente';
      CONTINUE;
    END IF;
    v_offset := 0;
    v_batch_ct := 0;
    v_total := 0;
    LOOP
      EXIT WHEN v_batch_ct >= p_max_batches;
      SELECT m.migrated_count, m.next_offset, m.duration_ms, m.status
      INTO v_migrated, v_next_off, v_dur, v_stat
      FROM evo.fn_migrate_messages_batch(v_tables[i], v_instances[i], p_batch_size, v_offset) m;
      v_total := v_total + COALESCE(v_migrated, 0);
      v_batch_ct := v_batch_ct + 1;
      EXIT WHEN COALESCE(v_migrated, 0) < p_batch_size;
      v_offset := v_next_off;
    END LOOP;
    RETURN QUERY SELECT v_tables[i], v_instances[i], v_total, v_batch_ct,
      CASE WHEN v_total > 0 THEN '✅ migrado' ELSE '⏹️ vazio_ou_skip' END;
  END LOOP;
END;
$function$;
