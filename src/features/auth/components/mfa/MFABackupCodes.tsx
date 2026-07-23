import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Shield, Copy, Check, Download, RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

interface MFABackupCodesProps {
  codes?: string[];
  onRegenerate?: () => void;
  onClose?: () => void;
}

// Generates backup codes using CSPRNG (in production, these come from the auth server)
const BACKUP_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generateBackupCodes(count: number = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const rng = new Uint8Array(8);
    crypto.getRandomValues(rng);
    const part1 = Array.from(rng.slice(0, 4), b => BACKUP_CODE_CHARS[b % BACKUP_CODE_CHARS.length]).join('');
    const part2 = Array.from(rng.slice(4, 8), b => BACKUP_CODE_CHARS[b % BACKUP_CODE_CHARS.length]).join('');
    codes.push(`${part1}-${part2}`);
  }
  return codes;
}

/** MFABackup Codes component for the mfa section. */
export function MFABackupCodes({ codes: initialCodes, onRegenerate, onClose }: MFABackupCodesProps) {
  const [codes] = useState<string[]>(initialCodes || generateBackupCodes());
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
  }, []);

  const handleCopyAll = () => {
    navigator.clipboard.writeText(codes.join('\n'));
    setCopied(true);
    toast.success('Códigos copiados!');
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const content = [
      '=== CÓDIGOS DE BACKUP - ZAPP Web ===',
      `Gerados em: ${new Date().toLocaleString('pt-BR')}`,
      '',
      'ATENÇÃO: Guarde estes códigos em um local seguro.',
      'Cada código pode ser usado apenas UMA vez.',
      '',
      ...codes.map((code, i) => `${String(i + 1).padStart(2, '0')}. ${code}`),
      '',
      '==========================================',
    ].join('\n');

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'backup-codes-crm.txt';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Arquivo baixado!');
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
          <Shield className="w-6 h-6 text-primary" />
        </div>
        <CardTitle>Códigos de Backup</CardTitle>
        <CardDescription>
          Salve estes códigos em um local seguro. Cada código só pode ser usado uma vez.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-muted/50 rounded-lg p-4"
        >
          <div className="grid grid-cols-2 gap-2">
            {codes.map((code) => (
              <div
                key={code}
                className=" text-sm px-3 py-1.5 bg-background rounded border text-center"
              >
                {code}
              </div>
            ))}
          </div>
        </motion.div>

        <div className="flex items-start gap-2 p-3 bg-destructive/10 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
          <p className="text-xs text-destructive">
            Se perder o acesso ao app autenticador, estes códigos serão a única forma de recuperar sua conta.
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={handleCopyAll}>
            {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
            Copiar
          </Button>
          <Button variant="outline" className="flex-1" onClick={handleDownload}>
            <Download className="w-4 h-4 mr-2" />
            Baixar
          </Button>
        </div>

        {onRegenerate && (
          <Button variant="ghost" className="w-full text-muted-foreground" onClick={onRegenerate}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Regenerar Códigos
          </Button>
        )}

        {!confirmed ? (
          <Button className="w-full" onClick={() => setConfirmed(true)}>
            Salvei meus códigos
          </Button>
        ) : (
          <Button className="w-full" onClick={onClose}>
            Concluir
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
