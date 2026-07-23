import { useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Activity, RefreshCw, Trash2, Download, FileText, CalendarIcon } from "lucide-react";
import { TelemetryCharts } from "@/features/admin";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SeverityFilter, TimeFilter } from "@/hooks/useQueryTelemetry";
import { useQueryTelemetry } from "@/hooks/useQueryTelemetry";
import { formatDuration, computeTopOffenders } from "./admin-telemetria/telemetryUtils";
import { TelemetryStatsCards } from "./admin-telemetria/TelemetryStatsCards";
import { TelemetryTopOffenders } from "./admin-telemetria/TelemetryTopOffenders";
import { TelemetryTable } from "./admin-telemetria/TelemetryTable";
import { ClientTelemetryPanel } from "./admin-telemetria/ClientTelemetryPanel";

/** Admin Telemetria Page. */
export default function AdminTelemetriaPage() {
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("24h");
  const [customDateFrom, setCustomDateFrom] = useState<Date | undefined>();
  const [customDateTo, setCustomDateTo] = useState<Date | undefined>();

  const { rows, isLoading, refetch, isRefetching, handleCleanup } = useQueryTelemetry({
    severityFilter,
    timeFilter,
    customDateFrom,
    customDateTo,
  });

  const handleExportCSV = () => {
    if (rows.length === 0) {
      toast.error("Nenhum dado para exportar");
      return;
    }
    const headers = ["Data/Hora", "Operação", "Tabela/RPC", "Duração (ms)", "Severidade", "Registros", "Limit", "Offset", "Count Mode", "Erro"];
    const csvRows = rows.map(r => [
      new Date(r.created_at).toLocaleString("pt-BR"), r.operation,
      r.table_name || r.rpc_name || "-", r.duration_ms, r.severity,
      r.record_count ?? "-", r.query_limit ?? "-", r.query_offset ?? "-",
      r.count_mode ?? "-", `"${(r.error_message || "").replace(/"/g, '""')}"`,
    ]);
    const csvContent = [headers.join(";"), ...csvRows.map(r => r.join(";"))].join("\n");
    const blob = new Blob(["﻿" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `telemetria_${format(new Date(), "yyyy-MM-dd")}_${timeFilter}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado com sucesso");
  };

  const handleExportPDF = async () => {
    if (rows.length === 0) {
      toast.error("Nenhum dado para exportar");
      return;
    }
    try {
      const { default: jsPDF } = await import("jspdf");
      const { default: autoTable } = await import("jspdf-autotable");
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const now = new Date();
      const periodLabels: Record<string, string> = { "1h": "Última hora", "6h": "Últimas 6h", "24h": "Últimas 24h", "7d": "Últimos 7 dias", custom: "Período personalizado" };
      doc.setFontSize(16); doc.text("Telemetria de Queries", 14, 15);
      doc.setFontSize(9); doc.setTextColor(100);
      doc.text(`Exportado em ${now.toLocaleString("pt-BR")} · Período: ${periodLabels[timeFilter]} · ${rows.length} registros`, 14, 22);
      const headers = ["Data/Hora", "Operação", "Tabela/RPC", "Duração", "Severidade", "Records", "Limit", "Offset", "Count", "Erro"];
      const body = rows.map(r => [
        new Date(r.created_at).toLocaleString("pt-BR"), r.operation, r.rpc_name || r.table_name || "-",
        `${r.duration_ms}ms`, r.severity === "very_slow" ? "Muito Lenta" : r.severity === "slow" ? "Lenta" : r.severity === "error" ? "Erro" : r.severity,
        String(r.record_count ?? "-"), String(r.query_limit ?? "-"), String(r.query_offset ?? "-"),
        r.count_mode || "-", (r.error_message || "-").substring(0, 60),
      ]);
      autoTable(doc, { head: [headers], body, startY: 28, styles: { fontSize: 7, cellPadding: 1.5 }, headStyles: { fillColor: [41, 37, 36], textColor: 255 }, alternateRowStyles: { fillColor: [245, 245, 244] } });
      doc.save(`telemetria_${format(now, "yyyy-MM-dd")}_${timeFilter}.pdf`);
      toast.success("PDF exportado com sucesso");
    } catch { toast.error("Erro ao gerar PDF"); }
  };

  const verySlow = rows.filter(r => r.severity === "very_slow").length;
  const slow = rows.filter(r => r.severity === "slow").length;
  const errors = rows.filter(r => r.severity === "error").length;
  const avgDuration = rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.duration_ms, 0) / rows.length) : 0;
  const topOffenders = computeTopOffenders(rows);

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Activity className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Telemetria de Queries</h1>
            <p className="text-sm text-muted-foreground">Monitoramento de performance do banco externo</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={rows.length === 0}><Download className="h-3.5 w-3.5 mr-1.5" />CSV</Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={rows.length === 0}><FileText className="h-3.5 w-3.5 mr-1.5" />PDF</Button>
          <Button variant="outline" size="sm" onClick={handleCleanup}><Trash2 className="h-3.5 w-3.5 mr-1.5" />Limpar +7d</Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isRefetching ? "animate-spin" : ""}`} />Atualizar
          </Button>
        </div>
      </div>

      <Tabs defaultValue="server" className="w-full">
        <TabsList>
          <TabsTrigger value="server">Servidor (DB)</TabsTrigger>
          <TabsTrigger value="client">Cliente (in-memory)</TabsTrigger>
        </TabsList>

        <TabsContent value="server" className="space-y-6 mt-4">
          <TelemetryStatsCards verySlow={verySlow} slow={slow} errors={errors} avgDuration={formatDuration(avgDuration)} />
          <TelemetryTopOffenders topOffenders={topOffenders} />
          <TelemetryCharts rows={rows} timeFilter={timeFilter} />

          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={severityFilter} onValueChange={(v) => setSeverityFilter(v as SeverityFilter /* ignore-audit: Select/Tabs value string narrowed to union; developer controls option values */)}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Severidade" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="slow">🟡 Lentas</SelectItem>
                <SelectItem value="very_slow">🔴 Muito Lentas</SelectItem>
                <SelectItem value="error">❌ Erros</SelectItem>
              </SelectContent>
            </Select>
            <Select value={timeFilter} onValueChange={(v) => setTimeFilter(v as TimeFilter /* ignore-audit: Select/Tabs value string narrowed to union; developer controls option values */)}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Período" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1h">Última hora</SelectItem>
                <SelectItem value="6h">Últimas 6h</SelectItem>
                <SelectItem value="24h">Últimas 24h</SelectItem>
                <SelectItem value="7d">Últimos 7 dias</SelectItem>
                <SelectItem value="custom">📅 Personalizado</SelectItem>
              </SelectContent>
            </Select>
            {timeFilter === "custom" && (
              <>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("w-36 justify-start text-left font-normal", !customDateFrom && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-3.5 w-3.5" />{customDateFrom ? format(customDateFrom, "dd/MM/yyyy") : "De"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={customDateFrom} onSelect={setCustomDateFrom} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("w-36 justify-start text-left font-normal", !customDateTo && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-3.5 w-3.5" />{customDateTo ? format(customDateTo, "dd/MM/yyyy") : "Até"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={customDateTo} onSelect={setCustomDateTo} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </>
            )}
            <span className="text-xs text-muted-foreground ml-auto">{rows.length} registros · auto-refresh 30s</span>
          </div>

          <TelemetryTable rows={rows} isLoading={isLoading} />
        </TabsContent>

        <TabsContent value="client" className="mt-4">
          <ClientTelemetryPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
