import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { FileText } from 'lucide-react';

const POLICY_VERSION = '2026.04.27';

const sections = [
  {
    id: 'controlador',
    title: '1. Controlador e Encarregado',
    body: `O ZAPP Web atua como operador no tratamento de dados pessoais sob instrução do controlador (sua organização). O encarregado de proteção de dados (DPO) pode ser contatado pelo administrador da conta. Conforme Art. 39 da LGPD, o DPO atende solicitações de titulares e da ANPD.`,
  },
  {
    id: 'finalidade',
    title: '2. Finalidade do Tratamento',
    body: `Os dados são tratados estritamente para: (a) execução do atendimento omnichannel solicitado pelo titular; (b) cumprimento de obrigações legais e regulatórias; (c) melhoria do serviço sob legítimo interesse, sempre respeitando direitos fundamentais.`,
  },
  {
    id: 'base-legal',
    title: '3. Bases Legais (Art. 7º LGPD)',
    body: `• Execução de contrato — para mensagens, atendimento, vendas.\n• Cumprimento de obrigação legal — registros de auditoria, retenção fiscal.\n• Legítimo interesse — segurança, prevenção a fraude, métricas operacionais agregadas.\n• Consentimento — somente para finalidades adicionais informadas explicitamente.`,
  },
  {
    id: 'compartilhamento',
    title: '4. Compartilhamento e Subprocessadores',
    body: `Dados podem trafegar por subprocessadores essenciais à operação: provedores de WhatsApp (Meta/Evolution API), envio de e-mail, armazenamento em nuvem e provedores de IA generativa. Todos sob contrato com cláusulas de proteção equivalentes à LGPD. Lista completa disponível com o controlador.`,
  },
  {
    id: 'retencao',
    title: '5. Retenção',
    body: `Mensagens e mídias: enquanto o atendimento estiver ativo + período definido pelo controlador. Logs de auditoria: mínimo de 6 meses (Marco Civil) e até 5 anos (obrigações fiscais). Dados de contato no CRM: até a solicitação de exclusão pelo titular ou fim do relacionamento.`,
  },
  {
    id: 'direitos',
    title: '6. Direitos do Titular (Art. 18 LGPD)',
    body: `Confirmação, acesso, correção, anonimização, portabilidade, eliminação, informação sobre compartilhamentos, revogação de consentimento e oposição. As solicitações são registradas em log auditável e respondidas em até 15 dias.`,
  },
  {
    id: 'transferencia',
    title: '7. Transferência Internacional',
    body: `Servidores primários no Brasil. Subprocessadores fora do território nacional (ex.: provedores de IA) operam sob garantias adequadas previstas no Art. 33 da LGPD. Nenhum dado sensível é transferido sem necessidade técnica comprovada.`,
  },
  {
    id: 'seguranca',
    title: '8. Medidas de Segurança',
    body: `Criptografia em trânsito (TLS 1.3) e em repouso, controle de acesso baseado em papéis (RBAC), Row Level Security em todas as tabelas com dados pessoais, autenticação multifator opcional, registros de auditoria imutáveis e revisão periódica de privilégios.`,
  },
  {
    id: 'incidentes',
    title: '9. Notificação de Incidentes',
    body: `Em caso de incidente que possa acarretar risco ou dano relevante, o controlador é notificado em prazo razoável (recomendado 48h) com descrição da natureza, dados afetados, riscos e medidas técnicas adotadas, conforme Art. 48 da LGPD.`,
  },
  {
    id: 'menores',
    title: '10. Crianças e Adolescentes',
    body: `O serviço não é direcionado a menores de 13 anos. Dados de adolescentes (13–17) são tratados somente sob consentimento específico do responsável legal, conforme Art. 14 da LGPD.`,
  },
];

/** Privacy Policy Section component for the compliance section. */
export function PrivacyPolicySection() {
  return (
    <Card className="border-secondary/30">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="w-4 h-4" /> Política de Privacidade
        </CardTitle>
        <CardDescription>
          Versão {POLICY_VERSION} — em conformidade com a Lei nº 13.709/2018 (LGPD) e GDPR
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible className="w-full">
          {sections.map((s) => (
            <AccordionItem key={s.id} value={s.id}>
              <AccordionTrigger className="text-sm font-medium">{s.title}</AccordionTrigger>
              <AccordionContent>
                <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">{s.body}</p>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
}
