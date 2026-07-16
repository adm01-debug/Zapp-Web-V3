import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Send, Search, Heart, Bell, Settings, Star } from 'lucide-react';

interface BorderRadiusControlProps {
  borderRadius: number;
  onChange: (value: number[]) => void;
}

export function BorderRadiusControl({ borderRadius, onChange }: BorderRadiusControlProps) {
  const r = `${borderRadius}px`;

  return (
    <Card className="border-secondary/30">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Raio da Borda</CardTitle>
          <span className="rounded-md bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground">
            {borderRadius}px
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Slider */}
        <div className="flex items-center gap-3">
          <span className="w-4 text-[10px] text-muted-foreground/60">0</span>
          <Slider
            value={[borderRadius]}
            onValueChange={onChange}
            min={0}
            max={20}
            step={1}
            className="flex-1"
          />
          <span className="w-5 text-[10px] text-muted-foreground/60">20</span>
        </div>

        {/* Live preview */}
        <div className="space-y-3">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/50">
            Preview em tempo real
          </p>

          <div className="space-y-3 rounded-xl border border-border/30 bg-muted/20 p-4">
            {/* Row 1: Buttons */}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="flex h-9 items-center gap-1.5 bg-primary px-4 text-xs font-medium text-primary-foreground transition-all"
                style={{ borderRadius: r }}
              >
                <Send className="h-3.5 w-3.5" /> Enviar
              </button>
              <button
                type="button"
                className="flex h-9 items-center gap-1.5 bg-secondary px-4 text-xs font-medium text-secondary-foreground transition-all"
                style={{ borderRadius: r }}
              >
                <Heart className="h-3.5 w-3.5" /> Curtir
              </button>
              <button
                type="button"
                className="flex h-9 items-center gap-1.5 border border-border bg-card px-4 text-xs font-medium text-foreground transition-all"
                style={{ borderRadius: r }}
              >
                <Settings className="h-3.5 w-3.5" /> Config
              </button>
              <button
                type="button"
                className="h-9 bg-destructive px-3 text-xs font-medium text-destructive-foreground transition-all"
                style={{ borderRadius: r }}
              >
                Excluir
              </button>
            </div>

            {/* Row 2: Input + Badge */}
            <div className="flex items-center gap-2">
              <div
                className="flex h-9 flex-1 items-center gap-2 border border-border bg-background px-3 transition-all"
                style={{ borderRadius: r }}
              >
                <Search className="h-3.5 w-3.5 text-muted-foreground/50" />
                <span className="text-xs text-muted-foreground/40">Buscar...</span>
              </div>
              <div
                className="flex h-6 items-center gap-1 bg-primary/15 px-2.5 text-[10px] font-semibold text-primary transition-all"
                style={{ borderRadius: r }}
              >
                <Star className="h-3 w-3" /> Novo
              </div>
              <div
                className="flex h-6 items-center gap-1 bg-accent px-2.5 text-[10px] font-medium text-accent-foreground transition-all"
                style={{ borderRadius: r }}
              >
                <Bell className="h-3 w-3" /> 3
              </div>
            </div>

            {/* Row 3: Mini card */}
            <div
              className="border border-border bg-card p-3 transition-all"
              style={{ borderRadius: r }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="flex h-8 w-8 items-center justify-center bg-primary/20 text-xs font-bold text-primary transition-all"
                  style={{ borderRadius: r }}
                >
                  JD
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground">João da Silva</p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    Última mensagem enviada há 5 min
                  </p>
                </div>
                <div className="h-2 w-2 shrink-0 rounded-full bg-primary" />
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
