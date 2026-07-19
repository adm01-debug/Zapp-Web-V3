import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { queryKeys } from '@/services/api/queryKeys';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTransferTeamConversation } from '@/hooks/useTeamChat';
import { TeamConversation } from '@/hooks/useTeamChat';
import { Building2, Loader2 } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversation: TeamConversation;
}

/** Transfer Conversation Dialog component for the team chat section. */
export function TransferConversationDialog({ open, onOpenChange, conversation }: Props) {
  const [selectedDeptId, setSelectedDeptId] = useState<string>('');
  const transferMutation = useTransferTeamConversation();

  const { data: departments = [] } = useQuery({
    queryKey: queryKeys.departmentChat.list(),
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('departments')
        .select('id, name')
        .eq('is_active', true);
      if (error) throw error;
      return data;
    },
  });

  const handleTransfer = () => {
    if (!selectedDeptId) return;

    transferMutation.mutate(
      {
        conversationId: conversation.id,
        departmentId: selectedDeptId,
        metadata: {
          ...(conversation.metadata || {}),
          transferred_at: new Date().toISOString(),
          transferred_by: 'Support Agent',
          original_department_id: conversation.department_id,
        },
      },
      {
        onSuccess: () => onOpenChange(false),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Transferir Conversa</DialogTitle>
          <DialogDescription>
            Selecione o departamento de destino para esta conversa.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <Select value={selectedDeptId} onValueChange={setSelectedDeptId}>
            <SelectTrigger className="w-full" data-testid="dept-select-trigger">
              <SelectValue placeholder="Selecione um departamento" />
            </SelectTrigger>
            <SelectContent>
              {departments.map((dept) => (
                <SelectItem
                  key={dept.id}
                  value={dept.id}
                  disabled={dept.id === conversation.department_id}
                  data-testid={`dept-option-${dept.name}`}
                >
                  {dept.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleTransfer}
            disabled={!selectedDeptId || transferMutation.isPending}
            className="gap-2"
            data-testid="confirm-transfer-btn"
          >
            {transferMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Building2 className="h-4 w-4" />
            )}
            Transferir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}