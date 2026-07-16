import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

type CallbackStatus = 'loading' | 'success' | 'error';

export default function SSOCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<CallbackStatus>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const addTimer = (t: ReturnType<typeof setTimeout>) => {
      timersRef.current.push(t);
    };

    const handleCallback = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (!mountedRef.current) return;

        if (error) {
          throw error;
        }

        if (data.session) {
          setStatus('success');
          toast.success('Login realizado com sucesso!');
          addTimer(
            setTimeout(() => {
              navigate('/');
            }, 1500)
          );
        } else {
          const hashParams = new URLSearchParams(window.location.hash.substring(1));
          const errorParam = hashParams.get('error_description') || hashParams.get('error');

          if (errorParam) {
            throw new Error('Autenticação SSO falhou. Tente novamente.');
          }

          const { data: authData } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' && session) {
              setStatus('success');
              toast.success('Login realizado com sucesso!');
              addTimer(setTimeout(() => navigate('/'), 1500));
            } else if (event === 'SIGNED_OUT') {
              setStatus('error');
              setErrorMessage('Sessão não encontrada');
            }
          });
          subscriptionRef.current = authData.subscription;

          addTimer(
            setTimeout(() => {
              setStatus((prev) => {
                if (prev === 'loading') {
                  setErrorMessage('Tempo esgotado. Tente novamente.');
                  return 'error';
                }
                return prev;
              });
            }, 10000)
          );
        }
      } catch (err: unknown) {
        if (!mountedRef.current) return;
        setStatus('error');
        setErrorMessage(err instanceof Error ? err.message : 'Erro durante autenticação');
        toast.error('Erro no login SSO');
      }
    };

    void handleCallback();

    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      subscriptionRef.current?.unsubscribe();
    };
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted/20 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md"
      >
        {status === 'loading' && (
          <Card>
            <CardHeader className="text-center">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10"
              >
                <Loader2 className="h-8 w-8 text-primary" />
              </motion.div>
              <CardTitle>Autenticando...</CardTitle>
              <CardDescription>Aguarde enquanto completamos seu login</CardDescription>
            </CardHeader>
          </Card>
        )}

        {status === 'success' && (
          <Card>
            <CardHeader className="text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring' }}
                className="dark:bg-success/20/30 mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success/10"
              >
                <CheckCircle className="h-8 w-8 text-success dark:text-success" />
              </motion.div>
              <CardTitle>Login Realizado!</CardTitle>
              <CardDescription>Redirecionando para o dashboard...</CardDescription>
            </CardHeader>
          </Card>
        )}

        {status === 'error' && (
          <Card role="alert">
            <CardHeader className="text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10"
              >
                <XCircle className="h-8 w-8 text-destructive" />
              </motion.div>
              <CardTitle>Erro no Login</CardTitle>
              <CardDescription>
                {errorMessage || 'Ocorreu um erro durante a autenticação'}
              </CardDescription>
              <div className="pt-4">
                <Button onClick={() => navigate('/auth')} className="w-full">
                  Tentar Novamente
                </Button>
              </div>
            </CardHeader>
          </Card>
        )}
      </motion.div>
    </div>
  );
}
