import { useEffect, useMemo, useState } from 'react';
import { useCronScheduler, type CronJob } from '@/hooks/useCronScheduler';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw, ChevronDown, ChevronRight, Clock } from 'lucide-react';

// ── Cron expression helpers ───────────────────────────────────────────────────

/** Returns a compact human-readable description of a cron expression. */
function describeSchedule(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5) return expr;
  const [min, hour, dom, , dow] = parts;

  if (min === '*' && hour === '*') return 'A cada minuto';
  if (min.startsWith('*/')) return `A cada ${min.slice(2)} min`;

  const hourNum = parseInt(hour, 10);
  const minNum = parseInt(min, 10);
  const pad = (n: number) => String(n).padStart(2, '0');
  const time = `${pad(hourNum)}:${pad(minNum)}`;

  if (dow !== '*' && dom === '*') {
    const days: Record<string, string> = {
      '1': 'Seg', '2': 'Ter', '3': 'Qua', '4': 'Qui', '5': 'Sex', '6': 'Sáb', '0': 'Dom',
      '1-5': 'Seg–Sex',
    };
    return `${days[dow] ?? `Dia ${dow}`} às ${time}`;
  }
  if (dom === '*' && dow === '*') return `Diário às ${time}`;
  if (dom !== '*') return `Dia ${dom} às ${time}`;
  return expr;
}

/** Groups jobs by their first dash-separated word (prefix). */
function groupJobs(jobs: CronJob[]): Map<string, CronJob[]> {
  const map = new Map<string, CronJob[]>();
  for (const job of jobs) {
    const prefix = job.jobname.split('-')[0] ?? 'outros';
    const arr = map.get(prefix) ?? [];
    arr.push(job);
    map.set(prefix, arr);
  }
  return map;
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

interface JobRowProps {
  job: CronJob;
  toggling: boolean;
  onToggle: (jobname: string, active: boolean) => void;
}

function JobRow({ job, toggling, onToggle }: JobRowProps) {
  const shortCommand =
    job.command.length > 80 ? `${job.command.slice(0, 80)}…` : job.command;

  return (
    <TableRow className="hover:bg-muted/40">
      <TableCell className="font-mono text-xs text-muted-foreground w-8 pl-4">
        {job.jobid}
      </TableCell>
      <TableCell className="font-medium text-sm max-w-[220px] truncate" title={job.jobname}>
        {job.jobname}
      </TableCell>
      <TableCell className="text-xs">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-1 cursor-default">
                <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="font-mono">{job.schedule}</span>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">{describeSchedule(job.schedule)}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground max-w-[300px]">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="font-mono truncate block cursor-default" title={job.command}>
                {shortCommand}
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[480px]">
              <p className="text-xs font-mono whitespace-pre-wrap break-all">{job.command}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </TableCell>
      <TableCell className="text-center w-24">
        <Badge variant={job.active ? 'default' : 'secondary'} className="text-xs">
          {job.active ? 'Ativo' : 'Pausado'}
        </Badge>
      </TableCell>
      <TableCell className="text-center w-16 pr-4">
        <Switch
          checked={job.active}
          disabled={toggling}
          onCheckedChange={(checked) => onToggle(job.jobname, checked)}
          aria-label={`${job.active ? 'Pausar' : 'Ativar'} ${job.jobname}`}
        />
      </TableCell>
    </TableRow>
  );
}

interface GroupRowsProps {
  prefix: string;
  jobs: CronJob[];
  toggling: Record<string, boolean>;
  onToggle: (jobname: string, active: boolean) => void;
  defaultCollapsed?: boolean;
}

function GroupRows({ prefix, jobs, toggling, onToggle, defaultCollapsed = false }: GroupRowsProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const activeCount = jobs.filter((j) => j.active).length;

  return (
    <>
      <TableRow
        className="bg-muted/20 hover:bg-muted/30 cursor-pointer select-none"
        onClick={() => setCollapsed((c) => !c)}
      >
        <TableCell colSpan={6} className="py-1.5 pl-2">
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {collapsed ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
            {prefix}
            <Badge variant="outline" className="text-[10px] h-4 px-1.5 ml-1">
              {activeCount}/{jobs.length} ativos
            </Badge>
          </span>
        </TableCell>
      </TableRow>
      {!collapsed &&
        jobs.map((job) => (
          <JobRow
            key={job.jobid}
            job={job}
            toggling={!!toggling[job.jobname]}
            onToggle={onToggle}
          />
        ))}
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

/** Admin page for managing pg_cron scheduled jobs. */
export default function CronSchedulerPage() {
  const { jobs, loading, toggling, listJobs, toggleJob } = useCronScheduler();

  useEffect(() => {
    listJobs();
  }, [listJobs]);

  const grouped = useMemo(() => groupJobs(jobs), [jobs]);
  const totalActive = jobs.filter((j) => j.active).length;

  return (
    <TooltipProvider>
      <div className="p-6 space-y-4 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Cron Scheduler</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Gerenciamento de jobs pg_cron — {totalActive} de {jobs.length} ativos
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={listJobs}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>

        {/* Table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Jobs Agendados</CardTitle>
            <CardDescription className="text-xs">
              Clique no grupo para expandir/colapsar. Alterne o switch para pausar ou reativar um job.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loading && jobs.length === 0 ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : jobs.length === 0 ? (
              <p className="text-center text-muted-foreground py-12 text-sm">
                Nenhum job pg_cron encontrado.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-8 pl-4 text-xs">ID</TableHead>
                      <TableHead className="text-xs">Nome</TableHead>
                      <TableHead className="text-xs">Agendamento</TableHead>
                      <TableHead className="text-xs">Comando</TableHead>
                      <TableHead className="text-center text-xs w-24">Status</TableHead>
                      <TableHead className="text-center text-xs w-16 pr-4">Toggle</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array.from(grouped.entries()).map(([prefix, groupJobs], idx) => (
                      <GroupRows
                        key={prefix}
                        prefix={prefix}
                        jobs={groupJobs}
                        toggling={toggling}
                        onToggle={toggleJob}
                        defaultCollapsed={idx > 0}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Legend */}
        <p className="text-[11px] text-muted-foreground">
          Os jobs são gerenciados via RPC <code className="font-mono">rpc_toggle_cron_job</code> —
          apenas o campo <code className="font-mono">active</code> é alterado; o schedule permanece
          intacto.
        </p>
      </div>
    </TooltipProvider>
  );
}
