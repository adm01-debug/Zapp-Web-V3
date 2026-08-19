-- Grant EXECUTE para authenticated + guarda admin nas funções de reassign.
--
-- Contract test 2026-08-05 (scripts/audit-contract.mjs + pg_catalog): 3 RPCs
-- chamados pelo front existiam em zapp mas SEM EXECUTE para authenticated:
--   - fn_system_health_score()            → HealthScoreCard.tsx (dashboard) — read-only
--   - reassign_absent_agents(int)         → useAgentReassignment.ts (admin)
--   - reassign_overloaded_agents()        → useAgentReassignment.ts (admin)
--
-- As duas funções de reassign são SECURITY DEFINER e ESCREVEM em contacts
-- (UPDATE assigned_to + INSERT conversation_events). Grantar sem guarda interna
-- permitiria a QUALQUER usuário autenticado reatribuir conversas de outros
-- agentes (escalonamento horizontal de privilégio). Seguindo o padrão canônico
-- do schema (42 funções usam zapp.is_admin_or_supervisor() + RAISE EXCEPTION),
-- adicionamos a guarda no corpo via CREATE OR REPLACE e só então concedemos.
--
-- fn_system_health_score() é read-only (métricas de infra p/ o dashboard) —
-- grant direto, sem alteração de corpo.
--
-- Rollback:
--   REVOKE EXECUTE ON FUNCTION zapp.fn_system_health_score() FROM authenticated;
--   REVOKE EXECUTE ON FUNCTION zapp.reassign_absent_agents(integer) FROM authenticated;
--   REVOKE EXECUTE ON FUNCTION zapp.reassign_overloaded_agents() FROM authenticated;
--   (restaurar corpos sem guarda do histórico, se desejado)

-- ── 1. Guarda admin/supervisor em reassign_absent_agents ────────────────────
CREATE OR REPLACE FUNCTION zapp.reassign_absent_agents(inactive_minutes integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'zapp'
AS $function$
DECLARE
  v_absent RECORD;
  v_new_agent UUID;
  v_reassigned INTEGER := 0;
  v_contact RECORD;
BEGIN
  IF NOT zapp.is_admin_or_supervisor() THEN
    RAISE EXCEPTION 'Acesso negado: requer admin ou supervisor' USING ERRCODE = '42501';
  END IF;

  FOR v_absent IN
    SELECT p.id AS agent_id
    FROM profiles p
    WHERE p.is_active = true
      AND p.last_seen_at IS NOT NULL
      AND p.last_seen_at < now() - (inactive_minutes || ' minutes')::interval
      AND EXISTS (SELECT 1 FROM contacts c WHERE c.assigned_to = p.id)
  LOOP
    FOR v_contact IN
      SELECT c.id, c.queue_id
      FROM contacts c
      WHERE c.assigned_to = v_absent.agent_id
    LOOP
      SELECT qm.profile_id INTO v_new_agent
      FROM queue_members qm
      JOIN profiles p ON p.id = qm.profile_id
      WHERE (v_contact.queue_id IS NULL OR qm.queue_id = v_contact.queue_id)
        AND qm.is_active = true
        AND p.is_active = true
        AND p.id != v_absent.agent_id
        AND (p.last_seen_at IS NULL OR p.last_seen_at > now() - (inactive_minutes || ' minutes')::interval)
      ORDER BY (
        SELECT COUNT(*) FROM contacts cc WHERE cc.assigned_to = qm.profile_id
      ) ASC
      LIMIT 1;

      IF v_new_agent IS NOT NULL THEN
        UPDATE contacts SET assigned_to = v_new_agent WHERE id = v_contact.id;

        INSERT INTO conversation_events (contact_id, event_type, from_agent_id, to_agent_id, metadata)
        VALUES (v_contact.id, 'absence_reassign', v_absent.agent_id, v_new_agent,
                jsonb_build_object('reason', 'agent_inactive', 'inactive_minutes', inactive_minutes));

        v_reassigned := v_reassigned + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_reassigned;
END;
$function$;

-- ── 2. Guarda admin/supervisor em reassign_overloaded_agents() ──────────────
CREATE OR REPLACE FUNCTION zapp.reassign_overloaded_agents()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'zapp', 'evo', 'monitoring'
AS $function$
DECLARE
  v_overloaded RECORD;
  v_new_agent UUID;
  v_reassigned INTEGER := 0;
  v_contact RECORD;
BEGIN
  IF NOT zapp.is_admin_or_supervisor() THEN
    RAISE EXCEPTION 'Acesso negado: requer admin ou supervisor' USING ERRCODE = '42501';
  END IF;

  -- Encontrar agentes sobrecarregados
  FOR v_overloaded IN
    SELECT p.id AS agent_id, p.max_chats,
           COUNT(c.id) AS current_chats
    FROM profiles p
    JOIN contacts c ON c.assigned_to = p.id
    WHERE p.is_active = true
      AND p.max_chats IS NOT NULL
      AND p.max_chats > 0
    GROUP BY p.id, p.max_chats
    HAVING COUNT(c.id) > p.max_chats
  LOOP
    -- Para cada conversa excedente, reatribuir
    FOR v_contact IN
      SELECT c.id, c.queue_id
      FROM contacts c
      WHERE c.assigned_to = v_overloaded.agent_id
      ORDER BY c.updated_at ASC
      LIMIT (v_overloaded.current_chats - v_overloaded.max_chats)
    LOOP
      -- Encontrar agente com menor carga na mesma fila
      SELECT qm.profile_id INTO v_new_agent
      FROM queue_members qm
      JOIN profiles p ON p.id = qm.profile_id
      WHERE (v_contact.queue_id IS NULL OR qm.queue_id = v_contact.queue_id)
        AND qm.is_active = true
        AND p.is_active = true
        AND p.id != v_overloaded.agent_id
        AND (p.max_chats IS NULL OR (
          SELECT COUNT(*) FROM contacts cc WHERE cc.assigned_to = p.id
        ) < p.max_chats)
      ORDER BY (
        SELECT COUNT(*) FROM contacts cc WHERE cc.assigned_to = qm.profile_id
      ) ASC
      LIMIT 1;

      IF v_new_agent IS NOT NULL THEN
        UPDATE contacts SET assigned_to = v_new_agent WHERE id = v_contact.id;

        INSERT INTO conversation_events (contact_id, event_type, from_agent_id, to_agent_id, metadata)
        VALUES (v_contact.id, 'overload_reassign', v_overloaded.agent_id, v_new_agent,
                jsonb_build_object('reason', 'max_chats_exceeded', 'max_chats', v_overloaded.max_chats));

        v_reassigned := v_reassigned + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_reassigned;
END;
$function$;

-- ── 3. Grants ───────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION zapp.fn_system_health_score() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zapp.fn_system_health_score() TO authenticated; -- ignore-lint-ml008: read-only (metricas de infra p/ dashboard, header linhas 16-17); reassign tem guardas is_admin_or_supervisor (linhas 38 e 97)

REVOKE ALL ON FUNCTION zapp.reassign_absent_agents(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zapp.reassign_absent_agents(integer) TO authenticated;

REVOKE ALL ON FUNCTION zapp.reassign_overloaded_agents() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zapp.reassign_overloaded_agents() TO authenticated;

-- O overload jsonb (p_max_conversations) permanece SEM grant (não é chamado
-- pelo front; reduz superfície).
