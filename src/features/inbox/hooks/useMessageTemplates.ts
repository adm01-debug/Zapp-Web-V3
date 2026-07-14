import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/features/auth';
import { getLogger } from '@/lib/logger';

const log = getLogger('useMessageTemplates');

export interface Template {
  id: string;
  title: string;
  content: string;
  shortcut: string | null;
  category: string;
  use_count: number;
  is_global?: boolean;
  created_at?: string;
  updated_at?: string;
}

export function useMessageTemplates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchTemplates = useCallback(async () => {
    if (!user?.id) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('message_templates')
        .select('*')
        .order('use_count', { ascending: false });
      if (!mountedRef.current) return;
      if (error) throw error;
      setTemplates((data as any) || []);
    } catch (err) {
      log.error('Error fetching templates:', err);
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [user?.id]);

  const addTemplate = useCallback(
    async (template: { title: string; content: string; shortcut: string; category: string }) => {
      if (!user || !template.title || !template.content) {
        toast({
          title: 'Campos obrigatórios',
          description: 'Preencha título e conteúdo do template.',
          variant: 'destructive',
        });
        return false;
      }
      try {
        const { error } = await supabase.from('message_templates').insert({
          user_id: user.id,
          title: template.title,
          content: template.content,
          shortcut: template.shortcut || null,
          category: template.category,
        });
        if (error) throw error;
        toast({ title: 'Template criado!', description: 'Seu template foi salvo com sucesso.' });
        await fetchTemplates();
        return true;
      } catch (err) {
        toast({
          title: 'Erro ao criar template',
          description: err instanceof Error ? err.message : 'Erro',
          variant: 'destructive',
        });
        return false;
      }
    },
    [user, toast, fetchTemplates]
  );

  const updateTemplate = useCallback(
    async (template: Template) => {
      try {
        const { error } = await supabase
          .from('message_templates')
          .update({
            title: template.title,
            content: template.content,
            shortcut: template.shortcut,
            category: template.category,
          })
          .eq('id', template.id);
        if (error) throw error;
        toast({ title: 'Template atualizado!', description: 'As alterações foram salvas.' });
        await fetchTemplates();
        return true;
      } catch {
        toast({ title: 'Erro ao atualizar', variant: 'destructive' });
        return false;
      }
    },
    [toast, fetchTemplates]
  );

  const deleteTemplate = useCallback(
    async (id: string) => {
      try {
        const { error } = await supabase.from('message_templates').delete().eq('id', id);
        if (error) throw error;
        toast({ title: 'Template excluído', description: 'O template foi removido.' });
        await fetchTemplates();
        return true;
      } catch {
        toast({ title: 'Erro ao excluir', variant: 'destructive' });
        return false;
      }
    },
    [toast, fetchTemplates]
  );

  const incrementUseCount = useCallback(async (template: Template) => {
    await supabase
      .from('message_templates')
      .update({ use_count: template.use_count + 1 })
      .eq('id', template.id);
  }, []);

  return {
    templates,
    isLoading,
    fetchTemplates,
    addTemplate,
    updateTemplate,
    deleteTemplate,
    incrementUseCount,
  };
}
