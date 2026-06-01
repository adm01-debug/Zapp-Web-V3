import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tag, Plus, Minus, Loader2, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { dbFrom } from '@/integrations/datasource/db';

interface ContactBulkTagDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactIds: string[];
  allTags: string[];
  onComplete: () => void;
}

export function ContactBulkTagDialog({
  open,
  onOpenChange,
  contactIds,
  allTags,
  onComplete,
}: ContactBulkTagDialogProps) {
  const [mode, setMode] = useState<'add' | 'remove'>('add');
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [newTag, setNewTag] = useState('');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const filteredTags = useMemo(() => {
    const all = [...new Set([...allTags, ...(newTag.trim() ? [newTag.trim()] : [])])];
    if (!search) return all;
    return all.filter((t) => t.toLowerCase().includes(search.toLowerCase()));
  }, [allTags, newTag, search]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  };

  const addNewTag = () => {
    if (!newTag.trim()) return;
    setSelectedTags((prev) => new Set(prev).add(newTag.trim()));
    setNewTag('');
  };

  const handleApply = async () => {
    if (selectedTags.size === 0) return;
    setSaving(true);
    try {
      const { data: contacts, error: contactsError } = await supabase
        .from('contacts')
        .select('id, tags')
        .in('id', contactIds);

      if (contactsError || !contacts)
        throw new Error(contactsError?.message || 'Erro ao buscar contatos');

      for (const contact of contacts) {
        const current = new Set(contact.tags || []);
        if (mode === 'add') {
          selectedTags.forEach((t) => current.add(t));
        } else {
          selectedTags.forEach((t) => current.delete(t));
        }
        await dbFrom('contacts')
          .update({ tags: [...current] })
          .eq('id', contact.id);
      }

      toast.success(
        mode === 'add'
          ? `${selectedTags.size} tag(s) adicionada(s) a ${contactIds.length} contatos`
          : `${selectedTags.size} tag(s) removida(s) de ${contactIds.length} contatos`
      );
      onComplete();
      onOpenChange(false);
      setSelectedTags(new Set());
    } catch {
      toast.error('Erro ao atualizar tags');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-primary" />
            Tags em Lote
          </DialogTitle>
          <DialogDescription>
            {mode === 'add' ? 'Adicionar' : 'Remover'} tags de {contactIds.length} contato(s)
          </DialogDescription>
        </DialogHeader>

        {/* Mode Toggle */}
        <div className="flex gap-2">
          <Button
            variant={mode === 'add' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('add')}
            className="flex-1 gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Adicionar
          </Button>
          <Button
            variant={mode === 'remove' ? 'destructive' : 'outline'}
            size="sm"
            onClick={() => setMode('remove')}
            className="flex-1 gap-1.5"
          >
            <Minus className="h-3.5 w-3.5" />
            Remover
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar tags..."
            className="h-8 pl-9 text-xs"
          />
        </div>

        {/* Tag List */}
        <ScrollArea className="h-48">
          <div className="space-y-1">
            <AnimatePresence>
              {filteredTags.map((tag) => (
                <motion.label
                  key={tag}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-lg p-2 transition-colors',
                    selectedTags.has(tag)
                      ? 'border border-primary/20 bg-primary/10'
                      : 'hover:bg-muted/50'
                  )}
                >
                  <Checkbox
                    checked={selectedTags.has(tag)}
                    onCheckedChange={() => toggleTag(tag)}
                    className="h-3.5 w-3.5"
                  />
                  <Badge variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                </motion.label>
              ))}
            </AnimatePresence>
          </div>
        </ScrollArea>

        {/* Add New Tag */}
        {mode === 'add' && (
          <div className="flex gap-2">
            <Input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addNewTag()}
              placeholder="Nova tag..."
              className="h-8 flex-1 text-xs"
            />
            <Button variant="outline" size="sm" onClick={addNewTag} disabled={!newTag.trim()}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {/* Selected Summary */}
        {selectedTags.size > 0 && (
          <div className="flex flex-wrap gap-1">
            {[...selectedTags].map((t) => (
              <Badge
                key={t}
                variant={mode === 'add' ? 'default' : 'destructive'}
                className="h-5 cursor-pointer text-[10px]"
                onClick={() => toggleTag(t)}
              >
                {t} ×
              </Badge>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleApply}
            disabled={saving || selectedTags.size === 0}
            className="gap-1.5"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : mode === 'add' ? (
              <Plus className="h-4 w-4" />
            ) : (
              <Minus className="h-4 w-4" />
            )}
            {mode === 'add' ? 'Adicionar' : 'Remover'} {selectedTags.size} Tag(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
