import { useState } from 'react';
import { useAutoExportJobs, type AutoExportJob } from '@/hooks/useAutoExportJobs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Database,
  Download,
  FileJson,
  FileSpreadsheet,
  Play,
  Plus,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

/** Allowlist de tabelas exportáveis (espelho da migration + edge). */
const SOURCE_TABLE_OPTIONS = [
  { value: 'contacts', label: 'Contatos' },
  { value: 'messages', label: 'Mensagens' },
  { value: 'conversations', label: 'Conversas' },
  { value: 'campaigns', label: 'Campanhas' },
  { value: 'scheduled_messages', label: 'Mensagens agendadas' },
] as const;

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pendente', className: 'bg-muted text-muted-foreground' },
  processing: { label: 'Processando', className: 'bg-amber-500/15 text-amber-600' },
  completed: { label: 'Concluído', className: 'bg-emerald-500/15 text-emerald-600' },
  failed: { label: 'Falhou', className: 'bg-destructive/15 text-destructive' },
};

function statusBadge(status: string | null) {
  const s = STATUS_LABELS[status ?? ''] ?? {
    label: status ?? '—',
    className: 'bg-muted text-muted-foreground',
  };
  return (
    <Badge variant="secondary" className={cn('px-2 py-0.5 text-[10px]', s.className)}>
      {s.label}
    </Badge>
  );
}

/** Admin AutoExport Page — jobs de exportação CSV/JSON (G4). */
export default function AdminAutoExportPage() {
  const { jobs, isLoading, createJob, deleteJob, runJob } = useAutoExportJobs();
  const [showCreate, setShowCreate] = useState(false);
  const [formName, setFormName] = useState('');
  const [formSource, setFormSource] = useState('contacts');
  const [formFormat, setFormFormat] = useState<'csv' | 'json'>('csv');
  const [formFilters, setFormFilters] = useState('');
  const [runningId, setRunningId] = useState<string | null>(null);

  const resetForm = () => {
    setFormName('');
    setFormSource('contacts');
    setFormFormat('csv');
    setFormFilters('');
  };

  const handleCreate = async () => {
    if (!formName.trim()) {
      toast.error('Informe um nome para o job');
      return;
    }
    let filters: Record<string, unknown> | undefined;
    if (formFilters.trim()) {
      try {
        const parsed: unknown = JSON.parse(formFilters);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          toast.error('Filtros devem ser um objeto JSON (ex.: {"status": "active"})');
          return;
        }
        filters = parsed as Record<string, unknown>;
      } catch {
        toast.error('Filtros inválidos — JSON mal formado');
        return;
      }
    }
    try {
      await createJob.mutateAsync({
        name: formName.trim(),
        sourceTable: formSource,
        format: formFormat,
        filters,
      });
      setShowCreate(false);
      resetForm();
    } catch {
      // toast já tratado no hook
    }
  };

  /** Executa o job e abre o download quando há arquivo gerado. */
  const handleRun = async (job: AutoExportJob, action: 'run' | 'link' = 'run') => {
    if (!job.id) return;
    setRunningId(job.id);
    try {
      const result = await runJob.mutateAsync({ jobId: job.id, action });
      if (result.signedUrl) {
        window.open(result.signedUrl, '_blank', 'noopener');
        if (result.empty) {
          toast.info(result.message ?? 'Exportação sem dados');
        } else {
          toast.success(
            `Exportação gerada: ${result.rowCount ?? 0} registros (${result.truncated ? 'limitada a 50k' : job.format})`
          );
        }
      } else if (result.empty) {
        toast.info(result.message ?? 'Nenhum registro encontrado para exportar');
      }
    } catch {
      // toast já tratado no hook (runJob.onError)
    } finally {
      setRunningId(null);
    }
  };

  const handleDelete = async (job: AutoExportJob) => {
    if (!job.id) return;
    if (!window.confirm(`Remover o job "${job.name ?? job.id}"?`)) return;
    await deleteJob.mutateAsync(job.id);
  };

  return (
    <div className="container max-w-7xl mx-auto py-8 px-4 md:px-6 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-foreground bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text">
            AutoExport
          </h1>
          <p className="text-muted-foreground mt-1 font-medium">
            Exportações automáticas CSV/JSON de dados do ZAPP para download seguro
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Job
        </Button>
      </div>

      <Card className="border border-border/60 bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            Jobs de Exportação
          </CardTitle>
          <CardDescription>
            Arquivos gerados ficam em storage privado (zapp-exports) — acesso somente via link
            temporário de 1h
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : jobs.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <FileSpreadsheet className="mx-auto mb-3 h-10 w-10 opacity-40" />
              <p className="text-sm font-medium">Nenhum job de exportação</p>
              <p className="mt-1 text-xs">Crie um job para exportar dados em CSV ou JSON</p>
            </div>
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className="flex flex-col gap-3 rounded-xl border border-border/60 p-4 transition-all hover:border-primary/30 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div
                      className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                        job.status === 'failed'
                          ? 'bg-destructive/10 text-destructive'
                          : 'bg-primary/10 text-primary'
                      )}
                    >
                      {job.format === 'json' ? (
                        <FileJson className="h-5 w-5" />
                      ) : (
                        <FileSpreadsheet className="h-5 w-5" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium">{job.name}</p>
                        {statusBadge(job.status)}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="px-1.5 text-[10px]">
                          {job.source_table}
                        </Badge>
                        <Badge variant="secondary" className="px-1.5 text-[10px] uppercase">
                          {job.format}
                        </Badge>
                        {typeof job.row_count === 'number' && job.row_count > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            {job.row_count.toLocaleString('pt-BR')} registros
                          </span>
                        )}
                        {job.last_run_at && (
                          <span className="text-[10px] text-muted-foreground">
                            Última execução:{' '}
                            {formatDistanceToNow(new Date(job.last_run_at), {
                              locale: ptBR,
                              addSuffix: true,
                            })}
                          </span>
                        )}
                      </div>
                      {job.last_error && (
                        <p className="mt-1 truncate text-[10px] text-destructive">
                          {job.last_error}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      disabled={runningId === job.id}
                      onClick={() => handleRun(job, 'run')}
                    >
                      <Play className="h-3.5 w-3.5" />
                      {runningId === job.id ? 'Executando…' : 'Exportar'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5"
                      disabled={runningId === job.id || job.status !== 'completed' || !job.file_path}
                      onClick={() => handleRun(job, 'link')}
                      title="Gerar novo link de download (1h)"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Link
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      disabled={runningId === job.id}
                      onClick={() => handleDelete(job)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo job de exportação</DialogTitle>
            <DialogDescription>
              Configure a fonte, o formato e os filtros. O arquivo será gerado sob demanda no
              botão “Exportar”.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ae-name">Nome</Label>
              <Input
                id="ae-name"
                placeholder="Ex.: Contatos ativos — mensal"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fonte de dados</Label>
                <Select value={formSource} onValueChange={(v) => setFormSource(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tabela" />
                  </SelectTrigger>
                  <SelectContent>
                    {SOURCE_TABLE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Formato</Label>
                <Select
                  value={formFormat}
                  onValueChange={(v) => setFormFormat(v as 'csv' | 'json')}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Formato" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="csv">CSV</SelectItem>
                    <SelectItem value="json">JSON</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ae-filters">Filtros (JSON opcional)</Label>
              <Textarea
                id="ae-filters"
                placeholder='{"status": "active"}'
                value={formFilters}
                onChange={(e) => setFormFilters(e.target.value)}
                rows={3}
              />
              <p className="text-[10px] text-muted-foreground">
                Igualdade simples sobre colunas da tabela. Deixe vazio para exportar tudo.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={createJob.isPending}>
              {createJob.isPending ? 'Criando…' : 'Criar job'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
