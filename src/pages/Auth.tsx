import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Smartphone,
  Mail,
  ArrowRight,
  Sparkles,
  Fingerprint,
  Loader2,
  Lock,
  AlertTriangle,
} from 'lucide-react';
import { RippleButton } from '@/components/ui/micro-interactions';
import { PasswordInput } from '@/features/auth';
import { SocialProof } from '@/features/auth';
import { HeroBenefits } from '@/features/auth';
import { useAuthForm } from '@/features/auth';
import { blockReasonMessage } from '@/lib/loginAttempts';
import { Link } from 'react-router-dom';
import { AuthDiagnosticsPanel } from '@/features/auth/components/AuthDiagnosticsPanel';

/** Auth. */
export default function Auth() {
  const {
    loading,
    passkeyAvailable,
    passkeyLoading,
    lockStatus,
    formData,
    setFormData,
    errors,
    handleLogin,
    handlePasskeyLogin,
  } = useAuthForm();

  return (
    <main className="relative flex min-h-screen overflow-y-auto overflow-x-hidden bg-background">
      {/* Background decorations */}
      <div className="pointer-events-none absolute inset-0">
        <motion.div
          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -right-40 -top-40 h-96 w-96 rounded-full bg-primary/20 blur-3xl"
        />
        <motion.div
          animate={{ scale: [1.2, 1, 1.2], opacity: [0.2, 0.4, 0.2] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-secondary/20 blur-3xl"
        />
        <motion.div
          animate={{ y: [0, -20, 0], opacity: [0.1, 0.3, 0.1] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute left-1/4 top-1/3 h-64 w-64 rounded-full bg-primary/10 blur-2xl"
        />
      </div>

      <div
        className="pointer-events-none absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, hsl(var(--primary)) 1px, transparent 0)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* Hero Benefits - Left Side (Desktop) */}
      <div className="relative z-10 hidden lg:flex lg:w-1/2">
        <HeroBenefits />
      </div>

      {/* Auth Form - Right Side */}
      <div className="flex flex-1 flex-col items-center justify-start p-4 lg:justify-center lg:p-8">
        <div className="relative z-10 mb-4 w-full max-w-md lg:hidden">
          <HeroBenefits />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative z-10 w-full max-w-md"
        >
          {/* Header */}
          <div className="mb-8 text-center">
            <motion.div
              initial={{ scale: 0.8, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15 }}
              whileHover={{ scale: 1.05, rotate: 5 }}
              className="relative mx-auto mb-8 flex h-24 w-24 items-center justify-center overflow-visible rounded-[2rem] shadow-2xl"
              style={{ background: 'var(--gradient-primary)' }}
            >
              <Smartphone className="h-12 w-12 text-primary-foreground" />
              <div className="absolute inset-0 -z-10 rounded-[2rem] bg-primary/40 opacity-60 blur-2xl" />
              <motion.div
                animate={{ scale: [0, 1, 0], opacity: [0, 1, 0] }}
                transition={{ duration: 2, repeat: Infinity, delay: 0 }}
                className="absolute -right-2 -top-2"
              >
                <Sparkles className="h-4 w-4 text-primary" />
              </motion.div>
              <motion.div
                animate={{ scale: [0, 1, 0], opacity: [0, 1, 0] }}
                transition={{ duration: 2, repeat: Infinity, delay: 0.7 }}
                className="absolute -bottom-1 -left-1"
              >
                <Sparkles className="h-3 w-3 text-secondary" />
              </motion.div>
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-gradient-to-r from-foreground via-foreground to-muted-foreground bg-clip-text text-3xl font-bold text-transparent"
            >
              ZAPP Web
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="mt-2 text-muted-foreground"
            >
              Plataforma omnichannel para atendimento
            </motion.p>
          </div>

          {/* Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4 }}
          >
            <Card className="overflow-hidden rounded-[1.5rem] border-border/40 bg-card/80 shadow-xl shadow-black/5 backdrop-blur-sm">
              <CardContent className="pt-6">
                <AnimatePresence>
                  {lockStatus.isLocked && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -10 }}
                      className="mb-4 rounded-lg border border-destructive/20 bg-destructive/10 p-4"
                    >
                      <div className="flex items-start gap-3">
                        <div className="rounded-full bg-destructive/20 p-2">
                          <Lock className="h-5 w-5 text-destructive" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-destructive">
                            Conta bloqueada temporariamente
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Muitas tentativas de login falhadas. Aguarde antes de tentar novamente.
                          </p>
                          <div className="mt-3 flex items-center gap-2">
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                              <motion.div
                                initial={{ width: '100%' }}
                                animate={{ width: '0%' }}
                                transition={{ duration: lockStatus.remainingTime, ease: 'linear' }}
                                className="h-full rounded-full bg-destructive"
                              />
                            </div>
                            <span className="min-w-[60px] text-right text-sm text-destructive">
                              {Math.floor(lockStatus.remainingTime / 60)}:
                              {(lockStatus.remainingTime % 60).toString().padStart(2, '0')}
                            </span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {lockStatus.blocked && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -10 }}
                      className="mb-4 rounded-lg border border-destructive/20 bg-destructive/10 p-4"
                    >
                      <div className="flex items-start gap-3">
                        <div className="rounded-full bg-destructive/20 p-2">
                          <Lock className="h-5 w-5 text-destructive" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-destructive">
                            Acesso bloqueado pela política de segurança
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {blockReasonMessage(lockStatus.blockReason)}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {!lockStatus.isLocked && lockStatus.attempts > 0 && lockStatus.attempts < 5 && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="mb-4 rounded-lg border border-warning/20 bg-warning/10 p-3"
                    >
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-warning" />
                        <p className="text-sm text-warning">
                          {5 - lockStatus.attempts} tentativa
                          {5 - lockStatus.attempts > 1 ? 's' : ''} restante
                          {5 - lockStatus.attempts > 1 ? 's' : ''} antes do bloqueio
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <form onSubmit={handleLogin} className="space-y-4">
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 }}
                    className="space-y-2"
                  >
                    <Label htmlFor="login-email" className="text-sm font-medium">
                      Email
                    </Label>
                    <div className="group relative">
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
                      <Input
                        id="login-email"
                        type="email"
                        autoComplete="email"
                        placeholder="seu@email.com"
                        className="glass border-border/50 pl-10 transition-all focus:border-primary/50 focus:ring-primary/20"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      />
                    </div>
                    <AnimatePresence>
                      {errors.email && (
                        <motion.p
                          role="alert"
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -5 }}
                          className="text-xs text-destructive"
                        >
                          {errors.email}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.6 }}
                    className="space-y-2"
                  >
                    <Label htmlFor="login-password" className="text-sm font-medium">
                      Senha
                    </Label>
                    <PasswordInput
                      id="login-password"
                      autoComplete="current-password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    />
                    <AnimatePresence>
                      {errors.password && (
                        <motion.p
                          role="alert"
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -5 }}
                          className="text-xs text-destructive"
                        >
                          {errors.password}
                        </motion.p>
                      )}
                    </AnimatePresence>
                    <div className="flex justify-end">
                      <Link
                        to="/forgot-password"
                        className="text-xs text-primary transition-colors hover:opacity-80 hover:underline"
                      >
                        Esqueci minha senha
                      </Link>
                    </div>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7 }}
                  >
                    <RippleButton
                      type="submit"
                      variant="primary"
                      className="group inline-flex h-9 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-all"
                      disabled={loading}
                    >
                      {loading ? (
                        <motion.span
                          animate={{ opacity: [0.5, 1, 0.5] }}
                          transition={{ duration: 1.5, repeat: Infinity }}
                        >
                          Entrando...
                        </motion.span>
                      ) : (
                        <>
                          Entrar
                          <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </>
                      )}
                    </RippleButton>
                  </motion.div>

                  {passkeyAvailable && (
                    <>
                      <div className="relative my-4">
                        <div className="absolute inset-0 flex items-center">
                          <Separator className="w-full" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                          <span className="bg-card px-2 text-muted-foreground">ou</span>
                        </div>
                      </div>
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.8 }}
                      >
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full gap-2"
                          disabled={passkeyLoading}
                          onClick={handlePasskeyLogin}
                        >
                          {passkeyLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Fingerprint className="h-4 w-4" />
                          )}
                          Entrar com Passkey
                        </Button>
                      </motion.div>
                    </>
                  )}
                </form>

<SocialProof />
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="mt-6 text-center"
          >
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} Promo Brindes. Todos os direitos reservados.
            </p>
            <AuthDiagnosticsPanel />
          </motion.div>
        </motion.div>
      </div>
    </main>
  );
}
