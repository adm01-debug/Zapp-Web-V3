import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, ShieldCheck, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface OfficialApiConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectionId: string;
  connectionName: string;
  instanceId: string | null;
}

interface CredentialsForm {
  phone_number_id: string;
  waba_id: string;
  business_account_id: string;
  access_token: string;
  app_secret: string;
  verify_token: string;
  graph_api_version: string;
}

const EMPTY: CredentialsForm = {
  phone_number_id: '',
  waba_id: '',
  business_account_id: '',
  access_token: '',
  app_secret: '',
  verify_token: '',
  graph_api_version: 'v21.0',
};

export function OfficialApiConfigDialog({
  open,
  onOpenChange,
  connectionId,
  connectionName,
  instanceId,
}: OfficialApiConfigDialogProps) {
  const [form, setForm] = useState<CredentialsForm>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const { data, error: _error } = await supabase
          .from('whatsapp_official_credentials')
          .select(
            'phone_number_id, waba_id, business_account_id, access_token, app_secret, verify_token, graph_api_version'
          )
          .eq('connection_id', connectionId)
          .maybeSingle();
        if (cancelled) return;
        if (data) {
          const mapped: CredentialsForm = {
            phone_number_id: (data as any).phone_number_id ?? '',
            waba_id: (data as any).waba_id ?? '',
            business_account_id: (data as any).business_account_id ?? '',
            access_token: (data as any).access_token ?? '',
            app_secret: (data as any).app_secret ?? '',
            verify_token: (data as any).verify_token ?? '',
            graph_api_version: (data as any).graph_api_version ?? 'v21.0',
          };
          setForm(mapped);
        } else {
          setForm(EMPTY);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, connectionId]);

  const update = (k: keyof CredentialsForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSave = async () => {
    if (!form.phone_number_id || !form.access_token || !form.app_secret || !form.verify_token) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Preencha Phone Number ID, Access Token, App Secret e Verify Token.',
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from('whatsapp_official_credentials').upsert(
        {
          connection_id: connectionId,
          phone_number_id: form.phone_number_id,
          waba_id: form.waba_id || null,
          business_account_id: form.business_account_id || null,
          access_token: form.access_token,
          app_secret: form.app_secret,
          verify_token: form.verify_token,
          graph_api_version: form.graph_api_version || 'v21.0',
          created_by: userData.user?.id ?? null,
        } as any,
        { onConflict: 'connection_id' }
      );
      if (error) {
        toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
        return;
      }
      toast({
        title: 'Credenciais salvas',
        description: 'WhatsApp Cloud API configurada com sucesso.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!instanceId) return;
    setTesting(true);
    const { data, error } = await supabase.functions.invoke('whatsapp-cloud-api', {
      body: { action: 'ping', instanceName: instanceId },
    });
    setTesting(false);
    if (error || (data as { ok?: boolean })?.ok === false) {
      const msg =
        error?.message ||
        (data as { data?: { error?: { message?: string } } })?.data?.error?.message ||
        'Falha ao conectar à Meta Graph API';
      toast({ title: 'Conexão falhou', description: msg, variant: 'destructive' });
      return;
    }
    const info = (data as { data?: { display_phone_number?: string; verified_name?: string } })
      ?.data;
    toast({
      title: 'Conexão bem-sucedida',
      description: info?.display_phone_number
        ? `${info.verified_name ?? ''} (${info.display_phone_number})`
        : 'Cloud API respondeu OK.',
    });
  };

  const projectRef = (import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined) ?? '';
  const webhookUrl = projectRef
    ? `https://${projectRef}.supabase.co/functions/v1/whatsapp-cloud-webhook`
    : '/functions/v1/whatsapp-cloud-webhook';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Configurar Cloud API — {connectionName}
          </DialogTitle>
          <DialogDescription>
            Insira as credenciais do WhatsApp Business Account (Meta) para esta conexão. Após
            salvar, configure o webhook no painel da Meta apontando para:
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2 break-all rounded-md bg-muted/50 px-3 py-2 text-xs">
          <span>{webhookUrl}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={() => {
              navigator.clipboard.writeText(webhookUrl);
              toast({ title: 'URL copiada' });
            }}
            aria-label="Copiar URL do webhook"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 py-2 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="phone_number_id">Phone Number ID *</Label>
              <Input
                id="phone_number_id"
                value={form.phone_number_id}
                onChange={update('phone_number_id')}
                placeholder="123456789012345"
              />
            </div>
            <div>
              <Label htmlFor="waba_id">WABA ID</Label>
              <Input id="waba_id" value={form.waba_id} onChange={update('waba_id')} />
            </div>
            <div>
              <Label htmlFor="business_account_id">Business Account ID</Label>
              <Input
                id="business_account_id"
                value={form.business_account_id}
                onChange={update('business_account_id')}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="access_token">Access Token *</Label>
              <Input
                id="access_token"
                type="password"
                value={form.access_token}
                onChange={update('access_token')}
                placeholder="EAAG..."
              />
            </div>
            <div>
              <Label htmlFor="app_secret">App Secret *</Label>
              <Input
                id="app_secret"
                type="password"
                value={form.app_secret}
                onChange={update('app_secret')}
              />
            </div>
            <div>
              <Label htmlFor="verify_token">Verify Token *</Label>
              <Input
                id="verify_token"
                value={form.verify_token}
                onChange={update('verify_token')}
                placeholder="qualquer string secreta"
              />
            </div>
            <div>
              <Label htmlFor="graph_api_version">Graph API Version</Label>
              <Input
                id="graph_api_version"
                value={form.graph_api_version}
                onChange={update('graph_api_version')}
              />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleTest} disabled={testing || loading}>
            {testing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Testar conexão
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar credenciais
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
