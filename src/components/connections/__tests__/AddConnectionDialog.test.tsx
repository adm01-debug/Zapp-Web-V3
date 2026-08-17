/**
 * Tests for <AddConnectionDialog /> — construção G7 (Inbox-add-connection).
 *
 * O componente é controlado (presentacional): o estado vive no pai
 * (useConnectionsManager/useConnectionsState). Este arquivo cobre:
 *
 * 1. FLUXO — contrato presentacional:
 *    - trigger "Nova conexão" sempre visível; conteúdo do dialog só quando `open`;
 *    - binding dos campos (nome, telefone, método) → `onNewConnectionChange`;
 *    - hint da API oficial (só quando api_type === 'official');
 *    - Cancelar → `onOpenChange(false)`; Adicionar → `onAdd`;
 *    - `isCreating` → botões desabilitados + "Criando..." + spinner;
 *    - `error` → alerta inline honesto (`role="alert"`, data-testid).
 *
 * 2. ERRO → TOAST — harness que espelha o contrato real do pai
 *    (`useConnectionsActions.handleAddConnection`): validação de nome/telefone
 *    (com a MESMA `validatePhoneDetailed` de produção) e criação; cada falha
 *    emite toast destrutivo E alerta inline, sem fechar o diálogo; o sucesso
 *    emite "Conexão criada!" e fecha o diálogo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { AddConnectionDialog, type NewConnectionData } from '../AddConnectionDialog';
import { useToast } from '@/hooks/use-toast';
import { validatePhoneDetailed } from '@/lib/phoneUtils';

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  toast: (p: unknown) => mockToast(p),
  useToast: () => ({ toast: (p: unknown) => mockToast(p) }),
}));

const NAME_INPUT_LABEL = 'Nome da conexão (identificação interna)';
const PHONE_PLACEHOLDER = '+55 11 99999-0000';
const DIALOG_DESCRIPTION = 'Configure os dados da conexão';

function makeConnectionData(over: Partial<NewConnectionData> = {}): NewConnectionData {
  return { name: 'Vendas', phone_number: '+55 11 98765-4321', api_type: 'evolution', ...over };
}

interface SetupOptions {
  open?: boolean;
  newConnection?: NewConnectionData;
  isCreating?: boolean;
  error?: string | null;
  onOpenChange?: (open: boolean) => void;
  onNewConnectionChange?: (c: NewConnectionData) => void;
  onAdd?: () => void;
}

/** Renderiza o dialog com spies default e devolve os spies para assert. */
function setup(options: SetupOptions = {}) {
  const onOpenChange = options.onOpenChange ?? vi.fn();
  const onNewConnectionChange = options.onNewConnectionChange ?? vi.fn();
  const onAdd = options.onAdd ?? vi.fn();
  render(
    <AddConnectionDialog
      open={options.open ?? true}
      onOpenChange={onOpenChange}
      newConnection={options.newConnection ?? makeConnectionData()}
      onNewConnectionChange={onNewConnectionChange}
      isCreating={options.isCreating ?? false}
      error={options.error ?? null}
      onAdd={onAdd}
    />
  );
  return { onOpenChange, onNewConnectionChange, onAdd };
}

// ── FLUXO — contrato presentacional ──────────────────────────────────────────

describe('<AddConnectionDialog /> — fluxo (contrato presentacional)', () => {
  beforeEach(() => {
    mockToast.mockClear();
  });

  it('mostra o trigger "Nova conexão" sempre, e o conteúdo do dialog só com open=true', () => {
    setup({ open: false });
    expect(screen.getByRole('button', { name: /Nova conexão/i })).toBeInTheDocument();
    // Conteúdo do dialog NÃO está montado enquanto fechado.
    expect(screen.queryByText(DIALOG_DESCRIPTION)).not.toBeInTheDocument();

    setup({ open: true });
    expect(screen.getByText('Conectar WhatsApp')).toBeInTheDocument();
    expect(screen.getByText(DIALOG_DESCRIPTION)).toBeInTheDocument();
  });

  it('reflete newConnection.name no input e propaga mudanças via onNewConnectionChange', () => {
    const { onNewConnectionChange } = setup({
      newConnection: makeConnectionData({ name: 'Financeiro' }),
    });
    const input = screen.getByLabelText(NAME_INPUT_LABEL) as HTMLInputElement;
    expect(input.value).toBe('Financeiro');

    fireEvent.change(input, { target: { value: 'SAC' } });
    expect(onNewConnectionChange).toHaveBeenCalledWith({
      name: 'SAC',
      phone_number: '+55 11 98765-4321',
      api_type: 'evolution',
    });
  });

  it('reflete phone_number no campo de telefone e propaga o valor formatado', () => {
    const { onNewConnectionChange } = setup({
      newConnection: makeConnectionData({ phone_number: '+55 11 91234-5678' }),
    });
    const input = screen.getByPlaceholderText(PHONE_PLACEHOLDER) as HTMLInputElement;
    expect(input.value).toContain('91234-5678');

    // Digitar DDD direto auto-prefixa +55 (comportamento do PhoneInput).
    fireEvent.change(input, { target: { value: '11988887777' } });
    expect(onNewConnectionChange).toHaveBeenCalledWith(
      expect.objectContaining({ phone_number: expect.stringContaining('98888-7777') })
    );
  });

  it('propaga a troca de método de conexão (evolution → official) via onNewConnectionChange', async () => {
    const { onNewConnectionChange } = setup();
    // O valor atual aparece no trigger do Select.
    expect(screen.getByText('Não-oficial (Evolution API)')).toBeInTheDocument();

    // happy-dom não seta pointerType='mouse' no pointerDown (Radix exige para
    // abrir) — abre via teclado e seleciona com Enter direto no option.
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' });
    const official = await screen.findByRole('option', {
      name: /Oficial \(WhatsApp Cloud API\)/,
    });
    fireEvent.keyDown(official, { key: 'Enter' });
    expect(onNewConnectionChange).toHaveBeenCalledWith({
      name: 'Vendas',
      phone_number: '+55 11 98765-4321',
      api_type: 'official',
    });
  });

  it('mostra o hint da API oficial apenas quando api_type === "official"', () => {
    setup({ newConnection: makeConnectionData({ api_type: 'evolution' }) });
    expect(screen.queryByText(/A API oficial não usa QR Code/i)).not.toBeInTheDocument();

    setup({ newConnection: makeConnectionData({ api_type: 'official' }) });
    expect(screen.getByText(/A API oficial não usa QR Code/i)).toBeInTheDocument();
  });

  it('Cancelar chama onOpenChange(false)', () => {
    const { onOpenChange } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('Adicionar chama onAdd', () => {
    const { onAdd } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('isCreating desabilita os botões, mostra "Criando..." + spinner e NÃO chama onAdd', () => {
    const { onAdd } = setup({ isCreating: true });
    const add = screen.getByRole('button', { name: /Criando\.\.\./i }) as HTMLButtonElement;
    const cancel = screen.getByRole('button', { name: 'Cancelar' }) as HTMLButtonElement;
    expect(add).toBeDisabled();
    expect(cancel).toBeDisabled();
    expect(add).toHaveTextContent('Criando...');
    expect(add.querySelector('.animate-spin')).not.toBeNull();

    fireEvent.click(add);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('exibe o alerta inline de erro (role="alert") apenas quando error é preenchido', () => {
    setup({ error: 'Falha ao criar instância na Evolution.' });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Falha ao criar instância na Evolution.');
    expect(alert).toHaveAttribute('data-testid', 'add-connection-error');

    setup({ error: null });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

// ── ERRO → TOAST — harness espelhando o contrato do pai ─────────────────────

interface HarnessProps {
  createImpl: (c: NewConnectionData) => Promise<unknown>;
}

/**
 * Réplica do contrato de `useConnectionsActions.handleAddConnection`:
 * valida nome → telefone (validatePhoneDetailed de produção) → criação;
 * falhas emitem toast destrutivo + alerta inline; sucesso emite toast e fecha.
 */
function Harness({ createImpl }: HarnessProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newConnection, setNewConnection] = useState<NewConnectionData>({
    name: '',
    phone_number: '',
    api_type: 'evolution',
  });

  const handleAdd = async () => {
    setError(null);
    if (!newConnection.name) {
      toast({ title: 'Nome é obrigatório', variant: 'destructive' });
      setError('Informe um nome para a conexão.');
      return;
    }
    const phoneValidation = validatePhoneDetailed(newConnection.phone_number);
    if (!phoneValidation.valid) {
      const phoneError =
        phoneValidation.error ?? 'Informe um número brasileiro válido (ex.: 11 99999-9999).';
      toast({ title: 'Número de telefone inválido', description: phoneError, variant: 'destructive' });
      setError(phoneError);
      return;
    }
    setIsCreating(true);
    try {
      await createImpl(newConnection);
      toast({ title: 'Conexão criada!' });
      setOpen(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast({ title: 'Erro ao criar conexão', description: msg, variant: 'destructive' });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <AddConnectionDialog
      open={open}
      onOpenChange={setOpen}
      newConnection={newConnection}
      onNewConnectionChange={setNewConnection}
      isCreating={isCreating}
      error={error}
      onAdd={() => void handleAdd()}
    />
  );
}

function fillName(name: string) {
  fireEvent.change(screen.getByLabelText(NAME_INPUT_LABEL), { target: { value: name } });
}

function fillPhone(digits: string) {
  fireEvent.change(screen.getByPlaceholderText(PHONE_PLACEHOLDER), { target: { value: digits } });
}

describe('<AddConnectionDialog /> — erro → toast (fluxo do pai)', () => {
  beforeEach(() => {
    mockToast.mockClear();
  });

  it('nome vazio → toast "Nome é obrigatório" + alerta inline; nada é criado e o diálogo permanece aberto', async () => {
    const createImpl = vi.fn(async () => ({}));
    render(<Harness createImpl={createImpl} />);

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Nome é obrigatório', variant: 'destructive' })
      )
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Informe um nome para a conexão.');
    expect(createImpl).not.toHaveBeenCalled();
    // Diálogo continua aberto — nunca fecha silenciosamente em erro.
    expect(screen.getByText(DIALOG_DESCRIPTION)).toBeInTheDocument();
  });

  it('telefone inválido → toast "Número de telefone inválido" + alerta inline; nada é criado', async () => {
    const createImpl = vi.fn(async () => ({}));
    render(<Harness createImpl={createImpl} />);

    fillName('Vendas');
    fillPhone('123');
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Número de telefone inválido', variant: 'destructive' })
      )
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(createImpl).not.toHaveBeenCalled();
  });

  it('falha na criação → toast "Erro ao criar conexão" (destrutivo) + alerta inline; diálogo permanece aberto', async () => {
    const createImpl = vi.fn(async () => {
      throw new Error('Evolution timeout');
    });
    render(<Harness createImpl={createImpl} />);

    fillName('Vendas');
    fillPhone('11987654321');
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Evolution timeout');
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Erro ao criar conexão',
          description: 'Evolution timeout',
          variant: 'destructive',
        })
      )
    );
    // Honestidade: o erro aparece DENTRO do diálogo, que não fecha.
    expect(screen.getByText(DIALOG_DESCRIPTION)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Adicionar' })).toBeEnabled();
  });

  it('sucesso → toast "Conexão criada!" e o diálogo fecha', async () => {
    const createImpl = vi.fn(async () => ({}));
    render(<Harness createImpl={createImpl} />);

    fillName('Vendas');
    fillPhone('11987654321');
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Conexão criada!' }))
    );
    await waitFor(() => expect(screen.queryByText(DIALOG_DESCRIPTION)).not.toBeInTheDocument());
  });

  it('mostra "Criando..." enquanto a criação está pendente; no erro, reabilita os botões e mantém o diálogo aberto', async () => {
    let rejectCreate!: (e: Error) => void;
    const createImpl = vi.fn(
      () => new Promise<unknown>((_resolve, reject) => (rejectCreate = reject))
    );
    render(<Harness createImpl={createImpl} />);

    fillName('Vendas');
    fillPhone('11987654321');
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    // Durante a promise pendente: spinner + botões desabilitados.
    const add = await screen.findByRole('button', { name: /Criando\.\.\./i });
    expect(add).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    expect(createImpl).toHaveBeenCalledTimes(1);

    await act(async () => {
      rejectCreate(new Error('timeout'));
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Adicionar' })).toBeEnabled()
    );
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeEnabled();
    // Erro honesto: alerta inline + diálogo permanece aberto.
    expect(screen.getByRole('alert')).toHaveTextContent('timeout');
    expect(screen.getByText(DIALOG_DESCRIPTION)).toBeInTheDocument();
  });
});
