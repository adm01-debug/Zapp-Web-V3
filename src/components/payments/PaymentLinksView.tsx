import { useState, useEffect, useCallback, type ComponentType } from 'react';
import { useMountedRef } from '@/hooks/useMountedRef';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Link2, Copy, Trash2, CheckCircle, Clock, XCircle, CreditCard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { normalizePaymentLink, type NormalizedPaymentLink as PaymentLink } from '@/lib/normalizers';

export function PaymentLinksView() {
  const mountedRef = useMountedRef();
  const [links, setLinks] = useState<PaymentLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);

  // Form
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formMethod, setFormMethod] = useState('pix');

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('payment_links')
      .select('*')
      .order('created_at', { ascending: false });
    if (mountedRef.current) {
      if (data)
        setLinks(
          data.map((row) => normalizePaymentLink(row as unknown as Record<string, unknown>))
        );
      setLoading(false);
    }
  }, [mountedRef]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const channel = supabase
      .channel('payment-links-changes')
      .on('postgres_changes', { event: '*', schema: 'financeiro', table: 'payment_links' }, () =>
        fetchData()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel).catch(() => {});
    };
  }, [fetchData]);

  const createLink = async () => {
    if (!formTitle.trim() || !formAmount) return;
    const amount = parseFloat(formAmount);
    if (isNaN(amount) || amount <= 0) return;

    // Generate a simple payment URL (in production would integrate with Stripe/payment provider)
    const paymentUrl = `${window.location.origin}/pay/${crypto.randomUUID().slice(0, 8)}`;

    const { error } = await supabase.from('payment_links').insert({
      title: formTitle,
      description: formDescription || null,
      amount,
      payment_method: formMethod,
      payment_url: paymentUrl,
    });

    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Link de pagamento criado!' });
    setShowDialog(false);
    setFormTitle('');
    setFormDescription('');
    setFormAmount('');
    setFormMethod('pix');
    fetchData();
  };

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    toast({ title: 'Link copiado!' });
  };

  const deleteLink = async (id: string) => {
    await supabase.from('payment_links').delete().eq('id', id);
    toast({ title: 'Link removido' });
    fetchData();
  };

  const statusConfig: Record<
    string,
    { label: string; icon: ComponentType<{ className?: string }>; className: string }
  > = {
    active: { label: 'Ativo', icon: Clock, className: 'text-info bg-info/20 border-info/30' },
    paid: {
      label: 'Pago',
      icon: CheckCircle,
      className: 'text-success bg-success/20 border-success/30',
    },
    expired: {
      label: 'Expirado',
      icon: XCircle,
      className: 'text-destructive bg-destructive/20 border-destructive/30',
    },
    cancelled: {
      label: 'Cancelado',
      icon: XCircle,
      className: 'text-muted-foreground bg-muted/20 border-border',
    },
  };

  const totalActive = links.filter((l) => l.status === 'active').reduce((s, l) => s + l.amount, 0);
  const totalPaid = links.filter((l) => l.status === 'paid').reduce((s, l) => s + l.amount, 0);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Links de Pagamento"
        subtitle="Crie e gerencie links de pagamento para enviar no chat"
        actions={
          <Button onClick={() => setShowDialog(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Novo Link
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 px-6 pb-4 md:grid-cols-3">
        <Card className="border-border/30 bg-card/50">
          <CardContent className="p-4">
            <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
              <Link2 className="h-3.5 w-3.5" /> Links Ativos
            </div>
            <p className="text-lg font-bold">
              R$ {totalActive.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/30 bg-card/50">
          <CardContent className="p-4">
            <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle className="h-3.5 w-3.5 text-success" /> Recebidos
            </div>
            <p className="text-lg font-bold text-success">
              R$ {totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/30 bg-card/50">
          <CardContent className="p-4">
            <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
              <CreditCard className="h-3.5 w-3.5" /> Total Links
            </div>
            <p className="text-lg font-bold">{links.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Links List */}
      <div className="flex-1 space-y-3 overflow-y-auto px-6 pb-6">
        <AnimatePresence>
          {links.map((link) => {
            const config = statusConfig[link.status] || statusConfig.active;
            const StatusIcon = config.icon;
            return (
              <motion.div
                key={link.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <Card className="group border-border/30 bg-card/50 transition-all hover:border-secondary/30">
                  <CardContent className="flex items-center gap-4 p-4">
                    <div
                      className={cn(
                        'flex h-10 w-10 items-center justify-center rounded-lg',
                        config.className
                      )}
                    >
                      <StatusIcon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 flex items-center gap-2">
                        <h3 className="text-sm font-semibold">{link.title}</h3>
                        <Badge
                          variant="outline"
                          className={cn('h-4 text-[10px]', config.className)}
                        >
                          {config.label}
                        </Badge>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {link.payment_method === 'pix' ? 'PIX' : 'Cartão'} •{' '}
                        {new Date(link.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <div className="mr-2 text-right">
                      <p className="text-sm font-bold text-foreground">
                        R$ {link.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      {link.payment_url && (
                        <Button
                          aria-label="Copiar link de pagamento"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => copyLink(link.payment_url!)}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        aria-label="Excluir link de pagamento"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => deleteLink(link.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {links.length === 0 && !loading && (
          <div className="py-16 text-center text-muted-foreground">
            <CreditCard className="mx-auto mb-3 h-12 w-12 opacity-20" />
            <p className="font-medium">Nenhum link de pagamento</p>
            <p className="text-sm">Crie links para enviar aos contatos no chat</p>
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Link de Pagamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Título *</Label>
              <Input
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Ex: Plano Mensal"
              />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Valor (R$) *</Label>
                <Input
                  type="number"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  placeholder="0,00"
                />
              </div>
              <div>
                <Label>Método</Label>
                <Select value={formMethod} onValueChange={setFormMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pix">PIX</SelectItem>
                    <SelectItem value="card">Cartão</SelectItem>
                    <SelectItem value="boleto">Boleto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={createLink}>Criar Link</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}