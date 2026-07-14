import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, Bug, RefreshCw } from 'lucide-react';
import { useUserRole } from '@/features/auth/hooks/useUserRole';

export function ThemeDebugger() {
  const { roles, loading: rolesLoading } = useUserRole();
  // Restrito ESTRITAMENTE a usuários com role 'dev' no banco — não usamos
  // isDev hierárquico aqui porque queremos esconder de admin/manager também.
  const isDevExact = roles.includes('dev');

  const [isOpen, setIsOpen] = useState(false);
  const [tokens, setTokens] = useState<
    Record<string, { value: string; source: 'inline' | 'css' | 'not set' }>
  >({});
  const [activePreset, setActivePreset] = useState<string>('unknown');

  const refreshTokens = () => {
    const root = document.documentElement;
    const computedStyle = getComputedStyle(root);
    const saved = localStorage.getItem('purpure-chat-theme-v2');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setActivePreset(parsed.preset || 'default');
      } catch {
        setActivePreset('error');
      }
    }

    const relevant = [
      '--primary',
      '--background',
      '--font-sans',
      '--font-display',
      '--radius',
      '--card',
      '--border',
    ];

    const values: Record<string, { value: string; source: 'inline' | 'css' | 'not set' }> = {};
    relevant.forEach((token) => {
      const inlineValue = root.style.getPropertyValue(token).trim();
      const computedValue = computedStyle.getPropertyValue(token).trim();

      if (inlineValue) {
        values[token] = { value: inlineValue, source: 'inline' };
      } else if (computedValue) {
        values[token] = { value: computedValue, source: 'css' };
      } else {
        values[token] = { value: 'not set', source: 'not set' };
      }
    });
    setTokens(values);
  };

  useEffect(() => {
    if (isOpen) {
      refreshTokens();
      const interval = setInterval(refreshTokens, 2000);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [isOpen]);

  // Esconde completamente para qualquer usuário que NÃO tenha o role 'dev'.
  if (rolesLoading || !isDevExact) return null;

  if (!isOpen) {
    return (
      <Button
        variant="outline"
        size="icon"
        className="fixed bottom-4 right-4 z-[9999] rounded-full bg-background/80 shadow-lg backdrop-blur"
        onClick={() => setIsOpen(true)}
        aria-label="Abrir theme debugger"
      >
        <Bug className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <Card className="fixed bottom-4 right-4 z-[9999] w-80 border-2 p-4 shadow-2xl animate-in fade-in slide-in-from-bottom-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <Bug className="h-4 w-4 text-primary" />
          Theme Debugger
          <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[9px] uppercase text-primary">
            {activePreset}
          </span>
        </h3>
        <div className="flex gap-1">
          <Button aria-label="Atualizar tokens" variant="ghost" size="icon" className="h-6 w-6" onClick={refreshTokens}>
            <RefreshCw className="h-3 w-3" />
          </Button>
          <Button aria-label="Fechar depurador de tema" variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsOpen(false)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <div className="space-y-2 text-[10px]">
        {Object.entries(tokens).map(([key, data]) => (
          <div key={key} className="flex flex-col border-b border-border/50 pb-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{key}</span>
              <span
                className={`rounded px-1 text-[8px] ${
                  data.source === 'inline'
                    ? 'bg-warning/20 text-warning-foreground'
                    : data.source === 'css'
                      ? 'bg-primary/20 text-primary'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {data.source}
              </span>
            </div>
            <span className="truncate text-foreground" title={data.value}>
              {data.value}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 text-[9px] italic text-muted-foreground">
        * Inline styles (root.style) override tokens.css
      </div>
    </Card>
  );
}
