import { useState, useEffect } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Bell, Reply, CheckCircle2, AlertTriangle, XCircle, Save } from 'lucide-react';
import { toast } from 'sonner';
import {
  useSLAAlertPreferences,
  type SLAAlertPreferences,
} from '@/features/sla';

interface PrefRow {
  key: keyof SLAAlertPreferences;
  icon: typeof Reply;
  iconClass: string;
  title: string;
  description: string;
}

const KIND_ROWS: PrefRow[] = [
  {
    key: 'alert_first_response',
    icon: Reply,
    iconClass: 'text-primary',
    title: 'Alertas de 1ª resposta',
    description: 'Avisar quando o tempo até a primeira resposta entra em risco ou é violado.',
  },
  {
    key: 'alert_resolution',
    icon: CheckCircle2,
    iconClass: 'text-success',
    title: 'Alertas de resolução',
    description: 'Avisar quando o tempo total de resolução da conversa entra em risco ou é violado.',
  },
];

const SEVERITY_ROWS: PrefRow[] = [
  {
    key: 'severity_warning',
    icon: AlertTriangle,
    iconClass: 'text-warning',
    title: 'Em risco',
    description: 'Receber notificações quando o SLA está prestes a estourar (≥ 70% do prazo).',
  },
  {
    key: 'severity_breached',
    icon: XCircle,
    iconClass: 'text-destructive',
    title: 'Violado',
    description: 'Receber notificações quando o prazo do SLA foi ultrapassado.',
  },
];

function PreferenceRow({
  row,
  checked,
  onChange,
}: {
  row: PrefRow;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  const Icon = row.icon;
  const id = `pref-${row.key}`;
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-card/50 p-3">
      <div className="mt-0.5 w-8 h-8 rounded-md bg-muted/40 flex items-center justify-center shrink-0">
        <Icon className={`w-4 h-4 ${row.iconClass}`} aria-hidden />
      </div>
      <div className="flex-1 min-w-0">
        <Label htmlFor={id} className="text-sm font-medium cursor-pointer">
          {row.title}
        </Label>
        <p className="text-xs text-muted-foreground mt-0.5">{row.description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} aria-label={row.title} />
    </div>
  );
}

/** SLAAlert Preferences Page. */
export default function SLAAlertPreferencesPage() {
  const [currentView, setCurrentView] = useState('settings');
  const { preferences, save, isLoading, isSaving } = useSLAAlertPreferences();
  const [draft, setDraft] = useState<SLAAlertPreferences>(preferences);

  useEffect(() => {
    setDraft(preferences);
  }, [preferences]);

  const isDirty =
    draft.enabled !== preferences.enabled ||
    draft.alert_first_response !== preferences.alert_first_response ||
    draft.alert_resolution !== preferences.alert_resolution ||
    draft.severity_warning !== preferences.severity_warning ||
    draft.severity_breached !== preferences.severity_breached;

  const update = (key: keyof SLAAlertPreferences) => (next: boolean) =>
    setDraft((prev) => ({ ...prev, [key]: next }));

  const handleSave = async () => {
    const { error } = await save(draft);
    if (error) {
      toast.error('Não foi possível salvar', { description: error.message });
    } else {
      toast.success('Preferências salvas');
    }
  };

  return (
    <div className="flex h-screen bg-background">
      <Sidebar currentView={currentView} onViewChange={setCurrentView} />
      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          <header className="space-y-1">
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary" aria-hidden />
              <h1 className="text-2xl font-semibold tracking-tight">Alertas de SLA</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Escolha quais alertas de SLA você deseja receber. As preferências são salvas por usuário
              e aplicam-se imediatamente nas conversas em andamento.
            </p>
          </header>

          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : (
            <>
              {/* Master switch — turning this off silences toasts AND skips audit inserts. */}
              <Card className={!draft.enabled ? 'border-warning/30 bg-warning/5' : undefined}>
                <CardContent className="flex items-start gap-3 py-4">
                  <div className="mt-0.5 w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                    <Bell className="w-4 h-4 text-primary" aria-hidden />
                  </div>
                  <div className="flex-1 min-w-0">
                    <Label htmlFor="pref-enabled" className="text-sm font-medium cursor-pointer">
                      Receber alertas de SLA
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Quando desligado, nenhum toast é exibido e nenhum registro de auditoria é
                      gravado para este usuário. Os ajustes finos abaixo só se aplicam quando esta
                      chave estiver ligada.
                    </p>
                  </div>
                  <Switch
                    id="pref-enabled"
                    checked={draft.enabled}
                    onCheckedChange={update('enabled')}
                    aria-label="Ativar alertas de SLA"
                  />
                </CardContent>
              </Card>

              <div
                className={!draft.enabled ? 'opacity-50 pointer-events-none select-none' : undefined}
                aria-disabled={!draft.enabled}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Tipos de alerta</CardTitle>
                    <CardDescription>Quais marcos da conversa devem gerar notificação.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {KIND_ROWS.map((row) => (
                      <PreferenceRow
                        key={row.key}
                        row={row}
                        checked={draft[row.key]}
                        onChange={update(row.key)}
                      />
                    ))}
                  </CardContent>
                </Card>

                <Card className="mt-6">
                  <CardHeader>
                    <CardTitle className="text-base">Severidade</CardTitle>
                    <CardDescription>
                      Em qual nível de criticidade os alertas devem chegar até você.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {SEVERITY_ROWS.map((row) => (
                      <PreferenceRow
                        key={row.key}
                        row={row}
                        checked={draft[row.key]}
                        onChange={update(row.key)}
                      />
                    ))}
                  </CardContent>
                </Card>
              </div>

              <div className="flex items-center justify-end gap-2 sticky bottom-0 bg-background/80 backdrop-blur py-3">
                <Button
                  variant="ghost"
                  onClick={() => setDraft(preferences)}
                  disabled={!isDirty || isSaving}
                >
                  Descartar
                </Button>
                <Button onClick={handleSave} disabled={!isDirty || isSaving}>
                  <Save className="w-4 h-4 mr-1.5" aria-hidden />
                  {isSaving ? 'Salvando…' : 'Salvar preferências'}
                </Button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
