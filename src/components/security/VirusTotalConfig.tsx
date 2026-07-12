import { useState } from 'react';
import { getLogger } from '@/lib/logger';
const log = getLogger('VirusTotalConfig');

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ShieldCheck, ShieldAlert, Loader2, Key } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const VirusTotalConfig = () => {
  const [apiKey, setApiKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; user?: string } | null>(null);

  const handleTestConnection = async () => {
    if (!apiKey) {
      toast.error("Por favor, insira a chave da API");
      return;
    }

    setIsLoading(true);
    setTestResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('virustotal-test', {
        body: { apiKey }
      });

      if (error) throw error;

      setTestResult({
        success: data.success,
        message: data.message,
        user: data.user
      });

      if (data.success) {
        toast.success("Conexão bem-sucedida!");
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      log.error('VirusTotal API test failed', error);
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : "Erro ao testar conexão"
      });
      toast.error("Erro ao validar chave");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto mt-8">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="w-5 h-5" />
          Configuração VirusTotal
        </CardTitle>
        <CardDescription>
          Insira sua chave de API do VirusTotal para habilitar a varredura preventiva de malwares nos uploads.
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
            <Button 
              onClick={handleTestConnection} 
              disabled={isLoading}
              variant="outline"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Testar"}
            </Button>
          </div>
        </div>

        {testResult && (
          <div className={`p-4 rounded-lg flex items-start gap-3 ${testResult.success ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-destructive text-destructive-foreground border border-destructive'}`}>
            {testResult.success ? <ShieldCheck className="w-5 h-5 mt-0.5" /> : <ShieldAlert className="w-5 h-5 mt-0.5" />}
            <div>
              <p className="font-semibold">{testResult.success ? 'Conexão Ativa' : 'Falha na Conexão'}</p>
              <p className="text-sm">{testResult.message}</p>
              {testResult.user && <p className="text-xs mt-1 opacity-80">Usuário: {testResult.user}</p>}
            </div>
          </div>
        )}

        <div className="text-xs text-muted-foreground bg-muted p-3 rounded border">
          <p className="font-semibold mb-1">Dica para o Desenvolvedor:</p>
          <p>Após validar que a chave funciona, salve-a nos segredos do projeto usando o comando:</p>
          <code className="block mt-1 p-1 bg-muted rounded">supabase secrets set VIRUSTOTAL_API_KEY=sua_chave</code>
        </div>
      </CardContent>
    </Card>
  );
};
