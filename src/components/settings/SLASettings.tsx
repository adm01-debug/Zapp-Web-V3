import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { AlertTriangle, ShieldAlert, FlaskConical } from 'lucide-react';
import { UserSettings } from '@/hooks/useUserSettings';

interface SLASettingsProps {
  settings: UserSettings;
  updateSettings: (updates: Partial<UserSettings>) => void;
}

export function SLASettings({ settings, updateSettings }: SLASettingsProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-primary" />
            <CardTitle>Configurações Globais de SLA</CardTitle>
          </div>
          <CardDescription>
            Defina os limites padrão de tempo de resposta para alertas de Risco e Violação.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sla_warning" className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-warning-foreground" />
                Limite de Risco (minutos)
              </Label>
              <Input
                id="sla_warning"
                type="number"
                value={settings.global_sla_warning_minutes}
                onChange={(e) => updateSettings({ global_sla_warning_minutes: parseInt(e.target.value) || 0 })}
                placeholder="Ex: 30"
              />
              <p className="text-[10px] text-muted-foreground">
                Tempo de espera antes de marcar a conversa como "Em Risco".
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sla_critical" className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-destructive-foreground" />
                Limite Crítico/Violação (minutos)
              </Label>
              <Input
                id="sla_critical"
                type="number"
                value={settings.global_sla_critical_minutes}
                onChange={(e) => updateSettings({ global_sla_critical_minutes: parseInt(e.target.value) || 0 })}
                placeholder="Ex: 60"
              />
              <p className="text-[10px] text-muted-foreground">
                Tempo de espera antes de marcar a conversa como "Violada".
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sla_message">Mensagem de Notificação Padrão</Label>
            <Textarea
              id="sla_message"
              value={settings.global_sla_notification_message}
              onChange={(e) => updateSettings({ global_sla_notification_message: e.target.value })}
              placeholder="Digite a mensagem que será enviada internamente..."
              className="min-h-[100px]"
            />
            <p className="text-[10px] text-muted-foreground">
              Esta mensagem será usada como padrão para novos alertas se não houver uma mensagem específica na conversa.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-warning bg-warning/30">
        <CardHeader>
          <div className="flex items-center gap-2 text-warning-foreground">
            <FlaskConical className="w-5 h-5" />
            <CardTitle>Modo de Simulação</CardTitle>
          </div>
          <CardDescription>
            Ative para testar gráficos e alertas com dados fictícios sem afetar conversas reais.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 rounded-xl bg-background border border-warning">
            <div className="space-y-0.5">
              <Label htmlFor="simulation-mode">Habilitar Dados Mock</Label>
              <p className="text-xs text-muted-foreground">
                Substitui métricas reais por dados gerados para demonstração.
              </p>
            </div>
            <Switch
              id="simulation-mode"
              checked={settings.simulation_mode_enabled}
              onCheckedChange={(checked) => updateSettings({ simulation_mode_enabled: checked })}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
