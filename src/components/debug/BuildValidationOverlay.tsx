
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
  
  // Only show in development or if explicitly requested
  const isDev = import.meta.env.DEV || window.location.search.includes('debug=true');
  
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
        <div className="w-80 max-h-[500px] bg-background border rounded-lg shadow-xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-2">
          <div className="p-3 border-b bg-muted/50 flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <Shield className={cn("w-4 h-4", status === 'healthy' ? "text-success" : "text-destructive")} />
              Build Validation Checklist
            </div>
            <button type="button" onClick={() => setIsOpen(false)} className="text-muted-foreground hover:text-foreground" aria-label="Fechar validação de build">
              <X className="w-4 h-4" />
            </button>
          </div>
          
          <ScrollArea className="flex-1 p-3">
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Health Status</div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    {status === 'healthy' ? (
                      <Badge variant="secondary" className="bg-success/10 text-success border-success/20 gap-1">
                        <CheckCircle className="w-3 h-3" /> System Operational
                      </Badge>
                    ) : status === 'warning' ? (
                      <Badge variant="secondary" className="bg-warning/10 text-warning border-warning/20 gap-1">
                        <Shield className="w-3 h-3" /> Minor Issues
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="gap-1">
                        <AlertTriangle className="w-3 h-3" /> Critical Failures
                      </Badge>
                    )}
                  </div>
                  {lastError && (
                    <div className="text-[10px] text-destructive bg-destructive/10 p-2 rounded border border-destructive/20 font-mono break-words">
                      {lastError}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Live Activity Log</div>
                <div className="space-y-1">
                  {events.length === 0 ? (
                    <div className="text-xs text-muted-foreground italic">No events logged yet.</div>
                  ) : (
                    events.slice(0, 15).map((event) => (
                      <div key={event.timestamp} className="text-[10px] p-1.5 rounded bg-muted/30 flex flex-col gap-0.5 border border-transparent hover:border-border">
                        <div className="flex items-center justify-between">
                          <span className={cn(
                            "font-bold uppercase px-1 rounded",
                            event.type === 'error' ? "text-destructive bg-destructive/10" :
                            event.type === 'network' ? "text-warning bg-warning/10" :
                            event.type === 'render' ? "text-success bg-success/10" :
                            "text-primary bg-primary/10"
                          )}>
                            {event.type}
                          </span>
                          <span className="text-muted-foreground">
                            {new Date(event.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="truncate text-foreground font-medium" title={event.message}>
                          {event.message}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </ScrollArea>

          <div className="p-3 border-t bg-muted/20 flex flex-col gap-2">
            <Button size="sm" variant="outline" className="w-full text-xs gap-1.5 h-8" onClick={handleRunChecks} disabled={isVerifying}>
              <RefreshCw className={cn("w-3 h-3", isVerifying && "animate-spin")} />
              {isVerifying ? 'Running Tests...' : 'Validate System Now'}
            </Button>
            <Button size="sm" className="w-full text-xs gap-1.5 h-8" onClick={generateEvidence}>
              <FileText className="w-3 h-3" /> Download Evidence Report
            </Button>
          </div>
        </div>
      )}

      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-12 h-12 rounded-full flex items-center justify-center shadow-2xl transition-all hover:scale-110 active:scale-95 border-2",
          status === 'healthy' ? "bg-success text-success-foreground border-success" :
          status === 'warning' ? "bg-warning text-warning-foreground border-warning" :
          "bg-destructive text-destructive-foreground border-destructive animate-pulse"
        )}
        title="Post-Build Validation Status"
        aria-label={`Status de validação: ${status === 'healthy' ? 'operacional' : status === 'warning' ? 'alertas' : 'crítico'}`}
      >
        {status === 'healthy' ? <Shield className="w-6 h-6" /> : 
         status === 'warning' ? <AlertTriangle className="w-6 h-6" /> :
         <Shield className="w-6 h-6" />}
      </button>
    </div>
  );
};
