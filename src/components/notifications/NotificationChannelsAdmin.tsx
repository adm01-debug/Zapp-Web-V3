import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BellRing, Plus, Pencil, Trash2, ShieldAlert, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useUserRole } from '@/features/auth/hooks/useUserRole';
import type { Json } from '@/integrations/supabase/types';
import {
  useNotificationChannels,
  type NotificationChannelConfig,
  type NotificationTemplate,
} from '@/hooks/useNotificationChannels';

// DASHBOARD-08 — UI admin para notificação por canal.
// SINALIZAÇÕES (fora do escopo desta branch — exigem migration/edge):
//  1. RLS de escrita ausente (SELECT-only em notification_channels_config; nenhuma policy em
//     notification_templates) → salvar/excluir retornará 42501 até migration adicionar
//     policies de escrita admin-only. O erro cru é exibido nos toasts.
//  2. Executor de envio NÃO criado (proposital): falta edge/worker que consuma
//     notification_channels_config + notification_templates para disparar envios.

const SEVERITY_OPTIONS = ['info', 'warning', 'critical', 'error'] as const;

function tryParseJson(raw: string): Json | null {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Json;
    return null;
  } catch {
    return null;
  }
}

interface ChannelDialogState {
  open: boolean;
  channel: NotificationChannelConfig | null;
  channelName: string;
  enabled: boolean;
  minSeverity: string;
  configJson: string;
}

interface TemplateDialogState {
  open: boolean;
  template: NotificationTemplate | null;
  name: string;
  channel: string;
  subject: string;
  bodyTemplate: string;
  variablesJson: string;
  isActive: boolean;
}

/** Admin UI: canais de notificação + templates (zapp.notification_channels_config / zapp.notification_templates). */
export function NotificationChannelsAdmin() {
  const { isAdmin, loading: roleLoading } = useUserRole();
  const {
    channels,
    channelsLoading,
    channelsError,
    templates,
    templatesLoading,
    templatesError,
    saveChannel,
    deleteChannel,
    saveTemplate,
    deleteTemplate,
  } = useNotificationChannels();

  const [channelDialog, setChannelDialog] = useState<ChannelDialogState>({
    open: false,
    channel: null,
    channelName: '',
    enabled: true,
    minSeverity: 'info',
    configJson: '',
  });
  const [templateDialog, setTemplateDialog] = useState<TemplateDialogState>({
    open: false,
    template: null,
    name: '',
    channel: 'whatsapp',
    subject: '',
    bodyTemplate: '',
    variablesJson: '',
    isActive: true,
  });

  if (roleLoading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Verificando permissões…
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <Alert>
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Acesso restrito</AlertTitle>
        <AlertDescription>
          A configuração de canais e templates de notificação é exclusiva para administradores
          (o RLS das tabelas exige <code>zapp.is_admin_or_supervisor()</code>).
        </AlertDescription>
      </Alert>
    );
  }

  const openNewChannel = () => {
    setChannelDialog({
      open: true,
      channel: null,
      channelName: '',
      enabled: true,
      minSeverity: 'info',
      configJson: '',
    });
  };

  const openEditChannel = (channel: NotificationChannelConfig) => {
    setChannelDialog({
      open: true,
      channel,
      channelName: channel.channel_name ?? '',
      enabled: channel.enabled ?? true,
      minSeverity: channel.min_severity ?? 'info',
      configJson: channel.config ? JSON.stringify(channel.config, null, 2) : '',
    });
  };

  const submitChannel = () => {
    if (!channelDialog.channelName.trim()) return;
    const config = tryParseJson(channelDialog.configJson);
    if (config === null) {
      toast.error('Config inválida', { description: 'Forneça um JSON de objeto válido' });
      return;
    }
    saveChannel.mutate({
      id: channelDialog.channel?.id ?? null,
      channel_name: channelDialog.channelName.trim(),
      enabled: channelDialog.enabled,
      min_severity: channelDialog.minSeverity,
      config,
    });
    setChannelDialog((d) => ({ ...d, open: false }));
  };

  const openNewTemplate = () => {
    setTemplateDialog({
      open: true,
      template: null,
      name: '',
      channel: 'whatsapp',
      subject: '',
      bodyTemplate: '',
      variablesJson: '',
      isActive: true,
    });
  };

  const openEditTemplate = (template: NotificationTemplate) => {
    setTemplateDialog({
      open: true,
      template,
      name: template.name ?? '',
      channel: template.channel ?? 'whatsapp',
      subject: template.subject ?? '',
      bodyTemplate: template.body_template ?? '',
      variablesJson: template.variables ? JSON.stringify(template.variables, null, 2) : '',
      isActive: template.is_active ?? true,
    });
  };

  const submitTemplate = () => {
    if (!templateDialog.name.trim() || !templateDialog.bodyTemplate.trim()) return;
    const variables = tryParseJson(templateDialog.variablesJson);
    if (variables === null) {
      toast.error('Variáveis inválidas', { description: 'Forneça um JSON de objeto válido' });
      return;
    }
    saveTemplate.mutate({
      id: templateDialog.template?.id ?? null,
      name: templateDialog.name.trim(),
      channel: templateDialog.channel || null,
      subject: templateDialog.subject || null,
      body_template: templateDialog.bodyTemplate,
      variables,
      is_active: templateDialog.isActive,
    });
    setTemplateDialog((d) => ({ ...d, open: false }));
  };

  return (
    <div className="space-y-6 pt-6">
      <Alert variant="destructive">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Sinalização DASHBOARD-08 — escrita bloqueada por RLS</AlertTitle>
        <AlertDescription>
          <code>zapp.notification_channels_config</code> só possui policy <b>SELECT</b> (admin/supervisor) e{' '}
          <code>zapp.notification_templates</code> não possui nenhuma policy no repositório. Salvar/excluir
          via frontend retornará <code>42501 permission denied</code> até uma migration adicionar policies de
          escrita (admin-only). O executor de envio (edge/worker que consome estas tabelas) <b>não foi criado</b> —
          fora do escopo desta correção.
        </AlertDescription>
      </Alert>

      {/* Canais */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <BellRing className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-base">Canais de Notificação</CardTitle>
                <CardDescription>
                  Configuração por canal (WhatsApp, e-mail, push…). Consumida pelo executor ainda inexistente.
                </CardDescription>
              </div>
            </div>
            <Button size="sm" onClick={openNewChannel}>
              <Plus className="mr-1 h-4 w-4" /> Novo Canal
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {channelsError ? (
            <p className="py-4 text-center text-sm text-destructive">
              Erro ao carregar canais: {channelsError.message}
            </p>
          ) : channelsLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/50" />
              ))}
            </div>
          ) : channels.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum canal configurado ainda (tabela vazia em produção).
            </p>
          ) : (
            <div className="space-y-2">
              {channels.map((channel) => (
                <div
                  key={channel.id ?? channel.channel_name}
                  className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{channel.channel_name}</p>
                      {channel.enabled ? (
                        <Badge className="text-[9px]">ativo</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[9px]">inativo</Badge>
                      )}
                      {channel.min_severity && (
                        <Badge variant="secondary" className="text-[9px]">
                          severidade mínima: {channel.min_severity}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {channel.config ? JSON.stringify(channel.config) : 'sem config extra'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditChannel(channel)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      disabled={deleteChannel.isPending}
                      onClick={() => {
                        if (channel.id !== null && channel.id !== undefined) deleteChannel.mutate(channel.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Templates */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Templates de Notificação</CardTitle>
              <CardDescription>
                Corpo/assunto por canal. Variáveis em JSON (ex.: {'{"name": "{{nome}}"}'}).
              </CardDescription>
            </div>
            <Button size="sm" onClick={openNewTemplate}>
              <Plus className="mr-1 h-4 w-4" /> Novo Template
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {templatesError ? (
            <p className="py-4 text-center text-sm text-destructive">
              Erro ao carregar templates: {templatesError.message}
            </p>
          ) : templatesLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-muted/50" />
              ))}
            </div>
          ) : templates.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum template criado ainda.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Assunto</TableHead>
                  <TableHead>Corpo</TableHead>
                  <TableHead>Ativo</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((template) => (
                  <TableRow key={template.id ?? template.name}>
                    <TableCell className="font-medium">{template.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[9px]">{template.channel ?? '—'}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[140px] truncate text-xs">{template.subject ?? '—'}</TableCell>
                    <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground">
                      {template.body_template}
                    </TableCell>
                    <TableCell>
                      <Badge variant={template.is_active ? 'default' : 'outline'} className="text-[9px]">
                        {template.is_active ? 'sim' : 'não'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditTemplate(template)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          disabled={deleteTemplate.isPending}
                          onClick={() => {
                            if (template.id) deleteTemplate.mutate(template.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog: canal */}
      <Dialog open={channelDialog.open} onOpenChange={(open) => setChannelDialog((d) => ({ ...d, open }))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{channelDialog.channel ? 'Editar Canal' : 'Novo Canal'}</DialogTitle>
            <DialogDescription>
              Canal de notificação (config consumida por executor ainda inexistente).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome do canal</Label>
              <Input
                value={channelDialog.channelName}
                onChange={(e) => setChannelDialog((d) => ({ ...d, channelName: e.target.value }))}
                placeholder="ex.: whatsapp, email, push"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Habilitado</Label>
              <Switch
                checked={channelDialog.enabled}
                onCheckedChange={(checked) => setChannelDialog((d) => ({ ...d, enabled: checked }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Severidade mínima</Label>
              <Select
                value={channelDialog.minSeverity}
                onValueChange={(value) => setChannelDialog((d) => ({ ...d, minSeverity: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITY_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Config (JSON)</Label>
              <Textarea
                rows={4}
                value={channelDialog.configJson}
                onChange={(e) => setChannelDialog((d) => ({ ...d, configJson: e.target.value }))}
                placeholder='{ "webhook_url": "…" }'
                className="font-mono text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChannelDialog((d) => ({ ...d, open: false }))}>
              Cancelar
            </Button>
            <Button onClick={submitChannel} disabled={saveChannel.isPending || !channelDialog.channelName.trim()}>
              {saveChannel.isPending ? 'Salvando…' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: template */}
      <Dialog open={templateDialog.open} onOpenChange={(open) => setTemplateDialog((d) => ({ ...d, open }))}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{templateDialog.template ? 'Editar Template' : 'Novo Template'}</DialogTitle>
            <DialogDescription>
              Template de notificação por canal (variáveis em JSON de objeto).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input
                  value={templateDialog.name}
                  onChange={(e) => setTemplateDialog((d) => ({ ...d, name: e.target.value }))}
                  placeholder="ex.: alerta-critico"
                />
              </div>
              <div className="space-y-2">
                <Label>Canal</Label>
                <Input
                  value={templateDialog.channel}
                  onChange={(e) => setTemplateDialog((d) => ({ ...d, channel: e.target.value }))}
                  placeholder="whatsapp"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Assunto</Label>
              <Input
                value={templateDialog.subject}
                onChange={(e) => setTemplateDialog((d) => ({ ...d, subject: e.target.value }))}
                placeholder="Opcional (e-mail)"
              />
            </div>
            <div className="space-y-2">
              <Label>Corpo do template</Label>
              <Textarea
                rows={4}
                value={templateDialog.bodyTemplate}
                onChange={(e) => setTemplateDialog((d) => ({ ...d, bodyTemplate: e.target.value }))}
                placeholder="Olá {{name}}! …"
              />
            </div>
            <div className="space-y-2">
              <Label>Variáveis (JSON)</Label>
              <Textarea
                rows={3}
                value={templateDialog.variablesJson}
                onChange={(e) => setTemplateDialog((d) => ({ ...d, variablesJson: e.target.value }))}
                placeholder='{ "name": "string", "severity": "string" }'
                className="font-mono text-xs"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Ativo</Label>
              <Switch
                checked={templateDialog.isActive}
                onCheckedChange={(checked) => setTemplateDialog((d) => ({ ...d, isActive: checked }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateDialog((d) => ({ ...d, open: false }))}>
              Cancelar
            </Button>
            <Button
              onClick={submitTemplate}
              disabled={saveTemplate.isPending || !templateDialog.name.trim() || !templateDialog.bodyTemplate.trim()}
            >
              {saveTemplate.isPending ? 'Salvando…' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
