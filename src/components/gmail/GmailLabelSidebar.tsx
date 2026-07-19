import { useState } from 'react';
import {
  Inbox, Star, Flag, Send, FileText, AlertOctagon, Trash2, Tag,
  ChevronDown, ChevronRight, RefreshCw,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useEmailLabels } from '@/hooks/useGmailLabels';

type EmailLabelId = 'INBOX' | 'STARRED' | 'IMPORTANT' | 'SENT' | 'DRAFTS' | 'SPAM' | 'TRASH' | string;

interface EmailLabelSidebarProps {
  accountId:      string | null;
  activeLabel:    EmailLabelId;
  unreadCounts?:  Record<string, number>;
  onSelectLabel:  (labelId: EmailLabelId) => void;
}

const LABEL_ICONS: Record<string, React.ReactNode> = {
  INBOX:     <Inbox     className="h-4 w-4" />,
  STARRED:   <Star      className="h-4 w-4" />,
  IMPORTANT: <Flag      className="h-4 w-4" />,
  SENT:      <Send      className="h-4 w-4" />,
  DRAFTS:    <FileText  className="h-4 w-4" />,
  SPAM:      <AlertOctagon className="h-4 w-4" />,
  TRASH:     <Trash2    className="h-4 w-4" />,
};

function LabelItem({
  label,
  active,
  unread,
  onClick,
}: {
  label:   { email_label_id: string; name: string; color?: string | null };
  active:  boolean;
  unread?: number;
  onClick: () => void;
}) {
  const icon = LABEL_ICONS[label.email_label_id] ?? <Tag className="h-4 w-4" />;

  return (
    <button type="button"
      onClick={onClick}
      className={`flex items-center gap-2.5 w-full px-3 py-1.5 rounded-lg text-sm transition-colors
        ${active
          ? 'bg-primary/10 text-primary font-semibold'
          : 'hover:bg-muted text-foreground'
        }`}
      aria-label={label.name}
      aria-current={active ? 'page' : undefined}
    >
      <span style={{ color: active ? undefined : (label.color ?? undefined) }}>
        {icon}
      </span>
      <span className="flex-1 text-left truncate">{label.name}</span>
      {unread && unread > 0 && (
        <Badge
          variant={active ? 'default' : 'secondary'}
          className="text-xs h-5 min-w-5 px-1 ml-auto"
          aria-label={`${unread} não lidos`}
        >
          {unread > 99 ? '99+' : unread}
        </Badge>
      )}
    </button>
  );
}

/** Email Label Sidebar component for the gmail section. */
export function EmailLabelSidebar({
  accountId,
  activeLabel,
  unreadCounts = {},
  onSelectLabel,
}: EmailLabelSidebarProps) {
  const {
    systemLabels,
    userLabels,
    isLoading,
    syncLabels,
  } = useEmailLabels(accountId);

  const [showCustom, setShowCustom] = useState(true);

  if (!accountId) {
    return (
      <div className="p-3 text-xs text-muted-foreground text-center">
        Conecte uma conta Email
      </div>
    );
  }

  return (
    <ScrollArea className="h-full py-2">
      <nav aria-label="Pastas Email">

        {/* Labels do sistema */}
        <div className="px-2 space-y-0.5">
          {systemLabels.map(label => (
            <LabelItem
              key={label.email_label_id}
              label={label}
              active={activeLabel === label.email_label_id}
              unread={unreadCounts[label.email_label_id]}
              onClick={() => onSelectLabel(label.email_label_id)}
            />
          ))}
        </div>

        {/* Labels personalizadas */}
        {userLabels.length > 0 && (
          <>
            <Separator className="my-2 mx-2" />
            <div className="px-2">
              <button type="button"
                onClick={() => setShowCustom(prev => !prev)}
                className="flex items-center gap-1.5 w-full px-1 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
              >
                {showCustom
                  ? <ChevronDown className="h-3 w-3" />
                  : <ChevronRight className="h-3 w-3" />
                }
                Labels
                <Badge variant="secondary" className="text-xs h-4 px-1 ml-auto">
                  {userLabels.length}
                </Badge>
              </button>

              {showCustom && (
                <div className="mt-1 space-y-0.5">
                  {userLabels.map(label => (
                    <LabelItem
                      key={label.email_label_id}
                      label={label}
                      active={activeLabel === label.email_label_id}
                      unread={unreadCounts[label.email_label_id]}
                      onClick={() => onSelectLabel(label.email_label_id as EmailLabelId)}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Sincronizar labels */}
        <div className="px-2 mt-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={syncLabels}
            disabled={isLoading}
            className="w-full justify-start gap-2 text-xs text-muted-foreground h-7"
          >
            <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
            Sincronizar labels
          </Button>
        </div>
      </nav>
    </ScrollArea>
  );
}

export default EmailLabelSidebar;
