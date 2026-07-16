import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { Tag, X, Check } from 'lucide-react';
import { CategorySelector } from './CategorySelector';
import { CATEGORY_LABELS, type PendingUpload } from './StickerTypes';

interface UploadPreviewProps {
  pending: PendingUpload;
  onConfirm: (p: PendingUpload) => void;
  onCancel: () => void;
}

export function StickerUploadPreview({ pending, onConfirm, onCancel }: UploadPreviewProps) {
  const [category, setCategory] = useState(pending.selectedCategory);
  const [name, setName] = useState(pending.name);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-2.5 rounded-lg border border-border bg-card p-3"
      role="dialog"
      aria-label="Pré-visualização do upload"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/30 bg-muted/30">
          <img
            src={pending.imageUrl}
            alt="Preview da figurinha"
            className="h-full w-full object-contain p-0.5"
          />
        </div>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-7 flex-1 text-xs"
          placeholder="Nome da figurinha"
          aria-label="Nome da figurinha"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onConfirm({ ...pending, selectedCategory: category, name });
            } else if (e.key === 'Escape') {
              onCancel();
            }
          }}
        />
      </div>

      <div className="flex items-center gap-2">
        <Tag className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="shrink-0 text-[10px] text-muted-foreground">Categoria:</span>
        <CategorySelector value={category} onChange={setCategory} size="sm" />
        {pending.aiCategory !== 'outros' &&
          pending.aiCategory !== 'enviadas' &&
          category !== pending.aiCategory && (
            <button
              type="button"
              onClick={() => setCategory(pending.aiCategory)}
              className="shrink-0 text-[9px] text-primary hover:underline"
              aria-label={`Usar sugestão da IA: ${CATEGORY_LABELS[pending.aiCategory]?.label}`}
            >
              IA sugere: {CATEGORY_LABELS[pending.aiCategory]?.label}
            </button>
          )}
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel}>
          <X className="mr-1 h-3 w-3" /> Cancelar
        </Button>
        <Button
          size="sm"
          className="h-7 text-xs"
          onClick={() => onConfirm({ ...pending, selectedCategory: category, name })}
        >
          <Check className="mr-1 h-3 w-3" /> Salvar
        </Button>
      </div>
    </motion.div>
  );
}
