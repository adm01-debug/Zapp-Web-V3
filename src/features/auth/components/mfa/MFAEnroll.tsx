import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Shield, Smartphone, Copy, Check, Loader2 } from 'lucide-react';
import { useMFA } from '@/features/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

interface MFAEnrollProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

/** MFAEnroll component for the mfa section. */
export function MFAEnroll({ onSuccess, onCancel }: MFAEnrollProps) {
  const { enrollTOTP, verifyTOTP, loading, enrollmentData } = useMFA();
  const [step, setStep] = useState<'intro' | 'qr' | 'verify'>('intro');
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    },
    []
  );

  const handleStartEnrollment = async () => {
    try {
      await enrollTOTP();
      setStep('qr');
    } catch {
      // Error handled in hook
    }
  };

  const handleCopySecret = () => {
    if (enrollmentData?.totp.secret) {
      navigator.clipboard.writeText(enrollmentData.totp.secret);
      setCopied(true);
      toast.success('Código copiado!');
      copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleVerify = async () => {
    if (!enrollmentData || code.length !== 6) return;

    setVerifying(true);
    try {
      await verifyTOTP(enrollmentData.id, code);
      onSuccess?.();
    } catch {
      setCode('');
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    if (code.length === 6) {
      handleVerify();
    }
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Shield className="h-6 w-6 text-primary" />
        </div>
        <CardTitle>Configurar Autenticação 2FA</CardTitle>
        <CardDescription>Adicione uma camada extra de segurança à sua conta</CardDescription>
      </CardHeader>

      <CardContent>
        {step === 'intro' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg bg-muted/50 p-3">
              <Smartphone className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-medium">Você precisará de um app autenticador</p>
                <p className="text-xs text-muted-foreground">
                  Como Google Authenticator, Authy ou 1Password
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Button className="w-full" onClick={handleStartEnrollment} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Gerando...
                  </>
                ) : (
                  'Começar Configuração'
                )}
              </Button>
              {onCancel && (
                <Button variant="ghost" className="w-full" onClick={onCancel}>
                  Cancelar
                </Button>
              )}
            </div>
          </motion.div>
        )}

        {step === 'qr' && enrollmentData && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="text-center">
              <p className="mb-4 text-sm text-muted-foreground">
                Escaneie este QR code com seu app autenticador
              </p>

              <div className="inline-block rounded-lg bg-background p-4 shadow-sm">
                <img
                  src={enrollmentData.totp.qr_code}
                  alt="QR Code para MFA"
                  className="h-48 w-48"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Ou insira manualmente:</Label>
              <div className="flex gap-2">
                <code className="flex-1 break-all rounded bg-muted p-2 text-xs">
                  {enrollmentData.totp.secret}
                </code>
                <Button size="sm" variant="outline" onClick={handleCopySecret}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <Button className="w-full" onClick={() => setStep('verify')}>
              Continuar
            </Button>
          </motion.div>
        )}

        {step === 'verify' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="text-center">
              <p className="mb-4 text-sm text-muted-foreground">
                Digite o código de 6 dígitos do seu app autenticador
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="code">Código de Verificação</Label>
              <Input
                id="code"
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className="text-center text-2xl tracking-widest"
                disabled={verifying}
                autoFocus
              />
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep('qr')}>
                Voltar
              </Button>
              <Button
                className="flex-1"
                onClick={handleVerify}
                disabled={code.length !== 6 || verifying}
              >
                {verifying ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verificando...
                  </>
                ) : (
                  'Verificar'
                )}
              </Button>
            </div>
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}
