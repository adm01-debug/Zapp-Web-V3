-- =============================================================================
-- E06 — Assert & document Realtime publication state for evo root tables
-- =============================================================================
-- This migration is an ASSERTION, not a schema change.
-- It validates that evo.evolution_messages and evo.evolution_conversations
-- are in the supabase_realtime publication (as required by publish_via_partition_root=true).
-- If they are missing, it adds them; if already present, the DO block is a no-op.
--
-- Background:
--   supabase_realtime publication has publish_via_partition_root = true.
--   This means only the ROOT table emits CDC events — leaf partitions are silent.
--   evo.evolution_messages has 25 leaf partitions (one per instance/type).
--   evo.evolution_conversations also has leaf partitions.
--   Subscribing to any leaf partition (e.g. evolution_messages_wpp2) silently
--   produces zero events. The root table MUST be in the publication.
--
-- References: CLAUDE.md §4 Realtime rules; BUG-7 (failed_messages); BUG-24
-- =============================================================================

DO $$
DECLARE
  v_pub_exists   boolean;
  v_msgs_in_pub  boolean;
  v_convs_in_pub boolean;
BEGIN
  -- Verify supabase_realtime publication exists
  SELECT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) INTO v_pub_exists;

  IF NOT v_pub_exists THEN
    RAISE EXCEPTION
      'E06 ASSERT FAILED: publication supabase_realtime does not exist. '
      'Supabase Realtime is not configured on this instance.';
  END IF;

  -- Check evo.evolution_messages
  SELECT EXISTS (
    SELECT 1
    FROM pg_publication_rel pr
    JOIN pg_publication    p  ON p.oid = pr.prpubid
    JOIN pg_class          c  ON c.oid = pr.prrelid
    JOIN pg_namespace      n  ON n.oid = c.relnamespace
    WHERE p.pubname   = 'supabase_realtime'
      AND n.nspname   = 'evo'
      AND c.relname   = 'evolution_messages'
  ) INTO v_msgs_in_pub;

  IF NOT v_msgs_in_pub THEN
    RAISE NOTICE
      'E06: evo.evolution_messages not in supabase_realtime — adding now.';
    ALTER PUBLICATION supabase_realtime ADD TABLE evo.evolution_messages;
  ELSE
    RAISE NOTICE
      'E06: evo.evolution_messages already in supabase_realtime — no-op.';
  END IF;

  -- Check evo.evolution_conversations
  SELECT EXISTS (
    SELECT 1
    FROM pg_publication_rel pr
    JOIN pg_publication    p  ON p.oid = pr.prpubid
    JOIN pg_class          c  ON c.oid = pr.prrelid
    JOIN pg_namespace      n  ON n.oid = c.relnamespace
    WHERE p.pubname   = 'supabase_realtime'
      AND n.nspname   = 'evo'
      AND c.relname   = 'evolution_conversations'
  ) INTO v_convs_in_pub;

  IF NOT v_convs_in_pub THEN
    RAISE NOTICE
      'E06: evo.evolution_conversations not in supabase_realtime — adding now.';
    ALTER PUBLICATION supabase_realtime ADD TABLE evo.evolution_conversations;
  ELSE
    RAISE NOTICE
      'E06: evo.evolution_conversations already in supabase_realtime — no-op.';
  END IF;

  -- Final assertion: both must now be present
  SELECT EXISTS (
    SELECT 1
    FROM pg_publication_rel pr
    JOIN pg_publication p ON p.oid = pr.prpubid
    JOIN pg_class       c ON c.oid = pr.prrelid
    JOIN pg_namespace   n ON n.oid = c.relnamespace
    WHERE p.pubname = 'supabase_realtime'
      AND n.nspname = 'evo'
      AND c.relname = 'evolution_messages'
  ) INTO v_msgs_in_pub;

  SELECT EXISTS (
    SELECT 1
    FROM pg_publication_rel pr
    JOIN pg_publication p ON p.oid = pr.prpubid
    JOIN pg_class       c ON c.oid = pr.prrelid
    JOIN pg_namespace   n ON n.oid = c.relnamespace
    WHERE p.pubname = 'supabase_realtime'
      AND n.nspname = 'evo'
      AND c.relname = 'evolution_conversations'
  ) INTO v_convs_in_pub;

  IF NOT v_msgs_in_pub OR NOT v_convs_in_pub THEN
    RAISE EXCEPTION
      'E06 ASSERT FAILED: evo.evolution_messages in pub: %, evo.evolution_conversations in pub: %. '
      'Manual intervention required.',
      v_msgs_in_pub, v_convs_in_pub;
  END IF;

  RAISE NOTICE
    'E06 ASSERT PASSED: evo.evolution_messages and evo.evolution_conversations '
    'are in supabase_realtime publication with publish_via_partition_root=true. '
    'Realtime subscriptions must target these ROOT tables, never leaf partitions.';
END $$;

-- =============================================================================
-- Add COMMENT to document publication state for schema inspectors
-- =============================================================================
COMMENT ON TABLE evo.evolution_messages IS
  'Partitioned root table for WhatsApp messages. 25 leaf partitions by instance/type. '
  'REALTIME: in supabase_realtime publication (publish_via_partition_root=true). '
  'Subscribe to this root — leaf partitions (e.g. evolution_messages_wpp2) are SILENT. '
  'In schema zapp this exists as a security_invoker VIEW; for Realtime use schema:evo.';

COMMENT ON TABLE evo.evolution_conversations IS
  'Partitioned root table for WhatsApp conversations. Leaf partitions by instance. '
  'REALTIME: in supabase_realtime publication (publish_via_partition_root=true). '
  'Subscribe to this root — leaf partitions are SILENT. '
  'In schema zapp this exists as a security_invoker VIEW; for Realtime use schema:evo.';
