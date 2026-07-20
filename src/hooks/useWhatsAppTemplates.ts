import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth';
import { toast } from 'sonner';
import { getLogger } from '@/lib/logger';

const log = getLogger('useWhatsAppTemplates');

/** Whats App Template interface definition. */
export interface WhatsAppTemplate {
  [key: string]: unknown;
  id: string;
  name: string;
  category: string;
  language: string;
  content: string;
  header_text: string | null;
  footer_text: string | null;
  buttons: Record<string, unknown>[] | null;
  variables: string[] | null;
  status: string;
  whatsapp_connection_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** T E M P L A T E_ C A T E G O R I E S constant. */
export const TEMPLATE_CATEGORIES = [
  { value: 'marketing', label: 'Marketing', color: 'bg-info/20 text-info' },
  { value: 'utility', label: 'Utilidade', color: 'bg-success/20 text-success' },
  { value: 'authentication', label: 'Autenticação', color: 'bg-primary/20 text-primary' },
];

/** T E M P L A T E_ L A N G U A G E S constant. */
export const TEMPLATE_LANGUAGES = [
  { value: 'pt_BR', label: 'Português (BR)' },
  { value: 'en_US', label: 'English (US)' },
  { value: 'es', label: 'Español' },
];

/** S T A T U S_ B A D G E S constant. */
export const STATUS_BADGES: Record<string, { label: string; className: string; iconName: string }> =
  {
    approved: {
      label: 'Aprovado',
      className: 'bg-success/20 text-success',
      iconName: 'CheckCircle2',
    },
    pending: { label: 'Pendente', className: 'bg-warning/20 text-warning', iconName: 'Clock' },
    rejected: {
      label: 'Rejeitado',
      className: 'bg-destructive/20 text-destructive',
      iconName: 'XCircle',
    },
    draft: { label: 'Rascunho', className: 'bg-muted text-muted-foreground', iconName: 'FileText' },
  };

/** E M P T Y_ T E M P L A T E constant. */
export const EMPTY_TEMPLATE: Partial<WhatsAppTemplate> = {
  name: '',
  category: 'utility',
  language: 'pt_BR',
  content: '',
  header_text: '',
  footer_text: '',
  buttons: [],
  variables: [],
  status: 'draft',
};

const TEMPLATES_KEY = ['whatsapp-templates'] as const;

/** Manages WhatsApp message templates with CRUD operations, preview, and variable substitution. */
export function useWhatsAppTemplates() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Partial<WhatsAppTemplate>>(EMPTY_TEMPLATE);
  const [previewTemplate, setPreviewTemplate] = useState<WhatsAppTemplate | null>(null);
  const [previewVariables, setPreviewVariables] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  const { data: templates = [], isLoading: loading } = useQuery({
    queryKey: TEMPLATES_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_templates')
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) {
        log.error('Error fetching templates:', error);
        toast.error('Erro ao carregar templates');
        return [] as WhatsAppTemplate[];
      }
      return (data || []) as unknown as WhatsAppTemplate[];
    },
    staleTime: 30_000,
  });

  const extractVariables = (text: string): string[] => {
    const matches = text.match(/\{\{(\d+)\}\}/g);
    return matches ? [...new Set(matches)].sort() : [];
  };

  const handleContentChange = useCallback((content: string) => {
    setEditingTemplate((prev) => ({ ...prev, content, variables: extractVariables(content) }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!editingTemplate.name?.trim() || !editingTemplate.content?.trim()) {
      toast.error('Nome e conteúdo são obrigatórios');
      return;
    }
    setIsSaving(true);
    try {
      const templateData = {
        name: editingTemplate.name.trim().toLowerCase().replace(/\s+/g, '_'),
        category: editingTemplate.category || 'utility',
        language: editingTemplate.language || 'pt_BR',
        content: editingTemplate.content.trim(),
        header_text: editingTemplate.header_text?.trim() || null,
        footer_text: editingTemplate.footer_text?.trim() || null,
        buttons: (editingTemplate.buttons || []) as unknown as Record<string, never>, // ignore-audit — Supabase JSONB column typed as Record<string,never>; actual data is array of button objects
        variables: editingTemplate.variables || [],
        status: editingTemplate.status || 'draft',
        created_by: user?.id || null,
      };
      if (editingTemplate.id) {
        const { error } = await supabase
          .from('whatsapp_templates')
          .update(templateData)
          .eq('id', editingTemplate.id);
        if (error) throw error;
        toast.success('Template atualizado!');
      } else {
        const { error } = await supabase.from('whatsapp_templates').insert(templateData);
        if (error) throw error;
        toast.success('Template criado!');
      }
      setIsDialogOpen(false);
      setEditingTemplate(EMPTY_TEMPLATE);
      void queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY });
    } catch (err) {
      log.error('Error saving template:', err);
      toast.error('Erro ao salvar template');
    } finally {
      setIsSaving(false);
    }
  }, [editingTemplate, user, queryClient]);

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        const { error } = await supabase.from('whatsapp_templates').delete().eq('id', id);
        if (error) throw error;
        toast.success('Template removido!');
        void queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY });
      } catch (err) {
        log.error('Error deleting:', err);
        toast.error('Erro ao remover template');
      }
    },
    [queryClient]
  );

  const handleDuplicate = useCallback((template: WhatsAppTemplate) => {
    setEditingTemplate({
      ...template,
      id: undefined,
      name: `${template.name}_copy`,
      status: 'draft',
    });
    setIsDialogOpen(true);
  }, []);

  const handlePreview = useCallback((template: WhatsAppTemplate) => {
    setPreviewTemplate(template);
    const vars: Record<string, string> = {};
    (template.variables || []).forEach((v: string) => {
      vars[v] = v === '{{1}}' ? 'João' : v === '{{2}}' ? '12345' : `valor_${v}`;
    });
    setPreviewVariables(vars);
    setIsPreviewOpen(true);
  }, []);

  const renderPreviewContent = useCallback((content: string, variables: Record<string, string>) => {
    let rendered = content;
    Object.entries(variables).forEach(([key, value]) => {
      rendered = rendered.split(key).join(value || key);
    });
    return rendered;
  }, []);

  const filteredTemplates = templates.filter((t) => {
    if (
      search &&
      !t.name.includes(search.toLowerCase()) &&
      !t.content.toLowerCase().includes(search.toLowerCase())
    )
      return false;
    if (filterCategory !== 'all' && t.category !== filterCategory) return false;
    if (filterStatus !== 'all' && t.status !== filterStatus) return false;
    return true;
  });

  const openNew = useCallback(() => {
    setEditingTemplate(EMPTY_TEMPLATE);
    setIsDialogOpen(true);
  }, []);
  const openEdit = useCallback((t: WhatsAppTemplate) => {
    setEditingTemplate(t);
    setIsDialogOpen(true);
  }, []);

  return {
    templates: filteredTemplates,
    loading,
    search,
    setSearch,
    filterCategory,
    setFilterCategory,
    filterStatus,
    setFilterStatus,
    isDialogOpen,
    setIsDialogOpen,
    isPreviewOpen,
    setIsPreviewOpen,
    editingTemplate,
    setEditingTemplate,
    previewTemplate,
    previewVariables,
    setPreviewVariables,
    isSaving,
    handleContentChange,
    handleSave,
    handleDelete,
    handleDuplicate,
    handlePreview,
    renderPreviewContent,
    openNew,
    openEdit,
  };
}
