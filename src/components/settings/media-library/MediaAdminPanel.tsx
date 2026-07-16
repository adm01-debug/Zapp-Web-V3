import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Card } from '@/components/ui/card';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Search,
  Trash2,
  Loader2,
  Upload,
  Package,
  Filter,
  RefreshCw,
  AlertTriangle,
  Wand2,
  Sparkles,
} from 'lucide-react';
import { useMediaLibrary } from '@/hooks/media-library/useMediaLibrary';
import { useMediaUpload } from '@/hooks/media-library/useMediaUpload';
import type { MediaType } from '@/hooks/media-library/useMediaLibrary';
import { StatsCards } from './StatsCards';
import { AIGenerateDialog } from './AIGenerateDialog';
import { MediaItemRow } from './MediaItemRow';

export function MediaAdminPanel({ type }: { type: MediaType }) {
  const lib = useMediaLibrary(type);
  const upload = useMediaUpload(type, lib.fetchItems);
  const [showGenDialog, setShowGenDialog] = useState(false);

  return (
    <div className="space-y-4">
      <StatsCards items={lib.items} type={type} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={lib.search}
            onChange={(e) => lib.setSearch(e.target.value)}
            placeholder="Buscar por nome ou categoria..."
            className="h-9 pl-9 text-sm"
          />
        </div>
        <Select value={lib.filterCategory} onValueChange={lib.setFilterCategory}>
          <SelectTrigger className="h-9 w-[160px] text-sm">
            <Filter className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas ({lib.items.length})</SelectItem>
            {lib.existingCategories.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {lib.categories?.[cat] || '📦'} {cat} (
                {lib.items.filter((i) => i.category === cat).length})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <input
          ref={upload.fileInputRef}
          type="file"
          accept={upload.acceptTypes}
          className="hidden"
          multiple
          onChange={upload.handleBulkUpload}
        />
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-1.5"
          onClick={() => upload.fileInputRef.current?.click()}
          disabled={upload.bulkUploading}
        >
          {upload.bulkUploading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {upload.uploadProgress}%
            </>
          ) : (
            <>
              <Upload className="h-3.5 w-3.5" />
              Upload em massa
            </>
          )}
        </Button>
        {type === 'audio_memes' && (
          <Button
            variant="default"
            size="sm"
            className="h-9 gap-1.5"
            onClick={() => setShowGenDialog(true)}
          >
            <Sparkles className="h-3.5 w-3.5" /> Gerar com IA
          </Button>
        )}
        <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={lib.fetchItems}>
          <RefreshCw className="h-3.5 w-3.5" /> Atualizar
        </Button>
      </div>

      {type === 'audio_memes' && (
        <AIGenerateDialog
          open={showGenDialog}
          onOpenChange={setShowGenDialog}
          onSaved={lib.fetchItems}
        />
      )}

      <AnimatePresence>
        {lib.selected.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-2.5"
          >
            <Badge variant="secondary" className="text-xs">
              {lib.selected.size} selecionados
            </Badge>
            <Select onValueChange={lib.handleBulkCategoryChange}>
              <SelectTrigger className="h-7 w-[150px] text-xs">
                <SelectValue placeholder="Mover para..." />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(lib.categories ?? {}).map(([cat, emoji]) => (
                  <SelectItem key={cat} value={cat} className="text-xs">
                    {emoji} {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={lib.handleBulkReclassify}
              disabled={lib.reclassifying}
            >
              {lib.reclassifying ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Wand2 className="h-3 w-3" />
              )}
              {lib.reclassifying ? 'Classificando...' : 'Reclassificar IA'}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="h-7 gap-1 text-xs">
                  <Trash2 className="h-3 w-3" /> Excluir selecionados
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    Confirmar exclusão em massa
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Tem certeza que deseja excluir {lib.selected.size} itens?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={lib.handleBulkDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Excluir {lib.selected.size} itens
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-7 text-xs"
              onClick={() => lib.setSelected(new Set())}
            >
              Limpar seleção
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <Card className="border-border/50">
        <ScrollArea className="h-[500px]">
          <div>
            <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground">
              <Checkbox
                checked={lib.filtered.length > 0 && lib.selected.size === lib.filtered.length}
                onCheckedChange={lib.toggleSelectAll}
                className="mr-1"
              />
              <span className="w-12">Preview</span>
              <span className="flex-1">Nome</span>
              <span className="hidden w-[130px] sm:block">Categoria</span>
              <span className="hidden w-16 text-center sm:block">Usos</span>
              <span className="hidden w-12 text-center sm:block">⭐</span>
              <span className="w-24 text-right">Ações</span>
            </div>
            {lib.loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : lib.filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Package className="mb-3 h-10 w-10 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">Nenhum item encontrado</p>
              </div>
            ) : (
              lib.filtered.map((item) => (
                <MediaItemRow
                  key={item.id}
                  item={item}
                  type={type}
                  isEditing={lib.editingId === item.id}
                  editName={lib.editName}
                  isSelected={lib.selected.has(item.id)}
                  isPlaying={lib.playingId === item.id}
                  categories={lib.categories}
                  onToggleSelect={() => lib.toggleSelect(item.id)}
                  onPreview={() => lib.handlePreview(item)}
                  onStartEdit={() => {
                    lib.setEditingId(item.id);
                    lib.setEditName(item.name || '');
                  }}
                  onEditNameChange={lib.setEditName}
                  onConfirmRename={() => lib.handleRename(item)}
                  onCancelEdit={() => lib.setEditingId(null)}
                  onCategoryChange={(cat) => lib.handleSingleCategoryChange(item, cat)}
                  onToggleFavorite={() => lib.handleToggleFavorite(item)}
                  onDelete={() => lib.handleDelete(item)}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </Card>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Exibindo {lib.filtered.length} de {lib.items.length} itens
        </span>
        {lib.selected.size > 0 && <span>{lib.selected.size} selecionados</span>}
      </div>
    </div>
  );
}
