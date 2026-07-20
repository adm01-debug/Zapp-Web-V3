import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MessageCircle, CheckCircle2, AlertTriangle, Clock, Database, Image as ImageIcon, Mic, Phone } from 'lucide-react';

const dataItems = [
  { icon: Phone, type: 'Número de telefone (JID WhatsApp)', purpose: 'Identificar a conversa e o contato', basis: 'Execução contratual', retention: 'Até exclusão pelo controlador' },
  { icon: MessageCircle, type: 'Conteúdo das mensagens', purpose: 'Operar o atendimento e o histórico', basis: 'Execução contratual', retention: 'Definida pelo controlador' },
  { icon: ImageIcon, type: 'Mídias (imagem, vídeo, documento)', purpose: 'Anexar à conversa para o atendimento', basis: 'Execução contratual', retention: 'Definida pelo controlador' },
  { icon: Mic, type: 'Áudios e transcrições', purpose: 'Acessibilidade, busca e auditoria', basis: 'Legítimo interesse', retention: '12 meses' },
  { icon: Database, type: 'Metadados (status, timestamp, quem leu)', purpose: 'Auditoria, SLA e qualidade', basis: 'Obrigação legal / Legítimo interesse', retention: 'Mínimo 6 meses' },
  { icon: Clock, type: 'Logs de envio/falha', purpose: 'Diagnóstico técnico e segurança', basis: 'Legítimo interesse', retention: '90 dias' },
];

const dos = [
  'Informe ao titular, na primeira interação, a finalidade do contato e a base legal.',
  'Use templates aprovados pela Meta para mensagens iniciadas pelo negócio (HSM).',
  'Respeite a janela de 24h para mensagens fora de template.',
  'Registre o opt-in (consentimento) antes de enviar campanhas — guarde origem e data.',
  'Atenda solicitações de exclusão e portabilidade em até 15 dias.',
  'Anonimize conteúdo em capturas de tela compartilhadas internamente.',
];

const donts = [
  'Não compartilhe conversas em grupos públicos ou redes sociais.',
  'Não use dados pessoais para finalidades não declaradas (ex.: enriquecimento de terceiros).',
  'Não envie mídia sensível por canais não criptografados.',
  'Não solicite dados sensíveis (saúde, biometria) sem base legal específica.',
  'Não retenha dados além do prazo necessário para a finalidade.',
];

/** Whats App Compliance Guide component for the compliance section. */
export function WhatsAppComplianceGuide() {
  return (
    <Card className="border-secondary/30">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <MessageCircle className="w-4 h-4" /> Guia de Conformidade — Atendimento WhatsApp
        </CardTitle>
        <CardDescription>O que é armazenado, por quê e como operar dentro da LGPD</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section>
          <h3 className="text-sm font-semibold text-foreground mb-3">Dados armazenados em cada conversa</h3>
          <div className="space-y-2">
            {dataItems.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.type} className="grid grid-cols-1 md:grid-cols-[auto_1fr_auto] items-start gap-3 p-3 rounded-lg bg-muted/30">
                  <Icon className="w-4 h-4 text-primary mt-0.5" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{item.type}</p>
                    <p className="text-xs text-muted-foreground">{item.purpose}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      <span className="font-medium">Retenção:</span> {item.retention}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[10px] whitespace-nowrap">{item.basis}</Badge>
                </div>
              );
            })}
          </div>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-success flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> Boas práticas
            </h3>
            <ul className="space-y-2">
              {dos.map((d) => (
                <li key={d} className="text-xs text-muted-foreground flex gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-success mt-0.5 flex-shrink-0" />
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-destructive flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> O que evitar
            </h3>
            <ul className="space-y-2">
              {donts.map((d) => (
                <li key={d} className="text-xs text-muted-foreground flex gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-destructive mt-0.5 flex-shrink-0" />
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </CardContent>
    </Card>
  );
}
