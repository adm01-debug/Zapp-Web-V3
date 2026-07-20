import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { safeFrom } from '@/integrations/supabase/safeClient';
import { toast } from '@/hooks/use-toast';

/** Article interface definition. */
export interface Article {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  is_published: boolean;
  embedding_status: string;
  created_at: string;
  updated_at: string;
}

/** K B File interface definition. */
export interface KBFile {
  id: string;
  article_id: string | null;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  processing_status: string;
  created_at: string;
}

/** C A T E G O R I E S constant. */
export const CATEGORIES = [
  'general',
  'product',
  'support',
  'sales',
  'onboarding',
  'technical',
  'faq',
];

/** C A T E G O R Y_ L A B E L S constant. */
export const CATEGORY_LABELS: Record<string, string> = {
  general: 'Geral',
  product: 'Produto',
  support: 'Suporte',
  sales: 'Vendas',
  onboarding: 'Onboarding',
  technical: 'Técnico',
  faq: 'FAQ',
};

interface KBSnapshot {
  articles: Article[];
  files: KBFile[];
}

const KB_QUERY_KEY = ['knowledge-base'] as const;

/** Manages knowledge base articles and files with create, update, delete, and upload operations. */
export function useKnowledgeBase() {
  const queryClient = useQueryClient();

  const { data, isLoading: loading } = useQuery({
    queryKey: KB_QUERY_KEY,
    queryFn: async (): Promise<KBSnapshot> => {
      const [articlesRes, filesRes] = await Promise.all([
        safeFrom('knowledge_base_articles').select('*').order('updated_at', { ascending: false }),
        safeFrom('knowledge_base_files').select('*').order('created_at', { ascending: false }),
      ]);
      const articles = (articlesRes.data ?? []).map((a: Record<string, unknown>) => ({
        ...a,
        tags: (a.tags as string[]) || [],
      })) as Article[];
      return { articles, files: (filesRes.data ?? []) as KBFile[] };
    },
    staleTime: 30_000,
  });

  const articles = data?.articles ?? [];
  const files = data?.files ?? [];

  const fetchData = useCallback(
    () => queryClient.invalidateQueries({ queryKey: KB_QUERY_KEY }),
    [queryClient]
  );

  const saveArticle = useCallback(
    async (
      payload: {
        title: string;
        content: string;
        category: string;
        tags: string[];
        is_published: boolean;
      },
      editingId?: string
    ) => {
      if (editingId) {
        const { error } = await safeFrom('knowledge_base_articles')
          .update(payload)
          .eq('id', editingId);
        if (error) {
          const errMsg =
            typeof error === 'object' && error !== null && 'message' in error
              ? String((error as { message: unknown }).message)
              : 'Erro desconhecido';
          toast({ title: 'Erro', description: errMsg, variant: 'destructive' });
          return false;
        }
        toast({ title: 'Artigo atualizado!' });
      } else {
        const { error } = await safeFrom('knowledge_base_articles').insert(payload);
        if (error) {
          const errMsg =
            typeof error === 'object' && error !== null && 'message' in error
              ? String((error as { message: unknown }).message)
              : 'Erro desconhecido';
          toast({ title: 'Erro', description: errMsg, variant: 'destructive' });
          return false;
        }
        toast({ title: 'Artigo criado!' });
      }
      void queryClient.invalidateQueries({ queryKey: KB_QUERY_KEY });
      return true;
    },
    [queryClient]
  );

  const deleteArticle = useCallback(
    async (id: string) => {
      await safeFrom('knowledge_base_articles').delete().eq('id', id);
      toast({ title: 'Artigo removido' });
      void queryClient.invalidateQueries({ queryKey: KB_QUERY_KEY });
    },
    [queryClient]
  );

  const uploadFile = useCallback(
    async (file: File) => {
      const fileName = `kb/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('whatsapp-media')
        .upload(fileName, file);
      if (uploadError) {
        const errMsg =
          typeof uploadError === 'object' && uploadError !== null && 'message' in uploadError
            ? String((uploadError as { message: unknown }).message)
            : 'Erro desconhecido';
        toast({
          title: 'Erro no upload',
          description: errMsg,
          variant: 'destructive',
        });
        return;
      }
      const { data: signedData } = await supabase.storage
        .from('whatsapp-media')
        .createSignedUrl(fileName, 86400);
      await safeFrom('knowledge_base_files').insert({
        file_name: file.name,
        file_url: signedData?.signedUrl || '',
        file_type: file.type,
        file_size: file.size,
      });
      toast({ title: 'Arquivo enviado!', description: file.name });
      void queryClient.invalidateQueries({ queryKey: KB_QUERY_KEY });
    },
    [queryClient]
  );

  return { articles, files, loading, fetchData, saveArticle, deleteArticle, uploadFile };
}
