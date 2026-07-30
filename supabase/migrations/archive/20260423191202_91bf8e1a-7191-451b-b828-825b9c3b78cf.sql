-- Cache de idempotência para envios à Evolution API.
-- Quando um mesmo `idem_key` chega de novo (retry de rede), devolvemos
-- a resposta cacheada em vez de chamar a Evolution e duplicar a mensagem.
CREATE TABLE IF NOT EXISTS public.evolution_send_idempotency (
  idem_key text PRIMARY KEY,
  instance_name text NOT NULL,
  path text NOT NULL,
  response jsonb NOT NULL,
  http_status integer NOT NULL DEFAULT 200,
  external_message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_evolution_send_idempotency_expires
  ON public.evolution_send_idempotency (expires_at);

CREATE INDEX IF NOT EXISTS idx_evolution_send_idempotency_instance
  ON public.evolution_send_idempotency (instance_name, created_at DESC);

ALTER TABLE public.evolution_send_idempotency ENABLE ROW LEVEL SECURITY;

-- Apenas o service role (edge functions) acessa. Usuários autenticados não leem
-- diretamente — sempre passam pelo proxy.
CREATE POLICY "service_role_all_evolution_send_idempotency"
  ON public.evolution_send_idempotency
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Função de limpeza periódica
CREATE OR REPLACE FUNCTION public.cleanup_evolution_send_idempotency()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.evolution_send_idempotency
  WHERE expires_at < now();
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_evolution_send_idempotency() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_evolution_send_idempotency() TO service_role;