import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { queryKeys } from '@/services/api/queryKeys';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface SearchInsight {
  id: string;
  search_term: string;
  search_count: number;
  click_count: number;
}

/** Search Insights Tables. */
export function SearchInsightsTables() {
  const { data: insights = [], isLoading } = useQuery({
    queryKey: queryKeys.adminOps.searchInsights(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('search_insights')
        .select('*')
        .order('search_count', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as SearchInsight[];
    },
  });

  if (isLoading) {
    return <div className="p-4">Carregando...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Insights de Busca</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Termo</TableHead>
              <TableHead>Buscas</TableHead>
              <TableHead>Cliques</TableHead>
              <TableHead>Taxa de Clique</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {insights.map((insight) => (
              <TableRow key={insight.id}>
                <TableCell className="font-medium">{insight.search_term}</TableCell>
                <TableCell>{insight.search_count?.toLocaleString('pt-BR')}</TableCell>
                <TableCell>{insight.click_count?.toLocaleString('pt-BR')}</TableCell>
                <TableCell>
                  {insight.search_count > 0
                    ? `${((insight.click_count / insight.search_count) * 100).toFixed(1)}%`
                    : '0%'}
                </TableCell>
                <TableCell>
                  <Badge variant={insight.search_count > 100 ? 'default' : 'secondary'}>
                    {insight.search_count > 100 ? 'Popular' : 'Normal'}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}