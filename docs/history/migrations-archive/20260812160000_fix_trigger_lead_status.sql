-- 20260812160000_fix_trigger_lead_status.sql
-- [FIX 2026-08-12] Alinha default de lead_status ao vocabulário vigente.
--
-- Contexto do incidente: o insert de CONTATO NOVO via view public.contacts
-- (webhook da Evolution) falhava com `chk_lead_status_vocab` em
-- evo.evolution_contacts: o trigger zapp.fn_contacts_view_insert_handler
-- mapeia lead_status = COALESCE(NEW.status, 'open'), mas o vocabulário
-- (PT-BR) aceita apenas novo/qualificado/negociando/ganho/perdido/inativo.
-- Consequência: contact=null no handler → early-return SEM log → mensagens
-- inbound de contatos novos descartadas silenciosamente (perda 22-40%).
--
-- Aplicado em produção via MCP (DB-as-source) e validado com ROLLBACK
-- (SET LOCAL request.jwt.claims + SET LOCAL ROLE service_role + INSERT na view).

CREATE OR REPLACE FUNCTION zapp.fn_contacts_view_insert_handler()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo'
AS $function$
DECLARE
  v_id uuid;
  v_instance text;
BEGIN
  -- [2026-07-05 contacts-view-io] zapp.contacts virou view (~21/06) sem INSTEAD OF:
  -- todo INSERT do webhook handler falhava (0A000) => contato/mensagem nao espelhados.
  -- [2026-08-12 FIX lead_status] vocabulario de evolution_contacts.lead_status e PT-BR
  -- (chk_lead_status_vocab: novo/qualificado/negociando/ganho/perdido/inativo); o default
  -- legado 'open' violava o CHECK e derrubava TODO insert de contato novo do webhook
  -- (mensagens inbound de contatos novos descartadas silenciosamente).
  v_instance := NULLIF(NEW.instance_name,'');
  IF v_instance IS NULL AND NEW.whatsapp_connection_id IS NOT NULL THEN
    SELECT wc.instance_name INTO v_instance
    FROM zapp.whatsapp_connections wc WHERE wc.id = NEW.whatsapp_connection_id;
  END IF;

  INSERT INTO evo.evolution_contacts (
    id, remote_jid, phone_number, push_name, profile_picture_url, full_name,
    email, company, role_title, lead_status, lead_source, lead_score,
    whatsapp_labels, tags, assigned_to, queue_id, notes, instance_name,
    raw_data, total_purchases, last_message_at, created_at, updated_at
  ) VALUES (
    COALESCE(NEW.id, gen_random_uuid()),
    COALESCE(NULLIF(NEW.remote_jid,''), NULLIF(NEW.external_id,''), NEW.phone || '@s.whatsapp.net'),
    NEW.phone,
    COALESCE(NEW.push_name, NEW.nickname),
    NEW.avatar_url,
    NEW.name,
    NEW.email, NEW.company,
    COALESCE(NEW."position", NEW.job_title),
    COALESCE(NEW.status, 'novo'),
    NEW.source,
    COALESCE(NEW.lead_score, 0),
    NEW.whatsapp_labels, NEW.tags, NEW.assigned_to, NEW.queue_id, NEW.notes,
    COALESCE(v_instance, 'wpp2'),
    NEW.metadata,
    COALESCE(NEW.total_purchases, 0),
    NEW.last_message_at,
    COALESCE(NEW.created_at, now()), COALESCE(NEW.updated_at, now())
  ) RETURNING id INTO v_id;

  NEW.id := v_id;
  RETURN NEW;
END $function$;

-- Rollback: reverter COALESCE(NEW.status, 'novo') → COALESCE(NEW.status, 'open')
-- (apenas se o vocabulário voltar a aceitar 'open').
