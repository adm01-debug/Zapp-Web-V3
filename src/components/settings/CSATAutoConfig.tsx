import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MessageSquareHeart, Clock, Send, Zap, ShieldAlert } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { useCSATAutoConfig } from '@/hooks/useCSATAutoConfig';

/** CSATAuto Config component for the settings section. */
export function CSATAutoConfig() {
  const {
    connections,
    isEnabled,
    setIsEnabled,
    delayMinutes,
    setDelayMinutes,
    template,
    setTemplate,
    connectionId,
    setConnectionId,
    saveMutation,
  } = useCSATAutoConfig();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <MessageSquareHeart className="h-5 w-5 text-primary" />
          CSAT Automático
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Envie pesquisas de satisfação automaticamente quando um ticket for resolvido.
        </p>
      </div>

      {/* Sinalização DASHBOARD-05: coleta automática sem executor */}
      <Alert variant="destructive">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Sinalização DASHBOARD-05 — coleta automática sem executor</AlertTitle>
        <AlertDescription>
          Salvar esta configuração persiste em <code>zapp.csat_auto_config</code>, mas <b>nenhum produtor
          existe</b>: nenhuma edge function ou worker lê <code>csat_auto_config</code> para disparar a
          pesquisa no WhatsApp após resolução (grep em supabase/functions/ retorna vazio) e nenhuma edge
          escreve <code>csat_surveys</code>. O CSAT continua dependendo do registro manual. Criar a edge{' '}
          <code>csat-auto-send</code> (ou pg_cron) fica fora do escopo desta branch.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="h-4 w-4" />
            Configuração
          </CardTitle>
          <CardDescription>
            A pesquisa será enviada via WhatsApp após o encerramento do atendimento.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Ativar CSAT Automático</Label>
              <p className="text-xs text-muted-foreground">Enviar pesquisa ao resolver ticket</p>
            </div>
            <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Atraso após resolução (minutos)
            </Label>
            <Input
              type="number"
              min={0}
              max={1440}
              value={delayMinutes}
              onChange={(e) => setDelayMinutes(Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              Tempo de espera antes de enviar a pesquisa (0 = imediato)
            </p>
          </div>

          <div className="space-y-2">
            <Label>Conexão WhatsApp</Label>
            <Select value={connectionId} onValueChange={setConnectionId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a conexão" />
              </SelectTrigger>
              <SelectContent>
                {connections.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Send className="h-4 w-4" />
              Modelo da Mensagem
            </Label>
            <Textarea
              rows={5}
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              placeholder="Use {name} para o nome do contato"
            />
            <p className="text-xs text-muted-foreground">
              Variáveis disponíveis: {'{name}'}, {'{agent}'}, {'{queue}'}
            </p>
          </div>

          <div className="rounded-lg border bg-muted/50 p-4">
            <p className="mb-2 text-xs font-medium">Pré-visualização:</p>
            <p className="whitespace-pre-wrap text-sm">
              {template
                .replace('{name}', 'João Silva')
                .replace('{agent}', 'Maria')
                .replace('{queue}', 'Suporte')}
            </p>
          </div>

          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="w-full"
          >
            {saveMutation.isPending ? 'Salvando...' : 'Salvar Configuração'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
