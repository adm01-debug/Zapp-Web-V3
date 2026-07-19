import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Palette, RotateCcw, Save, Sun, Moon, Monitor, ChevronLeft } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useTheme } from '@/hooks/useTheme';
import { PRESETS } from './theme/presets';
import { useThemePreset } from './theme/useThemePreset';
import { PresetCard } from './theme/PresetCard';
import { BorderRadiusControl } from './theme/BorderRadiusControl';
import { ThemeDebugTooltip } from './theme/ThemeDebugTooltip';
import { toast } from 'sonner';

/** Theme Customizer component for the settings section. */
export function ThemeCustomizer() {
  const { theme, setTheme } = useTheme();
  const { activePreset, borderRadius, applyPreset, handleBorderRadiusChange, resetTheme } =
    useThemePreset();

  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            aria-label="Voltar"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg"
            onClick={() => window.history.back()}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div>
            <h3 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Palette className="h-5 w-5 text-primary" />
              Skins
            </h3>
            <p className="text-sm text-muted-foreground">Escolha sua skin favorita</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ThemeDebugTooltip />
          <div className="flex gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                const preset = PRESETS.find((p) => p.id === activePreset);
                toast.success(`Tema "${preset?.name || 'Padrão'}" salvo com sucesso!`);
              }}
            >
              <Save className="mr-1 h-4 w-4" /> Salvar
            </Button>
            <Button variant="outline" size="sm" onClick={resetTheme}>
              <RotateCcw className="mr-1 h-4 w-4" /> Resetar tema
            </Button>
          </div>
        </div>
      </div>

      {/* Mode Toggle */}
      <Card className="border-secondary/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Modo de Cor</CardTitle>
        </CardHeader>
        <CardContent>
          <TooltipProvider>
            <div className="flex gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={theme === 'light' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setTheme('light')}
                  >
                    <Sun className="mr-1 h-4 w-4" /> Claro
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Força o tema claro independente do sistema</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={theme === 'dark' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setTheme('dark')}
                  >
                    <Moon className="mr-1 h-4 w-4" /> Escuro
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Força o tema escuro independente do sistema</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={theme === 'system' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setTheme('system')}
                  >
                    <Monitor className="mr-1 h-4 w-4" /> Sistema
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Segue automaticamente a preferência do seu dispositivo
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </CardContent>
      </Card>

      {/* Presets Grid */}
      <div>
        <h4 className="mb-3 text-sm font-medium text-muted-foreground">
          {PRESETS.length} skins disponíveis
        </h4>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {PRESETS.map((preset) => (
            <PresetCard
              key={preset.id}
              preset={preset}
              isActive={activePreset === preset.id}
              onSelect={applyPreset}
            />
          ))}
        </div>
      </div>

      {/* Border Radius */}
      <BorderRadiusControl borderRadius={borderRadius} onChange={handleBorderRadiusChange} />
    </div>
  );
}
