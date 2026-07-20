import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchProfileIdByUserId, insertContactNote } from '../hooks/useContactNotesMutations';
import { Button } from '@/components/ui/button';
import { Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ViewersIndicator } from './collaboration/ViewersIndicator';
import { InternalNotesPanel } from './collaboration/InternalNotesPanel';
import { HandoffDialog } from './collaboration/HandoffDialog';
import { dbFrom } from '@/integrations/datasource/db';
import { queryKeys } from '@/services/api/queryKeys';

interface RealtimeCollaborationProps {
  contactId: string;
  className?: string;
}

/** Realtime Collaboration component. */
export function RealtimeCollaboration({ contactId, className }: RealtimeCollaborationProps) {
  const [handoffOpen, setHandoffOpen] = useState(false);
  const queryClient = useQueryClient();

  const handleHandoff = async (agentId: string, comment: string) => {
    await dbFrom('contacts').update({ assigned_to: agentId }).eq('id', contactId);
    if (comment) {
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes.user?.id;
      if (!userId) return;
      const profile = await fetchProfileIdByUserId(userId);
      if (profile) {
        await insertContactNote({
          contact_id: contactId,
          author_id: profile.id,
          content: `Transferido: ${comment}`,
        });
        void queryClient.invalidateQueries({ queryKey: queryKeys.internalNotes.contact(contactId) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.contactDetails.notes(contactId) });
      }
    }
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <ViewersIndicator contactId={contactId} />
        <Button variant="outline" size="sm" onClick={() => setHandoffOpen(true)}>
          <Users className="mr-2 h-4 w-4" />
          Transferir
        </Button>
      </div>
      <InternalNotesPanel contactId={contactId} />
      <HandoffDialog
        open={handoffOpen}
        onOpenChange={setHandoffOpen}
        contactId={contactId}
        onHandoff={handleHandoff}
      />
    </div>
  );
}

/** Re-exported module members. */
export { ViewersIndicator, InternalNotesPanel, HandoffDialog };