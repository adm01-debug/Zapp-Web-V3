import {
  Loader2,
  MessageSquare,
  Settings2,
  Globe,
  Lock,
  Shield,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type WhatsappMode = 'none' | 'evolution' | 'official';

interface UpdateMutation {
  mutate: () => void;
  isPending: boolean;
}

interface Props {
  whatsappMode: WhatsappMode;
  setWhatsappMode: (mode: WhatsappMode) => void;
  whatsappApiKey: string;
  setWhatsappApiKey: (v: string) => void;
  whatsappInstanceId: string;
  setWhatsappInstanceId: (v: string) => void;
  updateWhatsappMutation: UpdateMutation;
}

interface ModeCardProps {
  mode: WhatsappMode;
  current: WhatsappMode;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  description: string;
  dimmed?: boolean;
}

function ModeCard({ mode, current, onClick, icon, label, description, dimmed }: ModeCardProps) {
  const active = current === mode;
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={active}
      className={cn(
        'relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 p-4 transition-all hover:border-primary/50',
        active ? 'border-primary bg-primary/5 shadow-sm' : 'border-border bg-card',
        dimmed && !active && 'opacity-60'
      )}
      onClick={onClick}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClick()}
    >
      <div
        className={cn(
          'mb-2 flex h-10 w-10 items-center justify-center rounded-full',
          active ? 'bg-primary/20' : 'bg-muted'
        )}
      >
        {icon}
      </div>
      <p className="text-xs font-bold">{label}</p>
      <p className="mt-1 text-center text-[10px] text-muted-foreground">{description}</p>
      {active && (
        <div className="absolute right-1 top-1">
          <Shield className="h-3 w-3 text-primary" />
        </div>
      )}
    </div>
  );
}

/** Department Whats App View component for the team chat section. */
export function DepartmentWhatsAppView({
  whatsappMode,
  setWhatsappMode,
  whatsappApiKey,
  setWhatsappApiKey,
  whatsappInstanceId,
  setWhatsappInstanceId,
  updateWhatsappMutation,
}: Props) {
  return (
    <div className="flex h-full flex-col space-y-6 px-6 py-6">
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-primary">
          <MessageSquare className="h-4 w-4" /> Integração Híbrida WhatsApp
        </h3>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Configure como este departamento interage com o WhatsApp. Você pode alternar entre API
          Oficial (Cloud) e Não-Oficial (Evolution).
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <ModeCard
          mode="none"
          current={whatsappMode}
          onClick={() => setWhatsappMode('none')}
          icon={<Lock className="h-5 w-5" />}
          label="Desativado"
          description="Apenas chat interno"
          dimmed
        />
        <ModeCard
          mode="evolution"
          current={whatsappMode}
          onClick={() => setWhatsappMode('evolution')}
          icon={<Globe className="h-5 w-5 text-success-foreground" />}
          label="Não-Oficial"
          description="Conexão via QR Code"
        />
        <ModeCard
          mode="official"
          current={whatsappMode}
          onClick={() => setWhatsappMode('official')}
          icon={<Shield className="h-5 w-5 text-primary" />}
          label="API Oficial"
          description="WhatsApp Cloud API"
        />
      </div>

      {whatsappMode !== 'none' && (
        <div className="space-y-4 rounded-xl border bg-muted/20 p-4 animate-in fade-in slide-in-from-top-2">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Configurações da Instância
            </h4>
            <Badge
              variant={whatsappInstanceId ? 'success' : 'secondary'}
              className="h-4 text-[10px]"
            >
              {whatsappInstanceId ? 'Conectado' : 'Aguardando Configuração'}
            </Badge>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase text-muted-foreground">
                ID da Instância / Phone ID
              </label>
              <Input
                value={whatsappInstanceId}
                onChange={(e) => setWhatsappInstanceId(e.target.value)}
                placeholder={whatsappMode === 'evolution' ? 'Ex: MinhaEmpresa' : 'Ex: 1029384756'}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase text-muted-foreground">
                Token de Acesso / API Key
              </label>
              <Input
                type="password"
                value={whatsappApiKey}
                onChange={(e) => setWhatsappApiKey(e.target.value)}
                placeholder="••••••••••••••••"
                className="h-9 text-sm"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button
              className="h-9 w-full gap-2"
              onClick={() => updateWhatsappMutation.mutate()}
              disabled={updateWhatsappMutation.isPending || !whatsappInstanceId || !whatsappApiKey}
            >
              {updateWhatsappMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Settings2 className="h-4 w-4" />
              )}
              Salvar e Validar Conexão
            </Button>
          </div>
        </div>
      )}

      <div className="flex gap-3 rounded-xl border border-warning/20 bg-warning/5 p-3">
        <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
        <div className="space-y-1">
          <p className="text-xs font-bold text-warning">Atenção sobre API Oficial</p>
          <p className="text-[10px] leading-relaxed text-warning">
            A API Oficial requer aprovação do Facebook Business Manager. O uso indevido pode
            resultar no banimento do número. Recomendamos iniciar com o modo Não-Oficial para
            testes.
          </p>
        </div>
      </div>
    </div>
  );
}
