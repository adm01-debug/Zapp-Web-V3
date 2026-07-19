import { queryKeys } from '@/services/api/queryKeys';
/**
 * Barra de ações de atendimento exibida acima do header do chat.
 *
 * Concentra: badge de status (open/in_progress/resolved), troca de
 * status, atribuição manual (assumir, transferir para outro atendente,
 * devolver à fila) e atribuição automática via `ticket-router`.
 */
import { useMemo, useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  Circle,
  Clock,
  UserCheck,
  UserPlus,
  Users,
  Wand2,
  History,
  ArrowRight,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { useTicketStatus } from '@/features/inbox';
import { useAuth } from '@/features/auth';
import { cn } from '@/lib/utils';
import type { TicketStatus } from '@/lib/inbox/ticketStore';

interface TeamProfile {
  id: string;
  name: string;
  avatar_url: string | null;
  is_active: boolean | null;
}

const STATUS_META: Record<TicketStatus, { label: string; icon: typeof Circle; className: string }> =
  {
    open: {
      label: 'Aberto',
      icon: Circle,
      className: 'bg-warning/15 text-warning border-warning/40',
    },
    in_progress: {
      label: 'Em atendimento',
      icon: Clock,
      className: 'bg-primary/15 text-primary border-primary/40',
    },
    resolved: {
      label: 'Resolvido',
      icon: CheckCircle2,
      className:
        'bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] border-[hsl(var(--success))]/40',
    },
  };

interface TicketActionsBarProps {
  contactId: string;
  onOpenHistory?: () => void;
}

function useTeamProfiles() {
  return useQuery<TeamProfile[]>({
    queryKey: queryKeys.teamProfiles.active(),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_team_profiles');
      if (error) throw error;
      return ((data ?? []) as TeamProfile[]).filter((p) => p.is_active !== false);
    },
    staleTime: 60_000,
  });
}

export function TicketActionsBar({ contactId, onOpenHistory }: TicketActionsBarProps) {
  const { profile } = useAuth();
  const { status, assignedTo, setStatus, assumir, transferir, devolverFila, atribuirAuto } =
    useTicketStatus(contactId);
  const { data: team = [] } = useTeamProfiles();
  const [isRouting, setIsRouting] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const meta = STATUS_META[status];
  const Icon = meta.icon;
  const isMine = assignedTo && profile?.id === assignedTo;
  const assignedProfile = useMemo(
    () => team.find((p) => p.id === assignedTo) ?? null,
    [team, assignedTo]
  );

  const handleAuto = async () => {
    setIsRouting(true);
    try {
      await atribuirAuto();
    } finally {
      if (mountedRef.current) setIsRouting(false);
    }
  };

  return (
    <div
      className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-3 py-2 md:px-5"
      data-testid="ticket-actions-bar"
    >
      {/* Status badge + troca */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn('h-7 gap-1.5 border', meta.className)}
            aria-label="Alterar status do atendimento"
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">{meta.label}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuLabel className="text-[11px]">Alterar status</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {(Object.keys(STATUS_META) as TicketStatus[]).map((s) => {
            const m = STATUS_META[s];
            const SIcon = m.icon;
            return (
              <DropdownMenuItem
                key={s}
                onClick={() => setStatus(s)}
                disabled={s === status}
                className="text-xs"
              >
                <SIcon className="mr-2 h-3.5 w-3.5" />
                {m.label}
                {s === status && (
                  <Badge variant="outline" className="ml-auto text-[9px]">
                    atual
                  </Badge>
                )}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Atribuição */}
      <div className="flex items-center gap-1.5 text-xs">
        <Users className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">Atendente:</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs font-medium">
              {assignedProfile ? (
                assignedProfile.name
              ) : (
                <span className="italic text-muted-foreground">não atribuído</span>
              )}
              <ArrowRight className="h-3 w-3 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-80 w-56 overflow-auto">
            <DropdownMenuLabel className="text-[11px]">Atribuir atendimento</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {!isMine && profile?.id && (
              <DropdownMenuItem onClick={() => assumir()} className="text-xs">
                <UserCheck className="mr-2 h-3.5 w-3.5 text-primary" />
                Assumir atendimento
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={handleAuto} disabled={isRouting} className="text-xs">
              <Wand2 className="mr-2 h-3.5 w-3.5 text-primary" />
              {isRouting ? 'Roteando…' : 'Atribuir automaticamente'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px] text-muted-foreground">
              Transferir para…
            </DropdownMenuLabel>
            {team.length === 0 && (
              <div className="px-2 py-3 text-[11px] text-muted-foreground">
                Nenhum atendente ativo
              </div>
            )}
            {team.map((p) => (
              <DropdownMenuItem
                key={p.id}
                onClick={() => transferir(p.id)}
                disabled={p.id === assignedTo}
                className="text-xs"
              >
                <UserPlus className="mr-2 h-3.5 w-3.5" />
                {p.name}
                {p.id === assignedTo && (
                  <Badge variant="outline" className="ml-auto text-[9px]">
                    atual
                  </Badge>
                )}
              </DropdownMenuItem>
            ))}
            {assignedTo && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => devolverFila()}
                  className="text-xs text-destructive"
                >
                  Devolver à fila
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Histórico */}
      {onOpenHistory && (
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
          onClick={onOpenHistory}
        >
          <History className="h-3.5 w-3.5" />
          Histórico
        </Button>
      )}
    </div>
  );
}