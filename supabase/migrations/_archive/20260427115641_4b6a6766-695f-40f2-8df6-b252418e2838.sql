ALTER TABLE public.automation_executions
  ADD COLUMN IF NOT EXISTS recommended_tag text,
  ADD COLUMN IF NOT EXISTS kb_sources text[] DEFAULT '{}'::text[];

COMMENT ON COLUMN public.automation_executions.recommended_tag IS 'Tag recomendada pela IA com base nas evolution_tags existentes (não aplicada automaticamente).';
COMMENT ON COLUMN public.automation_executions.kb_sources IS 'Títulos dos artigos da knowledge_base_articles que foram usados como contexto para gerar a sugestão.';