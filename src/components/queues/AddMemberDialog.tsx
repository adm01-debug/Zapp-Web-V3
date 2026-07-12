import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Check, Loader2 } from 'lucide-react';

interface Profile {
  id: string;
  name: string;
  avatar_url: string | null;
  is_active: boolean;
}

interface AddMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  queueId: string;
  existingMemberIds: string[];
  onAddMember: (profileId: string) => Promise<void>;
}

export function AddMemberDialog({
  open,
  onOpenChange,
  queueId: _queueId,
  existingMemberIds,
  onAddMember,
}: AddMemberDialogProps) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      fetchProfiles();
    }
  }, [open]);

  const fetchProfiles = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, avatar_url, is_active')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setProfiles(data || []);
    } catch (err) {
      log.error('Error fetching profiles:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddMember = async (profileId: string) => {
    setAddingId(profileId);
    try {
      await onAddMember(profileId);
    } finally {
      setAddingId(null);
    }
  };

  const availableProfiles = profiles.filter((p) => !existingMemberIds.includes(p.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border/30 bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">Adicionar Atendente</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : availableProfiles.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <p>Todos os atendentes já estão nesta fila.</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[300px]">
            <div className="space-y-2">
              {availableProfiles.map((profile) => (
                <div
                  key={profile.id}
                  className="flex items-center justify-between rounded-lg bg-muted/20 p-3 transition-colors hover:bg-muted/30"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={profile.avatar_url || undefined} />
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {profile.name[0]}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-medium text-foreground">{profile.name}</span>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleAddMember(profile.id)}
                    disabled={addingId === profile.id}
                  >
                    {addingId === profile.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Check className="mr-1 h-4 w-4" />
                        Adicionar
                      </>
                    )}
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
