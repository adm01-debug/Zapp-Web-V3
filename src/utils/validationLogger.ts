
type ValidationEvent = {
  timestamp: string;
  type: 'log' | 'error' | 'network' | 'render';
  message: string;
  data?: unknown;
};

declare global {
  interface Window {
    __zappValidationLogger: ValidationLogger;
  }
}

class ValidationLogger {
  private events: ValidationEvent[] = [];
  private maxEvents = 200;
  private isProcessing = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.setupInterceptors();
      this.loadPersistedEvents();
    }
  }

  private loadPersistedEvents() {
    try {
      const stored = localStorage.getItem('zapp_validation_evidence');
      if (stored) {
        this.events = JSON.parse(stored).slice(0, 50);
      }
    } catch (e) {
      // Corrupted/unavailable storage — start with an empty buffer rather than crash.
      console.warn('[validationLogger] failed to load persisted events', e);
    }
  }

  private setupInterceptors() {
    if (import.meta.env.PROD) return;
    // eslint-disable-next-line no-console
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    // eslint-disable-next-line no-console
    console.log = (...args: any[]) => {
      const msg = args.map(a => typeof a === 'object' ? '[Object]' : String(a)).join(' ');
      if (!msg.includes('[validationLogger]')) {
        this.addEvent('log', msg);
      }
      originalLog.apply(console, args);
    };

    console.error = (...args: any[]) => {
      const msg = args.map(a => typeof a === 'object' ? '[Error Object]' : String(a)).join(' ');
      if (!msg.includes('[validationLogger]')) {
        this.addEvent('error', msg);
      }
      originalError.apply(console, args);
    };

    console.warn = (...args: any[]) => {
      const msg = args.map(a => typeof a === 'object' ? '[Object]' : String(a)).join(' ');
      if (!msg.includes('[validationLogger]')) {
        this.addEvent('log', `[WARN] ${msg}`);
      }
      originalWarn.apply(console, args);
    };

    // Intercept fetch for endpoint validation
    const originalFetch = window.fetch;
    window.fetch = async (...args: [URL | RequestInfo, RequestInit?]) => {
      const url = typeof args[0] === 'string' ? args[0] : 
                  (args[0] instanceof Request) ? args[0].url : String(args[0]);
      
      try {
        const response = await originalFetch(...args);
        if (!response.ok && !url.includes('supabase.co')) { // Supabase handled separately
          this.addEvent('network', `Failed to fetch: ${url} (${response.status})`);
        }
        return response;
      } catch (error) {
        this.addEvent('network', `Network error: ${url} - ${String(error)}`);
        throw error;
      }
    };
  }

  public addEvent(type: ValidationEvent['type'], message: string, data?: unknown) {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const event: ValidationEvent = {
        timestamp: new Date().toISOString(),
        type,
        message,
        data
      };
      this.events.unshift(event);
      if (this.events.length > this.maxEvents) {
        this.events.pop();
      }
      
      // Save to localStorage
      try {
        localStorage.setItem('zapp_validation_evidence', JSON.stringify(this.events.slice(0, 100)));
      } catch (e) {
        // Quota exceeded / storage disabled — non-fatal for logging.
        // Using originalWarn to avoid re-entry if we weren't using isProcessing
        console.warn('[validationLogger] failed to persist events', e);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  public getEvents() {
    return this.events;
  }

  public getEvidence() {
    return {
      summary: {
        totalEvents: this.events.length,
        errors: this.events.filter(e => e.type === 'error').length,
        networkFailures: this.events.filter(e => e.type === 'network').length,
        renderChecks: this.events.filter(e => e.type === 'render').length,
      },
      events: this.events,
      browserInfo: {
        userAgent: navigator.userAgent,
        url: window.location.href,
        timestamp: new Date().toISOString(),
        screen: `${window.innerWidth}x${window.innerHeight}`,
      }
    };
  }
}

export const validationLogger = new ValidationLogger();

if (typeof window !== 'undefined') {
  window.__zappValidationLogger = validationLogger;
}

