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
      status: 'Verified',
    },
    {
      module: 'Segurança',
      feature: 'MFA Verification',
      path: 'src/hooks/useMFA.ts',
      snippet: 'supabase.auth.mfa.challenge()',
      status: 'Verified',
    },
    {
      module: 'Compliance',
      feature: 'LGPD Consent Control',
      path: 'src/components/contacts/LGPDConsentManager.tsx',
      snippet: 'const { updateConsent } = useLGPD()',
      status: 'Verified',
    },
  ];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-3xl font-bold">
          <ShieldCheck className="h-8 w-8 text-primary" />
          Dashboard de Evidências de Auditoria
        </h1>
        <Badge variant="outline" className="text-sm">
          V5.0.0-PROD
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {evidences.map((ev) => (
          <Card key={`${ev.module}-${ev.feature}`} className="border-l-4 border-l-primary">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <Badge variant="secondary">{ev.module}</Badge>
                <CheckCircle2 className="h-5 w-5 text-success-foreground" />
              </div>
              <CardTitle className="mt-2 text-lg">{ev.feature}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  <div className="mb-1 flex items-center gap-1">
                    <FileText className="h-4 w-4" />
                    <span>Path:</span>
                  </div>
                  <code className="block truncate rounded bg-muted p-1 text-xs">{ev.path}</code>
                </div>
                <div className="rounded bg-muted p-3 text-xs text-muted-foreground">
                  {ev.snippet}
                </div>
                <button
                  type="button"
                  className="flex w-full items-center justify-center gap-2 text-xs text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
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
