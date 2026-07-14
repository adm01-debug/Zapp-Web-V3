import { Link2, Copy, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/hooks/use-toast';

interface Invitation {
  id: string;
  code: string;
  expires_at: string;
  uses: number;
}

interface CreateMutation {
  mutate: () => void;
  isPending: boolean;
}

interface DeleteMutation {
  mutate: (id: string) => void;
}

interface Props {
  invitations: Invitation[];
  createInviteMutation: CreateMutation;
  deleteInviteMutation: DeleteMutation;
}

export function DepartmentInvitesView({
  invitations,
  createInviteMutation,
  deleteInviteMutation,
}: Props) {
  return (
    <div className="flex h-full flex-col px-6 py-4">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Links de convite permitem que colaboradores entrem no departamento.
        </p>
        <Button
          size="sm"
          onClick={() => createInviteMutation.mutate()}
          disabled={createInviteMutation.isPending}
        >
          <Link2 className="mr-2 h-4 w-4" /> Criar Link
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-3">
          {invitations.map((inv) => (
            <div key={inv.id} className="space-y-3 rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between">
                <code className="rounded bg-muted px-2 py-1 text-sm font-bold">{inv.code}</code>
                <div className="flex gap-2">
                  <Button
                    aria-label="Copiar código de convite"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => {
                      navigator.clipboard.writeText(inv.code);
                      toast({ title: 'Código copiado' });
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    aria-label="Excluir convite"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive"
                    onClick={() => deleteInviteMutation.mutate(inv.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
          {invitations.length === 0 && (
            <div className="py-10 text-center text-muted-foreground">Nenhum convite ativo.</div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
