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
          <span className="text-xs  text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-md">
            {borderRadius}px
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Slider */}
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-muted-foreground/60  w-4">0</span>
          <Slider
            value={[borderRadius]}
            onValueChange={onChange}
            min={0}
            max={20}
            step={1}
            className="flex-1"
          />
          <span className="text-[10px] text-muted-foreground/60  w-5">20</span>
        </div>

        {/* Live preview */}
        <div className="space-y-3">
          <p className="text-[11px] text-muted-foreground/50 uppercase tracking-wider font-medium">
            Preview em tempo real
          </p>

          <div className="bg-muted/20 border border-border/30 rounded-xl p-4 space-y-3">
            {/* Row 1: Buttons */}
            <div className="flex flex-wrap gap-2">
              <button type="button"
                className="bg-primary text-primary-foreground px-4 h-9 text-xs font-medium flex items-center gap-1.5 transition-all"
                style={{ borderRadius: r }}
              >
                <Send className="w-3.5 h-3.5" /> Enviar
              </button>
              <button type="button"
                className="bg-secondary text-secondary-foreground px-4 h-9 text-xs font-medium flex items-center gap-1.5 transition-all"
                style={{ borderRadius: r }}
              >
                <Heart className="w-3.5 h-3.5" /> Curtir
              </button>
              <button type="button"
                className="border border-border bg-card text-foreground px-4 h-9 text-xs font-medium flex items-center gap-1.5 transition-all"
                style={{ borderRadius: r }}
              >
                <Settings className="w-3.5 h-3.5" /> Config
              </button>
              <button type="button"
                className="bg-destructive text-destructive-foreground px-3 h-9 text-xs font-medium transition-all"
                style={{ borderRadius: r }}
              >
                Excluir
              </button>
            </div>

            {/* Row 2: Input + Badge */}
            <div className="flex gap-2 items-center">
              <div
                className="flex-1 h-9 bg-background border border-border flex items-center px-3 gap-2 transition-all"
                style={{ borderRadius: r }}
              >
                <Search className="w-3.5 h-3.5 text-muted-foreground/50" />
                <span className="text-xs text-muted-foreground/40">Buscar...</span>
              </div>
              <div
                className="bg-primary/15 text-primary px-2.5 h-6 text-[10px] font-semibold flex items-center gap-1 transition-all"
                style={{ borderRadius: r }}
              >
                <Star className="w-3 h-3" /> Novo
              </div>
              <div
                className="bg-accent text-accent-foreground px-2.5 h-6 text-[10px] font-medium flex items-center gap-1 transition-all"
                style={{ borderRadius: r }}
              >
                <Bell className="w-3 h-3" /> 3
              </div>
            </div>

            {/* Row 3: Mini card */}
            <div
              className="bg-card border border-border p-3 transition-all"
              style={{ borderRadius: r }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 bg-primary/20 flex items-center justify-center text-primary text-xs font-bold transition-all"
                  style={{ borderRadius: r }}
                >
                  JD
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground">João da Silva</p>
                  <p className="text-[10px] text-muted-foreground truncate">Última mensagem enviada há 5 min</p>
                </div>
                <div
                  className="w-2 h-2 bg-primary rounded-full shrink-0"
                />
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
