
-- Fase 1: Áudio-Meme — favoritos por usuário e RPCs de listagem/envio

CREATE TABLE IF NOT EXISTS public.audio_meme_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meme_id uuid NOT NULL REFERENCES public.audio_memes(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, meme_id)
);

GRANT SELECT, INSERT, DELETE ON public.audio_meme_favorites TO authenticated;
GRANT ALL ON public.audio_meme_favorites TO service_role;

ALTER TABLE public.audio_meme_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own meme favorites" ON public.audio_meme_favorites
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_meme_favorites_user ON public.audio_meme_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_audio_memes_category ON public.audio_memes(category);

-- RPC: listar memes com flag de favorito do usuário corrente
CREATE OR REPLACE FUNCTION public.fn_list_audio_memes_for_user(
  p_category text DEFAULT NULL,
  p_only_favorites boolean DEFAULT false,
  p_search text DEFAULT NULL
)
RETURNS TABLE(
  id uuid, name text, audio_url text, category text,
  duration_seconds numeric, use_count integer,
  is_favorite boolean, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT m.id, m.name, m.audio_url, m.category, m.duration_seconds, m.use_count,
         EXISTS (
           SELECT 1 FROM public.audio_meme_favorites f
           WHERE f.meme_id = m.id AND f.user_id = auth.uid()
         ) AS is_favorite,
         m.created_at
  FROM public.audio_memes m
  WHERE (p_category IS NULL OR m.category = p_category)
    AND (p_search IS NULL OR m.name ILIKE '%'||p_search||'%')
    AND (
      NOT p_only_favorites
      OR EXISTS (
        SELECT 1 FROM public.audio_meme_favorites f
        WHERE f.meme_id = m.id AND f.user_id = auth.uid()
      )
    )
  ORDER BY is_favorite DESC, m.use_count DESC, m.name ASC;
$$;

-- RPC: listar categorias com contagem
CREATE OR REPLACE FUNCTION public.fn_list_audio_meme_categories()
RETURNS TABLE(category text, total bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT category, COUNT(*)::bigint AS total
  FROM public.audio_memes
  GROUP BY category
  ORDER BY total DESC, category ASC;
$$;

-- RPC: toggle favorito do usuário
CREATE OR REPLACE FUNCTION public.fn_toggle_user_meme_favorite(p_meme_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_exists boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.audio_meme_favorites
                WHERE meme_id = p_meme_id AND user_id = auth.uid()) INTO v_exists;
  IF v_exists THEN
    DELETE FROM public.audio_meme_favorites
      WHERE meme_id = p_meme_id AND user_id = auth.uid();
    RETURN false;
  ELSE
    INSERT INTO public.audio_meme_favorites(user_id, meme_id)
      VALUES (auth.uid(), p_meme_id);
    RETURN true;
  END IF;
END;
$$;

-- RPC: incrementa use_count quando o atendente envia um meme
CREATE OR REPLACE FUNCTION public.fn_increment_meme_use(p_meme_id uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  UPDATE public.audio_memes SET use_count = use_count + 1 WHERE id = p_meme_id;
$$;

GRANT EXECUTE ON FUNCTION public.fn_list_audio_memes_for_user(text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_list_audio_meme_categories() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_toggle_user_meme_favorite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_increment_meme_use(uuid) TO authenticated;
