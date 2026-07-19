import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, Activity } from 'lucide-react';
import { BridgeStatus } from '../types';

interface BridgeStatusBadgeProps {
  status: BridgeStatus;
  isConfigured: boolean;
}

/** Bridge Status Badge component for the connections section. */
export function BridgeStatusBadge({ status, isConfigured }: BridgeStatusBadgeProps) {
  if (!isConfigured) {
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="w-3 h-3" /> Não configurado
      </Badge>
    );
  }

  if (status === 'online') {
    return (
      <Badge className="gap-1 bg-emerald-500/15 text-emerald-500 border-emerald-500/30">
        <CheckCircle2 className="w-3 h-3" /> Online
      </Badge>
    );
  }

  if (status === 'offline') {
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="w-3 h-3" /> Offline
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" className="gap-1">
      <Activity className="w-3 h-3" /> Verificando…
    </Badge>
  );
}
