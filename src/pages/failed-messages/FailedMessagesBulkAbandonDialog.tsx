import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { type useFailedMessagesUI } from '@/features/admin/hooks/monitoring/useFailedMessagesUI';

export function FailedMessagesBulkAbandonDialog({ ui, onConfirm }: { ui: ReturnType<typeof useFailedMessagesUI>; onConfirm: (ids: string[], reason: string) => void }) {
  return (
    <AlertDialog open={ui.confirmBulkAbandon} onOpenChange={(o) => {
      ui.setConfirmBulkAbandon(o);
      if (!o) ui.setBulkReason('');
    }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Abandonar {ui.selectedIds.size} item(s)?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta ação marca as mensagens selecionadas como abandonadas e elas não serão mais reprocessadas
            automaticamente. Você ainda pode forçar reprocesso manual depois.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">
            Motivo (opcional, fica registrado no log)
          </label>
          <Textarea
            value={ui.bulkReason}
            onChange={(e) => ui.setBulkReason(e.target.value)}
            placeholder="ex.: limpeza de exhausted antigos, instância descontinuada..."
            rows={3}
            maxLength={500}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              onConfirm(Array.from(ui.selectedIds as Set<string>), ui.bulkReason);
              ui.setSelectedIds(new Set());
              ui.setConfirmBulkAbandon(false);
              ui.setBulkReason('');
            }}
          >
            Confirmar abandono
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
