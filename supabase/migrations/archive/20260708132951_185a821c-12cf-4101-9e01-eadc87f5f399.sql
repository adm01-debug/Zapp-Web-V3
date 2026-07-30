-- 1) team_messages.status
ALTER TABLE public.team_messages
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'sent'
  CHECK (status IN ('sent','delivered','read','failed'));

CREATE INDEX IF NOT EXISTS idx_team_messages_status
  ON public.team_messages(status)
  WHERE status <> 'sent';

-- 2) automations — 4 colunas usadas por useAdminAutomations
ALTER TABLE public.automations
  ADD COLUMN IF NOT EXISTS priority         integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS cooldown_seconds integer NOT NULL DEFAULT 300,
  ADD COLUMN IF NOT EXISTS channel_id       uuid,
  ADD COLUMN IF NOT EXISTS department_id    uuid REFERENCES public.departments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_automations_priority       ON public.automations(priority);
CREATE INDEX IF NOT EXISTS idx_automations_department_id  ON public.automations(department_id) WHERE department_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_automations_channel_id     ON public.automations(channel_id)    WHERE channel_id    IS NOT NULL;

COMMENT ON COLUMN public.automations.priority IS 'Ordem de execução (menor = maior prioridade). Padrão 100.';
COMMENT ON COLUMN public.automations.cooldown_seconds IS 'Intervalo mínimo entre disparos consecutivos para o mesmo alvo.';
COMMENT ON COLUMN public.automations.channel_id IS 'Restringe execução a um canal (channel_connections.id). NULL = todos.';
COMMENT ON COLUMN public.automations.department_id IS 'Restringe execução a um departamento. NULL = todos.';
COMMENT ON COLUMN public.team_messages.status IS 'Status de entrega da mensagem interna: sent|delivered|read|failed.';