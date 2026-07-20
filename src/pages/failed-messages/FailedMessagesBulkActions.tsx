import { RotateCw, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/** Failed Messages Bulk Actions. */
export function FailedMessagesBulkActions({
  canEdit,
  selectedCount,
  onClearSelection,
  onReprocess,
  onAbandon,
  isBulkRetrying,
  isBulkAbandoning,
}: {
  canEdit: boolean;
  selectedCount: number;
  onClearSelection: () => void;
  onReprocess: () => void;
  onAbandon: () => void;
  isBulkRetrying: boolean;
  isBulkAbandoning: boolean;
}) {
  if (!canEdit || selectedCount === 0) return null;

  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardContent className="p-3 flex items-center justify-between gap-3 flex-wrap">
        <span className="text-sm">
          <strong>{selectedCount}</strong> item(s) selecionado(s)
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onClearSelection}
          >
            Limpar seleção
          </Button>
          <Button
            size="sm"
            onClick={onReprocess}
            disabled={isBulkRetrying}
          >
            <RotateCw className={cn('h-4 w-4 mr-2', isBulkRetrying && 'animate-spin')} />
            Reprocessar selecionados
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={onAbandon}
            disabled={isBulkAbandoning}
          >
            <Ban className="h-4 w-4 mr-2" />
            Abandonar selecionados
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
