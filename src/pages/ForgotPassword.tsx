import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, ArrowLeft, Loader2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useForgotPassword } from '@/hooks/useForgotPassword';

/** Forgot Password. */
export default function ForgotPassword() {
  const { email, setEmail, reason, setReason, loading, sent, error, handleSubmit } =
    useForgotPassword();

  if (sent) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted/20 p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: 'spring' }}
                className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-warning/10 dark:bg-warning/20"
              >
                <Clock className="h-8 w-8 text-warning dark:text-warning" />
              </motion.div>
              <CardTitle>Solicitação Enviada!</CardTitle>
              <CardDescription>
                Sua solicitação de reset para <strong>{email}</strong> foi enviada para análise.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 rounded-lg bg-muted p-4 text-sm">
                <p className="font-medium">Próximos passos:</p>
                <ol className="list-inside list-decimal space-y-1 text-muted-foreground">
                  <li>Um administrador irá analisar sua solicitação</li>
                  <li>Você receberá um email quando for aprovada</li>
                  <li>Use o link do email para redefinir sua senha</li>
                </ol>
              </div>
              <p className="text-center text-xs text-muted-foreground">
                Este processo pode levar alguns minutos. Verifique seu email regularmente.
              </p>
              <Button variant="outline" className="w-full" asChild>
                <Link to="/auth">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Voltar para login
                </Link>
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted/20 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Mail className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Esqueceu sua senha?</CardTitle>
            <CardDescription>
              Digite seu email e envie uma solicitação de reset. Um administrador irá analisar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  className={error ? 'border-destructive' : ''}
                />
                {error && (
                  <motion.p
                    role="alert"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-sm text-destructive"
                  >
                    {error}
                  </motion.p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="reason">Motivo (opcional)</Label>
                <Textarea
                  id="reason"
                  placeholder="Ex: Esqueci minha senha após férias..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={loading}
                  className="resize-none"
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  Ajuda o administrador a validar sua identidade
                </p>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  'Solicitar Reset de Senha'
                )}
              </Button>

              <Button variant="ghost" className="w-full" asChild>
                <Link to="/auth">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Voltar para login
                </Link>
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </main>
  );
}