import { useCallback, useEffect, useMemo, useState } from "react";
import { useMountedRef } from '@/hooks/useMountedRef';
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, ShieldAlert, RefreshCw, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface FailedAuthRow {
  id: string;
  email: string;
  ip_address: string | null;
  user_agent: string | null;
  attempt_count: number;
  last_attempt_at: string;
  locked_until: string | null;
  created_at: string;
}

export default function AdminFailedAuthMessagesPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<FailedAuthRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState<Date | undefined>(undefined);
  const [to, setTo] = useState<Date | undefined>(undefined);

  const mountedRef = useMountedRef();

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('login_attempts')
      .select("*")
      .order("last_attempt_at", { ascending: false })
      .limit(500);

    if (from) {
      const start = new Date(from);
      start.setHours(0, 0, 0, 0);
      query = query.gte("last_attempt_at", start.toISOString());
    }
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      query = query.lte("last_attempt_at", end.toISOString());
    }

    const { data, error } = await query;
    if (!mountedRef.current) return;
    if (error) {
      toast({
        title: "Erro ao carregar falhas",
        description: error.message,
        variant: "destructive",
      });
      setRows([]);
    } else {
      setRows((data ?? []) as FailedAuthRow[]);
    }
    setLoading(false);
  }, [from, to, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const total = rows.length;
    const totalAttempts = rows.reduce((s, r) => s + (r.attempt_count ?? 0), 0);
    const locked = rows.filter(
      (r) => r.locked_until && new Date(r.locked_until) > new Date()
    ).length;
    return { total, totalAttempts, locked };
  }, [rows]);

  const clearFilters = () => {
    setFrom(undefined);
    setTo(undefined);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center">
            <ShieldAlert className="w-5 h-5 text-destructive" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Falhas de Autenticação
            </h1>
            <p className="text-sm text-muted-foreground">
              Tentativas de login bloqueadas e contagem por e-mail.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
          Atualizar
        </Button>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">E-mails</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Tentativas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{stats.totalAttempts}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Bloqueados agora</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-destructive">{stats.locked}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtro por data</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <DatePicker label="De" value={from} onChange={setFrom} />
          <DatePicker label="Até" value={to} onChange={setTo} />
          <Button variant="ghost" size="sm" onClick={clearFilters} disabled={!from && !to}>
            Limpar
          </Button>
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <Alert variant="destructive" className="border-destructive/40 bg-destructive/5">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Atenção ao reenviar</AlertTitle>
          <AlertDescription>
            Há falhas de autenticação registradas. Reenviar sem corrigir as
            credenciais (e-mail, senha ou token do provedor) pode falhar
            novamente e aumentar o bloqueio. Verifique o motivo antes de tentar
            de novo.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Lista de falhas{" "}
            <span className="text-sm font-normal text-muted-foreground">
              ({rows.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Nenhuma falha de autenticação no período selecionado.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Tentativas</TableHead>
                  <TableHead>Última tentativa</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const isLocked = r.locked_until && new Date(r.locked_until) > new Date();
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.email}</TableCell>
                      <TableCell>{r.attempt_count}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(r.last_attempt_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </TableCell>
                      <TableCell className="text-muted-foreground  text-xs">
                        {r.ip_address ?? "—"}
                      </TableCell>
                      <TableCell>
                        {isLocked ? (
                          <Badge variant="destructive">
                            Bloqueado até{" "}
                            {format(new Date(r.locked_until ?? ''), "HH:mm", { locale: ptBR })}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Liberado</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DatePicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Date | undefined;
  onChange: (d: Date | undefined) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "w-[200px] justify-start text-left font-normal",
              !value && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {value
              ? format(value, "dd/MM/yyyy", { locale: ptBR })
              : "Selecionar data"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={value}
            onSelect={onChange}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
