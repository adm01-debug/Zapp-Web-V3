import { useState } from 'react';
import { Bell, BellOff, Shield, Smartphone, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useSecurityPushNotifications } from '@/hooks/useSecurityPushNotifications';

export function SecurityNotificationsPanel() {
  const {
    isSupported,
    permission,
    isSubscribed,
    isLoading,
    requestPermission: _requestPermission,
    toggleSubscription,
    showNotification,
  } = usePushNotifications();

  const { isEnabled: _securityNotificationsEnabled } = useSecurityPushNotifications();
  const [testSending, setTestSending] = useState(false);

  const handleToggle = async () => {
    await toggleSubscription();
  };

  const handleTestNotification = async () => {
    setTestSending(true);
    try {
      await showNotification({
        title: '🔐 Teste de Alerta de Segurança',
        body: 'Esta é uma notificação de teste do sistema de segurança.',
        tag: 'test-security-' + Date.now(),
        data: {
          category: 'security',
          test: true,
        },
      });
    } finally {
      setTestSending(false);
    }
  };

  if (!isSupported) {
    return (
      <Card className="border-warning/20 bg-warning/5">
        <CardContent className="flex items-start gap-4 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-warning" />
          <div>
            <h4 className="font-medium">Notificações Push Não Suportadas</h4>
            <p className="mt-1 text-sm text-muted-foreground">
              Seu navegador não suporta notificações push. Tente usar Chrome, Firefox, Edge ou
              Safari.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Notificações Push de Segurança
        </CardTitle>
        <CardDescription>
          Receba alertas de segurança em tempo real no seu navegador
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Status */}
        <div className="flex items-center justify-between rounded-lg border bg-card p-4">
          <div className="flex items-center gap-4">
            <div className={`rounded-lg p-2 ${isSubscribed ? 'bg-success/10' : 'bg-muted'}`}>
              {isSubscribed ? (
                <Bell className="h-5 w-5 text-success" />
              ) : (
                <BellOff className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div>
              <h4 className="font-medium">Status das Notificações</h4>
              <div className="mt-1 flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={
                    permission === 'granted'
                      ? 'border-success/20 bg-success/10 text-success'
                      : permission === 'denied'
                        ? 'border-destructive/20 bg-destructive/10 text-destructive'
                        : 'border-warning/20 bg-warning/10 text-warning'
                  }
                >
                  {permission === 'granted'
                    ? 'Permitido'
                    : permission === 'denied'
                      ? 'Bloqueado'
                      : 'Não solicitado'}
                </Badge>
                {isSubscribed && (
                  <Badge variant="outline" className="border-success/20 bg-success/10 text-success">
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    Ativo
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <Switch
            checked={isSubscribed}
            onCheckedChange={handleToggle}
            disabled={isLoading || permission === 'denied'}
          />
        </div>

        {/* Permission denied message */}
        {permission === 'denied' && (
          <div className="flex items-start gap-4 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
            <div>
              <h4 className="font-medium text-destructive">Permissão Negada</h4>
              <p className="mt-1 text-sm text-muted-foreground">
                As notificações foram bloqueadas. Para ativá-las, clique no ícone de cadeado na
                barra de endereço e permita notificações para este site.
              </p>
            </div>
          </div>
        )}

        {/* Security alerts info */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Tipos de alertas que você receberá:</Label>
          <div className="grid gap-3">
            <div className="flex items-center gap-3 rounded-lg border bg-muted/50 p-3">
              <Shield className="h-4 w-4 text-destructive" />
              <div>
                <span className="text-sm font-medium">Novo dispositivo detectado</span>
                <p className="text-xs text-muted-foreground">
                  Quando alguém fizer login de um dispositivo desconhecido
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border bg-muted/50 p-3">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <div>
                <span className="text-sm font-medium">Tentativas de login suspeitas</span>
                <p className="text-xs text-muted-foreground">
                  Múltiplas tentativas de login falhadas
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border bg-muted/50 p-3">
              <Smartphone className="h-4 w-4 text-info" />
              <div>
                <span className="text-sm font-medium">Alterações de segurança</span>
                <p className="text-xs text-muted-foreground">
                  Alterações de senha, MFA ou configurações de segurança
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Test button */}
        {isSubscribed && (
          <Button
            variant="outline"
            className="w-full"
            onClick={handleTestNotification}
            disabled={testSending}
          >
            {testSending ? (
              <>
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-current" />
                Enviando...
              </>
            ) : (
              <>
                <Bell className="mr-2 h-4 w-4" />
                Testar Notificação
              </>
            )}
          </Button>
        )}

        {/* Info */}
        <div className="flex items-start gap-4 rounded-lg border border-info/20 bg-info/5 p-4">
          <Shield className="mt-0.5 h-5 w-5 text-info" />
          <div>
            <h4 className="font-medium text-info">Por que ativar?</h4>
            <p className="mt-1 text-sm text-muted-foreground">
              Receba alertas instantâneos sobre atividades suspeitas na sua conta, mesmo quando não
              estiver usando o aplicativo. Isso permite uma resposta rápida a possíveis ameaças de
              segurança.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
