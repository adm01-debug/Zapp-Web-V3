import { useEffect, useState } from 'react';
import { useMountedRef } from '@/hooks/useMountedRef';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Bell, BellOff } from 'lucide-react';

interface Prefs {
  push_enabled: boolean;
  email_enabled: boolean;
  alert_on_degraded: boolean;
  alert_on_disconnected: boolean;
}

const DEFAULTS: Prefs = {
  push_enabled: true,
  email_enabled: false,
  alert_on_degraded: true,
  alert_on_disconnected: true,
};

export function ConnectionAlertPreferences() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );
  const mounted = useMountedRef();

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!mounted.current) return;
      if (!auth.user) {
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from('connection_alert_preferences')
        .select('push_enabled, email_enabled, alert_on_degraded, alert_on_disconnected')
        .eq('user_id', auth.user.id)
        .maybeSingle();
      if (!mounted.current) return;
      if (data) setPrefs(data as Prefs); // ignore-audit: narrows Supabase query result to local interface
      setLoading(false);
    })();
  }, [mounted]);

  const requestPermission = async () => {
    if (typeof Notification === 'undefined') {
      toast.error('Seu navegador não suporta notificações.');
      return;
    }
    const result = await Notification.requestPermission();
    setBrowserPermission(result);
    if (result === 'granted') toast.success('Notificações ativadas no navegador.');
    else toast.error('Permissão negada para notificações.');
  };

  const save = async () => {
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setSaving(false);
      return;
    }
    const { error } = await supabase
      .from('connection_alert_preferences')
      .upsert({ user_id: auth.user.id, ...prefs }, { onConflict: 'user_id' });
    setSaving(false);
    if (error) toast.error('Falha ao salvar preferências');
    else toast.success('Preferências salvas');
  };

  if (loading) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" /> Alertas de Conexão
        </CardTitle>
        <CardDescription>
          Receba avisos quando uma instância ficar instável ou desconectar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {browserPermission !== 'granted' && (
          <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center gap-2 text-sm">
              <BellOff className="h-4 w-4 text-muted-foreground" />
              Permissão do navegador para push: <strong>{browserPermission}</strong>
            </div>
            <Button size="sm" variant="outline" onClick={requestPermission}>
              Permitir notificações
            </Button>
          </div>
        )}

        <div className="flex items-center justify-between">
          <Label htmlFor="push">Notificações push do navegador</Label>
          <Switch
            id="push"
            checked={prefs.push_enabled}
            onCheckedChange={(v) => setPrefs((p) => ({ ...p, push_enabled: v }))}
          />
        </div>

        <div className="flex items-center justify-between opacity-60">
          <Label htmlFor="email">
            E-mail <span className="text-xs text-muted-foreground">(em breve)</span>
          </Label>
          <Switch
            id="email"
            checked={prefs.email_enabled}
            disabled
            onCheckedChange={(v) => setPrefs((p) => ({ ...p, email_enabled: v }))}
          />
        </div>

        <div className="space-y-3 border-t pt-4">
          <p className="text-sm font-medium">Quando alertar</p>
          <div className="flex items-center justify-between">
            <Label htmlFor="degraded">Conexão degradada (CONNECTION_CLOSED recente)</Label>
            <Switch
              id="degraded"
              checked={prefs.alert_on_degraded}
              onCheckedChange={(v) => setPrefs((p) => ({ ...p, alert_on_degraded: v }))}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="disc">Conexão desconectada</Label>
            <Switch
              id="disc"
              checked={prefs.alert_on_disconnected}
              onCheckedChange={(v) => setPrefs((p) => ({ ...p, alert_on_disconnected: v }))}
            />
          </div>
        </div>

        <Button onClick={save} disabled={saving} className="w-full">
          {saving ? 'Salvando...' : 'Salvar preferências'}
        </Button>
      </CardContent>
    </Card>
  );
}
