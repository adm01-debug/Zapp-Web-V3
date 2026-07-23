/**
 * AdminExternalDbExplorerPage — `/admin/external-db-explorer`
 *
 * Painel admin read-only para testar a conexão com o Postgres externo
 * (FATOR X — `tdprnylgyrogbbhgdoik`) via edge function `external-db-proxy`
 * e explorar amostras das tabelas / RPCs do domínio `evolution_*`.
 *
 * Não escreve nada no banco. Não expõe credenciais. Toda chamada é
 * roteada por `queryExternalProxy` (telemetry + breaker + retry).
 */
import { useRef } from 'react';
import { Database } from 'lucide-react';
import { HealthCheckBlock } from './external-db-explorer/HealthCheckBlock';
import { TableCatalogBlock } from './external-db-explorer/TableCatalogBlock';
import { QueryExplorerBlock, type QueryExplorerHandle } from './external-db-explorer/QueryExplorerBlock';

/** Admin page for read-only exploration of the external Evolution DB via the external-db-proxy edge function. */
export default function AdminExternalDbExplorerPage() {
  const explorerRef = useRef<QueryExplorerHandle>(null);

  const onPickTable = (table: string) => {
    explorerRef.current?.setTable(table);
    // scroll suave até o explorador
    requestAnimationFrame(() => {
      document.getElementById('query-explorer-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-4 max-w-6xl">
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Database className="h-6 w-6" /> Explorador FATOR X
          </h1>
          <p className="text-sm text-muted-foreground">
            Testa conexão e consulta amostras do Postgres externo via{' '}
            <code className="text-xs">external-db-proxy</code>. Read-only.
          </p>
        </div>
      </header>

      <HealthCheckBlock />
      <TableCatalogBlock onPickTable={onPickTable} />
      <div id="query-explorer-anchor" />
      <QueryExplorerBlock ref={explorerRef} />
    </div>
  );
}
