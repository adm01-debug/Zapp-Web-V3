/* eslint-disable react-refresh/only-export-components */
import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { useDensity } from '@/hooks/useDensity';
import {
  Users, MessageSquare, UsersRound, FileText, ShieldCheck,
  ClipboardList, Handshake, UserCheck, Truck, Wrench, ChevronDown,
} from 'lucide-react';
import { ConversationWithMessages } from '@/features/inbox';
import { isGroup as isGroupJid } from '@/lib/jid';

// ---------- types & config ----------

/** Filter Option interface definition. */
export interface FilterOption {
  value: string;
  label: string;
  icon: typeof Users;
  iconColor: string;
  indent?: boolean;
  /** Function to test if a conversation matches this filter */
  match: (c: ConversationWithMessages) => boolean;
}

const isGroup = (phone: string | null | undefined): boolean => {
  if (!phone) return false;
  if (isGroupJid(phone)) return true;
  return /^\d+-\d+$/.test(phone.replace(/\D/g, ''));
};

/** F I L T E R_ O P T I O N S constant. */
export const FILTER_OPTIONS: FilterOption[] = [
  { value: 'all', label: 'Todos os tipos', icon: Users, iconColor: 'text-muted-foreground', match: () => true },
  { value: 'individual', label: 'Chats Individuais', icon: MessageSquare, iconColor: 'text-primary',
    match: (c) => !isGroup(c.contact.phone) },
  { value: 'grupo', label: 'Todos os Grupos', icon: UsersRound, iconColor: 'text-warning',
    match: (c) => isGroup(c.contact.phone) },
  { value: 'grupo_orcamentos', label: 'Orçamentos | Fornecedores', icon: FileText, iconColor: 'text-info', indent: true,
    match: (c) => isGroup(c.contact.phone) && c.contact.group_category === 'orcamentos' },
  { value: 'grupo_aprovacao', label: 'Aprovação | Fornecedores', icon: ShieldCheck, iconColor: 'text-success', indent: true,
    match: (c) => isGroup(c.contact.phone) && c.contact.group_category === 'aprovacao' },
  { value: 'grupo_os', label: 'O.S. | Fornecedores', icon: ClipboardList, iconColor: 'text-warning', indent: true,
    match: (c) => isGroup(c.contact.phone) && c.contact.group_category === 'os' },
  { value: 'grupo_acerto', label: 'Acerto | Fornecedores', icon: Handshake, iconColor: 'text-secondary', indent: true,
    match: (c) => isGroup(c.contact.phone) && c.contact.group_category === 'acerto' },
  { value: 'grupo_sem_categoria', label: 'Grupos sem categoria', icon: UsersRound, iconColor: 'text-muted-foreground', indent: true,
    match: (c) => isGroup(c.contact.phone) && !c.contact.group_category },
  { value: 'cliente', label: 'Clientes', icon: Users, iconColor: 'text-info',
    match: (c) => !isGroup(c.contact.phone) && (c.contact.contact_type || 'cliente') === 'cliente' },
  { value: 'colaborador', label: 'Colaboradores', icon: UserCheck, iconColor: 'text-success',
    match: (c) => !isGroup(c.contact.phone) && c.contact.contact_type === 'colaborador' },
  { value: 'fornecedor', label: 'Fornecedores', icon: Truck, iconColor: 'text-secondary',
    match: (c) => !isGroup(c.contact.phone) && c.contact.contact_type === 'fornecedor' },
  { value: 'prestador_servico', label: 'Prestadores de Serviço', icon: Wrench, iconColor: 'text-warning',
    match: (c) => !isGroup(c.contact.phone) && c.contact.contact_type === 'prestador_servico' },
  { value: 'transportadora', label: 'Transportadoras', icon: Truck, iconColor: 'text-info',
    match: (c) => !isGroup(c.contact.phone) && c.contact.contact_type === 'transportadora' },
  { value: 'outros', label: 'Outros', icon: Users, iconColor: 'text-muted-foreground',
    match: (c) => !isGroup(c.contact.phone) && !['cliente', 'colaborador', 'fornecedor', 'transportadora'].includes(c.contact.contact_type || 'cliente') },
];

const SEPARATOR_AFTER = new Set(['individual', 'grupo_sem_categoria']);

// ---------- stats helper ----------

interface FilterStats { count: number; unread: number; }

function computeStats(
  conversations: ConversationWithMessages[],
  options: FilterOption[],
): Record<string, FilterStats> {
  const stats: Record<string, FilterStats> = {};
  for (const opt of options) stats[opt.value] = { count: 0, unread: 0 };
  for (const c of conversations) {
    for (const opt of options) {
      if (opt.match(c)) {
        stats[opt.value].count++;
        if (c.unreadCount > 0) stats[opt.value].unread++;
      }
    }
  }
  return stats;
}

// ---------- component ----------

interface ContactTypeFilterProps {
  value: string | null;
  onChange: (value: string | null) => void;
  conversations: ConversationWithMessages[];
}

/**
 * Filtro compacto de tipo de contato.
 *
 * Implementação nativa (button + painel absoluto) — substitui o uso anterior
 * de Radix Select para evitar o loop "Maximum update depth exceeded" causado
 * pela cascata SelectTrigger -> PopperAnchor -> composeRefs no sidebar.
 */
export function ContactTypeFilter({ value, onChange, conversations }: ContactTypeFilterProps) {
  const [open, setOpen] = useState(false);
  const { density } = useDensity();
  const isCompact = density === 'compact' || density === 'dense';
  const containerRef = useRef<HTMLDivElement>(null);

  const stats = useMemo(() => computeStats(conversations, FILTER_OPTIONS), [conversations]);

  const activeOption = FILTER_OPTIONS.find((o) => o.value === (value || 'all')) ?? FILTER_OPTIONS[0];
  const TriggerIcon = activeOption.icon;

  const handleSelect = useCallback((next: string) => {
    setOpen(false);
    onChange(next === 'all' ? null : next);
  }, [onChange]);

  // Click outside + Esc
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Filtro: ${activeOption.label}`}
        className={cn(
          'flex items-center justify-between w-full bg-muted/40 border-0 rounded-md transition-all',
          isCompact ? 'h-6 text-[10px] px-1.5 gap-0.5' : 'h-7 text-[11px] px-2 gap-1',
          'focus:outline-none focus:ring-1 focus:ring-primary/30 px-2 gap-1',
        )}
      >
        <span className="flex items-center gap-1 truncate">
          <TriggerIcon className={cn('w-3 h-3 shrink-0', activeOption.iconColor)} />
          <span className="truncate">{activeOption.label}</span>
        </span>
        <ChevronDown className="w-3 h-3 opacity-60 shrink-0" />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Tipos de contato"
          className={cn(
            'absolute z-50 mt-1 left-0 min-w-[220px] max-h-[360px] overflow-y-auto',
            'rounded-md border bg-popover text-popover-foreground shadow-md p-1',
          )}
        >
          {FILTER_OPTIONS.map((opt, idx) => {
            const Icon = opt.icon;
            const st = stats[opt.value];
            const selected = (value || 'all') === opt.value;
            const showSeparator = SEPARATOR_AFTER.has(opt.value) && idx < FILTER_OPTIONS.length - 1;
            return (
              <React.Fragment key={opt.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => handleSelect(opt.value)}
                  className={cn(
                    'w-full flex items-center gap-2 px-2 rounded-sm text-left transition-all',
                    isCompact ? 'py-1 text-[10px]' : 'py-1.5 text-[11px]',
                    'hover:bg-accent hover:text-accent-foreground focus:outline-none focus:bg-accent',
                    selected && 'bg-accent/60',
                    opt.indent && 'pl-5',
                  )}
                >
                  <Icon className={cn('w-3.5 h-3.5 shrink-0', opt.iconColor)} />
                  <span className="flex-1 truncate">{opt.label}</span>
                  {st.count > 0 && (
                    <span className="ml-auto flex items-center gap-1 shrink-0">
                      <span className="text-[9px] text-muted-foreground font-medium tabular-nums">{st.count}</span>
                      {st.unread > 0 && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                    </span>
                  )}
                </button>
                {showSeparator && <div className="-mx-1 my-1 h-px bg-muted" />}
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------- helper for filtering ----------

/** filter By Contact Type function. */
export function filterByContactType(
  conversations: ConversationWithMessages[],
  contactType: string | null,
): ConversationWithMessages[] {
  if (!contactType || contactType === 'all') return conversations;
  const option = FILTER_OPTIONS.find((o) => o.value === contactType);
  if (!option) return conversations;
  return conversations.filter(option.match);
}
