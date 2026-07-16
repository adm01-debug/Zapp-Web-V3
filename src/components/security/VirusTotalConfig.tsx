import { useState } from 'react';
import { getLogger } from '@/lib/logger';
const log = getLogger('VirusTotalConfig');

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ShieldCheck, ShieldAlert, Loader2, Key } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const VirusTotalConfig = () => {
  const [apiKey, setApiKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    user?: string;
  } | null>(null);

  const handleTestConnection = async () => {
    if (!apiKey) {
      toast.error('Por favor, insira a chave da API');
      return;
    }

    setIsLoading(true);
    setTestResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('virustotal-test', {
        body: { apiKey },
      });

      if (error) throw error;

      setTestResult({
        success: data.success,
        message: data.message,
        user: data.user,
      });

      if (data.success) {
        toast.success('Conexão bem-sucedida!');
      } else {
        toast.error(data.message);
      }
    } catch (error: unknown) {
      log.error('VirusTotal API test failed', error);
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : 'Erro ao testar conexão',
      });
      toast.error('Erro ao validar chave');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="mx-auto mt-8 w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="h-5 w-5" />
          Configuração VirusTotal
        </CardTitle>
        <CardDescription>
          Insira sua chave de API do VirusTotal para habilitar a varredura preventiva de malwares
          nos uploads.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Chave de API (VirusTotal)</label>
          <div className="flex gap-2">
            <Input
              type="password"
              placeholder="Cole sua chave aqui..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className=""
            />
            <Button onClick={handleTestConnection} disabled={isLoading} variant="outline">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Testar'}
            </Button>
          </div>
        </div>

        {testResult && (
          <div
            role="alert"
            className={`flex items-start gap-3 rounded-lg p-4 ${testResult.success ? 'border border-primary/20 bg-primary/10 text-primary' : 'border border-destructive bg-destructive text-destructive-foreground'}`}
          >
            {testResult.success ? (
              <ShieldCheck className="mt-0.5 h-5 w-5" />
            ) : (
              <ShieldAlert className="mt-0.5 h-5 w-5" />
            )}
            <div>
              <p className="font-semibold">
                {testResult.success ? 'Conexão Ativa' : 'Falha na Conexão'}
              </p>
              <p className="text-sm">{testResult.message}</p>
              {testResult.user && (
                <p className="mt-1 text-xs opacity-80">Usuário: {testResult.user}</p>
              )}
            </div>
          </div>
        )}

        <div className="rounded border bg-muted p-3 text-xs text-muted-foreground">
          <p className="mb-1 font-semibold">Dica para o Desenvolvedor:</p>
          <p>
            Após validar que a chave funciona, salve-a nos segredos do projeto usando o comando:
          </p>
          <code className="mt-1 block rounded bg-muted p-1">
            supabase secrets set VIRUSTOTAL_API_KEY=sua_chave
          </code>
        </div>
      </CardContent>
    </Card>
  );
};
