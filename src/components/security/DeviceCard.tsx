import { motion } from 'framer-motion';
import {
  Smartphone,
  Monitor,
  Globe,
  Clock,
  Trash2,
  Shield,
  ShieldCheck,
  LogOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface SessionCardProps {
  session: { id: string; device_id: string | null; ip_address: string | null; started_at: string };
  device?: { device_name: string | null; browser: string | null; os: string | null } | null;
  isCurrentSession: boolean;
  isProcessing: boolean;
  onEndSession: (id: string) => void;
}

/** Session Card component for the security section. */
export function SessionCard({
  session,
  device,
  isCurrentSession,
  isProcessing,
  onEndSession,
}: SessionCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex items-center justify-between rounded-lg border p-4 ${isCurrentSession ? 'border-primary bg-primary/5' : 'bg-card'}`}
    >
      <div className="flex items-center gap-4">
        <div className={`rounded-lg p-2 ${isCurrentSession ? 'bg-primary/10' : 'bg-muted'}`}>
          <Monitor className={`h-5 w-5 ${isCurrentSession ? 'text-primary' : ''}`} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h4 className="font-medium">{device?.device_name || 'Dispositivo desconhecido'}</h4>
            {isCurrentSession && <Badge className="bg-primary">Sessão atual</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            {device?.browser} · {device?.os}
          </p>
          <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <Globe className="h-3 w-3" />
            {session.ip_address}
            <span>·</span>
            <Clock className="h-3 w-3" />
            Ativa{' '}
            {formatDistanceToNow(new Date(session.started_at), { addSuffix: false, locale: ptBR })}
          </p>
        </div>
      </div>
      {!isCurrentSession && (
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => onEndSession(session.id)}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-current" />
          ) : (
            <>
              <LogOut className="mr-2 h-4 w-4" />
              Encerrar
            </>
          )}
        </Button>
      )}
    </motion.div>
  );
}

interface DeviceCardProps {
  device: {
    id: string;
    device_name: string | null;
    browser: string | null;
    os: string | null;
    ip_address: string | null;
    is_trusted: boolean | null;
    last_seen_at: string;
  };
  isCurrentDevice: boolean;
  isProcessing: boolean;
  onTrust: (id: string) => void;
  onRemove: (id: string) => void;
}

/** Device Card component for the security section. */
export function DeviceCard({
  device,
  isCurrentDevice,
  isProcessing,
  onTrust,
  onRemove,
}: DeviceCardProps) {
  const isMobile =
    device.os?.toLowerCase().includes('mobile') ||
    device.os?.toLowerCase().includes('android') ||
    device.os?.toLowerCase().includes('ios');

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-lg border p-4 ${isCurrentDevice ? 'border-primary bg-primary/5' : 'bg-card'}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className={`rounded-lg p-2 ${isCurrentDevice ? 'bg-primary/10' : 'bg-muted'}`}>
            {isMobile ? (
              <Smartphone className={`h-5 w-5 ${isCurrentDevice ? 'text-primary' : ''}`} />
            ) : (
              <Monitor className={`h-5 w-5 ${isCurrentDevice ? 'text-primary' : ''}`} />
            )}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="font-medium">{device.device_name || 'Dispositivo'}</h4>
              {isCurrentDevice && <Badge className="bg-primary">Este dispositivo</Badge>}
              {device.is_trusted && (
                <Badge variant="outline" className="border-success/20 bg-success/10 text-success">
                  <ShieldCheck className="mr-1 h-3 w-3" />
                  Confiável
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {device.browser} · {device.os}
            </p>
            <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Globe className="h-3 w-3" />
                {device.ip_address}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Último acesso:{' '}
                {formatDistanceToNow(new Date(device.last_seen_at), {
                  addSuffix: true,
                  locale: ptBR,
                })}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!device.is_trusted && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onTrust(device.id)}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-current" />
              ) : (
                <>
                  <Shield className="mr-2 h-4 w-4" />
                  Confiar
                </>
              )}
            </Button>
          )}
          {!isCurrentDevice && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remover dispositivo?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Isso removerá o dispositivo da lista e encerrará todas as sessões associadas.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => onRemove(device.id)}
                    className="bg-destructive hover:bg-destructive"
                  >
                    Remover
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>
    </motion.div>
  );
}
