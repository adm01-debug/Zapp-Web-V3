-- Migration: automations — adiciona priority, cooldown_seconds, channel_id, department_id
-- Decisão de produto: confirmado CRIAR (sessão 2026-07-07)
-- Contexto: colunas existiam na UI mas não no schema → save causava PostgREST 400 (silenciado
--           por casts); adjustPriority corrompia trigger_count. Agora ambos funcionam corretamente.

-- 1. Colunas na tabela base
ALTER TABLE zapp.automations
  ADD COLUMN IF NOT EXISTS priority          smallint  NOT NULL DEFAULT 100
    CONSTRAINT automations_priority_range CHECK (priority BETWEEN 1 AND 999),
  ADD COLUMN IF NOT EXISTS cooldown_seconds  integer   NOT NULL DEFAULT 300
    CONSTRAINT automations_cooldown_non_neg CHECK (cooldown_seconds >= 0),
  ADD COLUMN IF NOT EXISTS channel_id        uuid
    REFERENCES zapp.service_channels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS department_id     uuid
    REFERENCES public.departments(id)    ON DELETE SET NULL;

-- 2. Índice parcial: avaliação de regras ativas por prioridade (hot path do engine)
CREATE INDEX IF NOT EXISTS idx_automations_priority
  ON zapp.automations(priority)
  WHERE is_active = true;

-- 3. Comentários
COMMENT ON COLUMN zapp.automations.priority         IS 'Ordem de avaliacao das regras (1=mais alta). Padrao 100.';
COMMENT ON COLUMN zapp.automations.cooldown_seconds IS 'Intervalo minimo entre disparos para mesma conversa (s). Padrao 300.';
COMMENT ON COLUMN zapp.automations.channel_id       IS 'Canal restrito; NULL = todos os canais.';
COMMENT ON COLUMN zapp.automations.department_id    IS 'Departamento restrito; NULL = todos os departamentos.';

-- 4. Recria a view public.automations expondo as 4 novas colunas
--    (DROP+CREATE necessário: PostgreSQL não permite reordenar colunas via CREATE OR REPLACE)
DROP VIEW IF EXISTS public.automations;
CREATE VIEW public.automations
WITH (security_invoker = on) AS
SELECT
  a.id,
  a.name,
  a.description,
  a.is_active,
  a.trigger_type,
  a.trigger_config,
  a.actions,
  a.priority,
  a.cooldown_seconds,
  a.channel_id,
  a.department_id,
  a.trigger_count,
  a.last_triggered_at,
  a.created_by,
  a.created_at,
  a.updated_at
FROM zapp.automations a;
