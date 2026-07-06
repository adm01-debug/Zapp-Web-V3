import { useState } from 'react';
import { Mail, Key, Clock, Signature, Shield, Info, Wifi, Plus, Building2, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { EmailAccountSelector } from '@/components/gmail';
import { type TokenStatus as GmailTokenStatus } from '@/hooks/useGmailOAuthFlow';
import { EmailSignatureEditor } from '@/components/email/EmailSignatureEditor';
import { EmailSLADashboard } from '@/components/email/EmailSLADashboard';
import { useEmail } from '@/hooks/useEmail';
import { useOutlookEmail } from '@/hooks/useOutlookEmail';

export function EmailSettingsPage() {
  const {
    accounts: emailAccounts,
    tokenStatus,
    activeAccountId: emailActiveId,
    setActiveAccountId: setEmailActiveId,
    startOAuth: startEmailOAuth,
    disconnect: disconnectEmail,
    syncNow,
    isSyncing: isEmailSyncing,
  } = useEmail();

  const {
    accounts: outlookAccounts,
    activeAccountId: outlookActiveId,
    setActiveAccountId: setOutlookActiveId,
    startOAuth: startOutlookOAuth,
    syncInbox: syncOutlook,
    isSyncing: isOutlookSyncing,
    disconnect: disconnectOutlook,
  } = useOutlookEmail();

  const [slaThreshold, setSlaThreshold] = useState('480');
  const [slaWarningPct, setSlaWarningPct] = useState('80');
  const [businessHoursOnly, setBusinessHoursOnly] = useState(true);
  const [businessStart, setBusinessStart] = useState('8');
  const [businessEnd, setBusinessEnd] = useState('18');

  const totalAccounts = emailAccounts.length + outlookAccounts.length;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Mail className="h-6 w-6 text-primary" />
            Configurações de Email
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Gerencie contas Email, Outlook, assinaturas, SLA e notificações do Email Chat.
          </p>
        </div>
        {totalAccounts > 0 && (
          <Badge variant="secondary" className="text-sm">
            {totalAccounts} conta{totalAccounts > 1 ? 's' : ''} conectada{totalAccounts > 1 ? 's' : ''}
          </Badge>
        )}
      </div>

      <Tabs defaultValue="accounts">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="accounts" className="gap-1.5 text-xs">
            <Key className="h-3.5 w-3.5" />Email
          </TabsTrigger>
          <TabsTrigger value="outlook" className="gap-1.5 text-xs">
            <Building2 className="h-3.5 w-3.5" />Outlook
          </TabsTrigger>
          <TabsTrigger value="signatures" className="gap-1.5 text-xs">
            <Signature className="h-3.5 w-3.5" />Assinaturas
          </TabsTrigger>
          <TabsTrigger value="sla" className="gap-1.5 text-xs">
            <Clock className="h-3.5 w-3.5" />SLA
          </TabsTrigger>
          <TabsTrigger value="imap" className="gap-1.5 text-xs">
            <Wifi className="h-3.5 w-3.5" />IMAP/SMTP
          </TabsTrigger>
        </TabsList>

        {/* ── Tab: Email ─────────────────────────────────────────────── */}
        <TabsContent value="accounts" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contas Email Conectadas</CardTitle>
              <CardDescription>
                Autenticação OAuth2 segura. Tokens renovados automaticamente a cada 60s.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {emailAccounts.length === 0 ? (
                <div className="flex flex-col items-center gap-4 py-8">
                  <Mail className="h-12 w-12 text-muted-foreground/30" />
                  <div className="text-center">
                    <p className="font-medium">Nenhuma conta Email conectada</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Conecte sua conta Email para usar o Email Chat
                    </p>
                  </div>
                  <Button onClick={startEmailOAuth} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Conectar Email
                  </Button>
                </div>
              ) : (
                <EmailAccountSelector
                  accounts={emailAccounts}
                  activeAccountId={emailActiveId}
                  tokenStatus={Object.fromEntries(tokenStatus.map(s => [s.account_id, s.token_status])) as unknown as Record<string, GmailTokenStatus>}
                  isSyncing={isEmailSyncing}
                  onSelectAccount={setEmailActiveId}
                  onAddAccount={startEmailOAuth}
                  onDisconnect={disconnectEmail}
                  onSync={syncNow}
                />
              )}
            </CardContent>
          </Card>
          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription className="text-sm">
              OAuth2 seguro — sua senha nunca é armazenada. Tokens criptografados no banco.
            </AlertDescription>
          </Alert>
        </TabsContent>

        {/* ── Tab: Outlook ───────────────────────────────────────────── */}
        <TabsContent value="outlook" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contas Microsoft Outlook / Office 365</CardTitle>
              <CardDescription>
                Integração via Microsoft Graph API OAuth2 — sem IMAP, 100% HTTP seguro.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {outlookAccounts.length === 0 ? (
                <div className="flex flex-col items-center gap-4 py-8">
                  <Building2 className="h-12 w-12 text-muted-foreground/30" />
                  <div className="text-center">
                    <p className="font-medium">Nenhuma conta Outlook conectada</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Conecte sua conta Microsoft para acessar emails do Outlook
                    </p>
                  </div>
                  <Button onClick={startOutlookOAuth} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Conectar Outlook
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {outlookAccounts.map(acc => (
                    <div key={acc.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Building2 className="h-5 w-5 text-primary" />
                        <div>
                          <p className="font-medium text-sm">{acc.email}</p>
                          <Badge variant="secondary" className="text-xs mt-0.5">
                            Microsoft Graph API
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {outlookActiveId === acc.id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => syncOutlook(acc.id)}
                            disabled={isOutlookSyncing}
                            className="gap-1.5"
                          >
                            <RefreshCw className={`h-3.5 w-3.5 ${isOutlookSyncing ? 'animate-spin' : ''}`} />
                            Sincronizar
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => disconnectOutlook(acc.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          Desconectar
                        </Button>
                      </div>
                    </div>
                  ))}
                  <Button variant="outline" onClick={startOutlookOAuth} className="w-full gap-2">
                    <Plus className="h-4 w-4" />
                    Adicionar outra conta Outlook
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-sm">
              Requer <strong>MICROSOFT_CLIENT_ID</strong> e <strong>MICROSOFT_CLIENT_SECRET</strong> configurados
              nas variáveis de ambiente do Supabase. Crie o app em{' '}
              <a href="https://portal.azure.com" target="_blank" rel="noopener noreferrer" className="underline">
                portal.azure.com
              </a>.
            </AlertDescription>
          </Alert>
        </TabsContent>

        {/* ── Tab: Assinaturas ─────────────────────────────────────────── */}
        <TabsContent value="signatures" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Assinaturas de Email</CardTitle>
              <CardDescription>
                Configure assinaturas HTML inseridas automaticamente nas respostas.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <EmailSignatureEditor accountId={emailActiveId} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: SLA ─────────────────────────────────────────────────── */}
        <TabsContent value="sla" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Configuração de SLA</CardTitle>
              <CardDescription>
                Define prazos de primeira resposta com cálculo em horário comercial.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm">Prazo máximo (minutos)</Label>
                  <Input
                    type="number"
                    value={slaThreshold}
                    onChange={e => setSlaThreshold(e.target.value)}
                    min={15}
                    max={10080}
                    className="h-9"
                  />
                  <p className="text-xs text-muted-foreground">
                    {Math.floor(Number(slaThreshold) / 60)}h {Number(slaThreshold) % 60}min
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Alerta de atenção (%)</Label>
                  <Input
                    type="number"
                    value={slaWarningPct}
                    onChange={e => setSlaWarningPct(e.target.value)}
                    min={50}
                    max={99}
                    className="h-9"
                  />
                  <p className="text-xs text-muted-foreground">
                    Alerta aos {Math.round(Number(slaThreshold) * Number(slaWarningPct) / 100)}min
                  </p>
                </div>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Apenas horário comercial</p>
                  <p className="text-xs text-muted-foreground">Não conta noites, fins de semana</p>
                </div>
                <Switch checked={businessHoursOnly} onCheckedChange={setBusinessHoursOnly} />
              </div>
              {businessHoursOnly && (
                <div className="grid grid-cols-2 gap-4 pl-4 border-l-2 border-muted">
                  <div className="space-y-1.5">
                    <Label className="text-sm">Início (h)</Label>
                    <Select value={businessStart} onValueChange={setBusinessStart}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 12 }, (_, i) => i + 6).map(h => (
                          <SelectItem key={h} value={String(h)}>{h}:00</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Fim (h)</Label>
                    <Select value={businessEnd} onValueChange={setBusinessEnd}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 12 }, (_, i) => i + 12).map(h => (
                          <SelectItem key={h} value={String(h)}>{h}:00</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
              <Button className="w-full">Salvar Configurações de SLA</Button>
            </CardContent>
          </Card>
          <EmailSLADashboard />
        </TabsContent>

        {/* ── Tab: IMAP/SMTP (Yahoo / Custom) ─────────────────────────── */}
        <TabsContent value="imap" className="space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-sm">
              Para <strong>Email</strong>, use a aba Email (OAuth2). Para <strong>Outlook</strong>, use a aba Outlook (Microsoft Graph API).
              IMAP/SMTP é para Yahoo Mail e servidores customizados.
            </AlertDescription>
          </Alert>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Provedores Suportados</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { name: 'Email', method: 'OAuth2 (Google)', status: 'Suportado', color: 'green' },
                { name: 'Outlook / Office 365', method: 'OAuth2 (Microsoft Graph API)', status: 'Suportado', color: 'green' },
                { name: 'Yahoo Mail', method: 'IMAP + App Password', status: 'Worker externo necessário', color: 'yellow' },
                { name: 'Servidor SMTP/IMAP', method: 'IMAP + credenciais', status: 'Worker externo necessário', color: 'yellow' },
              ].map(p => (
                <div key={p.name} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium text-sm">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.method}</p>
                  </div>
                  <Badge variant={p.color === 'green' ? 'default' : 'secondary'} className="text-xs">
                    {p.status}
                  </Badge>
                </div>
              ))}
              <p className="text-xs text-muted-foreground pt-2">
                Para Yahoo e IMAP customizado, integre um worker externo como{' '}
                <a href="https://emailengine.app" target="_blank" rel="noopener noreferrer" className="underline">EmailEngine</a>
                {' '}ou{' '}
                <a href="https://nylas.com" target="_blank" rel="noopener noreferrer" className="underline">Nylas</a>.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default EmailSettingsPage;
