/**
 * Simulações do ErrorBoundary — fixes de UI/deploy (PR #645).
 *
 * Protege exatamente o contrato corrigido em ErrorBoundary.tsx:
 *   FIX F2 (render): `if (this.props.fallback !== undefined)` — fallback={null}
 *   (usado no DeferredProviders do App.tsx) renderiza NADA em vez do card de
 *   erro padrão; fallback ausente/undefined renderiza o card completo.
 *   Chunk-load errors: componentDidCatch delega para detectAndReloadOnChunkError
 *   (isChunkLoadError + triggerChunkReload com cooldown de 30s em sessionStorage)
 *   — reload chamado fora do cooldown e telemetria/onError suprimidos; dentro do
 *   cooldown o reload é evitado (loop guard) e o fluxo normal segue.
 *
 * Inclui verificações estáticas de fonte (sem renderizar):
 *   - App.tsx: 5 lazyWithRetry, zero lazy() cru, ErrorBoundary fallback={null}
 *
 * Nota: as verificações de vercel.json (rewrite SPA, headers imutáveis para
 * /assets/(.*)) foram removidas em 2026-08-21 — Vercel foi aposentada para o
 * ZAPP (deploy 100% VPS, ver CLAUDE.md); o comportamento equivalente
 * (try_files SPA fallback + Cache-Control immutable em /assets/) vive em
 * nginx.conf, não testado aqui.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ErrorInfo } from 'react';
import { ErrorBoundary } from '@/components/errors/ErrorBoundary';
import { CHUNK_RELOAD_SESSION_KEY } from '@/lib/lazyWithRetry';
import type { QueryEvent, Severity } from '@/lib/clientTelemetry';

/** Assinatura real de recordQueryEvent (src/lib/clientTelemetry.ts:176). */
type RecordQueryEventFn = (
  ev: Omit<QueryEvent, 'severity'> & { severity?: Severity }
) => QueryEvent;

// vi.hoisted: roda ANTES do hoisting do vi.mock — a factory do mock pode
// referenciar a variável sem TDZ (padrão à prova de transform do runner).
const { mockRecordQueryEvent } = vi.hoisted(() => ({
  mockRecordQueryEvent: vi.fn<RecordQueryEventFn>(),
}));

// Telemetria e logger são infra — mocks estreitos para isolar o boundary.
// clientTelemetry não é importado por mais ninguém no grafo do teste.
vi.mock('@/lib/clientTelemetry', () => ({
  recordQueryEvent: mockRecordQueryEvent,
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
  // createLogger existe para consumidores transitivos (shim externalClient).
  createLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

/** Lança erro síncrono no render (erro de negócio comum). */
function Boom(): never {
  throw new Error('boom no render');
}

/** Lança erro de chunk-load (stale hash pós-deploy) no render. */
function BoomChunk(): never {
  throw new Error('Failed to fetch dynamically imported module: /assets/index-abc123.js');
}

beforeEach(() => {
  vi.clearAllMocks();
  // React 18 loga erros capturados por boundaries no console — silenciar para
  // não poluir o output; as asserções validam o comportamento real.
  vi.spyOn(console, 'error').mockImplementation(() => {});
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe('ErrorBoundary — fallback null vs undefined vs default', () => {
  it('renderiza os filhos normalmente quando NÃO há erro', () => {
    render(
      <ErrorBoundary>
        <div>conteudo normal</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('conteudo normal')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('fallback={null} → renderiza NADA (container vazio), sem o card de erro padrão', () => {
    const { container } = render(
      <ErrorBoundary fallback={null}>
        <Boom />
      </ErrorBoundary>
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('Ops! Algo deu errado')).not.toBeInTheDocument();
  });

  it('fallback={undefined} explícito → card de erro padrão (condição !== undefined)', () => {
    render(
      <ErrorBoundary fallback={undefined}>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Ops! Algo deu errado')).toBeInTheDocument();
  });

  it('sem prop fallback → card de erro padrão com ações Tentar novamente / Voltar ao início', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Ops! Algo deu errado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Voltar ao início' })).toBeInTheDocument();
    expect(screen.getByText('Ou recarregue a página completamente')).toBeInTheDocument();
  });

  it('fallback custom → renderiza o fallback, não o card padrão', () => {
    render(
      <ErrorBoundary fallback={<div>fallback custom</div>}>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByText('fallback custom')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('erro não-chunk + fallback={null} → nada renderizado, MAS telemetria e onError rodam', () => {
    const onError = vi.fn<(error: Error, errorInfo: ErrorInfo) => void>();
    const { container } = render(
      <ErrorBoundary fallback={null} onError={onError}>
        <Boom />
      </ErrorBoundary>
    );
    expect(container.firstChild).toBeNull();
    expect(mockRecordQueryEvent).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe('ErrorBoundary — chunk-load errors (detectAndReloadOnChunkError)', () => {
  it('chunk error + fallback={null} + sem cooldown → reload chamado, telemetria/onError suprimidos, nada renderizado', () => {
    const reloadSpy = vi.spyOn(window.location, 'reload').mockImplementation(() => {});
    const onError = vi.fn<(error: Error, errorInfo: ErrorInfo) => void>();
    const { container } = render(
      <ErrorBoundary fallback={null} onError={onError}>
        <BoomChunk />
      </ErrorBoundary>
    );
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    // triggerChunkReload grava o timestamp ANTES de chamar reload.
    const stamped = Number(sessionStorage.getItem(CHUNK_RELOAD_SESSION_KEY) ?? '0');
    expect(stamped).toBeGreaterThan(Date.now() - 5000);
    expect(container.firstChild).toBeNull();
    expect(mockRecordQueryEvent).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('chunk error + fallback={null} + cooldown ativo → reload NÃO chamado (evita loop), telemetria gravada', () => {
    const reloadSpy = vi.spyOn(window.location, 'reload').mockImplementation(() => {});
    sessionStorage.setItem(CHUNK_RELOAD_SESSION_KEY, String(Date.now()));
    const { container } = render(
      <ErrorBoundary fallback={null}>
        <BoomChunk />
      </ErrorBoundary>
    );
    expect(reloadSpy).not.toHaveBeenCalled();
    expect(container.firstChild).toBeNull();
    expect(mockRecordQueryEvent).toHaveBeenCalledTimes(1);
  });

  it('chunk error + sem fallback + cooldown ativo → card dedicado "Atualização disponível" com "Recarregar Página"', () => {
    const reloadSpy = vi.spyOn(window.location, 'reload').mockImplementation(() => {});
    sessionStorage.setItem(CHUNK_RELOAD_SESSION_KEY, String(Date.now()));
    render(
      <ErrorBoundary>
        <BoomChunk />
      </ErrorBoundary>
    );
    expect(reloadSpy).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Atualização disponível')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recarregar Página' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Voltar ao início' })).toBeInTheDocument();
    // Chunk error: o botão "Tentar novamente" (retry do mesmo chunk) não faz sentido.
    expect(screen.queryByRole('button', { name: 'Tentar novamente' })).not.toBeInTheDocument();
  });

  it('chunk error + sem fallback + sem cooldown → reload chamado e card chunk commitado', () => {
    const reloadSpy = vi.spyOn(window.location, 'reload').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <BoomChunk />
      </ErrorBoundary>
    );
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    // getDerivedStateFromError já commitou hasError=true antes do
    // componentDidCatch dar early-return — o card chunk aparece mesmo assim.
    expect(screen.getByText('Atualização disponível')).toBeInTheDocument();
    expect(mockRecordQueryEvent).not.toHaveBeenCalled();
  });
});

describe('ErrorBoundary — recuperação (onError, resetKey, retry)', () => {
  it('onError recebe o erro capturado', () => {
    const onError = vi.fn<(error: Error, errorInfo: ErrorInfo) => void>();
    render(
      <ErrorBoundary onError={onError}>
        <Boom />
      </ErrorBoundary>
    );
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(onError.mock.calls[0][0].message).toBe('boom no render');
  });

  it('resetKey mudou → limpa o erro, filhos renderizam e onReset dispara', () => {
    const onReset = vi.fn<() => void>();
    const { rerender } = render(
      <ErrorBoundary resetKey={0} onReset={onReset}>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();

    rerender(
      <ErrorBoundary resetKey={1} onReset={onReset}>
        <div>filho recuperado</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('filho recuperado')).toBeInTheDocument();
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('botão "Tentar novamente" limpa o erro, re-renderiza filhos e dispara onReset', () => {
    let shouldThrow = true;
    const onReset = vi.fn<() => void>();
    function ConditionalBoom() {
      if (shouldThrow) throw new Error('boom condicional');
      return <div>recuperado apos retry</div>;
    }
    render(
      <ErrorBoundary onReset={onReset}>
        <ConditionalBoom />
      </ErrorBoundary>
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();

    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(screen.getByText('recuperado apos retry')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});

describe('App.tsx — verificação estática (sem renderizar)', () => {
  const APP_SOURCE = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');

  it('usa lazyWithRetry para todos os componentes lazy do App (5 providers diferidos + 4 debug widgets + 1 DeferredHooks = 10)', () => {
    // FIX perf TTM phase-07: BuildValidationOverlay, HardResetButton,
    // SwDebugWidget e ThemeDebugger passaram a lazyWithRetry (antes estáticos).
    // DeferredHooks (hooks pós-primeira-pintura: useServiceWorker,
    // useScreenProtection, buildVersion) também é lazyWithRetry.
    expect(APP_SOURCE.match(/lazyWithRetry\(/g) ?? []).toHaveLength(10);
  });

  it('NÃO usa lazy() cru (zero ocorrências de "= lazy(" e de lazy() com word boundary)', () => {
    expect(APP_SOURCE.split('= lazy(').length - 1).toBe(0);
    expect(APP_SOURCE.match(/\blazy\(/g) ?? []).toHaveLength(0);
  });

  it('envolve o DeferredProviders com <ErrorBoundary fallback={null}>', () => {
    expect(APP_SOURCE).toContain('<ErrorBoundary');
    expect(APP_SOURCE).toContain('fallback={null}');
    expect(APP_SOURCE).toContain('</ErrorBoundary>');
  });
});

// describe('vercel.json — verificação estática') REMOVIDO no PR #1355: a Vercel
// foi aposentada para o ZAPP (2026-08-20 — domínio www.zappweb.app.br migrado
// para o VPS; Traefik router `zappweb-www` inline no stack 157) e o vercel.json
// saiu do repo — o readFileSync na raiz derrubava a suíte inteira (ENOENT).
// O rewrite SPA e o Cache-Control de /assets agora são responsabilidade do
// Traefik/host no VPS — o gate equivalente abaixo (nginx.conf, adicionado no
// review do PR #1354) fecha a lacuna: sem ele, uma regressão nesses dois
// comportamentos de deploy passaria pelo CI sem detecção.
describe('nginx.conf — verificação estática (sem renderizar)', () => {
  const NGINX_SOURCE = readFileSync(resolve(process.cwd(), 'nginx.conf'), 'utf8');

  it('faz fallback SPA via try_files para /index.html', () => {
    expect(NGINX_SOURCE).toMatch(/try_files\s+\$uri\s+\$uri\/\s+\/index\.html/);
  });

  it('serve /assets/ com Cache-Control public, immutable', () => {
    const assetsBlock = NGINX_SOURCE.match(/location\s+\/assets\/\s*\{[\s\S]*?\}/)?.[0] ?? '';
    expect(assetsBlock).toContain('Cache-Control "public, immutable"');
  });
});
