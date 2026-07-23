import { useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { SLADashboard as SLADashboardComponent } from '@/components/queues/SLADashboard';
import { SectionErrorBoundary } from '@/components/ui/section-error-boundary';

const SLADashboardPage = () => {
  const [currentView, setCurrentView] = useState('sla');

  return (
    <div className="flex h-screen bg-background">
      <Sidebar currentView={currentView} onViewChange={setCurrentView} />
      <main className="flex-1 overflow-auto p-6">
        <SectionErrorBoundary sectionName="SLA Dashboard">
          <SLADashboardComponent />
        </SectionErrorBoundary>
      </main>
    </div>
  );
};

/** React component: S L A Dashboard. */
export default SLADashboardPage;
