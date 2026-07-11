import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/features/auth';
import { useMFA } from '@/features/auth';
import { MFAVerify } from '@/features/auth';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

export default function TwoFactorAuth() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { getAssuranceLevel, fetchFactors } = useMFA();
  const [needsVerification, setNeedsVerification] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const checkMFAStatus = async () => {
      await fetchFactors();
      if (cancelled) return;
      const assurance = await getAssuranceLevel();
      if (cancelled) return;

      if (assurance) {
        // If user has MFA setup but hasn't verified this session
        if (assurance.currentLevel === 'aal1' && assurance.nextLevel === 'aal2') {
          setNeedsVerification(true);
        } else if (assurance.currentLevel === 'aal2') {
          // Already verified, redirect to home
          navigate('/');
        }
      }
    };

    if (user) {
      void checkMFAStatus();
    }
    return () => {
      cancelled = true;
    };
  }, [user, navigate, getAssuranceLevel, fetchFactors]);

  if (!needsVerification) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted/20 p-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
          <Shield className="mx-auto mb-4 h-12 w-12 animate-pulse text-muted-foreground" />
          <p className="text-muted-foreground">Verificando status de autenticação...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted/20 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <MFAVerify
          title="Verificação Necessária"
          description="Para continuar, verifique sua identidade com 2FA"
          onSuccess={() => navigate('/')}
          onCancel={() => {
            // Sign out and go back to login
            supabase.auth.signOut().then(() => navigate('/auth'));
          }}
        />

        <div className="mt-4 text-center">
          <Button variant="ghost" size="sm" onClick={() => navigate('/auth')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar para login
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
