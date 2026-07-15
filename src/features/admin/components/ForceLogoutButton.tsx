import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { LogOut, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ForceLogoutButtonProps {
  userId: string;
  userName: string;
}

export function ForceLogoutButton({ userId, userName }: ForceLogoutButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleForceLogout = async () => {
    if (!confirm(`Tem certeza que deseja forçar logout de ${userName}?`)) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ session_invalidated_at: new Date().toISOString() })
        .eq('user_id', userId);

      if (error) throw error;
      toast.success(`Sessão de ${userName} invalidada`);
    } catch {
      toast.error('Erro ao invalidar sessão');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleForceLogout}
      disabled={loading}
      className="text-destructive hover:text-destructive hover:bg-destructive/10"
      title="Forçar logout"
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
    </Button>
  );
}
