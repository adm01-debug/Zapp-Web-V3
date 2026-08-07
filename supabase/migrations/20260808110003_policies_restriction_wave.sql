-- lint:ok: onda de correcao documentada aplicada via psql antes desta migration
-- ==========================================================================
-- Restrição de policies RLS com PII (33 policies, 27 tabelas) + trigger bloqueador de stickers
-- Espelho versionado da onda de correção executada em 2026-08-07 (DB-as-source:
-- objetos JÁ aplicados em produção via psql; esta migration é NO-OP idempotente
-- que alinha o repo com o banco canônico).
-- Fonte: .hermes/audit-db-exaustiva/20260807/ (exec-01..14, fix_*.sql)
-- ==========================================================================

-- exec-03-sql-ai.sql
DO $$
DECLARE t text;
BEGIN
  -- ai.*: nlp_extractions e trace_events expostas (auth_full_access ALL qual=true) — dados de análise/trace.
  -- Sem helper próprio no schema ai -> admin-only via zapp.is_admin_or_supervisor(). Front: 0 refs.
  FOREACH t IN ARRAY ARRAY['nlp_extractions','trace_events']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "auth_full_access" ON ai.%I', t);
    EXECUTE format('CREATE POLICY "auth_full_access" ON ai.%I FOR ALL TO authenticated USING (zapp.is_admin_or_supervisor()) WITH CHECK (zapp.is_admin_or_supervisor())', t);
  END LOOP;
END $$;

-- exec-03-sql-archive.sql
DO $$
DECLARE t text;
BEGIN
  -- archive.audit_*: 13 tabelas com auth_full_access (ALL authenticated qual=true) — dumps/diffs de auditoria (PII).
  -- admin-only via zapp.is_admin_or_supervisor(). Front: 0 refs. audit_tail_missing usa nomes auth_full/svc_full.
  FOREACH t IN ARRAY ARRAY['audit_backfill_chunks','audit_backfill_progress','audit_dump_chunks','audit_evo_fetches','audit_full_diff','audit_full_runs','audit_log','audit_source_full','audit_source_head_10k','audit_source_sample','audit_source_tail_10k','audit_test_results']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "auth_full_access" ON archive.%I', t);
    EXECUTE format('CREATE POLICY "auth_full_access" ON archive.%I FOR ALL TO authenticated USING (zapp.is_admin_or_supervisor()) WITH CHECK (zapp.is_admin_or_supervisor())', t);
  END LOOP;
  DROP POLICY IF EXISTS "auth_full" ON archive.audit_tail_missing;
  CREATE POLICY "auth_full" ON archive.audit_tail_missing
    FOR ALL TO authenticated
    USING (zapp.is_admin_or_supervisor())
    WITH CHECK (zapp.is_admin_or_supervisor());
END $$;

-- exec-03-sql-bpm.sql
DO $$
DECLARE t text;
BEGIN
  -- bpm: só as 4 tabelas com PII (credenciais SMTP, e-mails, tokens de share, configs de conexão).
  -- bpm não tem helper próprio (to_regprocedure('bpm.fn_app_role')=NULL) -> zapp.is_admin_or_supervisor() OR workspace_members.
  -- Front: 0 refs. Demais bpm_* (cards, flows, etc.) MANTIDAS (biblioteca do BPM p/ todos os membros) — documentado.
  FOREACH t IN ARRAY ARRAY['bpm_email_configs','bpm_card_emails','bpm_public_shares','bpm_connections']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "auth_full_access" ON bpm.%I', t);
    EXECUTE format('CREATE POLICY "auth_full_access" ON bpm.%I FOR ALL TO authenticated USING (zapp.is_admin_or_supervisor() OR EXISTS (SELECT 1 FROM zapp.workspace_members wm WHERE wm.user_id = auth.uid())) WITH CHECK (zapp.is_admin_or_supervisor() OR EXISTS (SELECT 1 FROM zapp.workspace_members wm WHERE wm.user_id = auth.uid()))', t);
  END LOOP;
END $$;

-- exec-03-sql-email_revalidation_jobs.sql
DO $$
BEGIN
  -- zapp.email_revalidation_jobs: email_reval_all/reval_admin eram ALL public com (auth.uid() IS NOT NULL)
  -- = qualquer logado lia/alterava jobs de QUALQUER conta de e-mail (PII: mensagens de erro, metadados).
  -- Novo escopo: dono da conta (email_app.email_accounts.user_id = auth.uid()) OU admin.
  -- reval_select (já escopada por conta) mantida — é o caminho de leitura do front (emailApi.ts).
  DROP POLICY IF EXISTS "email_reval_all" ON zapp.email_revalidation_jobs;
  CREATE POLICY "email_reval_all" ON zapp.email_revalidation_jobs
    FOR ALL TO public
    USING ((EXISTS (SELECT 1 FROM email_app.email_accounts ea WHERE ea.id = email_revalidation_jobs.account_id AND ea.user_id = auth.uid())) OR zapp.is_admin_or_supervisor())
    WITH CHECK ((EXISTS (SELECT 1 FROM email_app.email_accounts ea WHERE ea.id = email_revalidation_jobs.account_id AND ea.user_id = auth.uid())) OR zapp.is_admin_or_supervisor());
  DROP POLICY IF EXISTS "reval_admin" ON zapp.email_revalidation_jobs;
  CREATE POLICY "reval_admin" ON zapp.email_revalidation_jobs
    FOR ALL TO public
    USING ((EXISTS (SELECT 1 FROM email_app.email_accounts ea WHERE ea.id = email_revalidation_jobs.account_id AND ea.user_id = auth.uid())) OR zapp.is_admin_or_supervisor())
    WITH CHECK ((EXISTS (SELECT 1 FROM email_app.email_accounts ea WHERE ea.id = email_revalidation_jobs.account_id AND ea.user_id = auth.uid())) OR zapp.is_admin_or_supervisor());
END $$;

-- exec-03-sql-logistica.sql
DO $$
BEGIN
  -- logistica.transportadoras: 5 policies authenticated com qual=true (cnpj, endereço, telefone, e-mail = PII).
  -- Sem helper próprio no schema logistica -> admin-only via zapp.is_admin_or_supervisor(). Front: 0 refs.
  DROP POLICY IF EXISTS "transportadoras_auth" ON logistica.transportadoras;
  CREATE POLICY "transportadoras_auth" ON logistica.transportadoras
    FOR ALL TO authenticated
    USING (zapp.is_admin_or_supervisor())
    WITH CHECK (zapp.is_admin_or_supervisor());
  DROP POLICY IF EXISTS "transportadoras_select" ON logistica.transportadoras;
  CREATE POLICY "transportadoras_select" ON logistica.transportadoras
    FOR SELECT TO authenticated
    USING (zapp.is_admin_or_supervisor());
  DROP POLICY IF EXISTS "transportadoras_insert" ON logistica.transportadoras;
  CREATE POLICY "transportadoras_insert" ON logistica.transportadoras
    FOR INSERT TO authenticated
    WITH CHECK (zapp.is_admin_or_supervisor());
  DROP POLICY IF EXISTS "transportadoras_update" ON logistica.transportadoras;
  CREATE POLICY "transportadoras_update" ON logistica.transportadoras
    FOR UPDATE TO authenticated
    USING (zapp.is_admin_or_supervisor());
  DROP POLICY IF EXISTS "transportadoras_delete" ON logistica.transportadoras;
  CREATE POLICY "transportadoras_delete" ON logistica.transportadoras
    FOR DELETE TO authenticated
    USING (zapp.is_admin_or_supervisor());
END $$;

-- exec-03-sql-media_cache.sql
DO $$
BEGIN
  -- zapp.media_cache: auth_secure_77 (ALL authenticated, qual=true) = qualquer logado lia/alterava o cache inteiro.
  -- Front: só SELECT (useMediaUrl, dedup por file_hash) -> leitura preservada em media_cache_select_authenticated.
  -- Escrita: admin (auth_secure_77 escopada) + service_role (backend/edge functions).
  DROP POLICY IF EXISTS "auth_secure_77" ON zapp.media_cache;
  CREATE POLICY "auth_secure_77" ON zapp.media_cache
    FOR ALL TO authenticated
    USING (zapp.is_admin_or_supervisor())
    WITH CHECK (zapp.is_admin_or_supervisor());
  DROP POLICY IF EXISTS "media_cache_delete_authenticated" ON zapp.media_cache;
  DROP POLICY IF EXISTS "media_cache_insert" ON zapp.media_cache;
  DROP POLICY IF EXISTS "media_cache_upsert" ON zapp.media_cache;
  DROP POLICY IF EXISTS "service_full_access" ON zapp.media_cache;
  CREATE POLICY "service_full_access" ON zapp.media_cache
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);
END $$;

-- exec-03-sql-outbound_delivery_audit.sql
DO $$
BEGIN
  -- zapp.outbound_delivery_audit: ALL+SELECT de public com (auth.uid() IS NOT NULL) = qualquer logado lia PII (remote_jid, metadata).
  -- Front: 0 refs. INSERT (outbound_audit_insert) mantido (escrita do backend/RPC).
  DROP POLICY IF EXISTS "outbound_audit_all" ON zapp.outbound_delivery_audit;
  CREATE POLICY "outbound_audit_all" ON zapp.outbound_delivery_audit
    FOR ALL TO public
    USING (zapp.is_admin_or_supervisor())
    WITH CHECK (zapp.is_admin_or_supervisor());
  DROP POLICY IF EXISTS "outbound_audit_select" ON zapp.outbound_delivery_audit;
  CREATE POLICY "outbound_audit_select" ON zapp.outbound_delivery_audit
    FOR SELECT TO public
    USING (zapp.is_admin_or_supervisor());
END $$;

-- exec-03-sql-role_permissions.sql
DO $$
BEGIN
  -- zapp.role_permissions: leitura da matriz era qual=true p/ qualquer authenticated.
  -- Front usa: AuthProvider (.in('role', roleNames)) + usePermissions (todas as linhas).
  -- Novo escopo: admin vê tudo; usuário comum vê só as linhas dos PRÓPRIOS roles (zapp.user_roles).
  DROP POLICY IF EXISTS "auth_read_role_permissions" ON zapp.role_permissions;
  CREATE POLICY "auth_read_role_permissions" ON zapp.role_permissions
    FOR SELECT TO authenticated
    USING (zapp.is_admin_or_supervisor() OR role IN (SELECT role FROM zapp.user_roles WHERE user_id = auth.uid()));
END $$;

-- exec-03-sql-stickers.sql
DO $$
BEGIN
  -- zapp.stickers: stickers_update_own/stickers_delete_own usavam (owner_id = auth.uid() OR auth.uid() IN (SELECT users.id FROM auth.users))
  -- = sempre true p/ logado -> QUALQUER usuário atualizava/apagava QUALQUER sticker. Substituído por owner/admin.
  -- auth_secure_110 (ALL qual=true) -> vira SELECT-only: o picker (useStickerPicker) lista TODOS os stickers (biblioteca compartilhada),
  -- leitura NÃO pode sair. Escrita passa a ser via stickers_update_own/delete_own escopadas.
  -- OBS: owner_id está NULL em 994/994 linhas (insert do front não seta owner_id) -> update/delete efetivo só admin até backfill;
  -- front degrada com log.error (não quebra). stickers_insert_auth mantida (wc=auth.uid() IS NOT NULL) — inserção seta uploaded_by.
  DROP POLICY IF EXISTS "auth_secure_110" ON zapp.stickers;
  CREATE POLICY "auth_secure_110" ON zapp.stickers
    FOR SELECT TO authenticated
    USING (true);
  DROP POLICY IF EXISTS "stickers_delete_own" ON zapp.stickers;
  CREATE POLICY "stickers_delete_own" ON zapp.stickers
    FOR DELETE TO public
    USING ((owner_id = auth.uid()) OR zapp.is_admin_or_supervisor());
  DROP POLICY IF EXISTS "stickers_update_own" ON zapp.stickers;
  CREATE POLICY "stickers_update_own" ON zapp.stickers
    FOR UPDATE TO public
    USING ((owner_id = auth.uid()) OR zapp.is_admin_or_supervisor());
END $$;

-- Trigger bloqueador de URLs internas em stickers (ADR-001, CORR-08)
CREATE OR REPLACE FUNCTION zapp.fn_block_internal_sticker_urls() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'zapp','pg_temp' AS $function$
BEGIN
  IF NEW.image_url ILIKE '%kong:8000%' OR NEW.image_url ILIKE '%http://%' THEN
    RAISE EXCEPTION 'sticker image_url deve usar https://supabase.atomicabr.com.br' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_block_internal_sticker_urls ON zapp.stickers;
CREATE TRIGGER trg_block_internal_sticker_urls BEFORE INSERT OR UPDATE OF image_url ON zapp.stickers
FOR EACH ROW EXECUTE FUNCTION zapp.fn_block_internal_sticker_urls();
