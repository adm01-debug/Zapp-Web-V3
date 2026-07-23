import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { HealthHistoryRow } from '@/lib/evoApiHealth/types';

interface HistoryTabProps {
  history?: HealthHistoryRow[];
}

/** History Tab component for the evoApiHealth section. */
export const HistoryTab = React.memo(({ history }: HistoryTabProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Últimas 24h (snapshot a cada 5min)</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px]">
          <table className="w-full text-sm" aria-label="Histórico de snapshots das últimas 24h">
            <thead className="border-b text-left text-muted-foreground">
              <tr>
                <th scope="col" className="py-2 pr-3">
                  Bucket
                </th>
                <th scope="col" className="py-2 pr-3">
                  Inst. abertas
                </th>
                <th scope="col" className="py-2 pr-3">
                  Pico msgs/5m
                </th>
                <th scope="col" className="py-2 pr-3">
                  Lag médio
                </th>
                <th scope="col" className="py-2 pr-3">
                  Lag máx
                </th>
                <th scope="col" className="py-2">
                  OK?
                </th>
              </tr>
            </thead>
            <tbody>
              {history?.map((h, _idx) => (
                <tr key={h.bucket} className="border-b border-border/50">
                  <td className="whitespace-nowrap py-1.5 pr-3">
                    {new Date(h.bucket).toLocaleString('pt-BR')}
                  </td>
                  <td className="py-1.5 pr-3">{h.avg_instances_open}</td>
                  <td className="py-1.5 pr-3">{h.peak_messages_5m}</td>
                  <td className="py-1.5 pr-3">{h.avg_lag_sec}s</td>
                  <td className="py-1.5 pr-3">{h.max_lag_sec}s</td>
                  <td className="py-1.5">{h.all_ok ? '🟢' : '🔴'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
});
