/**
 * Centralized formatting utilities
 * Eliminates duplication of date/phone/currency formatting across components.
 */
import { formatDistanceToNow, format, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// ─── Date Formatting ────────────────────────────────────────────────

/**
 * Format a date as relative time in Portuguese (e.g., "há 5 minutos")
 */
export function formatRelativeTime(date: Date | string | number): string {
  const d = date instanceof Date ? date : new Date(date);
  return formatDistanceToNow(d, { addSuffix: true, locale: ptBR });
}

/**
 * Format a date as a smart label: "Hoje", "Ontem", or full date
 */
export function formatSmartDate(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  if (isToday(d)) return `Hoje, ${format(d, 'HH:mm', { locale: ptBR })}`;
  if (isYesterday(d)) return `Ontem, ${format(d, 'HH:mm', { locale: ptBR })}`;
  return format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

/**
 * Format a date as short date (dd/MM/yyyy)
 */
export function formatShortDate(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  return format(d, 'dd/MM/yyyy', { locale: ptBR });
}

/**
 * Format a date as full datetime
 */
export function formatFullDateTime(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  return format(d, "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR });
}

// ─── Phone Formatting ───────────────────────────────────────────────

/**
 * Clean phone number to digits only (removes +, spaces, dashes, parens)
 */
export function cleanPhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

// ─── Currency Formatting ────────────────────────────────────────────

/**
 * Format a number as Brazilian Real (R$ 1.234,56)
 */
export function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

// ─── Text Formatting ────────────────────────────────────────────────

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + '…';
}

/**
 * Get initials from a name (e.g., "João Silva" → "JS")
 */
export function getInitials(name: string, maxChars = 2): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, maxChars)
    .map((word) => word[0].toUpperCase())
    .join('');
}

/**
 * Get initials from a display name, falling back to the e-mail's first letter.
 * Parity-preserving consolidation of the local helpers previously duplicated in
 * EmailChatBubble, and ThreadListItem (Refactor Wave 1).
 */
export function getInitialsFromNameOrEmail(name?: string | null, email?: string | null): string {
  if (name) {
    return name
      .split(' ')
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }
  if (email) return email[0]?.toUpperCase() ?? '?';
  return '?';
}

/**
 * Compact date-time "dd/MM HH:mm:ss" (pt-BR). Null-safe. (Wave 5 — parity-proven
 * consolidation of 3 identical local impls: FailedMessageTableRow, AdminAlertHistoryPage, AdminWebhookEventsPage)
 */
export function formatDateTimeCompact(iso: string | null): string {
  if (!iso) return '—';
  try {
    return format(new Date(iso), 'dd/MM HH:mm:ss', { locale: ptBR });
  } catch {
    return iso;
  }
}

/**
 * Time as "HH:MM:SS" (pt-BR locale). (Wave 5 — parity-proven consolidation of
 * QrAttemptHistory + AgentRecentSendsPopover)
 */
export function formatTimeHMS(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

/**
 * Bytes → "N B" | "N.N KB" | "N.N MB". (Wave 5 — parity-proven consolidation of
 * EmailAttachmentPreview + pttLimits)
 */
export function formatBytesCompact(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Number Formatting ──────────────────────────────────────────────

/**
 * Format large numbers with K/M suffix (e.g., 1500 → "1.5K")
 */
export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

/**
 * Format a duration in seconds to human-readable (e.g., 125 → "2min 5s")
 */
export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  if (total < 60) return `${total}s`;
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  if (mins < 60) return secs > 0 ? `${mins}min ${secs}s` : `${mins}min`;
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return remainMins > 0 ? `${hours}h ${remainMins}min` : `${hours}h`;
}

/**
 * Format percentage (e.g., 0.856 → "85.6%")
 */
export function formatPercentage(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}
