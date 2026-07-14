import { Search, UserPlus, UserMinus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Profile {
  id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  department_id: string | null;
}

interface ManageMutation {
  mutate: (args: { profileId: string; action: 'add' | 'remove' }) => void;
  isPending: boolean;
}

interface Props {
  departmentId: string;
  allProfiles: Profile[];
  search: string;
  onSearchChange: (v: string) => void;
  manageMemberMutation: ManageMutation;
}

export function DepartmentMembersView({
  departmentId,
  allProfiles,
  search,
  onSearchChange,
  manageMemberMutation,
}: Props) {
  const filtered = allProfiles.filter(
    (p) =>
      p.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.email?.toLowerCase().includes(search.toLowerCase())
  );
  const deptMembers = filtered.filter((p) => p.department_id === departmentId);
  const otherProfiles = filtered.filter((p) => p.department_id !== departmentId);

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 py-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar colaboradores..."
            className="h-9 pl-8"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      </div>
      <ScrollArea className="flex-1 px-6 pb-6">
        <div className="space-y-6 pt-4">
          {deptMembers.length > 0 && (
            <section>
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Membros ({deptMembers.length})
              </h4>
              <div className="space-y-2">
                {deptMembers.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-xl border bg-accent/30 p-3"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={p.avatar_url || undefined} alt={p.name || ''} />
                        <AvatarFallback>{p.name?.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{p.email}</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() =>
                        manageMemberMutation.mutate({ profileId: p.id, action: 'remove' })
                      }
                      disabled={manageMemberMutation.isPending}
                    >
                      <UserMinus className="mr-2 h-4 w-4" /> Remover
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          )}
          <section>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Outros Colaboradores
            </h4>
            <div className="space-y-2">
              {otherProfiles.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-xl border p-3 transition-colors hover:bg-accent/20"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={p.avatar_url || undefined} alt={p.name || ''} />
                      <AvatarFallback>{p.name?.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.email}{' '}
                        {p.department_id && (
                          <Badge variant="outline" className="ml-1 py-0 text-[10px]">
                            Outro Depto
                          </Badge>
                        )}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-primary hover:bg-primary/10 hover:text-primary"
                    onClick={() => manageMemberMutation.mutate({ profileId: p.id, action: 'add' })}
                    disabled={manageMemberMutation.isPending}
                  >
                    <UserPlus className="mr-2 h-4 w-4" /> Adicionar
                  </Button>
                </div>
              ))}
            </div>
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}
