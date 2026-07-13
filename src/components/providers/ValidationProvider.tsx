/* eslint-disable react-refresh/only-export-components */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { validationLogger } from '@/utils/validationLogger';
import { supabase, isSupabaseConfigured, warnSupabaseUnconfigured } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ValidationContextType {
  status: 'loading' | 'healthy' | 'warning' | 'error';
  lastError?: string;
  generateEvidence: () => void;
  runProactiveChecks: () => Promise<void>;
}

const ValidationContext = createContext<ValidationContextType | undefined>(undefined);

export const ValidationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<ValidationContextType['status']>('loading');
  const [lastError, setLastError] = useState<string>();

  const runProactiveChecks = async () => {
    validationLogger.addEvent('render', 'Starting proactive validation checks');

    // When Supabase isn't configured, skip the network checks entirely (they
    // would only produce ERR_NAME_NOT_RESOLVED noise) and report a degraded —
    // not failed — state. The DOM render check still runs.
    if (!isSupabaseConfigured) {
      warnSupabaseUnconfigured('ValidationProvider');
      validationLogger.addEvent('network', 'Supabase não configurado — checagens de rede puladas (modo degradado)');
      const rootEl = document.getElementById('root');
      if (!rootEl || rootEl.childElementCount === 0) {
        validationLogger.addEvent('error', 'Critical: Root element is empty after expected render time');
        setStatus('error');
      } else {
        validationLogger.addEvent('render', 'DOM rendering confirmed');
        setStatus('warning');
      }
      return;
    }

    // Check 1: Supabase Connection
    try {
      const { error } = await supabase.from('profiles').select('id').limit(1).maybeSingle();
      if (error) throw error;
      validationLogger.addEvent('network', 'Supabase API connection verified');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      validationLogger.addEvent('error', `Critical: Supabase connection failed: ${msg}`);
    }

    // Check 2: Auth Session
    try {
      await supabase.auth.getSession();
      validationLogger.addEvent('network', 'Auth service verified');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      validationLogger.addEvent('error', `Auth service check failed: ${msg}`);
    }

    // Check 3: Render Verification
    const root = document.getElementById('root');
    if (!root || root.childElementCount === 0) {
      validationLogger.addEvent('error', 'Critical: Root element is empty after expected render time');
    } else {
      validationLogger.addEvent('render', 'DOM rendering confirmed');
    }

    // Update status based on results
    const evidence = validationLogger.getEvidence();
    if (evidence.summary.errors > 0) {
      setStatus('error');
      const criticalErr = evidence.events.find(e => e.type === 'error' && e.message.includes('Critical'));
      if (criticalErr) {
        toast.error('Falha Crítica no Sistema', {
          description: criticalErr.message,
          duration: 6000,
        });
      }
    } else if (evidence.summary.networkFailures > 0) {
      setStatus('warning');
    } else {
      setStatus('healthy');
    }
  };

  useEffect(() => {
    // Run proactive checks after app has had time to stabilize
    const timeout = setTimeout(runProactiveChecks, 3000);

    // Continuous monitoring
    const checkInterval = setInterval(() => {
      const evidence = validationLogger.getEvidence();
      if (evidence.summary.errors > 0) {
        setStatus('error');
        const lastErr = evidence.events.find(e => e.type === 'error' || e.type === 'network');
        setLastError(lastErr?.message);
      } else if (evidence.summary.networkFailures > 0) {
        setStatus('warning');
      } else {
        setStatus('healthy');
      }
    }, 5000);

    // Signal successful mount to the global loader if we haven't already
    if (window.__zappHideRootLoader) {
      setTimeout(() => {
        window.__zappHideRootLoader?.();
      }, 1000);
    }

    return () => {
      clearTimeout(timeout);
      clearInterval(checkInterval);
    };
  }, []);

  const generateEvidence = () => {
    const evidence = validationLogger.getEvidence();
    const blob = new Blob([JSON.stringify(evidence, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zapp-validation-evidence-${new Date().getTime()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Relatório de evidências exportado!');
  };

  return (
    <ValidationContext.Provider value={{ status, lastError, generateEvidence, runProactiveChecks }}>
      {children}
    </ValidationContext.Provider>
  );
};

export const useValidation = () => {
  const context = useContext(ValidationContext);
  if (!context) throw new Error('useValidation must be used within a ValidationProvider');
  return context;
};
