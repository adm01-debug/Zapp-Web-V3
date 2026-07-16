import { useState } from 'react';
import { useValidation } from '@/components/providers/ValidationProvider';
import { validationLogger } from '@/utils/validationLogger';
import { Shield, AlertTriangle, CheckCircle, FileText, X, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

export const BuildValidationOverlay: React.FC = () => {
  const { status, lastError, generateEvidence, runProactiveChecks } = useValidation();
  const [isOpen, setIsOpen] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const isDev = import.meta.env.DEV;

  if (!isDev) return null;

  const events = validationLogger.getEvents();

  const handleRunChecks = async () => {
    setIsVerifying(true);
    await runProactiveChecks();
    setIsVerifying(false);
  };

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col items-end gap-2">
      {isOpen && (
        <div className="flex max-h-[500px] w-80 flex-col overflow-hidden rounded-lg border bg-background shadow-xl animate-in slide-in-from-bottom-2">
          <div className="flex items-center justify-between border-b bg-muted/50 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Shield
                className={cn(
                  'h-4 w-4',
                  status === 'healthy' ? 'text-success' : 'text-destructive'
                )}
              />
              Build Validation Checklist
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Fechar validação de build"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <ScrollArea className="flex-1 p-3">
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Health Status
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    {status === 'healthy' ? (
                      <Badge
                        variant="secondary"
                        className="gap-1 border-success/20 bg-success/10 text-success"
                      >
                        <CheckCircle className="h-3 w-3" /> System Operational
                      </Badge>
                    ) : status === 'warning' ? (
                      <Badge
                        variant="secondary"
                        className="gap-1 border-warning/20 bg-warning/10 text-warning"
                      >
                        <Shield className="h-3 w-3" /> Minor Issues
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="gap-1">
                        <AlertTriangle className="h-3 w-3" /> Critical Failures
                      </Badge>
                    )}
                  </div>
                  {lastError && (
                    <div className="break-words rounded border border-destructive/20 bg-destructive/10 p-2 font-mono text-[10px] text-destructive">
                      {lastError}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Live Activity Log
                </div>
                <div className="space-y-1">
                  {events.length === 0 ? (
                    <div className="text-xs italic text-muted-foreground">
                      No events logged yet.
                    </div>
                  ) : (
                    events.slice(0, 15).map((event) => (
                      <div
                        key={event.timestamp}
                        className="flex flex-col gap-0.5 rounded border border-transparent bg-muted/30 p-1.5 text-[10px] hover:border-border"
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={cn(
                              'rounded px-1 font-bold uppercase',
                              event.type === 'error'
                                ? 'bg-destructive/10 text-destructive'
                                : event.type === 'network'
                                  ? 'bg-warning/10 text-warning'
                                  : event.type === 'render'
                                    ? 'bg-success/10 text-success'
                                    : 'bg-primary/10 text-primary'
                            )}
                          >
                            {event.type}
                          </span>
                          <span className="text-muted-foreground">
                            {new Date(event.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="truncate font-medium text-foreground" title={event.message}>
                          {event.message}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </ScrollArea>

          <div className="flex flex-col gap-2 border-t bg-muted/20 p-3">
            <Button
              size="sm"
              variant="outline"
              className="h-8 w-full gap-1.5 text-xs"
              onClick={handleRunChecks}
              disabled={isVerifying}
            >
              <RefreshCw className={cn('h-3 w-3', isVerifying && 'animate-spin')} />
              {isVerifying ? 'Running Tests...' : 'Validate System Now'}
            </Button>
            <Button size="sm" className="h-8 w-full gap-1.5 text-xs" onClick={generateEvidence}>
              <FileText className="h-3 w-3" /> Download Evidence Report
            </Button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex h-12 w-12 items-center justify-center rounded-full border-2 shadow-2xl transition-all hover:scale-110 active:scale-95',
          status === 'healthy'
            ? 'border-success bg-success text-success-foreground'
            : status === 'warning'
              ? 'border-warning bg-warning text-warning-foreground'
              : 'animate-pulse border-destructive bg-destructive text-destructive-foreground'
        )}
        title="Post-Build Validation Status"
        aria-label={`Status de validação: ${status === 'healthy' ? 'operacional' : status === 'warning' ? 'alertas' : 'crítico'}`}
      >
        {status === 'healthy' ? (
          <Shield className="h-6 w-6" />
        ) : status === 'warning' ? (
          <AlertTriangle className="h-6 w-6" />
        ) : (
          <Shield className="h-6 w-6" />
        )}
      </button>
    </div>
  );
};
