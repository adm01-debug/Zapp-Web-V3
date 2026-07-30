-- ===================================================================
-- E08 Phase 1 — RLS Impact Measurement (7-day watch)
-- ===================================================================
-- Cria view v_rls_impact_preview que simula o impacto de uma nova
-- policy RLS com filtro auth.uid() SEM aplicá-la.
--
-- Uso: SELECT * FROM zapp.v_rls_impact_preview;
--
-- Colunas:
--   profile_id     | uuid   | ID do perfil (agente)
--   agent_name     | text   | Nome do agente
--   agent_email    | text   | Email do agente
--   agent_role     | text   | Role (admin/agent/supervisor)
--   user_id        | uuid   | ID do usuário auth
--   visiveis_hoje  | bigint | Total mensagens 7d (sem RLS scope)
--   visiveis_apos  | bigint | Mensagens visíveis com scope auth.uid()
--   pct_retido     | numeric| % de mensagens retidas após policy
--   status_impacto | text   | BLOQUEADO se <70% retido, OK caso contrário
--
-- Resultado esperado: se % retido < 30% para agentes legítimos,
-- marcar como BLOQUEADO e corrigir dados antes da Fase 2.
-- NÃO aplicar policy ainda.
-- ===================================================================

CREATE OR REPLACE VIEW zapp.v_rls_impact_preview AS
WITH 
-- 7-day window: combina evolution_messages (origem primária) e messages (mirror)
msg_window AS (
    SELECT id, conversation_id, created_at FROM zapp.evolution_messages
    WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
    UNION
    SELECT id, conversation_id, created_at FROM zapp.messages
    WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
),
-- Total deduplicado no período (visiveis_hoje = tudo, sem RLS)
total_7d AS (
    SELECT count(DISTINCT id) AS total FROM msg_window
),
-- Agentes ativos (profiles = usuarios da plataforma)
active_agents AS (
    SELECT id, name, email, role, user_id
    FROM zapp.profiles
    WHERE is_active = true
),
-- Métricas por agente
agent_stats AS (
    SELECT
        aa.id AS profile_id,
        aa.name AS agent_name,
        aa.email AS agent_email,
        aa.role AS agent_role,
        aa.user_id,
        t.total AS visiveis_hoje,
        -- Após RLS: mensagens com acesso via team_conversation_members
        -- (única relação existente entre profiles e conversas)
        COALESCE((
            SELECT count(DISTINCT m2.id)
            FROM msg_window m2
            WHERE m2.conversation_id IN (
                SELECT tcm.conversation_id
                FROM zapp.team_conversation_members tcm
                WHERE tcm.profile_id = aa.id
            )
        ), 0) AS visiveis_apos
    FROM active_agents aa
    CROSS JOIN total_7d t
)
SELECT
    profile_id,
    agent_name,
    agent_email,
    agent_role,
    user_id,
    visiveis_hoje,
    visiveis_apos,
    CASE 
        WHEN visiveis_hoje = 0 THEN 100.0
        ELSE ROUND((visiveis_apos::numeric / visiveis_hoje::numeric) * 100, 1)
    END AS pct_retido,
    CASE 
        WHEN visiveis_hoje = 0 THEN 'SEM_DADOS'
        WHEN (visiveis_apos::numeric / GREATEST(visiveis_hoje::numeric, 1)) * 100 < 70 THEN 'BLOQUEADO'
        ELSE 'OK'
    END AS status_impacto
FROM agent_stats
ORDER BY agent_name;

COMMENT ON VIEW zapp.v_rls_impact_preview IS 
'E08 Phase 1 — RLS impact measurement. 
 visiveis_hoje = total msgs 7d (sem policy).
 visiveis_apos = msgs visíveis com auth.uid() scope.
 Se pct_retido < 70% → BLOQUEADO → corrigir dados antes Fase 2.';

-- ===================================================================
-- IMPORTANTE: NÃO aplicar policy RLS nesta fase.
-- Fase 2 = preparar índices. Fase 3 = aplicar policy.
-- ===================================================================
