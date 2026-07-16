import { forwardRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useAuth } from '@/features/auth';
import { useOnboarding } from '@/hooks/useOnboarding';
import { TourProvider } from '@/components/onboarding/OnboardingTour';
import { IndexContentConnected } from '@/components/layout/IndexContentConnected';
import { useLoginAudit } from '@/features/auth';

const Index = forwardRef<HTMLDivElement>(function Index(_props, _ref) {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { completeOnboarding } = useOnboarding();

  useLoginAudit(user, loading);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  if (loading) {
    return <LoadingSplash />;
  }

  if (!user) return null;

  return (
    <TourProvider onComplete={completeOnboarding}>
      <IndexContentConnected />
    </TourProvider>
  );
});

function LoadingSplash() {
  return (
    <main
      className="relative flex h-dvh items-center justify-center overflow-hidden bg-background"
      role="main"
      aria-busy="true"
      aria-label="Carregando aplicação"
    >
      <h1 className="sr-only">ZAPP Web — Carregando</h1>
      <div className="absolute inset-0" aria-hidden="true">
        <div className="absolute left-1/4 top-1/4 h-96 w-96 animate-pulse rounded-full bg-primary/20 blur-3xl" />
        <div
          className="absolute bottom-1/4 right-1/4 h-96 w-96 animate-pulse rounded-full bg-primary-glow/10 blur-3xl"
          style={{ animationDelay: '1s' }}
        />
      </div>
      <div className="relative z-10 animate-fade-in text-center">
        <div
          className="relative mx-auto mb-6 flex h-16 w-16 animate-pulse items-center justify-center rounded-2xl"
          style={{ background: 'var(--gradient-primary)' }}
        >
          <Sparkles className="h-8 w-8 text-primary-foreground" />
        </div>
        <p className="mb-2 font-display text-xl font-semibold text-foreground">Carregando</p>
        <p className="text-sm text-muted-foreground">Preparando sua experiência...</p>
        <div className="mt-6 flex justify-center gap-1.5" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-2 w-2 animate-pulse rounded-full bg-primary"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
      </div>
    </main>
  );
}

export default Index;
