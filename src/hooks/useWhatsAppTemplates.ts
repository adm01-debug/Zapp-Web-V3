import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth';
import { toast } from 'sonner';
import { getLogger } from '@/lib/logger';
import { evolutionTemplatesGet } from '@/lib/adapters/evolutionOps';

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
  const [isSyncing, setIsSyncing] = useState(false);

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
      return (data || []) as unknown as WhatsAppTemplate[]; // ignore-audit — Supabase row type for whatsapp_templates has no index signature for direct widening to WhatsAppTemplate[]
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

  /**
   * WHATSAPP-05 — conecta a UI à edge `evolution-templates` (contrato real v1):
   * GET lista templates ativos de `evolution_message_templates` e responde
   * { success, templates[] }; POST roteia { action: send|preview }. Aqui o GET
   * sincroniza os templates do WhatsApp/Evolution e persiste em
   * `whatsapp_templates` (merge por nome — sem unique constraint na tabela).
   * NOTA: a edge exige service-role/cron (requireServiceRoleOrCron); invocada
   * do browser com anon key retorna 401 — o fallback mantém a UI local intacta
   * e reporta via toast/log. Se a edge for relaxada para requireUser (padrão
   * de instance-pause-control), a sincronização passa a funcionar sem mudança.
   */
  const syncFromEvolution = useCallback(async (): Promise<number> => {
    setIsSyncing(true);
    try {
      const { data, error } = await evolutionTemplatesGet();
      if (error) throw error;
      const result = data as {
        success?: boolean;
        templates?: Array<Record<string, unknown>>;
        error?: string;
      };
      if (!result?.success || !Array.isArray(result.templates)) {
        throw new Error(result?.error ?? 'Resposta inesperada da edge evolution-templates');
      }
      const rows = result.templates
        .map((t) => ({
          name: String(t.name ?? '').trim().toLowerCase().replace(/\s+/g, '_'),
          category: typeof t.category === 'string' && t.category ? t.category : 'utility',
          language: typeof t.language === 'string' && t.language ? t.language : 'pt_BR',
          content: String(t.content ?? ''),
          header_text: typeof t.header_content === 'string' ? t.header_content : null,
          footer_text: typeof t.footer_text === 'string' ? t.footer_text : null,
          status: (typeof t.approval_status === 'string' ? t.approval_status : 'draft').toLowerCase(),
          variables: extractVariables(String(t.content ?? '')),
          buttons: [],
          created_by: user?.id ?? null,
        }))
        .filter((r) => r.name && r.content);
      if (rows.length === 0) {
        toast.info('Nenhum template ativo encontrado na Evolution');
        return 0;
      }
      let created = 0;
      let updated = 0;
      for (const row of rows) {
        const { data: existing } = await supabase
          .from('whatsapp_templates')
          .select('id')
          .eq('name', row.name)
          .maybeSingle();
        if (existing?.id) {
          const { error } = await supabase.from('whatsapp_templates').update(row).eq('id', existing.id);
          if (!error) updated += 1;
        } else {
          const { error } = await supabase.from('whatsapp_templates').insert(row);
          if (!error) created += 1;
        }
      }
      void queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY });
      toast.success(`Sincronizado com Evolution: ${created} criado(s), ${updated} atualizado(s)`);
      return created + updated;
    } catch (err) {
      log.error('syncFromEvolution — erro ao sincronizar via edge evolution-templates:', err);
      toast.error('Não foi possível sincronizar templates com a Evolution');
      return 0;
    } finally {
      setIsSyncing(false);
    }
  }, [user, queryClient]);

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
      !t.name.toLowerCase().includes(search.toLowerCase()) &&
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
    isSyncing,
    syncFromEvolution,
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
