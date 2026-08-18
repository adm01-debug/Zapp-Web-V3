-- ============================================================================
-- CAPTURE (2026-08-18) — zapp.get_contact_360_by_phone (espelho runtime)
-- ----------------------------------------------------------------------------
-- Funcao aplicada fora do versionamento (FIX 2026-08-03 perf: partition
-- pruning via EXECUTE + p_instance). Versiona a definicao viva de producao
-- (pg_get_functiondef 2026-08-18) para que o schema versionado reflita a
-- realidade e um recreate nao perca o fix. CREATE OR REPLACE idempotente.
-- ============================================================================
CREATE OR REPLACE FUNCTION zapp.get_contact_360_by_phone(p_phone text, p_instance text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'zapp', 'auth', 'extensions'
AS $function$
/*
  FIX 2026-08-03 (perf):
  1. Contato: mantido via zapp.contacts VIEW para preservar shape dos campos.
  2. Conversa: reescrito com EXECUTE + p_instance → partition pruning ativo.
     Antes: varrida de 23 partições de evolution_conversations sem pruning.
     Depois: plano em runtime com instance_name = $2 → 1 partição tocada.
  3. Normalização do phone antes dos ORs para evitar triple-OR no contacts lookup.
  Breaking changes: nenhum (assinatura backward-compatible com default NULL).
*/
DECLARE
  v_result         jsonb;
  v_contact        contacts%ROWTYPE;
  v_conversation_id uuid;
  v_workspace_id   uuid;
  v_jid_with       text;
  v_jid_without    text;
BEGIN
  -- [SEC 2026-08-01] Workspace isolation guard
  IF auth.uid() IS NOT NULL THEN
    SELECT workspace_id INTO v_workspace_id
    FROM zapp.workspace_members
    WHERE user_id = auth.uid()
    LIMIT 1;

    IF v_workspace_id IS NULL THEN
      RAISE EXCEPTION 'unauthorized: user has no workspace membership'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Normalizar phone uma vez: evita 3 OR conditions com funções inline
  v_jid_with    := CASE WHEN p_phone LIKE '%@s.whatsapp.net'
                        THEN p_phone
                        ELSE p_phone || '@s.whatsapp.net' END;
  v_jid_without := replace(p_phone, '@s.whatsapp.net', '');

  -- Buscar contato via VIEW (mantém field-shape esperado pelo frontend)
  -- Usa idx_ec_coalesce_phone via BitmapOr (cost ~4) — já rápido
  SELECT * INTO v_contact
  FROM contacts c
  WHERE (
      c.phone = v_jid_without
   OR c.phone = v_jid_with
  )
  AND (v_workspace_id IS NULL OR c.workspace_id = v_workspace_id)
  LIMIT 1;

  -- FIX: Buscar conversa com partition pruning via dynamic SQL
  -- p_instance IS NOT NULL → plan em runtime com instance_name literal
  -- → PostgreSQL prune: só a partição evolution_conversations_{instance} é tocada
  IF p_instance IS NOT NULL THEN
    EXECUTE
      'SELECT id FROM zapp.evolution_conversations
       WHERE remote_jid = $1
         AND instance_name = $2
       ORDER BY created_at DESC
       LIMIT 1'
    INTO v_conversation_id
    USING v_jid_with, p_instance;
  ELSE
    -- Fallback sem pruning: compatibilidade com callers que omitem p_instance
    -- (ainda mais rápido que antes: 2 OR → 1 condição com JID normalizado)
    SELECT id INTO v_conversation_id
    FROM zapp.evolution_conversations
    WHERE remote_jid = v_jid_with
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  v_result := jsonb_build_object(
    'contact',         CASE WHEN v_contact.id IS NOT NULL THEN row_to_json(v_contact) ELSE NULL END,
    'conversation_id', v_conversation_id,
    'phone',           p_phone,
    'found',           v_contact.id IS NOT NULL
  );

  RETURN v_result;
END;
$function$;
