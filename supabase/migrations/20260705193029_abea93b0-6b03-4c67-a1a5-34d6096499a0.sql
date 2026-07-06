-- Adiciona políticas RLS explícitas de "deny-all" nas tabelas do schema evo.
-- Motivo: essas tabelas só são acessíveis via edge function `external-db-proxy` usando service_role (que bypassa RLS).
-- Sem políticas explícitas, o linter alerta "RLS Enabled No Policy" mesmo o acesso já sendo negado por default.
-- Uma policy explícita usando "false" documenta a intenção e elimina o warning.

DO $$
DECLARE
  t text;
  evo_tables text[] := ARRAY[
    'evolution_alerts',
    'evolution_audit_log',
    'evolution_calls',
    'evolution_contacts',
    'evolution_conversations',
    'evolution_label_associations',
    'evolution_labels',
    'evolution_messages',
    'evolution_reactions',
    'evolution_realtime_events',
    'evolution_settings',
    'evolution_webhook_events',
    'evolution_webhook_events_wpp2',
    'evolution_whatsapp_status'
  ];
BEGIN
  FOREACH t IN ARRAY evo_tables LOOP
    -- Só cria a policy se a tabela realmente existir no schema evo
    IF EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'evo' AND c.relname = t AND c.relkind = 'r'
    ) THEN
      EXECUTE format(
        'DROP POLICY IF EXISTS "deny_anon_authenticated" ON evo.%I;',
        t
      );
      EXECUTE format(
        'CREATE POLICY "deny_anon_authenticated" ON evo.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);',
        t
      );
    END IF;
  END LOOP;
END$$;