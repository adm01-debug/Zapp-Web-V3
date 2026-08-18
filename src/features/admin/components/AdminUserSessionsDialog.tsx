import { useCallback, useEffect, useState } from 'react';
import { Monitor, Smartphone, Globe, Clock, LogOut, Loader2, AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface AdminUserSessionsDialogProps {
  userId: string;
  userName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Sessão vinda do RPC zapp.sessions_list (auth.sessions). */
interface AdminSessionRow {
  id: string;
  user_agent: string | null;
  ip: string | null;
  last_active: string;
}

/** Descreve um user_agent de auth.sessions em dispositivo/navegador/SO. */
function describeUserAgent(ua: string | null): { device: string; browser: string; os: string } {
  if (!ua) return { device: 'Dispositivo desconhecido', browser: '—', os: '—' };
  let browser = 'Navegador';
  let os = 'SO';
  if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Edg')) browser = 'Edge';
  else if (ua.includes('Chrome')) browser = 'Chrome';
  else if (ua.includes('Safari')) browser = 'Safari';
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
  const isMobile = /Mobile|Android|iPhone|iPad/.test(ua);
  return { device: isMobile ? 'Dispositivo Móvel' : 'Desktop', browser, os };
}

/**
 * Diálogo admin: listagem de sessões ativas de um usuário (Etapa 56.6) com
 * revogação remota via edge revoke-session (admin/supervisor podem revogar
 * sessões de outros usuários — autorização revalidada no backend).
 */
export function AdminUserSessionsDialog({
  userId,
  userName,
  open,
  onOpenChange,
}: AdminUserSessionsDialogProps) {
  const [sessions, setSessions] = useState<AdminSessionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('sessions_list', {
        p_target_user_id: userId,
        p_admin: true,
      });
      if (error) throw error;
      setSessions((data ?? []) as AdminSessionRow[]);
    } catch (error) {
      console.error('Erro ao listar sessões:', error);
      toast.error('Erro ao listar sessões');
    } finally {
      setLoading(false);
    }
  }, [open, userId]);

  useEffect(() => {
    void fetchSessions();
  }, [fetchSessions]);

  const handleRevoke = async (sessionId: string) => {
    setProcessing(sessionId);
    try {
      const { error } = await supabase.functions.invoke('revoke-session', {
        body: { sessionId },
      });
      if (error) throw error;
      toast.success('Sessão encerrada');
      await fetchSessions();
    } catch {
      toast.error('Erro ao encerrar sessão');
    } finally {
      setProcessing(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            Sessões ativas — {userName}
          </DialogTitle>
          <DialogDescription>
            Sessões de auth.sessions deste usuário. Encerrar uma sessão desconecta o dispositivo.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <AlertCircle className="mb-3 h-10 w-10 text-muted-foreground" />
              <h4 className="font-medium">Nenhuma sessão ativa</h4>
              <p className="text-sm text-muted-foreground">Nenhuma sessão encontrada para este usuário</p>
            </div>
          ) : (
            sessions.map((session) => {
              const { device, browser, os } = describeUserAgent(session.user_agent);
              const isMobile = device === 'Dispositivo Móvel';
              return (
                <div
                  key={session.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-muted p-2">
                      {isMobile ? (
                        <Smartphone className="h-4 w-4" />
                      ) : (
                        <Monitor className="h-4 w-4" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{device}</p>
                      <p className="text-xs text-muted-foreground">
                        {browser} · {os}
                      </p>
                      <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                        <Globe className="h-3 w-3" />
                        {session.ip || 'IP desconhecido'}
                        <span>·</span>
                        <Clock className="h-3 w-3" />
                        Último uso{' '}
                        {formatDistanceToNow(new Date(session.last_active), {
                          addSuffix: false,
                          locale: ptBR,
                        })}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => handleRevoke(session.id)}
                    disabled={processing === session.id}
                  >
                    {processing === session.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <LogOut className="mr-2 h-4 w-4" />
                        Encerrar
                      </>
                    )}
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
