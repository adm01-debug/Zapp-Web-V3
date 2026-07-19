/* eslint-disable react-refresh/only-export-components */
import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Edit2, Copy, Search, Folder, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { AVAILABLE_VARIABLES, replaceVariables } from './template-utils';
import {
  TemplateEditorDialog,
  VariableInserter,
  TemplatePreview,
} from './templates/TemplateEditorDialog';
import { useMessageTemplates, type Template } from '../hooks/useMessageTemplates';

// Variable highlighter
function VariableHighlighter({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(\{\{[^}]+\}\})/g);
  return (
    <span className={className}>
      {parts.map((part, index) => {
        if (part.match(/^\{\{[^}]+\}\}$/)) {
          return (
            <Badge key={`${part}-${index}`} variant="secondary" className="mx-0.5 text-xs">
              {part.slice(2, -2)}
            </Badge>
          );
        }
        return <span key={`${part}-${index}`}>{part}</span>;
      })}
    </span>
  );
}

interface TemplateWithVariablesProps {
  onUseTemplate: (content: string, variables: Record<string, string>) => void;
  contactData?: { name?: string; company?: string; job_title?: string };
}

/** Templates With Variables component. */
export function TemplatesWithVariables({ onUseTemplate, contactData }: TemplateWithVariablesProps) {
  const { templates, fetchTemplates, addTemplate, updateTemplate } = useMessageTemplates();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const filteredTemplates = useMemo(() => {
    return templates.filter((t) => {
      const matchesSearch =
        !search ||
        t.title.toLowerCase().includes(search.toLowerCase()) ||
        t.content.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = categoryFilter === 'all' || t.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [templates, search, categoryFilter]);

  const categories = useMemo(
    () => ['all', ...Array.from(new Set(templates.map((t) => t.category)))],
    [templates]
  );

  const handleUseTemplate = (template: Template) => {
    const processedContent = replaceVariables(template.content, contactData);
    onUseTemplate(processedContent, {});
    toast.success(`Template "${template.title}" aplicado!`);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Templates com Variáveis
            </CardTitle>
            <CardDescription>Mensagens dinâmicas com dados do contato</CardDescription>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setEditingTemplate(null);
              setEditorOpen(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" />
            Novo
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar templates..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-32">
              <Folder className="mr-2 h-4 w-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categories.map((cat: string) => (
                <SelectItem key={cat} value={cat}>
                  {cat === 'all' ? 'Todas' : cat.charAt(0).toUpperCase() + cat.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <ScrollArea className="h-64">
          <div className="space-y-2">
            <AnimatePresence>
              {filteredTemplates.map((template, index) => (
                <motion.div
                  key={template.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ delay: index * 0.05 }}
                  className="group rounded-lg border p-3 transition-colors hover:border-primary/50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="truncate text-sm font-medium">{template.title}</h4>
                        <Badge variant="secondary" className="text-xs">
                          {template.category}
                        </Badge>
                        {template.shortcut && (
                          <Badge variant="outline" className="text-xs">
                            /{template.shortcut}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        <VariableHighlighter text={template.content} />
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label="Editar template"
                        onClick={() => {
                          setEditingTemplate(template);
                          setEditorOpen(true);
                        }}
                      >
                        <Edit2 className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label="Usar template"
                        onClick={() => handleUseTemplate(template)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {filteredTemplates.length === 0 && (
              <div className="py-8 text-center text-muted-foreground">
                <FileText className="mx-auto mb-2 h-10 w-10 opacity-50" />
                <p>Nenhum template encontrado</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
      <TemplateEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        template={editingTemplate}
        onSave={async (data) => {
          if (editingTemplate) {
            await updateTemplate({ ...editingTemplate, ...data } as Template);
          } else {
            await addTemplate(
              data as { title: string; content: string; shortcut: string; category: string }
            );
          }
        }}
      />
    </Card>
  );
}

/** Re-exported module members. */
export {
  VariableHighlighter,
  TemplatePreview,
  VariableInserter,
  replaceVariables,
  AVAILABLE_VARIABLES,
};
