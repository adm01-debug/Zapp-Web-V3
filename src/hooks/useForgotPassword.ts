import { useState } from 'react';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getLogger } from '@/lib/logger';

const log = getLogger('ForgotPassword');
const emailSchema = z.string().email('Email inválido');

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
      const { data: existingUser } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('email', email)
        .maybeSingle();

      if (!existingUser) {
        setSent(true);
        toast.success('Se o email existir, sua solicitação será analisada.');
        return;
      }

      const { error: insertError } = await supabase.from('password_reset_requests').insert({
        user_id: existingUser.user_id,
        email,
        reason: reason || null,
        ip_address: null,
        user_agent: navigator.userAgent,
      });

      if (insertError) throw insertError;

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
