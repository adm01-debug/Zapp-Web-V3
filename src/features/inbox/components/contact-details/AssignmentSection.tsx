import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User, Users } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAgents } from '@/features/admin';
import { useQueues } from '@/hooks/useQueues';
import { useContactAssignment } from '@/hooks/useContactAssignment';
import { Conversation } from '@/types/chat';
import { cn } from '@/lib/utils';

interface AssignmentSectionProps {
  conversation: Conversation;
}

export function AssignmentSection({ conversation }: AssignmentSectionProps) {
  const { agents } = useAgents();
  const { queues } = useQueues();
  const { assignAgent, assignQueue } = useContactAssignment(conversation.contact.id);

  const currentAgent = agents.find((a) => a.id === conversation.assignedTo?.id);

  return (
    <div className="space-y-3">
      {/* Current assignment preview */}
      {currentAgent && (
        <div className="flex items-center gap-2.5 rounded-lg border border-primary/10 bg-primary/5 p-2.5">
          <div className="relative">
            <Avatar className="h-8 w-8 ring-1 ring-primary/20">
              <AvatarImage src={currentAgent.avatar_url || undefined} alt={currentAgent.name} />
              <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                {currentAgent.name[0]}
              </AvatarFallback>
            </Avatar>
            <div
              className={cn(
                'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-background',
                currentAgent.is_active ? 'bg-success' : 'bg-muted-foreground/40'
              )}
            />
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium">{currentAgent.name}</p>
            <p className="text-[10px] text-muted-foreground">
              {currentAgent.is_active ? 'Online' : 'Offline'}
            </p>
          </div>
        </div>
      )}

      <div className="space-y-2.5">
        <div>
          <label className="mb-1 block flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            <User className="h-3 w-3" />
            Atendente
          </label>
          <Select
            defaultValue={conversation.assignedTo?.id}
            onValueChange={(value) => assignAgent(value)}
          >
            <SelectTrigger className="h-9 w-full border-border/30 bg-background/40 transition-colors hover:border-primary/30">
              <SelectValue placeholder="Selecionar atendente" />
            </SelectTrigger>
            <SelectContent className="border-border/30 bg-background">
              {agents
                .filter((a) => a.is_active)
                .map((agent) => (
                  <SelectItem key={agent.id} value={agent.id} className="hover:bg-primary/10">
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Avatar className="h-5 w-5 ring-1 ring-border/30">
                          <AvatarImage src={agent.avatar_url || undefined} alt={agent.name} />
                          <AvatarFallback className="bg-primary/10 text-[10px] text-primary">
                            {agent.name[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div
                          className={cn(
                            'absolute -bottom-px -right-px h-2 w-2 rounded-full ring-1 ring-background',
                            agent.is_active ? 'bg-success' : 'bg-muted-foreground/30'
                          )}
                        />
                      </div>
                      <span>{agent.name}</span>
                    </div>
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="mb-1 block flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            <Users className="h-3 w-3" />
            Fila
          </label>
          <Select
            defaultValue={conversation.queue?.id}
            onValueChange={(value) => assignQueue(value)}
          >
            <SelectTrigger className="h-9 w-full border-border/30 bg-background/40 transition-colors hover:border-primary/30">
              <SelectValue placeholder="Selecionar fila" />
            </SelectTrigger>
            <SelectContent className="border-border/30 bg-background">
              {queues.map((queue) => (
                <SelectItem key={queue.id} value={queue.id} className="hover:bg-primary/10">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-3 w-3 rounded-full ring-1 ring-border/20"
                      style={{ backgroundColor: queue.color }}
                    />
                    <span>{queue.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
