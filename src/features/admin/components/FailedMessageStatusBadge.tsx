import { Badge } from '@/components/ui/badge';
import { FailedMessageStatus } from '@/features/admin';

const STATUS_LABEL: Record<FailedMessageStatus, string> = {
  pending: 'Pendente',
  retrying: 'Reprocessando',
  succeeded: 'Sucesso',
  abandoned: 'Abandonado',
  failed: 'Falhou',
};

const STATUS_VARIANT: Record<FailedMessageStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'secondary',
  retrying: 'default',
  succeeded: 'outline',
  abandoned: 'destructive',
  failed: 'destructive',
};

interface Props {
  status: FailedMessageStatus;
  className?: string;
}

export function FailedMessageStatusBadge({ status, className }: Props) {
  return (
    <Badge variant={STATUS_VARIANT[status]} className={className}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}
