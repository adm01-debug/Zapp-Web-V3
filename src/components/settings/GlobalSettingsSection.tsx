import { useGlobalSettings } from '@/hooks/useGlobalSettings';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Globe, Users, MessageCircle, RotateCcw, Key } from 'lucide-react';
import { toast } from 'sonner';
import { LanguageSelector } from '@/components/settings/LanguageSelector';
import { WhatsAppModeSetting } from '@/components/settings/WhatsAppModeSetting';
import { ConnectionTestPanel } from '@/components/settings/ConnectionTestPanel';

export function GlobalSettingsSection() {
  const { settings: _settings, isLoading, getSetting, updateSetting } = useGlobalSettings();

  const handleToggle = async (key: string, currentValue: string | null) => {
    const newValue = currentValue === 'enabled' ? 'disabled' : 'enabled';
    try {
      await updateSetting(key, newValue);
      toast.success('Configuração atualizada');
    } catch {
      toast.error('Erro ao atualizar');
    }
  };

  const handleInputChange = async (key: string, value: string) => {
    try {
      await updateSetting(key, value);
      toast.success('Configuração salva');
    } catch {
      toast.error('Erro ao salvar');
    }
  };

  if (isLoading) {
    return (
      <Card className="border border-secondary/20 bg-card">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const booleanSettings = [
    {
      key: 'user_creation',
      label: 'Criação de Usuários',
      desc: 'Permite novos cadastros no sistema',
      icon: Users,
    },
    {
      key: 'check_msg_is_group',
      label: 'Mensagens de Grupo',
      desc: 'Processar mensagens de grupos WhatsApp',
      icon: MessageCircle,
    },
    {
      key: 'group_tickets_enabled',
      label: 'Tickets de Grupo',
      desc: 'Criar tickets automaticamente para grupos',
      icon: Globe,
    },
  ];

  return (
    <Card className="border border-secondary/20 bg-card transition-all hover:border-secondary/30">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              Configurações Globais
            </CardTitle>
            <CardDescription>Configurações que se aplicam a todo o sistema</CardDescription>
          </div>
          <LanguageSelector />
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {booleanSettings.map(({ key, label, desc, icon: Icon }) => (
          <div
            key={key}
            className="flex items-center justify-between rounded-lg border border-border/20 p-3 transition-colors hover:bg-muted/10"
          >
            <div className="flex items-center gap-3">
              <Icon className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label className="text-sm font-medium">{label}</Label>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            </div>
            <Switch
              checked={getSetting(key) === 'enabled'}
              onCheckedChange={() => handleToggle(key, getSetting(key))}
            />
          </div>
        ))}

        <WhatsAppModeSetting />

        <div className="space-y-2 rounded-lg border border-border/20 p-3">
          <div className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-muted-foreground" />
            <Label className="text-sm font-medium">Reabertura Automática (horas)</Label>
          </div>
          <p className="text-xs text-muted-foreground">
            Tempo após fechamento em que uma nova mensagem reabre a conversa automaticamente
          </p>
          <Input
            type="number"
            min={0}
            max={72}
            value={getSetting('auto_reopen_hours') || '2'}
            onChange={(e) => handleInputChange('auto_reopen_hours', e.target.value)}
            className="h-8 w-24 text-sm"
          />
        </div>

        <div className="space-y-2 rounded-lg border border-border/20 p-3">
          <div className="flex items-center gap-2">
            <Key className="h-4 w-4 text-muted-foreground" />
            <Label className="text-sm font-medium">Token API Pública</Label>
          </div>
          <p className="text-xs text-muted-foreground">
            Token para autenticar chamadas à API pública de envio de mensagens
          </p>
          <Input
            type="password"
            value={getSetting('api_token') || ''}
            onChange={(e) => handleInputChange('api_token', e.target.value)}
            placeholder="Defina um token seguro..."
            className="h-8 text-sm"
          />
        </div>
      </CardContent>
      <CardContent className="pt-0">
        <ConnectionTestPanel />
      </CardContent>
    </Card>
  );
}
