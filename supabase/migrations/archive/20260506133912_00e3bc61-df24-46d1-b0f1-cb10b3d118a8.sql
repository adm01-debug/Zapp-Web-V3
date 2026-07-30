ALTER TABLE public.business_hours ADD COLUMN IF NOT EXISTS instance_name TEXT;
-- Migrar dados se necessário ou limpar para o novo padrão multi-instância
ALTER TABLE public.business_hours DROP CONSTRAINT IF EXISTS business_hours_instance_name_day_of_week_key;
ALTER TABLE public.business_hours ADD CONSTRAINT business_hours_instance_name_day_of_week_key UNIQUE(instance_name, day_of_week);

-- Ajustar nomes de colunas para o padrão da função fn_add_business_minutes se necessário
-- (A função usa start_time/end_time/is_enabled)
ALTER TABLE public.business_hours RENAME COLUMN open_time TO start_time;
ALTER TABLE public.business_hours RENAME COLUMN close_time TO end_time;
ALTER TABLE public.business_hours RENAME COLUMN is_open TO is_enabled;
