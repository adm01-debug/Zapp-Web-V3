import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Wifi, Save, Eye, EyeOff, RefreshCw, CheckCircle2, XCircle,
  Loader2, ShieldCheck, Server, Activity, History, Settings2,
  Trash2, Plus, Search, AlertCircle, Clock
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useEvolutionApiIntegration, DEFAULT_URL } from '@/features/integrations/hooks/useEvolutionApiIntegration';

export function EvolutionApiIntegrationView() {
  const [activeTab, setActiveTab] = useState('instances');
  const [searchTerm, setSearchTerm] = useState('');

  const {
    credentials, healthLogs, loading, testing, formData, setFormData,
    fetchData, handleTestConnection, handleSave, handleDelete,
  } = useEvolutionApiIntegration();

  const filteredCredentials = useMemo(() => {
    return credentials.filter(c => 
      c.instance_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.api_url.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [credentials, searchTerm]);

  return (
    <div className="space-y-6 p-6 max-w-6xl mx-auto min-h-[80vh]">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-whatsapp/10 flex items-center justify-center border border-whatsapp/20">
            <Wifi className="w-6 h-6 text-whatsapp" />
          </div>
          <div>
            <h2 className="font-display text-2xl font-bold">Gestão Evolution API</h2>
            <p className="text-sm text-muted-foreground">Monitoramento e credenciais por instância</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Sincronizar
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="instances" className="gap-2">
            <Server className="w-4 h-4" />
            Instâncias
          </TabsTrigger>
          <TabsTrigger value="config" className="gap-2">
            <Settings2 className="w-4 h-4" />
            Configurar
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-2">
            <History className="w-4 h-4" />
            Logs de Saúde
          </TabsTrigger>
        </TabsList>

        <TabsContent value="instances" className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Buscar por nome ou URL..." 
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence mode="popLayout">
              {filteredCredentials.map((creds) => (
                <motion.div
                  key={creds.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                >
                  <Card className="h-full border-primary/5 hover:border-primary/20 transition-all group">
                    <CardHeader className="p-4 pb-2">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <CardTitle className="text-base font-bold flex items-center gap-2">
                            {creds.instance_name}
                            <Badge 
                              variant={creds.health_status === 'healthy' ? 'default' : 'destructive'}
                              className="text-[10px] h-4 px-1"
                            >
                              {creds.health_status === 'healthy' ? 'ONLINE' : 'OFFLINE'}
                            </Badge>
                          </CardTitle>
                          <CardDescription className="text-xs truncate max-w-[180px]">
                            {creds.api_url}
                          </CardDescription>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            aria-label="Configurar credencial"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => {
                              setFormData({
                                instance_name: creds.instance_name,
                                api_url: creds.api_url,
                                api_key: creds.api_key,
                                show_key: false,
                                is_editing: creds.id
                              });
                              setActiveTab('config');
                            }}
                          >
                            <Settings2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            aria-label="Excluir credencial"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={() => handleDelete(creds.id, creds.instance_name)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-4 pt-2">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Último check:
                          </span>
                          <span>
                            {creds.last_health_check 
                              ? format(new Date(creds.last_health_check), "HH:mm, dd/MM", { locale: ptBR })
                              : 'Nunca'}
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                          <motion.div 
                            className={`h-full ${creds.health_status === 'healthy' ? 'bg-whatsapp' : 'bg-destructive'}`}
                            initial={{ width: 0 }}
                            animate={{ width: '100%' }}
                          />
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter className="p-4 pt-0">
                      <Button 
                        variant="secondary" 
                        size="sm" 
                        className="w-full text-xs h-8"
                        onClick={() => handleTestConnection(creds)}
                        disabled={testing === creds.id}
                      >
                        {testing === creds.id ? (
                          <Loader2 className="w-3 h-3 animate-spin mr-2" />
                        ) : (
                          <Activity className="w-3 h-3 mr-2" />
                        )}
                        Health Check Agora
                      </Button>
                    </CardFooter>
                  </Card>
                </motion.div>
              ))}
              
              {filteredCredentials.length === 0 && !loading && (
                <div className="col-span-full py-12 text-center border-2 border-dashed rounded-xl bg-muted/50">
                  <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-20" />
                  <p className="text-muted-foreground">Nenhuma credencial encontrada para "{searchTerm}"</p>
                  <Button variant="link" onClick={() => setSearchTerm('')}>Limpar busca</Button>
                </div>
              )}
            </AnimatePresence>
          </div>
        </TabsContent>

        <TabsContent value="config">
          <Card className="max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {formData.is_editing ? <Settings2 className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                {formData.is_editing ? 'Editar Instância' : 'Nova Conexão Evolution'}
              </CardTitle>
              <CardDescription>
                Configure as credenciais específicas para uma instância da Evolution API.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <Label>Nome da Instância (ID)</Label>
                  <Input 
                    placeholder="ex: wpp2" 
                    value={formData.instance_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, instance_name: e.target.value }))}
                    disabled={!!formData.is_editing}
                  />
                  <p className="text-[10px] text-muted-foreground">O nome deve ser idêntico ao cadastrado na Evolution API.</p>
                </div>
                
                <div className="space-y-2">
                  <Label>URL do Servidor</Label>
                  <Input 
                    placeholder="https://evolution.dominio.com" 
                    value={formData.api_url}
                    onChange={(e) => setFormData(prev => ({ ...prev, api_url: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Chave de API (AUTHENTICATION_API_KEY)</Label>
                  <div className="relative">
                    <Input 
                      type={formData.show_key ? 'text' : 'password'}
                      value={formData.api_key}
                      onChange={(e) => setFormData(prev => ({ ...prev, api_key: e.target.value }))}
                      placeholder="Sua chave secreta..."
                      className="pr-10"
                    />
                    <Button
                      aria-label={formData.show_key ? 'Ocultar chave' : 'Mostrar chave'}
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                      onClick={() => setFormData(prev => ({ ...prev, show_key: !prev.show_key }))}
                    >
                      {formData.show_key ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between border-t p-6 mt-4">
              <Button variant="ghost" onClick={() => setFormData({
                instance_name: '',
                api_url: DEFAULT_URL,
                api_key: '',
                show_key: false,
                is_editing: null
              })}>
                Cancelar
              </Button>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => handleTestConnection({ 
                    api_url: formData.api_url, 
                    api_key: formData.api_key,
                    instance_name: formData.instance_name
                  })}
                  disabled={testing === 'new'}
                >
                  {testing === 'new' ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Activity className="w-4 h-4 mr-2" />}
                  Testar
                </Button>
                <Button onClick={handleSave} disabled={loading}>
                  <Save className="w-4 h-4 mr-2" />
                  Salvar Alterações
                </Button>
              </div>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <History className="w-4 h-4" />
                Histórico Recente de Conexões
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[400px]">
                <div className="divide-y">
                  {healthLogs.map((log) => {
                    const creds = credentials.find(c => c.instance_name === log.instance_name);
                    return (
                      <div key={log.id} className="p-4 flex items-center justify-between hover:bg-muted/30 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-full ${log.status === 'success' ? 'bg-whatsapp/10' : 'bg-destructive/10'}`}>
                            {log.status === 'success' 
                              ? <CheckCircle2 className="w-4 h-4 text-whatsapp" /> 
                              : <XCircle className="w-4 h-4 text-destructive" />
                            }
                          </div>
                          <div>
                            <p className="text-sm font-medium">{log.instance_name}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {format(new Date(log.performed_at), "HH:mm:ss - dd/MM/yyyy", { locale: ptBR })}
                            </p>
                          </div>
                        </div>
                        <div className="text-right space-y-1">
                          <div className="flex items-center gap-2 justify-end">
                            <Badge variant="outline" className="text-[9px] h-4 font-normal">
                              {log.response_time_ms}ms
                            </Badge>
                            {log.status === 'success' && (
                              <Badge variant="secondary" className="text-[9px] h-4 font-normal bg-whatsapp/5 text-whatsapp border-whatsapp/20">
                                {log.online_instances}/{log.total_instances} online
                              </Badge>
                            )}
                            {creds && (
                              <Button
                                aria-label="Repetir teste de conexão"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 ml-1"
                                onClick={() => handleTestConnection(creds)}
                                disabled={testing === creds.id}
                              >
                                {testing === creds.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <RefreshCw className="w-3 h-3" />
                                )}
                              </Button>
                            )}
                          </div>
                          {log.error_message && (
                            <p className="text-[10px] text-destructive truncate max-w-[200px]">
                              {log.error_message}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {healthLogs.length === 0 && (
                    <div className="p-8 text-center text-muted-foreground italic">
                      Nenhum log registrado ainda. Realize um teste para começar.
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <Card className="border-primary/10 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-primary mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="text-sm font-medium">Observabilidade e Governança</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Este painel centraliza a saúde operacional das suas APIs. O sistema agora normaliza automaticamente URLs 
                  (garantindo HTTPS e removendo barras extras) e realiza um teste de pré-validação antes de salvar qualquer 
                  credencial, prevenindo falhas de configuração em cascata.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
