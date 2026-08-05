import { useMemo, useState } from 'react';
import { Plus, Trash2, Loader2, Plug, Mail, Server, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useImapAccounts,
  type ImapProvider,
  type ImapSmtpAccount,
  type ImapSmtpConfig,
} from '@/hooks/email/useImapAccounts';
import { toast } from 'sonner';

/**
 * ImapAccountsSettings — Contas IMAP/SMTP não-Gmail (EMAIL-02).
 *
 * Lista contas de imap_smtp_accounts e abre dialog de conexão que invoca a
 * edge email-imap-bridge (getProviderConfig para pré-preencher hosts dos
 * provedores, testConnection para validar formato, saveCredentials para
 * persistir com senha criptografada AES-GCM).
 *
 * LIMITAÇÃO conhecida: edge functions são HTTP-only (sem TCP) — a edge
 * valida apenas formato. Conexão IMAP/SMTP real exige broker externo
 * (Nylas/EmailEngine), conforme documentado na própria edge.
 */

interface AccountForm {
  provider: ImapProvider;
  email: string;
  password: string;
  username: string;
  displayName: string;
  imapHost: string;
  imapPort: string;
  imapSsl: boolean;
  smtpHost: string;
  smtpPort: string;
  smtpTls: boolean;
}

const DEFAULT_FORM: AccountForm = {
  provider: 'outlook',
  email: '',
  password: '',
  username: '',
  displayName: '',
  imapHost: '',
  imapPort: '993',
  imapSsl: true,
  smtpHost: '',
  smtpPort: '587',
  smtpTls: true,
};

/** Rótulos dos provedores suportados. */
const PROVIDER_LABELS: Record<ImapProvider, string> = {
  outlook: 'Outlook / Microsoft 365',
  yahoo: 'Yahoo Mail',
  gmail: 'Gmail (IMAP)',
  custom: 'Personalizado',
};

export function ImapAccountsSettings() {
  const {
    accounts,
    isLoading,
    getProviderConfig,
    testConnection,
    saveAccount,
    setActive,
    removeAccount,
  } = useImapAccounts();

  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState<AccountForm>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [loadingProvider, setLoadingProvider] = useState(false);
  const [testResult, setTestResult] = useState<{
    valid: boolean;
    issues?: string[];
    message?: string;
  } | null>(null);

  const setField = <K extends keyof AccountForm>(key: K, value: AccountForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  /** Ao trocar provedor, busca a config pré-definida na edge e pré-preenche. */
  const handleProviderChange = async (provider: ImapProvider) => {
    setForm((prev) => ({ ...prev, provider }));
    setTestResult(null);
    if (provider === 'custom') {
      setForm((prev) => ({
        ...prev,
        provider,
        imapHost: '',
        smtpHost: '',
        imapPort: '993',
        smtpPort: '587',
        imapSsl: true,
        smtpTls: true,
      }));
      return;
    }
    setLoadingProvider(true);
    const res = await getProviderConfig(provider);
    setLoadingProvider(false);
    if (res.error || !res.data) {
      toast.error(`Não foi possível carregar a configuração de ${provider}`);
      return;
    }
    const cfg = res.data;
    setForm((prev) => ({
      ...prev,
      provider,
      imapHost: cfg.imap_host,
      imapPort: String(cfg.imap_port),
      imapSsl: cfg.imap_use_ssl,
      smtpHost: cfg.smtp_host,
      smtpPort: String(cfg.smtp_port),
      smtpTls: cfg.smtp_use_tls,
    }));
  };

  const buildConfig = (): ImapSmtpConfig | null => {
    const email = form.email.trim();
    const password = form.password;
    const imapPort = Number(form.imapPort);
    const smtpPort = Number(form.smtpPort);
    if (!email || !email.includes('@')) {
      toast.error('Informe um e-mail válido');
      return null;
    }
    if (!password || password.length < 6) {
      toast.error('Informe a senha/app password (mínimo 6 caracteres)');
      return null;
    }
    if (!form.imapHost.trim() || !form.smtpHost.trim()) {
      toast.error('Preencha os hosts IMAP e SMTP');
      return null;
    }
    if (!Number.isInteger(imapPort) || imapPort < 1 || imapPort > 65535) {
      toast.error('Porta IMAP inválida');
      return null;
    }
    if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
      toast.error('Porta SMTP inválida');
      return null;
    }
    return {
      email,
      password,
      provider: form.provider,
      imap_host: form.imapHost.trim(),
      imap_port: imapPort,
      imap_use_ssl: form.imapSsl,
      smtp_host: form.smtpHost.trim(),
      smtp_port: smtpPort,
      smtp_use_tls: form.smtpTls,
      username: form.username.trim() || email,
      display_name: form.displayName.trim() || undefined,
    };
  };

  const handleTest = async () => {
    const config = buildConfig();
    if (!config) return;
    setTesting(true);
    setTestResult(null);
    const res = await testConnection(config);
    setTesting(false);
    if (res.error) {
      setTestResult({ valid: false, issues: [res.error] });
      toast.error(`Falha no teste: ${res.error}`);
      return;
    }
    setTestResult(res.data ?? { valid: false });
    if (res.data?.valid) {
      toast.success('Credenciais válidas (formato)');
    } else {
      toast.error('Credenciais inválidas');
    }
  };

  const handleSave = async () => {
    const config = buildConfig();
    if (!config) return;
    setSaving(true);
    const res = await saveAccount(config);
    setSaving(false);
    if (res.error) {
      toast.error(`Falha ao conectar conta: ${res.error}`);
      return;
    }
    toast.success(`Conta ${res.data?.email ?? config.email} conectada!`);
    setShowDialog(false);
    setForm(DEFAULT_FORM);
    setTestResult(null);
  };

  const handleRemove = async (acc: ImapSmtpAccount) => {
    if (!acc.id) return;
    if (!window.confirm(`Remover a conta ${acc.email ?? acc.id}?`)) return;
    const ok = await removeAccount(acc.id);
    if (ok) toast.success('Conta removida');
    else toast.error('Falha ao remover conta');
  };

  const handleToggleActive = async (acc: ImapSmtpAccount, active: boolean) => {
    if (!acc.id) return;
    const ok = await setActive(acc.id, active);
    if (!ok) toast.error('Falha ao atualizar conta');
  };

  const sortedAccounts = useMemo(
    () =>
      [...accounts].sort((a, b) => Number(b?.is_active ?? false) - Number(a?.is_active ?? false)),
    [accounts]
  );

  return (
    <div className="space-y-5 rounded-xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold tracking-tight">Contas IMAP/SMTP (não-Gmail)</h3>
          <p className="text-xs text-muted-foreground">
            Outlook, Yahoo, Gmail via IMAP ou servidores personalizados. As senhas são
            criptografadas (AES-GCM) antes de persistir.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setShowDialog(true);
            setForm(DEFAULT_FORM);
            setTestResult(null);
          }}
        >
          <Plus className="mr-1 h-4 w-4" /> Conectar conta
        </Button>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-warning/20 bg-warning/5 p-3 text-xs text-muted-foreground">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
        <p>
          Edge functions são HTTP-only (sem TCP): a validação de conexão confere apenas o formato
          das credenciais. Recebimento/envio real por IMAP/SMTP exige um broker externo (Nylas,
          EmailEngine) — o cadastro fica pronto para quando o broker for integrado.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando contas…
        </div>
      ) : sortedAccounts.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-muted-foreground">
          <Plug className="h-8 w-8 opacity-30" />
          <p>Nenhuma conta IMAP/SMTP conectada.</p>
          <p className="text-xs">
            Use o botão acima para conectar Outlook, Yahoo ou um servidor personalizado.
          </p>
        </div>
      ) : (
        <ScrollArea className="max-h-[380px]">
          <div className="space-y-2 pr-3">
            {sortedAccounts.map((acc) => (
              <div
                key={acc.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="truncate text-sm font-semibold">{acc.email}</span>
                    <Badge variant="secondary" className="text-[9px]">
                      {acc.provider
                        ? (PROVIDER_LABELS[acc.provider as ImapProvider] ?? acc.provider)
                        : 'custom'}
                    </Badge>
                    {!acc.is_active && (
                      <Badge variant="outline" className="text-[9px] text-muted-foreground">
                        Inativa
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Server className="h-3 w-3" />
                    IMAP {acc.imap_host}:{acc.imap_port} · SMTP {acc.smtp_host}:{acc.smtp_port}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Switch
                      checked={!!acc.is_active}
                      onCheckedChange={(v) => handleToggleActive(acc, v)}
                    />
                    Ativa
                  </label>
                  <Button
                    aria-label="Remover conta"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => handleRemove(acc)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}

      {/* ── Dialog de conexão ─────────────────────────────────────── */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Conectar conta IMAP/SMTP</DialogTitle>
            <DialogDescription>
              Escolha um provedor para pré-preencher os servidores ou use &quot;Personalizado&quot;
              para digitar manualmente.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="imap-provider">Provedor</Label>
                <Select
                  value={form.provider}
                  onValueChange={(v) => handleProviderChange(v as ImapProvider)}
                >
                  <SelectTrigger id="imap-provider" className="h-9 text-xs">
                    <SelectValue placeholder="Selecione o provedor" />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PROVIDER_LABELS) as ImapProvider[]).map((p) => (
                      <SelectItem key={p} value={p}>
                        {PROVIDER_LABELS[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="imap-email">E-mail</Label>
                  <Input
                    id="imap-email"
                    className="h-9 text-xs"
                    placeholder="voce@empresa.com"
                    value={form.email}
                    onChange={(e) => setField('email', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="imap-password">Senha / App password</Label>
                  <Input
                    id="imap-password"
                    className="h-9 text-xs"
                    type="password"
                    placeholder="••••••••"
                    value={form.password}
                    onChange={(e) => setField('password', e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="imap-username">Usuário (opcional)</Label>
                  <Input
                    id="imap-username"
                    className="h-9 text-xs"
                    placeholder="padrão: e-mail"
                    value={form.username}
                    onChange={(e) => setField('username', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="imap-display-name">Nome de exibição (opcional)</Label>
                  <Input
                    id="imap-display-name"
                    className="h-9 text-xs"
                    placeholder="Nome do remetente"
                    value={form.displayName}
                    onChange={(e) => setField('displayName', e.target.value)}
                  />
                </div>
              </div>

              <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Servidores
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="imap-host">IMAP host</Label>
                    <Input
                      id="imap-host"
                      className="h-8 text-xs"
                      placeholder="imap.provedor.com"
                      value={form.imapHost}
                      onChange={(e) => setField('imapHost', e.target.value)}
                      disabled={loadingProvider}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="imap-port">IMAP porta</Label>
                    <Input
                      id="imap-port"
                      className="h-8 text-xs"
                      inputMode="numeric"
                      value={form.imapPort}
                      onChange={(e) => setField('imapPort', e.target.value)}
                      disabled={loadingProvider}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="smtp-host">SMTP host</Label>
                    <Input
                      id="smtp-host"
                      className="h-8 text-xs"
                      placeholder="smtp.provedor.com"
                      value={form.smtpHost}
                      onChange={(e) => setField('smtpHost', e.target.value)}
                      disabled={loadingProvider}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="smtp-port">SMTP porta</Label>
                    <Input
                      id="smtp-port"
                      className="h-8 text-xs"
                      inputMode="numeric"
                      value={form.smtpPort}
                      onChange={(e) => setField('smtpPort', e.target.value)}
                      disabled={loadingProvider}
                    />
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-4">
                  <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Switch
                      checked={form.imapSsl}
                      onCheckedChange={(v) => setField('imapSsl', v)}
                      disabled={loadingProvider}
                    />
                    SSL IMAP (993)
                  </label>
                  <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Switch
                      checked={form.smtpTls}
                      onCheckedChange={(v) => setField('smtpTls', v)}
                      disabled={loadingProvider}
                    />
                    TLS SMTP (587)
                  </label>
                  {loadingProvider && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  )}
                </div>
              </div>

              {testResult && (
                <div
                  className={`rounded-lg border p-2.5 text-xs ${
                    testResult.valid
                      ? 'border-success/20 bg-success/5 text-success'
                      : 'border-destructive/20 bg-destructive/5 text-destructive'
                  }`}
                >
                  {testResult.valid
                    ? (testResult.message ?? 'Credenciais válidas (formato).')
                    : (testResult.issues ?? ['Credenciais inválidas']).join(' · ')}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleTest}
              disabled={testing || saving || loadingProvider}
            >
              {testing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
              Testar conexão
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={saving || testing || loadingProvider}
            >
              {saving ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="mr-1 h-3.5 w-3.5" />
              )}
              Conectar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
