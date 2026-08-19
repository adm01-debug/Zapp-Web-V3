-- Migration: índices para FK sem índice detectadas em auditoria 2026-08-13
-- Aplicados via CREATE INDEX CONCURRENTLY diretamente no banco.
-- Este arquivo documenta os índices para reprodução em ambientes novos.
-- Agente: audit-agent (sessão pós-merge PR#1071)

-- zapp.evolution_calls: FK fk_calls_contact (contact_id)
CREATE INDEX IF NOT EXISTS idx_evolution_calls_contact_id
  ON zapp.evolution_calls(contact_id);

-- zapp.evolution_notifications: FK fk_notifications_contact (contact_id)
CREATE INDEX IF NOT EXISTS idx_evolution_notifications_contact_id
  ON zapp.evolution_notifications(contact_id);

-- zapp.evolution_tasks: FK fk_tasks_contact (contact_id)
CREATE INDEX IF NOT EXISTS idx_evolution_tasks_contact_id
  ON zapp.evolution_tasks(contact_id);

-- zapp.evolution_notification_outbox: FK evolution_notification_outbox_notification_id_fkey (notification_id)
CREATE INDEX IF NOT EXISTS idx_evolution_notification_outbox_notification_id
  ON zapp.evolution_notification_outbox(notification_id);

-- zapp.evolution_instance_credentials: FK evolution_instance_credentials_vault_secret_id_fkey (vault_secret_id)
CREATE INDEX IF NOT EXISTS idx_evolution_instance_credentials_vault_secret_id
  ON zapp.evolution_instance_credentials(vault_secret_id)
  WHERE vault_secret_id IS NOT NULL;

-- zapp.cron_inventory: FK cron_inventory_replaced_by_fkey (replaced_by)
CREATE INDEX IF NOT EXISTS idx_cron_inventory_replaced_by
  ON zapp.cron_inventory(replaced_by)
  WHERE replaced_by IS NOT NULL;
