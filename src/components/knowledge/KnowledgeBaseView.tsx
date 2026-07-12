import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Plus,
  BookOpen,
  FileText,
  Search,
  Upload,
  Trash2,
  Edit,
  Brain,
  CheckCircle,
  AlertCircle,
  Clock,
  File,
} from 'lucide-react';
import { useKnowledgeBase, CATEGORIES, CATEGORY_LABELS } from '@/hooks/useKnowledgeBase';

const statusIcon = (status: string) => {
  if (status === 'completed') return <CheckCircle className="h-3.5 w-3.5 text-success" />;
  if (status === 'processing') return <Clock className="h-3.5 w-3.5 animate-spin text-warning" />;
  return <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />;
};

export function KnowledgeBaseView() {
  const { articles, files, fetchData, saveArticle, deleteArticle, uploadFile } = useKnowledgeBase();
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showEditor, setShowEditor] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('articles');
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formCategory, setFormCategory] = useState('general');
  const [formTags, setFormTags] = useState('');
  const [formPublished, setFormPublished] = useState(true);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openNew = () => {
    setEditingId(null);
    setFormTitle('');
    setFormContent('');
    setFormCategory('general');
    setFormTags('');
    setFormPublished(true);
    setShowEditor(true);
  };
  const openEdit = (a: (typeof articles)[0]) => {
    setEditingId(a.id);
    setFormTitle(a.title);
    setFormContent(a.content);
    setFormCategory(a.category);
    setFormTags(a.tags.join(', '));
    setFormPublished(a.is_published);
    setShowEditor(true);
  };

  const save = async () => {
    if (!formTitle.trim() || !formContent.trim()) return;
    const ok = await saveArticle(
      {
        title: formTitle,
        content: formContent,
        category: formCategory,
        tags: formTags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        is_published: formPublished,
      },
      editingId || undefined
    );
    if (ok) setShowEditor(false);
  };

  const filteredArticles = articles.filter((a) => {
    const matchesSearch =
      !search ||
      a.title.toLowerCase().includes(search.toLowerCase()) ||
      a.content.toLowerCase().includes(search.toLowerCase());
    return matchesSearch && (selectedCategory === 'all' || a.category === selectedCategory);
  });

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Base de Conhecimento"
        subtitle="Treine a IA com documentos e artigos da sua empresa"
        actions={
          <div className="flex gap-2">
            <label>
              <Button variant="outline" className="gap-2" asChild>
                <span>
                  <Upload className="h-4 w-4" /> Upload
                </span>
              </Button>
              <input
                type="file"
                className="hidden"
                accept=".pdf,.txt,.md,.doc,.docx"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadFile(f);
                }}
              />
            </label>
            <Button onClick={openNew} className="gap-2">
              <Plus className="h-4 w-4" /> Novo Artigo
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 px-6 pb-4 md:grid-cols-4">
        {[
          {
            icon: BookOpen,
            color: 'bg-primary/20',
            textColor: 'text-primary',
            label: 'Artigos',
            value: articles.length,
          },
          {
            icon: File,
            color: 'bg-secondary/20',
            textColor: 'text-secondary',
            label: 'Arquivos',
            value: files.length,
          },
          {
            icon: CheckCircle,
            color: 'bg-success/20',
            textColor: 'text-success',
            label: 'Publicados',
            value: articles.filter((a) => a.is_published).length,
          },
          {
            icon: Brain,
            color: 'bg-primary/20',
            textColor: 'text-primary',
            label: 'Indexados',
            value: articles.filter((a) => a.embedding_status === 'completed').length,
          },
        ].map(({ icon: Icon, color, textColor, label, value }) => (
          <Card key={label} className="border-border/30 bg-card/50">
            <CardContent className="flex items-center gap-3 p-4">
              <div className={`h-10 w-10 rounded-lg ${color} flex items-center justify-center`}>
                <Icon className={`h-5 w-5 ${textColor}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-lg font-bold">{value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 px-6">
        <TabsList>
          <TabsTrigger value="articles">Artigos</TabsTrigger>
          <TabsTrigger value="files">Arquivos</TabsTrigger>
        </TabsList>
        <TabsContent value="articles" className="mt-4 flex-1">
          <div className="mb-4 flex gap-3">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar artigos..."
                className="pl-9"
              />
            </div>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 gap-4 overflow-y-auto pb-6 md:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence>
              {filteredArticles.map((article) => (
                <motion.div
                  key={article.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                >
                  <Card className="group h-full border-border/30 bg-card/50 transition-all hover:border-secondary/30">
                    <CardContent className="p-4">
                      <div className="mb-2 flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          {statusIcon(article.embedding_status)}
                          <Badge variant="outline" className="text-[10px]">
                            {CATEGORY_LABELS[article.category] || article.category}
                          </Badge>
                        </div>
                        <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => openEdit(article)}
                            aria-label="Editar artigo"
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive"
                            onClick={() => deleteArticle(article.id)}
                            aria-label="Excluir artigo"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <h3 className="mb-1 text-sm font-semibold text-foreground">
                        {article.title}
                      </h3>
                      <p className="mb-3 line-clamp-3 text-xs text-muted-foreground">
                        {article.content}
                      </p>
                      <div className="flex flex-wrap items-center gap-1">
                        {article.tags.slice(0, 3).map((tag) => (
                          <Badge key={tag} variant="secondary" className="h-4 text-[10px]">
                            {tag}
                          </Badge>
                        ))}
                        {!article.is_published && (
                          <Badge
                            variant="outline"
                            className="h-4 border-warning/30 text-[10px] text-warning"
                          >
                            Rascunho
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </TabsContent>
        <TabsContent value="files" className="mt-4">
          <div className="space-y-2 pb-6">
            {files.map((file) => (
              <Card key={file.id} className="border-border/30 bg-card/50">
                <CardContent className="flex items-center gap-3 p-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted/50">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{file.file_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {file.file_size ? `${(file.file_size / 1024).toFixed(1)} KB` : 'N/A'} •{' '}
                      {new Date(file.created_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {statusIcon(file.processing_status)}
                    <Badge variant="outline" className="text-[10px]">
                      {file.processing_status}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
            {files.length === 0 && (
              <div className="py-12 text-center text-muted-foreground">
                <Upload className="mx-auto mb-3 h-10 w-10 opacity-30" />
                <p className="text-sm">Nenhum arquivo enviado</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={showEditor} onOpenChange={setShowEditor}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Artigo' : 'Novo Artigo'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Título *</Label>
              <Input
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Título do artigo"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Categoria</Label>
                <Select value={formCategory} onValueChange={setFormCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {CATEGORY_LABELS[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tags (separadas por vírgula)</Label>
                <Input
                  value={formTags}
                  onChange={(e) => setFormTags(e.target.value)}
                  placeholder="tag1, tag2"
                />
              </div>
            </div>
            <div>
              <Label>Conteúdo *</Label>
              <Textarea
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                rows={12}
                placeholder="Escreva o conteúdo do artigo..."
                className="text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditor(false)}>
              Cancelar
            </Button>
            <Button onClick={save}>{editingId ? 'Salvar' : 'Criar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
