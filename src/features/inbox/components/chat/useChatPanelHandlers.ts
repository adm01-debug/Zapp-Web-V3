import { useState, useRef, useCallback } from 'react';
import { log } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import { undoToast } from '@/lib/undoToast';
import { useAuth } from '@/features/auth';
import { Message, InteractiveMessage, InteractiveButton, LocationMessage } from '@/types/chat';
import { SlashCommand } from '../SlashCommands';
import { ExternalProduct } from '@/hooks/useExternalCatalog';
import { toast } from '@/hooks/use-toast';
import { dbFrom } from '@/integrations/datasource/db';
import { isValidUUID } from '@/utils/uuid';
import { type DialogKey } from './hooks/useChatDialogs';
import { type ActiveTool } from './ChatHeaderToolbar';

interface UseChatPanelHandlersOptions {
  conversationId: string;
  contactId: string;
  contactPhone: string;
  instanceName?: string;
  onSendMessage: (content: string, attachments?: File[], onProgress?: (p: number) => void) => void;
  editMessageApi: (instance: string, params: { number: string; messageId: string; text: string }) => Promise<any>;
  applySignature: (text: string) => string;
  handleTypingStart: () => void;
  handleTypingStop: () => void;
  openDialog: (key: DialogKey) => void;
  closeDialog: (key: DialogKey) => void;
  handleSetActiveTool: (tool: ActiveTool) => void;
}

export function useChatPanelHandlers(opts: UseChatPanelHandlersOptions) {
  const { contactPhone, instanceName, onSendMessage, editMessageApi, applySignature, handleTypingStart, handleTypingStop, openDialog, closeDialog, handleSetActiveTool } = opts;
  const { profile } = useAuth();
  const [inputValue, setInputValue] = useState('');
  const [isWhisper, setIsWhisper] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [lastSendError, setLastSendError] = useState<string | null>(null);
  const [lastSendErrorDetail, setLastSendErrorDetail] = useState<string | null>(null);
  const lastFailedPayloadRef = useRef<string | null>(null);
  const lastFailedAudioRef = useRef<{ blob: Blob; onSendAudio: (blob: Blob) => Promise<void>; } | null>(null);
  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null);
  const [sendProgress, setSendProgress] = useState(0);
  const [forwardMessage, setForwardMessage] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const inputValueRef = useRef(inputValue); inputValueRef.current = inputValue;
  const isSendingRef = useRef(isSending); isSendingRef.current = isSending;
  const editingMessageRef = useRef(editingMessage); editingMessageRef.current = editingMessage;
  const replyToMessageRef = useRef(replyToMessage); replyToMessageRef.current = replyToMessage;
  const isWhisperRef = useRef(isWhisper); isWhisperRef.current = isWhisper;

  const EDIT_WINDOW_MINUTES = 15;

  const handleEditStart = useCallback((message: Message) => {
    const minutesAgo = (Date.now() - message.timestamp.getTime()) / 60000;
    if (minutesAgo > EDIT_WINDOW_MINUTES) { toast({ title: 'Tempo expirado', description: `Voce so pode editar mensagens nos primeiros ${EDIT_WINDOW_MINUTES} minutos.`, variant: 'destructive' }); return; }
    setEditingMessage(message); setInputValue(message.content); inputRef.current?.focus();
  }, []);

  const handleCancelEdit = useCallback(() => { setEditingMessage(null); setInputValue(''); }, []);

  const handleSend = useCallback(async (attachments?: File[]) => {
    const currentInput = inputValueRef.current;
    if (!currentInput.trim() || isSendingRef.current) return;

    const currentEditing = editingMessageRef.current;
    if (currentEditing) {
      const externalId = currentEditing.external_id;
      const contactJid = contactPhone ? `${contactPhone}@s.whatsapp.net` : '';
      setIsSending(true);
      try {
        if (instanceName && externalId && contactJid) await editMessageApi(instanceName, { number: contactJid, messageId: externalId, text: currentInput.trim() });
        await dbFrom('messages').update({ content: currentInput.trim(), updated_at: new Date().toISOString() }).eq('id', currentEditing.id);
        toast({ title: 'Mensagem editada', description: 'A mensagem foi atualizada com sucesso.' });
      } catch (err) {
        log.error('Failed to edit message:', err);
        toast({ title: 'Erro ao editar', description: 'Nao foi possivel editar a mensagem.', variant: 'destructive' });
      } finally { setIsSending(false); }
      setEditingMessage(null); setInputValue('');
      return;
    }

    const messageContent = applySignature(currentInput.trim());
    const wasReply = replyToMessageRef.current;
    setIsSending(true); setSendProgress(0); setInputValue(''); setReplyToMessage(null); handleTypingStop();
    setLastSendError(null);

    try {
      const { simulateLatency, shouldSimulateFailure } = await import('@/features/inbox/utils/simulateChatLatency');
      await simulateLatency();
      if (shouldSimulateFailure()) throw new Error('Falha simulada no envio via WhatsApp API (Debug Mode)');

      if (isWhisperRef.current) {
        if (attachments && attachments.length > 0) toast({ title: 'Aviso', description: 'Arquivos nao sao suportados em modo sussurro no momento.', variant: 'destructive' });
        if (!profile?.id) throw new Error('Usuario nao autenticado');

        // Guard: whisper_messages.contact_id is uuid. When USE_EXTERNAL_DB=true,
        // opts.contactId may be a WhatsApp JID (phone number). Passing a JID
        // causes PostgREST 400 "invalid input syntax for type uuid" on INSERT.
        if (!isValidUUID(opts.contactId)) {
          toast({ title: 'Sussurro indisponivel', description: 'Esta conversa usa ID externo (JID WhatsApp). Sussurros requerem contato interno com UUID.', variant: 'destructive' });
          setIsSending(false);
          return;
        }

        const { error } = await supabase.from('whisper_messages').insert({
          contact_id: opts.contactId,
          sender_id: profile.id,
          content: messageContent,
          target_agent_id: profile.id,
        });
        if (error) throw error;
        toast({ title: 'Sussurro enviado', description: 'Nota interna registrada com sucesso.' });
        setIsWhisper(false);
      } else {
        await Promise.resolve(onSendMessage(messageContent, attachments, (p) => setSendProgress(p)));
        setSendProgress(100);
      }
      lastFailedPayloadRef.current = null;
      undoToast({ message: 'Mensagem enviada', icon: 'ok', delay: 3000, onUndo: () => { setInputValue(messageContent); if (wasReply) setReplyToMessage(wasReply); toast({ title: 'Mensagem restaurada', description: 'O texto foi restaurado no campo de entrada.' }); } });
    } catch (err: any) {
      log.error('Failed to send message:', err);
      const msg = err?.message || 'Falha ao invocar a funcao de envio.';
      const detail = typeof err?.detail === 'string' ? err.detail : null;
      lastFailedPayloadRef.current = messageContent;
      setLastSendError(msg); setLastSendErrorDetail(detail); setInputValue(messageContent);
      if (wasReply) setReplyToMessage(wasReply);
      toast({ title: 'Erro ao enviar', description: msg, variant: 'destructive' });
    } finally { setIsSending(false); }
  }, [contactPhone, instanceName, editMessageApi, applySignature, onSendMessage, handleTypingStop]);

  const retryLastSend = useCallback(async () => {
    if (isSendingRef.current) return;
    const audioPending = lastFailedAudioRef.current;
    if (audioPending) {
      setIsSending(true); setLastSendError(null); setLastSendErrorDetail(null);
      try { await audioPending.onSendAudio(audioPending.blob); lastFailedAudioRef.current = null; toast({ title: 'Audio reenviado', description: 'O audio foi reenviado com sucesso.' }); }
      catch (err: any) { log.error('Audio retry failed:', err); const msg = err?.message || 'Falha ao reenviar audio.'; const detail = typeof err?.detail === 'string' ? err.detail : null; setLastSendError(msg); setLastSendErrorDetail(detail); toast({ title: 'Erro ao reenviar audio', description: msg, variant: 'destructive' }); }
      finally { setIsSending(false); }
      return;
    }
    const payload = lastFailedPayloadRef.current;
    if (!payload) return;
    setIsSending(true); setLastSendError(null); setLastSendErrorDetail(null);
    try { await Promise.resolve(onSendMessage(payload)); lastFailedPayloadRef.current = null; toast({ title: 'Reenviado', description: 'A mensagem foi enviada com sucesso.' }); }
    catch (err: any) { log.error('Retry failed:', err); const msg = err?.message || 'Falha ao reenviar.'; const detail = typeof err?.detail === 'string' ? err.detail : null; setLastSendError(msg); setLastSendErrorDetail(detail); toast({ title: 'Erro ao reenviar', description: msg, variant: 'destructive' }); }
    finally { setIsSending(false); }
  }, [onSendMessage]);

  const dismissSendError = useCallback(() => { setLastSendError(null); setLastSendErrorDetail(null); lastFailedPayloadRef.current = null; lastFailedAudioRef.current = null; }, []);
  const handleReplyToMessage = useCallback((message: Message) => { setReplyToMessage(message); inputRef.current?.focus(); }, []);
  const handleCopyMessage = useCallback((content: string) => { navigator.clipboard.writeText(content); toast({ title: 'Copiado!', description: 'Mensagem copiada para a area de transferencia.' }); }, []);
  const handleForwardMessage = useCallback((message: Message) => { setForwardMessage(message); openDialog('forwardDialog'); }, [openDialog]);
  const handleForwardToTargets = useCallback((targetIds: string[], targetType: 'contact' | 'group') => { log.debug('Forwarding to:', { targetIds, targetType, message: forwardMessage }); }, [forwardMessage]);
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInputValue(value);
    if (value.startsWith('/')) { openDialog('slashCommands'); closeDialog('quickReplies'); } else { closeDialog('slashCommands'); }
    if (value.length > 0) handleTypingStart(); else handleTypingStop();
  }, [openDialog, closeDialog, handleTypingStart, handleTypingStop]);
  const handleKeyDown = useCallback((e: React.KeyboardEvent, slashCommandsOpen: boolean) => {
    if (slashCommandsOpen && (e.key === 'Enter' || e.key === 'ArrowUp' || e.key === 'ArrowDown')) return;
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    if (e.key === 'k' && e.ctrlKey) { e.preventDefault(); openDialog('globalSearch'); }
    if (e.key === 'f' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleSetActiveTool('chatSearch'); }
    if (e.key === 'w' && e.altKey) { e.preventDefault(); setIsWhisper(prev => !prev); }
    if (e.key === 'Escape' && slashCommandsOpen) closeDialog('slashCommands');
  }, [handleSend, openDialog, closeDialog, handleSetActiveTool]);
  const handleSlashCommand = useCallback((command: Pick<SlashCommand, 'id'> & Partial<SlashCommand>, subCommand?: string) => {
    closeDialog('slashCommands'); setInputValue('');
    switch (command.id) {
      case 'transfer': openDialog('transferDialog'); break;
      case 'resolve': toast({ title: 'Conversa Resolvida', description: 'A conversa foi marcada como resolvida.' }); break;
      case 'template': openDialog('quickReplies'); break;
      case 'note': toast({ title: 'Nota Privada', description: 'Funcionalidade de notas sera aberta.' }); break;
      case 'tag': toast({ title: subCommand === 'add' ? 'Adicionar Tag' : 'Remover Tag', description: subCommand === 'add' ? 'Selecione uma tag para adicionar.' : 'Selecione uma tag para remover.' }); break;
      case 'priority': { const labels: Record<string, string> = { high: 'Alta', medium: 'Media', low: 'Baixa' }; toast({ title: 'Prioridade Definida', description: `Prioridade definida como ${labels[subCommand || ''] || subCommand}.` }); break; }
      case 'assign': toast({ title: 'Atribuir Conversa', description: 'Selecione um agente para atribuir.' }); break;
      case 'snooze': { const labels: Record<string, string> = { '1h': '1 hora', '3h': '3 horas', tomorrow: 'amanha', nextweek: 'proxima semana' }; toast({ title: 'Conversa Adiada', description: `Conversa adiada para ${labels[subCommand || ''] || subCommand}.` }); break; }
      case 'star': toast({ title: 'Conversa Favoritada', description: 'A conversa foi marcada como favorita.' }); break;
      case 'archive': toast({ title: 'Conversa Arquivada', description: 'A conversa foi arquivada.' }); break;
      case 'remind': toast({ title: 'Lembrete Criado', description: 'Um lembrete foi criado para esta conversa.' }); break;
      case 'quick': openDialog('quickReplies'); break;
      case 'summary': handleSetActiveTool('aiAssistant'); break;
      case 'produto': openDialog('catalogDirect'); break;
      case 'internal-note': setIsWhisper(prev => !prev); break;
      case 'internal-file': handleSetActiveTool('teamFiles'); break;
      default: toast({ title: `Comando: ${command.label}`, description: command.description }); break;
    }
  }, [closeDialog, openDialog, handleSetActiveTool, setIsWhisper]);
  const handleSendProduct = useCallback((product: ExternalProduct) => {
    const price = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(product.sale_price);
    const lines = [`Produto: *${product.name}*`, product.brand ? `Marca: ${product.brand}` : '', `Preco: ${price}`, product.min_quantity ? `Qtd. minima: ${product.min_quantity} un.` : '', product.colors?.length ? `Cores: ${product.colors.join(', ')}` : '', product.dimensions_display ? `Dimensoes: ${product.dimensions_display}` : '', product.allows_personalization ? 'Permite personalizacao' : '', product.lead_time_days ? `Prazo: ${product.lead_time_days} dias uteis` : '', product.is_stockout ? '*Sem estoque no momento*' : `Em estoque: ${product.stock_quantity} un.`, (product.short_description || product.description) ? `\n${(product.short_description || product.description || '').slice(0, 300)}` : '', product.primary_image_url ? `\n${product.primary_image_url}` : ''].filter(Boolean).join('\n');
    onSendMessage(lines); toast({ title: 'Produto enviado!', description: `${product.name} - ${price}` });
  }, [onSendMessage]);
  const handleSendInteractiveMessage = useCallback((interactive: InteractiveMessage) => { toast({ title: 'Mensagem interativa enviada!', description: `Mensagem com ${interactive.buttons?.length || 0} botoes enviada.` }); }, []);
  const handleInteractiveButtonClick = useCallback((button: InteractiveButton) => { toast({ title: 'Botao clicado', description: `Resposta: ${button.title}` }); }, []);
  const handleSendLocation = useCallback((location: LocationMessage) => { toast({ title: 'Localizacao enviada!', description: location.isLive ? `Localizacao em tempo real por ${location.liveUntil ? Math.round((location.liveUntil.getTime() - Date.now()) / 60000) : 15} minutos` : location.name || 'Localizacao compartilhada' }); }, []);
  const handleAudioSend = useCallback(async (audioBlob: Blob, onSendAudio?: (blob: Blob) => Promise<void>) => {
    if (!onSendAudio) { toast({ title: 'Erro', description: 'Envio de audio nao configurado.', variant: 'destructive' }); setIsRecordingAudio(false); return; }
    try { await onSendAudio(audioBlob); lastFailedAudioRef.current = null; }
    catch (err: any) { log.error('Error sending audio:', err); const msg = err?.message || 'Falha ao enviar audio.'; const detail = typeof err?.detail === 'string' ? err.detail : null; lastFailedAudioRef.current = { blob: audioBlob, onSendAudio }; lastFailedPayloadRef.current = null; setLastSendError(msg); setLastSendErrorDetail(detail); toast({ title: 'Erro ao enviar audio', description: 'Clique em Reenviar para tentar novamente.', variant: 'destructive' }); }
    finally { setIsRecordingAudio(false); }
  }, []);
  const handleAudioVoiceChange = useCallback(async (messageId: string, newBlob: Blob) => {
    try {
      toast({ title: 'Voz alterada!', description: 'Enviando nova versao do audio...' });
      const filePath = `audios/${Date.now()}.mp3`;
      const { error: uploadError } = await supabase.storage.from('chat-media').upload(filePath, newBlob);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('chat-media').getPublicUrl(filePath);
      await dbFrom('messages').update({ mediaUrl: publicUrl, updated_at: new Date().toISOString() }).eq('id', messageId);
      toast({ title: 'Sucesso', description: 'Audio atualizado com a nova voz.' });
    } catch (err: any) { log.error('Failed to change audio voice:', err); toast({ title: 'Erro na conversao', description: err.message, variant: 'destructive' }); }
  }, []);

  return {
    inputValue, setInputValue, isSending, sendProgress, isRecordingAudio, setIsRecordingAudio,
    replyToMessage, setReplyToMessage, forwardMessage, editingMessage, inputRef,
    handleEditStart, handleCancelEdit, handleSend,
    handleReplyToMessage, handleCopyMessage, handleForwardMessage, handleForwardToTargets,
    handleInputChange, handleKeyDown, handleSlashCommand,
    handleSendProduct, handleSendInteractiveMessage, handleInteractiveButtonClick,
    handleSendLocation, handleAudioSend, handleAudioVoiceChange,
    lastSendError, lastSendErrorDetail, retryLastSend, dismissSendError,
    isWhisper, setIsWhisper,
  };
}
