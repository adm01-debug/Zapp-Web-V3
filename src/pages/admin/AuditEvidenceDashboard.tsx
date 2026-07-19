import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, ShieldCheck, FileText, CheckCircle2 } from 'lucide-react';

const AuditEvidenceDashboard = () => {
  const evidences = [
    {
      module: 'Inbox',
      feature: 'Virtualização & Performance',
      path: 'src/components/team-chat/TeamChatPanel.tsx',
      snippet: "import { FixedSizeList as List } from 'react-window'",
      status: 'Verified'
    },
    {
      module: 'Segurança',
      feature: 'MFA Verification',
      path: 'src/hooks/useMFA.ts',
      snippet: 'supabase.auth.mfa.challenge()',
      status: 'Verified'
    },
    {
      module: 'Compliance',
      feature: 'LGPD Consent Control',
      path: 'src/components/contacts/LGPDConsentManager.tsx',
      snippet: 'const { updateConsent } = useLGPD()',
      status: 'Verified'
    }
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <ShieldCheck className="w-8 h-8 text-primary" />
          Dashboard de Evidências de Auditoria
        </h1>
        <Badge variant="outline" className="text-sm ">V5.0.0-PROD</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {evidences.map((ev) => (
          <Card key={`${ev.module}-${ev.feature}`} className="border-l-4 border-l-primary">
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <Badge variant="secondary">{ev.module}</Badge>
                <CheckCircle2 className="w-5 h-5 text-success-foreground" />
              </div>
              <CardTitle className="text-lg mt-2">{ev.feature}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  <div className="flex items-center gap-1 mb-1">
                    <FileText className="w-4 h-4" />
                    <span>Path:</span>
                  </div>
                  <code className="bg-muted p-1 rounded text-xs block truncate">
                    {ev.path}
                  </code>
                </div>
                <div className="text-xs  bg-muted text-muted-foreground p-3 rounded">
                  {ev.snippet}
                </div>
                <button type="button" className="w-full flex items-center justify-center gap-2 text-xs text-primary hover:underline">
                  <ExternalLink className="w-3 h-3" />
                  Ver no Repositório
                </button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default AuditEvidenceDashboard;
