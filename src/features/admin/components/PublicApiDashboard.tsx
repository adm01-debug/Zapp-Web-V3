import { queryKeys } from '@/services/api/queryKeys';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getLogger } from '@/lib/logger';

const log = getLogger('PublicApiDashboard');
import { Globe, Key, Copy, RefreshCw, Send, CheckCircle, XCircle, Clock, Eye, EyeOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ApiLog {
  id: string;
  action: string;
  created_at: string;
  details: Record<string, unknown> | null;
  entity_type: string | null;
}

/** Public Api Dashboard component. */
export function PublicApiDashboard() {
  const [newToken, setNewToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data, isFetching, refetch } = useQuery({
    queryKey: queryKeys.adminOps.publicApi(),
    queryFn: async () => {
      try {
        const { data: setting } = await supabase
          .from('global_settings')
          .select('value')
          .eq('key', 'api_token')
          .maybeSingle() // ✅ fix: maybeSingle evita PGRST116;

        const { data: auditLogs } = await supabase
          .from('audit_logs')
          .select('id, action, created_at, details, entity_type')
          .eq('entity_type', 'public_api')
          .order('created_at', { ascending: false })
          .limit(50);

        return {
          apiToken: (setting?.value as string) || '',
          logs: (auditLogs || []) as ApiLog[],
        };
      } catch (err) {
        log.warn('Failed to load API data:', err);
        return { apiToken: '', logs: [] as ApiLog[] };
      }
    },
  });

  const apiToken = data?.apiToken ?? '';
  const logs = data?.logs ?? [];
  const loading = isFetching;
  const loadData = () => { void refetch(); };

  const generateToken = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const rng = new Uint8Array(40);
    crypto.getRandomValues(rng);
    const token = 'zapp_' + Array.from(rng, b => chars[b % chars.length]).join('');
    setNewToken(token);
  };

  const saveToken = async () => {
    if (!newToken) return;
    setSaving(true);
    try {
      const { error: upsertError } = await supabase
        .from('global_settings')
        .upsert({ key: 'api_token', value: newToken, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (upsertError) throw upsertError;
      setNewToken('');
      toast.success('Token de API salvo com sucesso');
      void refetch();
    } catch {
      toast.error('Erro ao salvar token');
    } finally {
      setSaving(false);
    }
  };

  const copyToken = () => {
    navigator.clipboard.writeText(apiToken || newToken);
    toast.success('Token copiado!');
  };

  const baseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-api`;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-primary/10">
          <Globe className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold">API Pública</h2>
          <p className="text-sm text-muted-foreground">Gerencie tokens e monitore o uso da API REST externa</p>
        </div>
        <Button variant="outline" size="sm" className="ml-auto h-8 text-xs" onClick={loadData} disabled={loading}>
          <RefreshCw className={`w-3 h-3 mr-1 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </Button>
      </div>

      {/* API Token Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Key className="w-5 h-5" /> Token de Autenticação
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {apiToken && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Token Atual</Label>
              <div className="flex items-center gap-2">
                <Input readOnly value={showToken ? apiToken : '•'.repeat(30)} className=" text-xs" />
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowToken(!showToken)} aria-label={showToken ? 'Ocultar token' : 'Mostrar token'}>
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={copyToken} aria-label="Copiar token">
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Input
              placeholder="Gere um novo token..."
              value={newToken}
              readOnly
              className=" text-xs"
            />
            <Button variant="outline" size="sm" onClick={generateToken} className="shrink-0">
              Gerar Token
            </Button>
            {newToken && (
              <Button size="sm" onClick={saveToken} disabled={saving} className="shrink-0">
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* API Endpoint Documentation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Send className="w-5 h-5" /> Endpoint
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="bg-muted/50 rounded-lg p-4  text-xs space-y-2 border">
            <p className="text-muted-foreground">POST {baseUrl}</p>
            <p className="text-muted-foreground">Headers:</p>
            <p className="pl-4">x-api-key: <span className="text-primary">{'<seu_token>'}</span></p>
            <p className="pl-4">Content-Type: application/json</p>
            <p className="text-muted-foreground mt-2">Body (enviar mensagem):</p>
            <pre className="pl-4 text-foreground/80">{`{
  "action": "send",
  "number": "5511999999999",
  "message": "Olá!",
  "connectionId": "(opcional)"
}`}</pre>
          </div>
          <p className="text-xs text-muted-foreground">
            Ações suportadas: <Badge variant="secondary" className="text-[10px]">send</Badge>
          </p>
        </CardContent>
      </Card>

      {/* Usage Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="w-5 h-5" /> Logs de Uso
            <Badge variant="secondary" className="text-[10px] ml-auto">{logs.length} registros</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum log de uso registrado ainda. As requisições à API aparecerão aqui.
            </p>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-auto">
              {logs.map(entry => (
                <div key={entry.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors">
                  {entry.action.includes('error') || entry.action.includes('fail') ? (
                    <XCircle className="w-4 h-4 text-destructive shrink-0" />
                  ) : (
                    <CheckCircle className="w-4 h-4 text-success shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{entry.action}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(entry.created_at).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  {entry.details && (
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {JSON.stringify(entry.details).substring(0, 40)}...
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}