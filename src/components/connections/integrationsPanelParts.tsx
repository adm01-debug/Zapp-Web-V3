import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

/** Integration Form component for the connections section. */
export function IntegrationForm({
  title,
  icon: Icon,
  fields,
  values,
  onChange,
  onSave,
  onDelete,
  isLoading,
}: {
  title: string;
  icon: React.ElementType;
  fields: { key: string; label: string; type?: string; placeholder?: string }[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  onSave: () => void;
  onDelete: () => void;
  isLoading: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-lg border border-border/20 bg-muted/10 p-3">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-primary" />
          <Label className="font-medium">{title}</Label>
        </div>
        <Switch
          checked={Boolean(values.enabled)}
          onCheckedChange={(checked) => onChange('enabled', checked)}
        />
      </div>

      {Boolean(values.enabled) && (
        <>
          {fields.map(({ key, label, type = 'text', placeholder }) => (
            <div key={key}>
              <Label className="text-sm">{label}</Label>
              {type === 'boolean' ? (
                <div className="mt-1 flex items-center gap-2">
                  <Switch
                    checked={Boolean(values[key])}
                    onCheckedChange={(checked) => onChange(key, checked)}
                  />
                  <span className="text-sm text-muted-foreground">
                    {values[key] ? 'Ativado' : 'Desativado'}
                  </span>
                </div>
              ) : (
                <Input
                  type={type}
                  value={String(values[key] ?? '')}
                  onChange={(e) =>
                    onChange(key, type === 'number' ? Number(e.target.value) : e.target.value)
                  }
                  placeholder={placeholder}
                  className="mt-1"
                />
              )}
            </div>
          ))}

          <div className="flex gap-2">
            <Button onClick={onSave} disabled={isLoading} className="flex-1">
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
            <Button variant="destructive" onClick={onDelete} disabled={isLoading}>
              Remover
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
