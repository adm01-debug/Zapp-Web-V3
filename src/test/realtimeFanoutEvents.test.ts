import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ALL_EVENTS, parseEdgeEvents, type Evt } from '@/lib/realtime/edgeEvents';

export { parseEdgeEvents };

/**
 * Valida que os rótulos de evento nas arestas DB -.->|...| <Hook> do diagrama
 * batem com os tipos de evento (INSERT/UPDATE/DELETE) realmente assinados em
 * cada arquivo consumidor de postgres_changes na tabela 'messages'.
 *
 * Falha em duas direções:
 *   - aresta declara evento X que o hook NÃO assina;
 *   - hook assina evento X que NÃO aparece na aresta.
 *
 * Eventos reconhecidos: INSERT, UPDATE, DELETE. '*' expande para os três.
 * Palavras-chave depois do evento (ex: "UPDATE status", "INSERT KPIs") são
 * descritivas e ignoradas pelo parser.
 */

const REPO_ROOT = resolve(__dirname, '../..');
const MMD_PATH = resolve(__dirname, 'fixtures/TRILHA_MENSAGENS_NAVEGAVEL.mmd');
const UPDATE_HINT =
  'Atualize src/test/fixtures/TRILHA_MENSAGENS_NAVEGAVEL.mmd (e a cópia em /mnt/documents/).';

// Mapeia node id no .mmd -> caminho do arquivo no repo (espelha bloco `click`).
const NODE_TO_FILE: Record<string, string> = {
  // useRealtimeMessages/useMessageStatus em src/hooks/* são re-exports (shims);
  // a subscription real vive em features/inbox.
  // useMessages delega para messageRepository, que detém a subscrição postgres_changes.
  URM: 'src/features/inbox/hooks/useRealtimeMessages.ts',
  UM: 'src/features/inbox/data-access/messageRepository.ts',
  UMS: 'src/features/inbox/hooks/useMessageStatus.ts',
  UTN: 'src/hooks/useTranscriptionNotifications.ts',
  URD: 'src/hooks/useRealtimeDashboard.ts',
  UEM: 'src/components/monitoring/hooks/useEvolutionMonitoring.ts',
  AMP: 'src/features/inbox/components/useAudioMessagePlayer.ts',
};

function parseDiagramEdges(): Record<string, Set<Evt>> {
  const mmd = readFileSync(MMD_PATH, 'utf8');
  const re = /DB\s*-\.->\s*\|([^|]+)\|\s*(\w+)/g;
  const edges: Record<string, Set<Evt>> = {};
  let m: RegExpExecArray | null;
  while ((m = re.exec(mmd)) !== null) {
    edges[m[2]] = parseEdgeEvents(m[1]);
  }
  return edges;
}

// Captura todos os blocos `.on('postgres_changes', { ... table: <messages> ... })`
// dentro de um arquivo e extrai o `event:` de cada um.
// A tabela pode ser referenciada como literal (`table: 'messages'`) ou via o
// helper do datasource (`table: dbTable('messages')`), ambos aceitos aqui.
function parseFileEvents(absPath: string): Set<Evt> {
  const src = readFileSync(absPath, 'utf8');
  const blockRe = /\.on\(\s*['"]postgres_changes['"]\s*,\s*\{([\s\S]*?)\}\s*,/g;
  const out = new Set<Evt>();
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(src)) !== null) {
    const body = m[1];
    if (
      !/table:\s*(?:['"](?:messages|evolution_messages)['"]|dbTable\(\s*['"](?:messages|evolution_messages)['"]\s*\))/.test(
        body
      )
    )
      continue;
    const ev = body.match(/event:\s*['"]([A-Z*]+)['"]/);
    if (!ev) continue;
    if (ev[1] === '*') ALL_EVENTS.forEach((e) => out.add(e));
    else if ((ALL_EVENTS as string[]).includes(ev[1])) out.add(ev[1] as Evt);
  }
  return out;
}

describe('Diagrama TRILHA_MENSAGENS_NAVEGAVEL — eventos realtime nas arestas', () => {
  const diagram = parseDiagramEdges();

  for (const [node, file] of Object.entries(NODE_TO_FILE)) {
    it(`aresta DB -> ${node} (${file}) reflete os eventos assinados`, () => {
      const declared = diagram[node];
      expect(
        declared,
        `Aresta DB -.->|...| ${node} ausente no diagrama. ${UPDATE_HINT}`
      ).toBeDefined();

      const actual = parseFileEvents(resolve(REPO_ROOT, file));
      expect(actual.size, `${file} nao assina nenhum evento em table:'messages'.`).toBeGreaterThan(
        0
      );

      const missingInDiagram = [...actual].filter((e) => !declared!.has(e));
      const phantomInDiagram = [...declared!].filter((e) => !actual.has(e));

      if (missingInDiagram.length || phantomInDiagram.length) {
        const parts: string[] = [];
        if (missingInDiagram.length)
          parts.push(`faltam no diagrama: ${missingInDiagram.join(', ')}`);
        if (phantomInDiagram.length)
          parts.push(`fantasma no diagrama: ${phantomInDiagram.join(', ')}`);
        throw new Error(`Aresta DB -> ${node} desalinhada (${parts.join(' | ')}). ${UPDATE_HINT}`);
      }
    });
  }
});
