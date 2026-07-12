-- Auditoria e Limpeza de referências cruzadas
-- O Lovable Supabase não deve conter tabelas ou referências a evolution_contacts, evolution_messages ou evolution_conversations

-- 1. Remover índices que referenciam tabelas inexistentes no Lovable (causariam erro no schema)
DROP INDEX IF EXISTS public.idx_contacts_dedup_hash;
DROP INDEX IF EXISTS public.idx_contacts_lgpd_request;
DROP INDEX IF EXISTS public.idx_conversations_inbox_list;
DROP INDEX IF EXISTS public.idx_conversations_unread;
DROP INDEX IF EXISTS public.idx_messages_conversation_recent;

-- 2. Notar que as tabelas de métricas e idempotência (fallback_events, retry_metrics, send_idempotency) 
-- são permitidas no Lovable como buffers operacionais, conforme arquitetura.

-- 3. Limpeza de metadados de webhook antigos se houver
DO $$ 
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'evolution_webhook_events') THEN
        DELETE FROM public.evolution_webhook_events WHERE created_at < now() - interval '14 days';
    END IF;
END $$;
