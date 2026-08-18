import { useState } from 'react';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getLogger } from '@/lib/logger';

const log = getLogger('ForgotPassword');
const emailSchema = z.string().email('Email inválido');

/**
 * Solicitação pública de reset (Etapa 55).
 *
 * Rota: EF pública `request-password-reset` (rate-limit + anti-enumeração +
 * lookup server-side). NUNCA inserir direto em password_reset_requests:
 * a RLS da tabela é authenticated-only (prr_insert_own exige
 * user_id = auth.uid()) e profiles não é legível por anon — o insert
 * client-side morria em produção.
 */
export function useForgotPassword() {
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      emailSchema.parse(email);
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.issues[0].message);
        return;
      }
    }

    setLoading(true);
    try {
      const { error: invokeError } = await supabase.functions.invoke('request-password-reset', {
        body: {
          email,
          reason: reason || undefined,
          userAgent: navigator.userAgent,
        },
      });

      if (invokeError) throw invokeError;

      setSent(true);
      toast.success('Solicitação enviada! Aguarde a aprovação de um administrador.');
    } catch (err: unknown) {
      log.error('Error submitting reset request:', err);
      setError('Erro ao enviar solicitação. Tente novamente.');
      toast.error('Erro ao enviar solicitação');
    } finally {
      setLoading(false);
    }
  };

  return { email, setEmail, reason, setReason, loading, sent, error, handleSubmit };
}
