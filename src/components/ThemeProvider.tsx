import { type ReactNode } from 'react';

interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: 'light' | 'dark' | 'system';
  storageKey?: string;
}

// Thin wrapper for API compatibility — actual theme state is managed by the
// useTheme.ts singleton and ThemeSync mounted inside AppProviders.
export function ThemeProvider({ children }: ThemeProviderProps) {
  return <>{children}</>;
}
