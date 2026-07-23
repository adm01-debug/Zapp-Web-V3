import { motion } from "framer-motion";
import { ShieldAlert, Home, ArrowLeft, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getLogger } from "@/lib/logger";

const log = getLogger('AccessDenied');

/** Access Denied. */
export default function AccessDenied() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || "/";

  useEffect(() => {
    // Log unauthorized access attempt locally for telemetry
    log.error('Access denied', { route: from });
    
    // Log to Supabase audit trail if we have a user
    const logEvent = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.rpc('log_security_event', {
          p_event_type: 'unauthorized_access',
          p_resource: from,
          p_action: 'NAVIGATE',
          p_status: 'denied',
          p_details: {
            referrer: document.referrer,
            timestamp: new Date().toISOString()
          }
        });
      }
    };
    void logEvent();
  }, [from]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 overflow-hidden relative">
      {/* Background Effect */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-destructive/10 rounded-full blur-[120px]" />
      </div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md text-center relative z-10"
      >
        <div className="relative inline-block mb-8">
          <motion.div 
            animate={{ 
              scale: [1, 1.1, 1],
              rotate: [0, 5, -5, 0]
            }}
            transition={{ duration: 4, repeat: Infinity }}
            className="w-24 h-24 rounded-3xl bg-destructive/10 flex items-center justify-center mx-auto"
          >
            <ShieldAlert className="w-12 h-12 text-destructive" />
          </motion.div>
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 }}
            className="absolute -top-2 -right-2 bg-background border border-border p-2 rounded-xl shadow-lg"
          >
            <Lock className="w-4 h-4 text-muted-foreground" />
          </motion.div>
        </div>

        <motion.h1 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-3xl font-bold mb-4"
        >
          Acesso Negado
        </motion.h1>
        
        <motion.p 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-muted-foreground mb-8"
        >
          Você não tem as permissões necessárias para acessar esta página. 
          Se acredita que isso é um erro, entre em contato com o administrador.
        </motion.p>

        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="flex flex-col sm:flex-row gap-3 justify-center"
        >
          <Button 
            variant="outline" 
            className="gap-2"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </Button>
          <Button 
            className="gap-2"
            onClick={() => navigate("/")}
          >
            <Home className="w-4 h-4" />
            Início
          </Button>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="mt-12 text-xs text-muted-foreground/50"
        >
          ID da tentativa: {Math.random().toString(36).substring(2, 10).toUpperCase()}
        </motion.div>
      </motion.div>
    </div>
  );
}
