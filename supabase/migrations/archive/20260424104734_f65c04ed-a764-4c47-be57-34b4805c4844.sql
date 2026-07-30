ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS retry_attempt smallint,
  ADD COLUMN IF NOT EXISTS retry_total smallint;

COMMENT ON COLUMN public.messages.retry_attempt IS 'Última tentativa de envio registrada (1..retry_total). Persistido para sobreviver a reload.';
COMMENT ON COLUMN public.messages.retry_total IS 'Total de tentativas configurado para o envio (MAX_RETRIES no messageSender).';