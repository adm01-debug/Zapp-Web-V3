import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  id: string;
}

export function PasswordInput({ id, className, ...props }: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="group relative">
      <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
      <Input
        id={id}
        type={showPassword ? 'text' : 'password'}
        placeholder="••••••••"
        className={cn(
          'glass border-border/50 pl-10 pr-10 transition-all focus:border-primary/50 focus:ring-primary/20',
          className
        )}
        {...props}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
        aria-pressed={showPassword}
        className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 p-0 hover:bg-transparent"
        onClick={() => setShowPassword(!showPassword)}
        tabIndex={0}
      >
        {showPassword ? (
          <EyeOff className="h-4 w-4 text-muted-foreground transition-colors hover:text-foreground" />
        ) : (
          <Eye className="h-4 w-4 text-muted-foreground transition-colors hover:text-foreground" />
        )}
      </Button>
    </div>
  );
}
