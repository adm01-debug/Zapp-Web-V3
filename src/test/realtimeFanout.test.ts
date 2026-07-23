import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Validador do diagrama de fan-out realtime de mensagens.
 *
 * Falha quando:
 *  1. Um nó clicável do .mmd referencia arquivo que não existe (hook removido/renomeado).
 *  2. Um arquivo do código escuta postgres_changes em table:'messages' mas NÃO está no diagrama.
 *  3. Um consumidor listado no diagrama não escuta mais a tabela messages.
 *
 * Fonte da verdade do diagrama: src/test/fixtures/TRILHA_MENSAGENS_NAVEGAVEL.mmd
 * (cópia sincronizada de /mnt/documents/TRILHA_MENSAGENS_NAVEGAVEL.mmd)
 */

const REPO_ROOT = resolve(__dirname, '../..');
const MMD_PATH = resolve(__dirname, 'fixtures/TRILHA_MENSAGENS_NAVEGAVEL.mmd');

// Allowlist canônica — extraída dos comentários %% no rodapé do .mmd.
// Ao alterar consumidores realtime de 'messages', atualize AMBOS: diagrama e esta lista.
const EXPECTED_REALTIME_CONSUMERS: string[] = [
  'src/features/inbox/hooks/useRealtimeMessages.ts',
  'src/features/inbox/data-access/messageRepository.ts',
  'src/features/inbox/hooks/useMessageStatus.ts',
  'src/hooks/useRealtimeManagement.ts',
  'src/components/monitoring/hooks/useEvolutionMonitoring.ts',
  'src/features/inbox/components/useAudioMessagePlayer.ts',
  'src/features/inbox/hooks/realtime/useRetryResolutionAlerts.ts',
  'src/features/inbox/components/chat/ChatMessagesArea.tsx',
  'src/hooks/useRealtimeMessages.ts',
  'src/hooks/useTranscriptionNotifications.ts',
];

const UPDATE_HINT =
  'Atualize src/test/fixtures/TRILHA_MENSAGENS_NAVEGAVEL.mmd (e a cópia em /mnt/documents/).';

function readMmd(): string {
  return readFileSync(MMD_PATH, 'utf8');
}

function extractClickPaths(mmd: string): Array<{ node: string; path: string }> {
  const re = /click\s+(\w+)\s+"([^"]+)"/g;
  const out: Array<{ node: string; path: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(mmd)) !== null) out.push({ node: m[1], path: m[2] });
  return out;
}

function walk(dir: string, acc: string[] = []): string[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const name of entries) {
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === '__tests__' || name === 'test' || name === 'fixtures')
        continue;
      walk(full, acc);
    } else if (st.isFile()) {
      if (/\.(test|spec)\.(ts|tsx)$/.test(name)) continue;
      if (/\.(ts|tsx)$/.test(name)) acc.push(full);
    }
  }
  return acc;
}

// Aceita literal `table: 'messages'|'evolution_messages'` e helper `table: dbTable(...)`,
// independentemente de o channel vir de `supabase.channel(...)` ou `dbChannel(...)`.
// 'evolution_messages' é o nome da tabela no schema 'evo' (FATOR X v6.2).
const MESSAGES_CHANNEL_RE =
  /(?:supabase\s*\.channel|dbChannel)\([\s\S]*?table:\s*(?:dbTable\(\s*)?['"](?:messages|evolution_messages)['"]/;

function findMessagesListeners(): string[] {
  const srcDir = join(REPO_ROOT, 'src');
  const files = walk(srcDir);
  const hits: string[] = [];
  for (const f of files) {
    let content: string;
    try {
      content = readFileSync(f, 'utf8');
    } catch {
      continue;
    }
    if (MESSAGES_CHANNEL_RE.test(content)) {
      hits.push(f.substring(REPO_ROOT.length + 1).replace(/\\/g, '/'));
    }
  }
  return hits;
}

describe('Diagrama TRILHA_MENSAGENS_NAVEGAVEL — validador de fan-out realtime', () => {
  it('todos os caminhos clicaveis no diagrama existem no repositorio', () => {
    const mmd = readMmd();
    const clicks = extractClickPaths(mmd);
    expect(clicks.length).toBeGreaterThan(0);

    const missing = clicks.filter(({ path }) => !existsSync(resolve(REPO_ROOT, path)));
    if (missing.length > 0) {
      const list = missing.map(({ node, path }) => `  - ${node} -> ${path}`).join('\n');
      throw new Error(
        `Arquivo(s) referenciado(s) no diagrama nao existe(m):\n${list}\n${UPDATE_HINT}`
      );
    }
  });

  it('todo arquivo que escuta postgres_changes em messages esta no diagrama', () => {
    // Infraestrutura/builders não são consumidores e ficam fora do diagrama.
    const INFRA_IGNORELIST = new Set<string>([
      'src/integrations/datasource/db.ts',
      'src/integrations/datasource/registry.ts',
      'src/services/messages/messagesRepository.ts',
    ]);
    const listeners = findMessagesListeners().filter((p) => !INFRA_IGNORELIST.has(p));
    const orphans = listeners.filter((p) => !EXPECTED_REALTIME_CONSUMERS.includes(p));
    if (orphans.length > 0) {
      throw new Error(
        `Arquivo(s) escutam table:'messages' mas NAO estao no diagrama:\n` +
          orphans.map((p) => `  - ${p}`).join('\n') +
          `\n${UPDATE_HINT}`
      );
    }
  });

  it('todo consumidor listado no diagrama ainda escuta postgres_changes em messages', () => {
    const listeners = new Set(findMessagesListeners());
    const phantoms = EXPECTED_REALTIME_CONSUMERS.filter((p) => !listeners.has(p));
    if (phantoms.length > 0) {
      throw new Error(
        `Consumidor(es) listado(s) no diagrama nao escutam mais table:'messages':\n` +
          phantoms.map((p) => `  - ${p}`).join('\n') +
          `\n${UPDATE_HINT}`
      );
    }
  });
});
