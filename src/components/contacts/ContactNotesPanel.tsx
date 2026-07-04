/**
 * ContactNotesPanel.tsx
 * Threaded notes for a contact using evolution_contact_notes table.
 * Supports pinned notes, note types, and add/remove.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useMountedRef } from '@/hooks/useMountedRef';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { StickyNote, Pin, RefreshCw, Send, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { dbRpc } from '@/integrations/datasource/db';
import { RPC } from '@/integrations/datasource/rpcCatalog';
import { sanitizeHtml } from '@/lib/sanitize';
import SafeHtml from './SafeHtml';

interface Note {
  id:         string;
  content:    string;
  note_type:  string;
  is_pinned:  boolean;
  created_by: string | null;
  created_at: string;
}

const NOTE_TYPES = [
  { value: 'general',  label: '📝 Geral',     color: 'bg-muted text-muted-foreground' },
  { value: 'call',     label: '📞 Ligação',   color: 'bg-primary text-primary-foreground' },
  { value: 'meeting',  label: '🤝 Reunião',   color: 'bg-primary text-primary' },
  { value: 'email',    label: '📧 E-mail',    color: 'bg-primary text-primary' },
  { value: 'task',     label: '✅ Tarefa',    color: 'bg-warning text-warning-foreground' },
  { value: 'lgpd',     label: '⚖️ LGPD',      color: 'bg-destructive text-destructive-foreground' },
];

const TYPE_COLOR: Record<string, string> = Object.fromEntries(NOTE_TYPES.map((t) => [t.value, t.color]));
const TYPE_LABEL: Record<string, string> = Object.fromEntries(NOTE_TYPES.map((t) => [t.value, t.label]));

export const ContactNotesPanel: React.FC<{ contactId: string }> = ({ contactId }) => {
  const { toast } = useToast();
  const mountedRef = useMountedRef();
  const [notes,    setNotes]    = useState<Note[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [text,     setText]     = useState('');
  const [noteType, setNoteType] = useState('general');
  const [pinned,   setPinned]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error: rpcErr } = await (supabase as any).rpc('get_contact_notes', { p_contact_id: contactId, p_limit: 30 });
      if (mountedRef.current) setNotes((data ?? []) as Note[]);
    } finally { if (mountedRef.current) setLoading(false); }
  }, [contactId]);

  useEffect(() => { load(); }, [load]);

  const addNote = async () => {
    const content = text.trim();
    if (!content) return;
    setSaving(true);
    try {
      const { data, error } = await dbRpc(RPC.addContactNote, {
        p_contact_id: contactId,
        p_content:    sanitizeHtml(content),
        p_note_type:  noteType,
        p_is_pinned:  pinned,
      });
      if (error) throw error;
      const result = (data ?? {}) as Record<string, unknown>;
      if (result?.error) throw new Error(String(result.error));
      setText(''); setPinned(false);
      await load();
      toast({ title: '✅ Nota adicionada!', duration: 2_000 });
    } catch (err) {
      toast({ title: 'Erro ao salvar nota', description: String(err), variant: 'destructive' });
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <StickyNote className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Notas {notes.length > 0 && `(${notes.length})`}
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading} className="h-6 w-6 p-0">
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Add note */}
      <div className="space-y-2 rounded-lg border p-3 bg-muted/20">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Adicionar nota..."
          rows={3}
          className="resize-none text-sm"
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addNote(); }}
        />
        <div className="flex items-center gap-2">
          <Select value={noteType} onValueChange={setNoteType}>
            <SelectTrigger className="flex-1 h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NOTE_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={pinned ? 'default' : 'outline'}
            size="sm" className="h-7 px-2"
            onClick={() => setPinned((v) => !v)}
            title="Fixar nota"
            aria-pressed={pinned}
          >
            <Pin className="h-3 w-3" />
          </Button>
          <Button
            size="sm" className="h-7 gap-1 px-3"
            onClick={addNote}
            disabled={!text.trim() || saving}
          >
            {saving ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            Salvar
          </Button>
        </div>
        <p className="text-xs text-muted-foreground/60">Ctrl+Enter para salvar</p>
      </div>

      {/* Notes list */}
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {notes.length === 0 && !loading && (
          <div className="text-center py-4 text-muted-foreground">
            <FileText className="h-6 w-6 mx-auto mb-1 opacity-30" />
            <p className="text-xs">Nenhuma nota ainda.</p>
          </div>
        )}
        {notes.map((note) => (
          <div
            key={note.id}
            className={`rounded-lg border p-2.5 text-xs space-y-1.5 ${note.is_pinned ? 'bg-warning border-warning' : 'bg-muted/20'}`}
          >
            <div className="flex items-center gap-2">
              <Badge className={`text-xs px-1.5 py-0 h-4 ${TYPE_COLOR[note.note_type] ?? 'bg-muted'}`}>
                {TYPE_LABEL[note.note_type] ?? note.note_type}
              </Badge>
              {note.is_pinned && <span title="Nota fixada" className="inline-flex"><Pin className="h-3 w-3 text-warning-foreground" /></span>}
              <span className="ml-auto text-muted-foreground/60">
                {new Date(note.created_at).toLocaleDateString('pt-BR', {
                  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                })}
              </span>
            </div>
            <SafeHtml html={note.content} className="text-foreground/90 whitespace-pre-wrap" />
          </div>
        ))}
      </div>
    </div>
  );
};

export default ContactNotesPanel;
