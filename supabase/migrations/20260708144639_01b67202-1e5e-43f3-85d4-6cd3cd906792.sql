-- Converte warroom_alerts.alert_type de text livre para enum tipado
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'warroom_alert_type') THEN
    CREATE TYPE public.warroom_alert_type AS ENUM ('info', 'warning', 'critical', 'sla_breach');
  END IF;
END $$;

-- Normaliza valores fora do enum (defensivo; tabela hoje está vazia)
UPDATE public.warroom_alerts
   SET alert_type = 'warning'
 WHERE alert_type NOT IN ('info','warning','critical','sla_breach');

-- Remove default text antes de alterar tipo
ALTER TABLE public.warroom_alerts ALTER COLUMN alert_type DROP DEFAULT;

ALTER TABLE public.warroom_alerts
  ALTER COLUMN alert_type TYPE public.warroom_alert_type
  USING alert_type::public.warroom_alert_type;

ALTER TABLE public.warroom_alerts
  ALTER COLUMN alert_type SET DEFAULT 'warning'::public.warroom_alert_type;