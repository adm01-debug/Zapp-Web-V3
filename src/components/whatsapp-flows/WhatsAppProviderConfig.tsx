import { useState, useEffect } from 'react';
import { getLogger } from '@/lib/logger';
const log = getLogger('WhatsAppProviderConfig');

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { 
  Smartphone, 
  Globe, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  RefreshCcw,
  ShieldCheck
} from 'lucide-react';
import { safeClient } from '@/integrations/supabase/safeClient';
import { toast } from 'sonner';

type ProviderType = 'evolution' | 'unofficial';

export default function WhatsAppProviderConfig() {
  const [provider, setProvider] = useState<ProviderType>('evolution');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadCurrentConfig();
  }, []);

  const loadCurrentConfig = async () => {
    setIsLoading(true);
    try {
      const { data: configs } = await safeClient.from<Record<string, unknown>>(
        'whatsapp_connections_safe',
        (q) => q.select('*').limit(1),
      );
      
      if (configs && configs.length > 0) {
        const config = configs[0];
        setProvider(config.provider_type || 'evolution');
        setBaseUrl(config.base_url || '');
      }
    } catch (err) {
      log.warn('Initial WhatsApp provider config not found');
    } finally {
      setIsLoading(false);
    }
  };

  const validateCredentials = async () => {
    setIsVerifying(true);
    setStatus(null);
    try {
      if (provider === 'evolution') {
        // Simulação de chamada de health check da Evolution API
        const response = await fetch(`${baseUrl}/instance/fetchInstances`, {
          headers: { 'apikey': apiKey }
        });
        
        if (response.ok) {
          setStatus({ ok: true, message: 'Evolution API conectada com sucesso!' });
          toast.success('Conexão validada!');
        } else {
          throw new Error('API Key inválida ou servidor offline.');
        }
      } else {
        // Lógica para Unofficial
        setStatus({ ok: true, message: 'Provedor sem API oficial configurado localmente.' });
      }
    } catch (err) {
      setStatus({ ok: false, message: err instanceof Error ? err.message : 'Falha ao validar credenciais.' });
      toast.error('Erro na validação.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSave = async () => {
    try {
      const { error } = await safeClient.rpc('rpc_upsert_whatsapp_provider', {
        p_provider_type: provider,
        p_base_url: baseUrl,
        p_api_key: apiKey,
      });

      if (error) throw error;
      toast.success('Configuração de provedor salva com sucesso!');
    } catch (err) {
      toast.error(`Erro ao salvar: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center p-12"><Loader2 className="animate-spin" /></div>;
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto p-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">Configuração de WhatsApp</h1>
        <p className="text-muted-foreground">Escolha como o sistema se conectará ao WhatsApp.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className={provider === 'unofficial' ? 'border-primary ring-1 ring-primary' : ''}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="w-5 h-5" />
                Sem API Oficial
              </CardTitle>
              <RadioGroup value={provider} onValueChange={(v) => setProvider(v as ProviderType)}>
                <RadioGroupItem value="unofficial" id="unofficial" />
              </RadioGroup>
            </div>
            <CardDescription>
              Conexão via QR Code direta (Web scraping/Local). Ideal para baixo volume.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="text-sm space-y-2 text-muted-foreground">
              <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary" /> Sem custos de setup</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary" /> Ativação instantânea</li>
              <li className="flex items-center gap-2"><AlertCircle className="w-4 h-4 text-warning" /> Maior risco de banimento</li>
            </ul>
          </CardContent>
        </Card>

        <Card className={provider === 'evolution' ? 'border-primary ring-1 ring-primary' : ''}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Globe className="w-5 h-5" />
                Evolution API
              </CardTitle>
              <RadioGroup value={provider} onValueChange={(v) => setProvider(v as ProviderType)}>
                <RadioGroupItem value="evolution" id="evolution" />
              </RadioGroup>
            </div>
            <CardDescription>
              Gateway profissional com suporte a múltiplas instâncias e webhooks.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="text-sm space-y-2 text-muted-foreground">
              <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary" /> Alta performance</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary" /> API REST robusta</li>
              <li className="flex items-center gap-2"><AlertCircle className="w-4 h-4 text-primary" /> Requer servidor próprio</li>
            </ul>
          </CardContent>
        </Card>
      </div>

      {provider === 'evolution' && (
        <Card className="animate-in slide-in-from-top-4 duration-300">
          <CardHeader>
            <CardTitle className="text-lg">Credenciais Evolution</CardTitle>
            <CardDescription>Informe os dados do seu servidor Evolution API.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="url">URL do Servidor</Label>
              <Input 
                id="url" 
                placeholder="https://api.meuserver.com" 
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="key">Global API Key</Label>
              <Input 
                id="key" 
                type="password" 
                placeholder="Suas credenciais seguras" 
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>

            {status && (
              <Alert variant={status.ok ? 'default' : 'destructive'} className={status.ok ? 'bg-primary/10 border-primary/20 text-primary-foreground' : ''}>
                {status.ok ? <ShieldCheck className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                <AlertTitle>{status.ok ? 'Sucesso' : 'Falha'}</AlertTitle>
                <AlertDescription>{status.message}</AlertDescription>
              </Alert>
            )}

            <div className="flex gap-3 pt-2">
              <Button 
                variant="outline" 
                onClick={validateCredentials} 
                disabled={isVerifying || !baseUrl || !apiKey}
              >
                {isVerifying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                Validar Conexão
              </Button>
              <Button onClick={handleSave} disabled={!status?.ok}>
                Salvar Configuração
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {provider === 'unofficial' && (
        <div className="flex justify-end">
          <Button onClick={handleSave}>Confirmar Provedor Local</Button>
        </div>
      )}
    </div>
  );
}
