import { useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { SLAHistoryDashboard, SLADeliveryHistoryDashboard } from '@/features/sla';
import { FloatingParticles } from '@/components/dashboard/FloatingParticles';
import { AuroraBorealis } from '@/components/effects/AuroraBorealis';
import { Tabs, TabsContent, TabsTrigger, TabsList } from '@/components/ui/tabs';
import { SectionErrorBoundary } from '@/components/ui/section-error-boundary';

const SLAHistory = () => {
  const [currentView, setCurrentView] = useState('sla-history');

  return (
    <div className="flex h-screen bg-background">
      <Sidebar currentView={currentView} onViewChange={setCurrentView} />
      <main className="relative flex-1 overflow-auto p-6">
        <AuroraBorealis />
        <FloatingParticles />
        <div className="relative z-10">
          <Tabs defaultValue="standard" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="standard">Atendimento</TabsTrigger>
              <TabsTrigger value="delivery">Entregas & Leituras</TabsTrigger>
            </TabsList>
            <TabsContent value="standard">
              <SectionErrorBoundary sectionName="Histórico de SLA">
                <SLAHistoryDashboard />
              </SectionErrorBoundary>
            </TabsContent>
            <TabsContent value="delivery">
              <SectionErrorBoundary sectionName="Histórico de Entregas">
                <SLADeliveryHistoryDashboard />
              </SectionErrorBoundary>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
};

export default SLAHistory;
