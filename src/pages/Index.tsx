import { forwardRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useAuth } from '@/features/auth';
import { useOnboarding } from '@/hooks/useOnboarding';
import { TourProvider } from '@/components/onboarding/OnboardingTour';
import { IndexContentConnected } from '@/components/layout/IndexContentConnected';
import { useLoginAudit } from '@/features/auth';

/** Root page component that bootstraps auth state and redirects to the correct initial view. */
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
      className="flex items-center justify-center h-dvh bg-background relative overflow-hidden"
      role="main"
      aria-busy="true"
      aria-label="Carregando aplicação"
    >
      <h1 className="sr-only">ZAPP Web — Carregando</h1>
      <div className="absolute inset-0" aria-hidden="true">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-primary-glow/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>
      <div className="text-center relative z-10 animate-fade-in">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 relative animate-pulse"
          style={{ background: 'var(--gradient-primary)' }}
        >
          <Sparkles className="w-8 h-8 text-primary-foreground" />
        </div>
        <p className="font-display text-xl font-semibold text-foreground mb-2">Carregando</p>
        <p className="text-muted-foreground text-sm">Preparando sua experiência...</p>
        <div className="flex gap-1.5 justify-center mt-6" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="w-2 h-2 rounded-full bg-primary animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />
          ))}
        </div>
      </div>
    </main>
  );
}

/** Default export. */
export default Index;

