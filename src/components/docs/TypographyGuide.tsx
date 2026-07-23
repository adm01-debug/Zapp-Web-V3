import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Info, Code, FileText } from "lucide-react";

/** Typography Guide component for the docs section. */
export function TypographyGuide() {
  return (
    <div className="space-y-8 animate-fade-in">
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold flex items-center gap-2">
          <FileText className="w-6 h-6 text-primary" />
          Guia de Herança Tipográfica
        </h2>
        <p className="text-muted-foreground">
          Nossa tipografia é baseada no sistema de tokens para garantir consistência em todos os temas.
        </p>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card variant="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="w-5 h-5 text-info" />
              Tipografia Global (Inter)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm">
              Toda a interface herda <strong>Inter</strong> automaticamente do <code>body</code>. 
              Evite usar classes literais como <code></code> a menos que precise resetar um estilo local.
            </p>
            <ul className="list-disc list-inside text-xs space-y-2 text-muted-foreground">
              <li>Headings (h1-h6): Usam <code>--font-display</code></li>
              <li>Corpo de texto: Usa <code>--font-sans</code></li>
              <li>Componentes UI: Herdam o estilo global por padrão</li>
            </ul>
          </CardContent>
        </Card>

        <Card variant="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code className="w-5 h-5 text-warning" />
              Quando usar 
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm">
              A tipografia monoespaçada (<strong>JetBrains Mono</strong>) deve ser reservada estritamente para dados técnicos.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-muted/30 p-2 rounded text-[10px]">
                <p className="font-bold uppercase mb-1">Permitido</p>
                <ul className="space-y-1 ">
                  <li>IDs: #INV-001</li>
                  <li>Timestamps: 12:45:00</li>
                  <li>CNPJ: 00.000/0001-00</li>
                  <li>Métricas: 1.250ms</li>
                </ul>
              </div>
              <div className="bg-muted/10 p-2 rounded text-[10px]">
                <p className="font-bold uppercase mb-1">Evitar</p>
                <ul className="space-y-1">
                  <li>Nomes de usuários</li>
                  <li>Descrições de produtos</li>
                  <li>Labels de botões</li>
                  <li>Mensagens de chat</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
