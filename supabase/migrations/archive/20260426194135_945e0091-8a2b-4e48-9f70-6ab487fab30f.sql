-- Round-robin real para filas omnicanais
-- Adiciona rastreio do último agente atribuído por fila
ALTER TABLE public.queues
  ADD COLUMN IF NOT EXISTS last_assigned_user_id uuid,
  ADD COLUMN IF NOT EXISTS last_assigned_at timestamptz;

-- Reescreve rpc_pick_next_agent para honrar o algoritmo escolhido
CREATE OR REPLACE FUNCTION public.rpc_pick_next_agent(p_queue_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_algo text;
  v_last uuid;
  v_pick uuid;
BEGIN
  SELECT distribution_algorithm, last_assigned_user_id
    INTO v_algo, v_last
    FROM public.queues
   WHERE id = p_queue_id AND status = 'active';

  IF v_algo IS NULL OR v_algo = 'manual_pull' THEN
    RETURN NULL;
  END IF;

  IF v_algo = 'round_robin' THEN
    -- Próximo elegível depois do último atribuído (ordem determinística por user_id),
    -- com fallback para o primeiro elegível se já passou do fim da lista.
    WITH cand AS (
      SELECT user_id, active_chats, max_chats
        FROM public.rpc_list_eligible_agents(p_queue_id)
       WHERE active_chats < max_chats
       ORDER BY user_id
    )
    SELECT user_id INTO v_pick FROM cand
     WHERE v_last IS NULL OR user_id > v_last
     ORDER BY user_id
     LIMIT 1;

    IF v_pick IS NULL THEN
      SELECT user_id INTO v_pick FROM (
        SELECT user_id, active_chats, max_chats
          FROM public.rpc_list_eligible_agents(p_queue_id)
         WHERE active_chats < max_chats
         ORDER BY user_id
         LIMIT 1
      ) s;
    END IF;
  ELSIF v_algo = 'longest_idle' THEN
    SELECT a.user_id INTO v_pick
      FROM public.rpc_list_eligible_agents(p_queue_id) a
      LEFT JOIN public.profiles p ON p.user_id = a.user_id
     WHERE a.active_chats < a.max_chats
     ORDER BY p.last_active_at NULLS FIRST, a.active_chats ASC, random()
     LIMIT 1;
  ELSE
    -- least_busy (default)
    SELECT user_id INTO v_pick
      FROM public.rpc_list_eligible_agents(p_queue_id)
     WHERE active_chats < max_chats
     ORDER BY active_chats ASC, random()
     LIMIT 1;
  END IF;

  IF v_pick IS NOT NULL THEN
    UPDATE public.queues
       SET last_assigned_user_id = v_pick,
           last_assigned_at = now()
     WHERE id = p_queue_id;
  END IF;

  RETURN v_pick;
END
$function$;