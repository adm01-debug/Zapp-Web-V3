// @ts-nocheck
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { EyeOff, Send, X, MessageSquare, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { isValidUUID } from '@/utils/uuid';

interface WhisperModeProps {
  contactId: string;
  targetAgentId?: string;
  className?: string;
  defaultExpanded?: boolean;
}

interface WhisperMessage {
  id: string;
  content: string;
  sender_id: string;
  sender_name?: string;
  is_read: boolean;
  created_at: string;
  whisper_thread_id?: string;
  reply_count?: number;
}

export function WhisperMode({ contactId, targetAgentId, className, defaultExpanded = false }: WhisperModeProps) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const isSupervisor = profile?.role === 'admin' || profile?.role === 'supervisor';

  // whisper_messages.contact_id is uuid. When USE_EXTERNAL_DB=true, contactId
  // may be a WhatsApp JID/phone (e.g. "551146375517"). Skip all DB ops in that
  // case to prevent PostgREST 400 "invalid input syntax for type uuid".
  const contactIsUUID = isValidUUID(contactId);

  const { data: whispers = [] } = useQuery({
    queryKey: ['whispers', contactId],
    enabled: contactIsUUID,
    queryFn: async () => {
      let query = supabase
        .from('whisper_messages')
        .select(`id, content, sender_id, is_read, created_at, whisper_thread_id`)
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false });
      if (activeThreadId) {
        query = query.or(`id.eq.${activeThreadId},whisper_thread_id.eq.${activeThreadId}`);
      } else {
        query = query.is('whisper_thread_id', null);
      }
      const { data, error } = await (query as any).limit(50);
      if (!data) return [];
      const senderIds = [...new Set(data.map((w: any) => w.sender_id))];
      const { data: profiles } = await supabase.from('profiles').select('id, name').in('id', senderIds);
      const nameMap = new Map((profiles || []).map(p => [p.id, p.name]));
      const threadCounts: Record<string, number> = {};
      if (!activeThreadId && data.length > 0) {
        const parentIds = data.map((d: any) => d.id);
        const { data: counts } = await supabase.from('whisper_messages').select('whisper_thread_id').in('whisper_thread_id', parentIds);
        counts?.forEach((c: any) => { if (c.whisper_thread_id) threadCounts[c.whisper_thread_id] = (threadCounts[c.whisper_thread_id] || 0) + 1; });
      }
      return data.map((w: any) => ({ ...w, sender_name: nameMap.get(w.sender_id) || 'Supervisor', reply_count: threadCounts[w.id] || 0 })) as WhisperMessage[];
    },
    refetchInterval: 10000,
  });

  useEffect(() => {
    if (isExpanded) setTimeout(() => inputRef.current?.focus(), 100);
  }, [isExpanded]);

  // Realtime subscription - skip if contactId is not a UUID (JID would make invalid filter)
  useEffect(() => {
    if (!contactIsUUID) return;
    const channel = supabase
      .channel(`whisper-${contactId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'whisper_messages', filter: `contact_id=eq.${contactId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['whispers', contactId] });
        setIsExpanded(true);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [contactId, contactIsUUID, queryClient]);

  // Mark as read - skip if contactId is not a UUID (JID would 400 on UPDATE)
  useEffect(() => {
    if (!contactIsUUID) return;
    if (isExpanded && whispers.some(w => !w.is_read)) {
      const markAsRead = async () => {
        const { error } = await supabase.from('whisper_messages').update({ is_read: true }).eq('contact_id', contactId).eq('is_read', false);
        if (!error) queryClient.setQueryData(['whispers', contactId], (old: WhisperMessage[] | undefined) => old?.map(w => ({ ...w, is_read: true })));
      };
      markAsRead();
    }
  }, [isExpanded, whispers, contactId, contactIsUUID, queryClient]);

  const unreadCount = whispers.filter(w => !w.is_read).length;

  const sendWhisper = async () => {
    if (!message.trim() || !profile?.id) return;
    // Guard: whisper_messages.contact_id is uuid; JID would 400 on INSERT
    if (!contactIsUUID) {
      toast({ title: 'Sussurro indisponivel', description: 'Esta conversa usa ID externo (JID). Sussurros requerem contato interno com UUID.', variant: 'destructive' });
      return;
    }
    const agentId = targetAgentId || profile.id;
    const { error } = await supabase.from('whisper_messages').insert({
      contact_id: contactId,
      sender_id: profile.id,
      target_agent_id: agentId,
      content: message.trim(),
      whisper_thread_id: activeThreadId,
    });
    if (error) {
      toast({ title: 'Erro ao enviar sussurro', description: error.message, variant: 'destructive' });
    } else {
      setMessage('');
      queryClient.invalidateQueries({ queryKey: ['whispers', contactId] });
    }
  };

  if (!isSupervisor && whispers.length === 0) return null;

  return (
    <div className={cn("relative flex items-center", className)} role="region" aria-label="Modo Sussurro">
      <Button
        variant="ghost" size="sm"
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn("relative gap-1.5 text-xs transition-all duration-200", isExpanded ? "bg-warning text-warning-foreground hover:bg-warning" : "text-muted-foreground hover:text-foreground")}
        title="Modo Sussurro - Notas internas invisiveis ao cliente (Alt+W)"
        aria-expanded={isExpanded} aria-haspopup="dialog"
      >
        <EyeOff className={cn("w-3.5 h-3.5", isExpanded && "animate-pulse")} />
        <span className="hidden sm:inline">Sussurro</span>
        {unreadCount > 0 && (<Badge variant="destructive" className="h-4 min-w-[16px] px-1 text-[9px] flex items-center justify-center animate-bounce" aria-label={`${unreadCount} novas mensagens de sussurro`}>{unreadCount}</Badge>)}
      </Button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute bottom-full right-0 mb-3 z-[100] bg-card border border-warning/50 rounded-xl shadow-2xl overflow-hidden ring-1 ring-black/5"
            style={{ width: 340 }} role="dialog" aria-modal="true" aria-label="Painel de Sussurro"
          >
            <div className="p-3 bg-warning/50 border-b border-warning flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-warning-foreground uppercase tracking-wider">
                {activeThreadId ? (<Button variant="ghost" size="icon" className="h-6 w-6 mr-1 text-warning-foreground hover:bg-warning" onClick={() => setActiveThreadId(null)}><ChevronLeft className="w-4 h-4" /></Button>) : (<div className="w-2 h-2 rounded-full bg-warning animate-pulse" />)}
                {activeThreadId ? 'Discussao em Thread' : 'Equipe - Interno'}
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-warning text-warning-foreground" onClick={() => { setIsExpanded(false); setActiveThreadId(null); }} aria-label="Fechar sussurro"><X className="w-3.5 h-3.5" /></Button>
            </div>
            <div className="max-h-[300px] overflow-y-auto p-3 space-y-3 bg-gradient-to-b from-amber-50/20 to-transparent flex flex-col-reverse relative" role="log" aria-live="polite">
              <div className="sticky top-0 z-10 bg-warning/80 backdrop-blur-sm border border-warning/50 rounded-lg px-2 py-1 mb-2 flex items-center justify-center gap-1.5 shadow-sm">
                <EyeOff className="w-3 h-3 text-warning-foreground" />
                <span className="text-[9px] font-bold text-warning-foreground uppercase tracking-tighter">Ambiente de Equipe - Privado</span>
              </div>
              {whispers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center space-y-2">
                  <EyeOff className="w-8 h-8 text-warning-foreground" />
                  <p className="text-xs text-warning-foreground/60 font-medium">Nenhum sussurro registrado para esta conversa.</p>
                </div>
              ) : (
                whispers.map((w, idx) => {
                  const isParent = w.id === activeThreadId;
                  return (
                    <motion.div key={w.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.05 }} className={cn("flex flex-col gap-1 group/whisper", isParent && "border-l-2 border-warning pl-3 py-1 bg-warning/30 rounded-r-xl")}>
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[10px] font-bold text-warning-foreground/80">{w.sender_name} {isParent && <Badge variant="outline" className="text-[8px] h-3 px-1 ml-1 bg-warning border-warning">PAI</Badge>}</span>
                        <span className="text-[9px] text-muted-foreground/60">{new Date(w.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className="relative text-xs p-2.5 rounded-2xl bg-warning/50 border border-warning/30 text-warning-foreground shadow-sm leading-relaxed group-hover/whisper:bg-warning transition-colors">
                        {w.content}
                        <div className="absolute -bottom-1.5 -right-1 opacity-0 group-hover/whisper:opacity-100 transition-opacity flex items-center gap-0.5 bg-background border border-warning rounded-full px-1 shadow-sm z-20">
                          <TooltipProvider>
                            <Tooltip><TooltipTrigger asChild><button onClick={() => toast({ title: 'Confirmado' })} className="hover:scale-120 transition-transform">ok</button></TooltipTrigger><TooltipContent className="text-[10px] p-1">Confirmar</TooltipContent></Tooltip>
                            {!activeThreadId && (<Tooltip><TooltipTrigger asChild><button onClick={() => setActiveThreadId(w.id)} className="hover:scale-120 transition-transform text-warning-foreground ml-0.5 p-0.5"><MessageSquare className="w-3 h-3" /></button></TooltipTrigger><TooltipContent className="text-[10px] p-1">Responder em Thread</TooltipContent></Tooltip>)}
                          </TooltipProvider>
                        </div>
                        {!activeThreadId && w.reply_count && w.reply_count > 0 ? (<button onClick={() => setActiveThreadId(w.id)} className="mt-1 flex items-center gap-1 text-[9px] font-bold text-warning-foreground hover:text-warning-foreground transition-colors"><MessageSquare className="w-2.5 h-2.5" />{w.reply_count} {w.reply_count === 1 ? 'resposta' : 'respostas'}</button>) : null}
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
            {isSupervisor && (
              <div className="p-3 bg-background border-t border-border/40">
                <div className="relative flex items-end gap-2">
                  <textarea ref={inputRef} value={message} onChange={e => setMessage(e.target.value)} placeholder={activeThreadId ? "Responder na thread..." : "Escreva uma orientacao privada..."} aria-label={activeThreadId ? "Resposta de thread" : "Mensagem de sussurro"} className="flex-1 min-h-[40px] max-h-[120px] bg-muted/30 border-none focus-visible:ring-1 focus-visible:ring-amber-400 rounded-xl p-2.5 text-xs resize-none placeholder:text-muted-foreground/50 transition-all" onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendWhisper(); } if (e.key === 'Escape') setIsExpanded(false); }} />
                  <Button size="icon" className="h-9 w-9 shrink-0 rounded-xl bg-warning hover:bg-warning text-foreground shadow-lg shadow-amber-200" onClick={sendWhisper} disabled={!message.trim()} aria-label="Enviar sussurro"><Send className="w-3.5 h-3.5" /></Button>
                </div>
                <p className="mt-2 text-[9px] text-center text-muted-foreground/60 font-medium italic">* Apenas agentes e supervisores podem ver estas mensagens.</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
