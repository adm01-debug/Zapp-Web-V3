-- Garantir que os buckets existam
INSERT INTO storage.buckets (id, name, public)
VALUES ('whatsapp-media', 'whatsapp-media', false)
ON CONFLICT (id) DO UPDATE SET public = false;

INSERT INTO storage.buckets (id, name, public)
VALUES ('quarantine', 'quarantine', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Remover políticas existentes para evitar erros de duplicidade
DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Permitir upload para usuários autenticados no whatsapp-media" ON storage.objects;
    DROP POLICY IF EXISTS "Permitir leitura para usuários autenticados no whatsapp-media" ON storage.objects;
    DROP POLICY IF EXISTS "Permitir upload para usuários autenticados no quarantine" ON storage.objects;
END $$;

-- Políticas para 'whatsapp-media'
CREATE POLICY "Permitir upload para usuários autenticados no whatsapp-media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'whatsapp-media');

CREATE POLICY "Permitir leitura para usuários autenticados no whatsapp-media"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'whatsapp-media');

-- Políticas para 'quarantine' (Acesso Restrito)
CREATE POLICY "Permitir upload para usuários autenticados no quarantine"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'quarantine');
