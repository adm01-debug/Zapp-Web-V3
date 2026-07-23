import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { motion } from 'framer-motion';
import { Music, Tag, X, Check } from 'lucide-react';
import { type PendingUpload } from '@/hooks/useAudioManagement';
import { CATEGORY_LABELS } from './audioMemeConstants';
import { AudioMemeCategorySelector } from './AudioMemeCategorySelector';

interface AudioMemeUploadPreviewProps {
  pending: PendingUpload;
  onConfirm: (p: PendingUpload) => void;
  onCancel: () => void;
}

/** Audio Meme Upload Preview component. */
export function AudioMemeUploadPreview({
  pending,
  onConfirm,
  onCancel,
}: AudioMemeUploadPreviewProps) {
  const [category, setCategory] = useState(pending.selectedCategory);
  const [name, setName] = useState(pending.name);
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-2.5 rounded-lg border border-border bg-card p-3"
    >
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Music className="h-4 w-4 text-primary" />
        </div>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-7 flex-1 text-xs"
          placeholder="Nome do áudio"
        />
      </div>
      <div className="flex items-center gap-2">
        <Tag className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="shrink-0 text-[10px] text-muted-foreground">Categoria:</span>
        <AudioMemeCategorySelector value={category} onChange={setCategory} size="sm" />
        {pending.aiCategory !== 'outros' && category !== pending.aiCategory && (
          <button type="button"
            onClick={() => setCategory(pending.aiCategory)}
            className="shrink-0 text-[9px] text-primary hover:underline"
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
