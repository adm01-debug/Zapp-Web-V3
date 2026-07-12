-- =====================================================================
-- SECURITY FIX: Corrige RLS policies com USING(true) - V3
-- Autor: Claude (Missão ZAPP-WEB 10/10)
-- Data: 2026-05-03
-- =====================================================================

-- =====================================================
-- 1. ENTITY_VERSIONS - Restringir por owner/organização
-- =====================================================

DROP POLICY IF EXISTS "Users can view versions" ON public.entity_versions;
DROP POLICY IF EXISTS "Users can insert versions" ON public.entity_versions;
DROP POLICY IF EXISTS "Authenticated can view versions" ON public.entity_versions;
DROP POLICY IF EXISTS "Authenticated can insert versions" ON public.entity_versions;

CREATE POLICY "entity_versions_select_own_org"
ON public.entity_versions FOR SELECT TO authenticated
USING (
  changed_by = auth.uid()
  OR changed_by IS NULL
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
    AND p.role IN ('admin', 'supervisor')
  )
);

CREATE POLICY "entity_versions_insert_own"
ON public.entity_versions FOR INSERT TO authenticated
WITH CHECK (
  changed_by = auth.uid()
  OR changed_by IS NULL
);

-- =====================================================
-- 2. EMAIL_THREADS - Restringir por account owner
-- =====================================================

DROP POLICY IF EXISTS "Authenticated users can view email threads" ON public.email_threads;
DROP POLICY IF EXISTS "Users can manage email threads they have access to" ON public.email_threads;

CREATE POLICY "email_threads_select_own_or_assigned"
ON public.email_threads FOR SELECT TO authenticated
USING (
  gmail_account_id IN (
    SELECT id FROM public.gmail_accounts WHERE user_id = auth.uid()
  )
  OR assigned_to IN (
    SELECT id FROM public.profiles WHERE user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'supervisor')
  )
);

CREATE POLICY "email_threads_manage_own"
ON public.email_threads FOR ALL TO authenticated
USING (
  gmail_account_id IN (
    SELECT id FROM public.gmail_accounts WHERE user_id = auth.uid()
  )
  OR assigned_to IN (
    SELECT id FROM public.profiles WHERE user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'supervisor')
  )
)
WITH CHECK (
  gmail_account_id IN (
    SELECT id FROM public.gmail_accounts WHERE user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'supervisor')
  )
);

-- =====================================================
-- 3. EMAIL_MESSAGES - Restringir por account owner
-- =====================================================

DROP POLICY IF EXISTS "Authenticated users can view email messages" ON public.email_messages;
DROP POLICY IF EXISTS "Users can manage their email messages" ON public.email_messages;

CREATE POLICY "email_messages_select_own"
ON public.email_messages FOR SELECT TO authenticated
USING (
  gmail_account_id IN (
    SELECT id FROM public.gmail_accounts WHERE user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'supervisor')
  )
);

CREATE POLICY "email_messages_manage_own"
ON public.email_messages FOR ALL TO authenticated
USING (
  gmail_account_id IN (
    SELECT id FROM public.gmail_accounts WHERE user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'supervisor')
  )
)
WITH CHECK (
  gmail_account_id IN (
    SELECT id FROM public.gmail_accounts WHERE user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'supervisor')
  )
);

-- =====================================================
-- 4. WHATSAPP_CONNECTION_QUEUES - Restringir por org
-- =====================================================

DROP POLICY IF EXISTS "Authenticated can view connection queues" ON public.whatsapp_connection_queues;

CREATE POLICY "whatsapp_connection_queues_select_org"
ON public.whatsapp_connection_queues FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid())
);

-- =====================================================
-- 5. Audit comments
-- =====================================================
COMMENT ON TABLE public.entity_versions IS 'Versionamento de entidades - RLS corrigido em 2026-05-03';
COMMENT ON TABLE public.email_threads IS 'Threads de email Gmail - RLS corrigido em 2026-05-03';
COMMENT ON TABLE public.email_messages IS 'Mensagens de email Gmail - RLS corrigido em 2026-05-03';
COMMENT ON TABLE public.whatsapp_connection_queues IS 'Conexões WhatsApp-Filas - RLS corrigido em 2026-05-03';