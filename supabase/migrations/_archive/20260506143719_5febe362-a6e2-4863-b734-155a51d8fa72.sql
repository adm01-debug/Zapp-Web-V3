-- Verificar e garantir existência de buckets
INSERT INTO storage.buckets (id, name, public) 
VALUES ('audio-messages', 'audio-messages', false)
ON CONFLICT (id) DO UPDATE SET public = false;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('whatsapp-media', 'whatsapp-media', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Remover políticas antigas para evitar conflitos
DROP POLICY IF EXISTS "Service role access" ON storage.objects;
DROP POLICY IF EXISTS "Agents can upload audio" ON storage.objects;
DROP POLICY IF EXISTS "Agents can upload media" ON storage.objects;
DROP POLICY IF EXISTS "Agents can view their own uploads" ON storage.objects;

-- Política de leitura para o serviço (Edge Functions/Backend)
CREATE POLICY "Backend can manage all objects" 
ON storage.objects FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- Política de Upload para Atendentes Autenticados
CREATE POLICY "Authenticated users can upload media" 
ON storage.objects FOR INSERT 
TO authenticated 
WITH CHECK (
    bucket_id IN ('audio-messages', 'whatsapp-media')
);

-- Política de Visualização para Atendentes Autenticados (Apenas via Signed URL geralmente, mas permitimos SELECT para verificação de existência)
CREATE POLICY "Authenticated users can select media" 
ON storage.objects FOR SELECT 
TO authenticated 
USING (
    bucket_id IN ('audio-messages', 'whatsapp-media')
);

-- Auditoria: Adicionar trigger para logar falhas de upload (Opcional, mas útil)
CREATE OR REPLACE FUNCTION public.log_storage_upload_error()
RETURNS TRIGGER AS $$
BEGIN
    -- Log simplificado se houver falha (Postgres não pega erro de storage diretamente aqui, 
    -- mas podemos logar a tentativa de inserção bem sucedida como 'pending')
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
