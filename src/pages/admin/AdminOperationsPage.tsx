import { lazy, Suspense } from "react";
import { SectionErrorBoundary } from "@/components/ui/section-error-boundary";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { OpsMetricsTab } from "./operations/OpsMetricsTab";
import { OpsLogsTab } from "./operations/OpsLogsTab";
import { OpsTransfersTab } from "./operations/OpsTransfersTab";

const AdminChannelsPage = lazy(() => import("./AdminChannelsPage"));
const AdminQueuesPage = lazy(() => import("./AdminQueuesPage"));

/** Admin Operations Page. */
export default function AdminOperationsPage() {
  return (
    <div className="container max-w-7xl mx-auto py-8 px-4 md:px-6 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-foreground bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text">Operações</h1>
          <p className="text-muted-foreground mt-1 font-medium">
            Gerenciamento centralizado de canais, filas e fluxo operacional.
          </p>
        </div>
      </div>

      <Tabs defaultValue="metrics" className="w-full">
        <TabsList className="bg-muted/30 p-1.5 border border-border/20 flex-wrap h-auto gap-1 rounded-2xl backdrop-blur-md mb-8">
          <TabsTrigger value="metrics" className="rounded-xl px-6 py-2.5 data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-lg transition-all duration-300">Métricas</TabsTrigger>
          <TabsTrigger value="channels" className="rounded-xl px-6 py-2.5 data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-lg transition-all duration-300">Canais</TabsTrigger>
          <TabsTrigger value="queues" className="rounded-xl px-6 py-2.5 data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-lg transition-all duration-300">Filas</TabsTrigger>
          <TabsTrigger value="transfers" className="rounded-xl px-6 py-2.5 data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-lg transition-all duration-300">Transferências</TabsTrigger>
          <TabsTrigger value="logs" className="rounded-xl px-6 py-2.5 data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-lg transition-all duration-300">Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="metrics" className="mt-4">
          <SectionErrorBoundary sectionName="Métricas">
            <OpsMetricsTab />
          </SectionErrorBoundary>
        </TabsContent>

        <TabsContent value="channels" className="mt-4">
          <SectionErrorBoundary sectionName="Canais">
            <Suspense fallback={<Skeleton className="h-96" />}>
              <AdminChannelsPage />
            </Suspense>
          </SectionErrorBoundary>
        </TabsContent>

        <TabsContent value="queues" className="mt-4">
          <SectionErrorBoundary sectionName="Filas">
            <Suspense fallback={<Skeleton className="h-96" />}>
              <AdminQueuesPage />
            </Suspense>
          </SectionErrorBoundary>
        </TabsContent>

        <TabsContent value="transfers" className="mt-4">
          <SectionErrorBoundary sectionName="Transferências">
            <OpsTransfersTab />
          </SectionErrorBoundary>
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          <SectionErrorBoundary sectionName="Logs">
            <OpsLogsTab />
          </SectionErrorBoundary>
        </TabsContent>
      </Tabs>
    </div>
  );
}
