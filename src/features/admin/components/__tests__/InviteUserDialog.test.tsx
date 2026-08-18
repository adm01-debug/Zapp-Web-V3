/**
 * InviteUserDialog — UI do convite (E57, Etapa 57.5).
 *
 * Contrato:
 *   <InviteUserDialog open onOpenChange onInvite />
 *   onInvite(payload) → Promise<boolean>  (true = sucesso → fecha e limpa)
 *
 * Eixos: validação de email (vazio/inválido → erro inline, sem chamada),
 * submit chama onInvite com { email, role, message }, sucesso fecha o dialog,
 * falha mantém aberto com erro inline (reenvio), botão desabilitado durante
 * o envio.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { InviteUserDialog } from '../InviteUserDialog';

function setup(onInvite: (payload: { email: string; role: 'admin' | 'supervisor' | 'agent'; message?: string }) => Promise<boolean>) {
  const onOpenChange = vi.fn();
  render(<InviteUserDialog open onOpenChange={onOpenChange} onInvite={onInvite} />);
  return { onOpenChange };
}

describe('InviteUserDialog (E57)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('envia convite com email, role e mensagem; sucesso fecha o dialog', async () => {
    const onInvite = vi.fn().mockResolvedValue(true);
    const { onOpenChange } = setup(onInvite);

    fireEvent.change(screen.getByLabelText('Email *'), { target: { value: 'novo@atomica.br' } });
    fireEvent.change(screen.getByLabelText('Mensagem (opcional)'), { target: { value: 'Bem-vindo!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar Convite' }));

    await waitFor(() => expect(onInvite).toHaveBeenCalledTimes(1));
    expect(onInvite).toHaveBeenCalledWith({
      email: 'novo@atomica.br',
      role: 'agent',
      message: 'Bem-vindo!',
    });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('falha do convite mantém o dialog aberto com erro inline (reenvio)', async () => {
    const onInvite = vi.fn().mockResolvedValue(false);
    const { onOpenChange } = setup(onInvite);

    fireEvent.change(screen.getByLabelText('Email *'), { target: { value: 'duplicado@atomica.br' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar Convite' }));

    await waitFor(() => expect(onInvite).toHaveBeenCalledTimes(1));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível enviar o convite');
  });

  it('email vazio → erro inline sem chamar onInvite', async () => {
    const onInvite = vi.fn().mockResolvedValue(true);
    setup(onInvite);

    fireEvent.click(screen.getByRole('button', { name: 'Enviar Convite' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Email é obrigatório');
    expect(onInvite).not.toHaveBeenCalled();
  });

  it('email inválido → erro inline sem chamar onInvite', async () => {
    const onInvite = vi.fn().mockResolvedValue(true);
    setup(onInvite);

    fireEvent.change(screen.getByLabelText('Email *'), { target: { value: 'nao-e-email' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar Convite' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Email inválido');
    expect(onInvite).not.toHaveBeenCalled();
  });
});
