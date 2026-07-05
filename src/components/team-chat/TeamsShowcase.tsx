import { useState } from 'react';
import { useAuth } from '@/features/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Building2, 
  Lock, 
  MessageSquare, 
  ShieldCheck, 
  Users, 
  ArrowRight,
  Info,
  Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Dados mock para demonstração
const MOCK_DEPARTMENTS = [
  {
    id: 'd1111111-1111-1111-1111-111111111111',
    name: 'Marketing',
    description: 'Estratégias de Growth, Design e Social Media.',
    memberCount: 8,
    status: 'active',
    lastActivity: '2 min atrás'
  },
  {
    id: 'd2222222-2222-2222-2222-222222222222',
    name: 'TI',
    description: 'Infraestrutura, Segurança e Desenvolvimento.',
    memberCount: 12,
    status: 'active',
    lastActivity: 'Agora'
  },
  {
    id: 'd3333333-3333-3333-3333-333333333333',
    name: 'RH',
    description: 'Recrutamento, Seleção e Cultura.',
    memberCount: 5,
    status: 'active',
    lastActivity: '1h atrás'
  },
  {
    id: 'd4444444-4444-4444-4444-444444444444',
    name: 'Suporte',
    description: 'Atendimento ao Cliente e Success.',
    memberCount: 15,
    status: 'active',
    lastActivity: '15 min atrás'
  }
];

export function TeamsShowcase() {
  const { profile } = useAuth();
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const isAdmin = profile?.role === 'admin';
  const userDeptId = profile?.department_id;

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Building2 className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Hub de Departamentos</h1>
        </div>
        <p className="text-muted-foreground max-w-2xl">
          Visualize todos os setores da empresa. O acesso às mensagens e membros é restrito automaticamente com base no seu departamento e nível de permissão.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {MOCK_DEPARTMENTS.map((dept) => {
          const hasAccess = isAdmin || userDeptId === dept.id;
          const isYourDept = userDeptId === dept.id;

          return (
            <Card 
              key={dept.id}
              className={cn(
                "relative overflow-hidden transition-all duration-300 border-border/50",
                hoveredId === dept.id ? "shadow-lg border-primary/20 -translate-y-1" : "shadow-sm"
              )}
              onMouseEnter={() => setHoveredId(dept.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {isYourDept && (
                <div className="absolute top-0 right-0">
                  <div className="bg-primary text-primary-foreground text-[10px] font-bold px-3 py-1 rounded-bl-lg shadow-sm">
                    SEU DEPARTAMENTO
                  </div>
                </div>
              )}

              <CardHeader className="pb-4">
                <div className="flex items-start justify-between">
                  <div className={cn(
                    "p-2.5 rounded-xl mb-2",
                    hasAccess ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                  )}>
                    {hasAccess ? <ShieldCheck className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
                  </div>
                  {!hasAccess && (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      Restrito
                    </Badge>
                  )}
                </div>
                <CardTitle className="text-xl flex items-center gap-2">
                  {dept.name}
                </CardTitle>
                <CardDescription className="line-clamp-2 min-h-[40px]">
                  {dept.description}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-6">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Users className="w-4 h-4" />
                    <span>{dept.memberCount} membros</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    <span>{dept.lastActivity}</span>
                  </div>
                </div>

                <div className="pt-2">
                  {hasAccess ? (
                    <Button className="w-full group" variant={isYourDept ? "default" : "secondary"}>
                      Acessar Canal
                      <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
                    </Button>
                  ) : (
                    <div className="space-y-3">
                      <Button className="w-full" variant="outline" disabled>
                        Acesso Bloqueado
                      </Button>
                      <div className="flex items-start gap-2 p-3 bg-muted/30 rounded-lg">
                        <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                        <p className="text-[10px] text-muted-foreground leading-normal">
                          Apenas membros do {dept.name} ou administradores podem visualizar o histórico.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <section className="bg-muted/20 border rounded-2xl p-8 mt-12">
        <div className="max-w-2xl">
          <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-primary" />
            Canais de Comunicação
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            O Teams utiliza canais isolados para cada departamento, garantindo que assuntos estratégicos e dados sensíveis permaneçam protegidos. 
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-card rounded-xl border border-border/50 shadow-sm">
              <p className="text-xs font-bold text-primary uppercase tracking-widest mb-1">Público (Geral)</p>
              <p className="text-sm">Comunicação interdepartamental aberta a todos.</p>
            </div>
            <div className="p-4 bg-card rounded-xl border border-border/50 shadow-sm">
              <p className="text-xs font-bold text-destructive uppercase tracking-widest mb-1">Privado (Depto)</p>
              <p className="text-sm">Canais restritos com criptografia de ponta a ponta.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
