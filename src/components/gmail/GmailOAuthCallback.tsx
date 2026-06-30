import { useEffect, useState } from 'react';
import { Mail, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

/**
 * EmailOAuthCallback — Página de callback para OAuth2 do Email
 *
 * Renderizada em /auth/email/callback
 * Recebe o ?code= do redirect do Google e troca por tokens.
 * Após sucesso, envia postMessage ao window.opener e fecha.
 */
export function EmailOAuthCallback() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Autenticando com o Google...');
  const [email, setEmail]     = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code   = params.get('code');
    const error  = params.get('error');
    const state  = params.get('state');

    if (error) {
      setStatus('error');
      setMessage(`Autorização negada: ${error}`);
      return;
    }

    if (!code) {
      setStatus('error');
      setMessage('Código de autorização não encontrado na URL.');
      return;
    }

    (async () => {
      try {
        // Obter usuário autenticado
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setStatus('error');
          setMessage('Você precisa estar logado para conectar uma conta Email.');
          return;
        }

        // Trocar code por tokens via Edge Function
        const { data, error: fnErr } = await supabase.functions.invoke('gmail-oauth', {
          body: { action: 'exchangeCode', code, userId: user.id, state },
        });

        if (fnErr || !data?.success) {
          setStatus('error');
          setMessage(data?.error ?? 'Falha ao autenticar. Tente novamente.');
          return;
        }

        setStatus('success');
        setEmail(data.email);
        setMessage(`Conta ${data.email} conectada com sucesso!`);

        // Enviar resultado ao popup pai
        if (window.opener) {
          window.opener.postMessage({
            type: 'email_oauth_callback',
            code,
            success: true,
            email: data.email,
            accountId: data.accountId,
          }, window.location.origin);

          // Fechar popup após 2 segundos
          setTimeout(() => window.close(), 2000);
        }

      } catch (err) {
        setStatus('error');
        setMessage(err instanceof Error ? err.message : 'Erro inesperado');
      }
    })();
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="max-w-sm w-full p-8 text-center space-y-6">
        {/* Ícone */}
        <div className="flex justify-center">
          {status === 'loading' && <Loader2 className="h-16 w-16 text-primary animate-spin" />}
          {status === 'success' && <CheckCircle className="h-16 w-16 text-primary" />}
          {status === 'error'   && <XCircle className="h-16 w-16 text-destructive" />}
        </div>

        {/* Título */}
        <div>
          <h1 className="text-xl font-bold flex items-center justify-center gap-2">
            <Mail className="h-5 w-5" />
            Email OAuth
          </h1>
          <p className="text-sm text-muted-foreground mt-2">{message}</p>
        </div>

        {/* Email conectado */}
        {email && status === 'success' && (
          <div className="bg-primary/10 dark:bg-primary/20 rounded-lg p-3 text-sm text-primary dark:text-primary">
            <strong>{email}</strong> conectado ao ZAPP WEB
          </div>
        )}

        {/* Instruções */}
        {status === 'success' && (
          <p className="text-xs text-muted-foreground">
            Esta janela fechará automaticamente em 2 segundos...
          </p>
        )}
        {status === 'error' && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Feche esta janela e tente novamente nas configurações.
            </p>
            <button
              onClick={() => window.close()}
              className="text-sm text-primary underline cursor-pointer"
            >
              Fechar janela
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default EmailOAuthCallback;
