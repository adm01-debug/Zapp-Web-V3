import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export function FontUsageGuide() {
  return (
    <div className="p-8 space-y-10 max-w-5xl mx-auto">
      <header className="space-y-4">
        <h1 className="text-4xl font-extrabold tracking-tight">Guia de Tipografia</h1>
        <p className="text-xl text-muted-foreground">
          Padronização do uso de fontes globais e monoespaçadas no sistema.
        </p>
      </header>

      <section className="space-y-6">
        <h2 className="text-2xl font-bold border-b pb-2">Regras de Ouro</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="bg-primary/5 border-primary/20">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary" /> Inter (Sans)
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <p><strong>Uso:</strong> Interface geral, títulos, parágrafos, botões e labels.</p>
              <p><strong>Herança:</strong> É a fonte padrão do sistema. Não use <code>font-sans</code> explicitamente, ela já é herdada.</p>
            </CardContent>
          </Card>
          
          <Card className="bg-accent/5 border-accent/20">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-accent" /> JetBrains Mono
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <p><strong>Uso:</strong> Apenas dados técnicos e numéricos que requerem alinhamento vertical.</p>
              <p><strong>Aplicação:</strong> IDs, Timestamps, Métricas, Logs, Código, Telefones e Documentos (CNPJ/CPF).</p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="text-2xl font-bold border-b pb-2">Exemplos Práticos (Antes vs Depois)</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-1/2">Incorreto (Redundante ou Mal Uso)</TableHead>
              <TableHead className="w-1/2">Correto (Semântico e Técnico)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>
                <p className="font-sans text-destructive">Redundante:</p>
                <code className="text-xs">&lt;p className="font-sans"&gt;Texto&lt;/p&gt;</code>
              </TableCell>
              <TableCell>
                <p className="text-success font-medium">Limpo (Herança Global):</p>
                <code className="text-xs">&lt;p&gt;Texto&lt;/p&gt;</code>
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell>
                <p className="font-mono text-destructive">Texto comum em mono:</p>
                <code className="text-xs">&lt;span className="font-mono"&gt;Configurações&lt;/span&gt;</code>
              </TableCell>
              <TableCell>
                <p className="text-success font-medium">Inter para UI:</p>
                <code className="text-xs">&lt;span&gt;Configurações&lt;/span&gt;</code>
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell>
                <p className="text-destructive">ID sem distinção visual:</p>
                <Badge variant="outline">ID: #45829</Badge>
              </TableCell>
              <TableCell>
                <p className="text-success font-medium">Mono para clareza técnica:</p>
                <Badge variant="outline" className="font-mono text-[10px]">ID: #45829</Badge>
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell>
                <p className="text-destructive">Métrica difícil de ler:</p>
                <span className="text-2xl font-bold">12.5%</span>
              </TableCell>
              <TableCell>
                <p className="text-success font-medium">Mono para alinhamento de dados:</p>
                <span className="text-2xl font-bold font-mono">12.5%</span>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold border-b pb-2">Auditoria Automática</h2>
        <p className="text-sm text-muted-foreground">
          O build do projeto falhará no CI se novas ocorrências de <code>font-sans</code> ou <code>font-mono</code> (fora de contexto técnico) forem detectadas.
          Use <code>@ds-ignore</code> se precisar ignorar uma regra em caso excepcional devidamente justificado.
        </p>
      </section>
    </div>
  );
}
