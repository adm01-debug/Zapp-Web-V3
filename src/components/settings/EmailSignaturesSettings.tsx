import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2, Star, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { safeClient } from '@/integrations/supabase/safeClient';
import { useEmailSignature, type EmailSignature } from '@/hooks/email/useEmailSignature';
import { sanitizeHtmlStrict } from '@/lib/sanitize';
import { toast } from 'sonner';

/**
 * EmailSignaturesSettings — Painel mínimo de gestão de assinaturas de e-mail
 * (EMAIL-08). CRUD (criar/editar via save, definir default, excluir) por conta
 * Gmail conectada, no padrão dos demais painéis de SettingsView.
 */
export function EmailSignaturesSettings() {
  const { data: accounts = [] } = useQuery({
    queryKey: ['email-accounts-settings'],
    queryFn: async () => {
      const { data } = await safeClient.from<{ id: string; email: string }>(
        'email_accounts',
        (q) => q.select('id, email').eq('is_active', true).order('created_at')
      );
      return data ?? [];
    },
  });

  const [accountId, setAccountId] = useState<string | null>(null);
  const activeAccountId = accountId ?? accounts[0]?.id ?? null;
  const { signatures, defaultSignature, isLoading, save, remove, setDefault } =
    useEmailSignature(activeAccountId);

  const [name, setName] = useState('');
  const [html, setHtml] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!activeAccountId) return;
    if (!name.trim() || !html.trim()) {
      toast.error('Informe nome e conteúdo da assinatura');
      return;
    }
    setSaving(true);
    await save({
      name: name.trim(),
      html_content: html,
      is_default: signatures.length === 0,
    });
    setSaving(false);
    setName('');
    setHtml('');
    toast.success('Assinatura salva');
  };

  return (
    <div className="space-y-5 rounded-xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold tracking-tight">Assinaturas de e-mail</h3>
          <p className="text-xs text-muted-foreground">
            Usadas automaticamente ao responder e-mails (selecionáveis na barra de resposta).
          </p>
        </div>
        {accounts.length > 0 && (
          <Select
            value={activeAccountId ?? 'none'}
            onValueChange={(v) => setAccountId(v === 'none' ? null : v)}
          >
            <SelectTrigger className="h-8 w-56 text-xs">
              <SelectValue placeholder="Selecione a conta" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma conta de e-mail conectada. Conecte uma conta Gmail para gerenciar assinaturas.
        </p>
      ) : (
        <>
          {/* Lista */}
          <div className="space-y-2">
            {isLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…
              </div>
            ) : signatures.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma assinatura para esta conta ainda.
              </p>
            ) : (
              signatures.map((sig: EmailSignature) => (
                <div
                  key={sig.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 p-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{sig.name}</span>
                      {sig.id === defaultSignature?.id && (
                        <Badge variant="secondary" className="text-[9px]">
                          Padrão
                        </Badge>
                      )}
                    </div>
                    <div
                      className="mt-1 max-h-16 overflow-hidden text-xs text-muted-foreground opacity-70"
                      dangerouslySetInnerHTML={{
                        __html: sanitizeHtmlStrict(sig.html_content).html,
                      }}
                    />
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {sig.id !== defaultSignature?.id && (
                      <Button
                        aria-label="Definir como padrão"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setDefault(sig.id)}
                      >
                        <Star className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      aria-label="Excluir assinatura"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => remove(sig.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Novo */}
          <div className="space-y-2 border-t border-border/60 pt-4">
            <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Nova assinatura
            </h4>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome (ex.: Comercial)"
              className="h-8 text-xs"
            />
            <Textarea
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              placeholder="HTML da assinatura (ex.: <p>Fulano</p><p>Zapp Web</p>)"
              className="min-h-[90px] resize-y text-xs"
            />
            <Button
              size="sm"
              className="gap-1.5"
              onClick={handleAdd}
              disabled={saving || !activeAccountId}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Adicionar assinatura
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
