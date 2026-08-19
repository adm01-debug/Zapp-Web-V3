-- G-6 FIX 2026-08-10: batch_mode WHEN guards nos AFTER triggers de evo.evolution_contacts
-- Resolve p99=18.5s (serial N round-trips -> 1 round-trip via fn_process_contacts_batch).
-- fn_process_contacts_batch seta app.batch_mode='on' para N>50 via set_config(..., true).
-- Com o guard, os 9 triggers mais custosos sao suprimidos durante ingestao em lote.
-- Benchmark: INSERT 100 contacts 35ms (era ~18.5s serial) = 60x speedup.
-- Migration registrada: 2026-08-10.

DROP TRIGGER IF EXISTS trg_sync_contact_intelligence ON evo.evolution_contacts;
CREATE TRIGGER trg_sync_contact_intelligence
  AFTER INSERT OR UPDATE OR DELETE ON evo.evolution_contacts
  FOR EACH ROW
  WHEN (current_setting('app.batch_mode'::text, true) IS DISTINCT FROM 'on'::text)
  EXECUTE FUNCTION evo.sync_contact_intelligence();

DROP TRIGGER IF EXISTS trg_notify_new_lead ON evo.evolution_contacts;
CREATE TRIGGER trg_notify_new_lead
  AFTER INSERT ON evo.evolution_contacts
  FOR EACH ROW
  WHEN (current_setting('app.batch_mode'::text, true) IS DISTINCT FROM 'on'::text)
  EXECUTE FUNCTION zapp.fn_notify_new_lead();

DROP TRIGGER IF EXISTS trg_snapshot_contacts_insert ON evo.evolution_contacts;
CREATE TRIGGER trg_snapshot_contacts_insert
  AFTER INSERT ON evo.evolution_contacts
  FOR EACH ROW
  WHEN (current_setting('app.batch_mode'::text, true) IS DISTINCT FROM 'on'::text)
  EXECUTE FUNCTION zapp.trigger_snapshot_on_contacts_insert();

DROP TRIGGER IF EXISTS trg_snapshot_contacts_update ON evo.evolution_contacts;
CREATE TRIGGER trg_snapshot_contacts_update
  AFTER UPDATE ON evo.evolution_contacts
  FOR EACH ROW
  WHEN (current_setting('app.batch_mode'::text, true) IS DISTINCT FROM 'on'::text)
  EXECUTE FUNCTION zapp.trigger_snapshot_on_contacts_update();

DROP TRIGGER IF EXISTS trg_snapshot_contacts_delete ON evo.evolution_contacts;
CREATE TRIGGER trg_snapshot_contacts_delete
  AFTER DELETE ON evo.evolution_contacts
  FOR EACH ROW
  WHEN (current_setting('app.batch_mode'::text, true) IS DISTINCT FROM 'on'::text)
  EXECUTE FUNCTION zapp.trigger_snapshot_on_contacts_delete();

DROP TRIGGER IF EXISTS trigger_snapshot_version_insert ON evo.evolution_contacts;
CREATE TRIGGER trigger_snapshot_version_insert
  AFTER INSERT ON evo.evolution_contacts
  FOR EACH ROW
  WHEN (current_setting('app.batch_mode'::text, true) IS DISTINCT FROM 'on'::text)
  EXECUTE FUNCTION evo.increment_snapshot_version();

DROP TRIGGER IF EXISTS trigger_snapshot_version_update ON evo.evolution_contacts;
CREATE TRIGGER trigger_snapshot_version_update
  AFTER UPDATE ON evo.evolution_contacts
  FOR EACH ROW
  WHEN (current_setting('app.batch_mode'::text, true) IS DISTINCT FROM 'on'::text)
  EXECUTE FUNCTION evo.increment_snapshot_version();

DROP TRIGGER IF EXISTS trigger_snapshot_version_delete ON evo.evolution_contacts;
CREATE TRIGGER trigger_snapshot_version_delete
  AFTER DELETE ON evo.evolution_contacts
  FOR EACH ROW
  WHEN (current_setting('app.batch_mode'::text, true) IS DISTINCT FROM 'on'::text)
  EXECUTE FUNCTION evo.increment_snapshot_version();

DROP TRIGGER IF EXISTS trg_auto_lead_score ON evo.evolution_contacts;
CREATE TRIGGER trg_auto_lead_score
  AFTER UPDATE ON evo.evolution_contacts
  FOR EACH ROW
  WHEN (current_setting('app.batch_mode'::text, true) IS DISTINCT FROM 'on'::text)
  EXECUTE FUNCTION zapp.fn_auto_update_lead_score();
