import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Palette, Zap, Type } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export const ChatThemeSettings = () => {
  const { theme, setTheme } = useTheme();
  const [neonIntensity, setNeonIntensity] = useState(70);
  const [fontSize, setFontSize] = useState(14);
  const [roundedBubbles, setRoundedBubbles] = useState(true);

  // Sync with local preferences or global CSS
  useEffect(() => {
    document.documentElement.style.setProperty('--neon-glow-intensity', `${neonIntensity / 100}`);
    document.documentElement.style.setProperty('--chat-font-size', `${fontSize}px`);
    document.documentElement.style.setProperty('--chat-bubble-radius', roundedBubbles ? '20px' : '4px');
  }, [neonIntensity, fontSize, roundedBubbles]);
  
  return (
    <Card className="border-secondary/20 bg-card/50 backdrop-blur-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-primary">
          <Palette className="h-5 w-5" />
          Personalização do Chat
        </CardTitle>
        <CardDescription>
          Ajuste a experiência visual para o seu estilo 10/10.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Tabs defaultValue="appearance" className="w-full">
          <TabsList className="grid grid-cols-2 w-full mb-4">
            <TabsTrigger value="appearance" className="gap-2">
              <Zap className="h-4 w-4" /> Aparência
            </TabsTrigger>
            <TabsTrigger value="layout" className="gap-2">
              <Type className="h-4 w-4" /> Leitura
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="appearance" className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Modo OLED Black</Label>
                <p className="text-xs text-muted-foreground">Preto absoluto para telas OLED.</p>
              </div>
              <Switch 
                checked={theme === 'dark'} 
                onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
              />
            </div>
            
            <div className="space-y-3">
              <Label>Intensidade Neon (Glow)</Label>
              <Slider 
                value={[neonIntensity]} 
                onValueChange={(v) => setNeonIntensity(v[0])} 
                max={100} 
                step={1} 
                className="py-2" 
              />
              <div className="flex justify-between text-[10px] text-muted-foreground uppercase font-bold">
                <span>Discreto</span>
                <span>Vibrante ({neonIntensity}%)</span>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="layout" className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
            <div className="space-y-3">
              <Label>Tamanho do Texto ({fontSize}px)</Label>
              <Slider 
                value={[fontSize]} 
                onValueChange={(v) => setFontSize(v[0])} 
                min={12} 
                max={20} 
                step={1} 
                className="py-2" 
              />
              <div className="flex justify-between text-[10px] text-muted-foreground uppercase font-bold">
                <span>Padrão</span>
                <span>Grande</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Bolhas Arredondadas</Label>
                <p className="text-xs text-muted-foreground">Estilo moderno (WhatsApp) vs Clássico.</p>
              </div>
              <Switch 
                checked={roundedBubbles} 
                onCheckedChange={setRoundedBubbles} 
              />
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};