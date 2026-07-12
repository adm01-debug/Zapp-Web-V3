-- Update instance_registry table to match the 28-column specification
ALTER TABLE public.instance_registry 
ADD COLUMN IF NOT EXISTS slot_name VARCHAR,
ADD COLUMN IF NOT EXISTS department VARCHAR,
ADD COLUMN IF NOT EXISTS usage_type VARCHAR,
ADD COLUMN IF NOT EXISTS operator_name VARCHAR,
ADD COLUMN IF NOT EXISTS operator_email VARCHAR,
ADD COLUMN IF NOT EXISTS operator_since TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS operator_phone VARCHAR,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS max_concurrent_chats INTEGER DEFAULT 50,
ADD COLUMN IF NOT EXISTS sla_first_response_minutes INTEGER DEFAULT 30,
ADD COLUMN IF NOT EXISTS sla_resolution_hours INTEGER DEFAULT 24,
ADD COLUMN IF NOT EXISTS auto_reply_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS auto_reply_message TEXT,
ADD COLUMN IF NOT EXISTS business_hours_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS bitrix_integration JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS n8n_workflows JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Update existing column types/defaults if needed to align
ALTER TABLE public.instance_registry 
ALTER COLUMN instance_name SET DATA TYPE VARCHAR,
ALTER COLUMN display_name SET DATA TYPE VARCHAR,
ALTER COLUMN phone_number SET DATA TYPE VARCHAR;

-- Add check constraint for department if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_department') THEN
        ALTER TABLE public.instance_registry 
        ADD CONSTRAINT check_department 
        CHECK (department IN ('comercial', 'financeiro', 'compras', 'logistica', 'artes', 'gravacao', 'marketing', 'ti', 'sistema'));
    END IF;
END $$;

-- Add check constraint for usage_type
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_usage_type') THEN
        ALTER TABLE public.instance_registry 
        ADD CONSTRAINT check_usage_type 
        CHECK (usage_type IN ('individual', 'shared'));
    END IF;
END $$;
