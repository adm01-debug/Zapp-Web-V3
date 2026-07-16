import { useState } from 'react';
import {
  Inbox,
  Star,
  Flag,
  Send,
  FileText,
  AlertOctagon,
  Trash2,
  Tag,
  ChevronDown,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useEmailLabels } from '@/hooks/useGmailLabels';

type EmailLabelId =
  'INBOX' | 'STARRED' | 'IMPORTANT' | 'SENT' | 'DRAFTS' | 'SPAM' | 'TRASH' | string;

interface EmailLabelSidebarProps {
  accountId: string | null;
  activeLabel: EmailLabelId;
  unreadCounts?: Record<string, number>;
  onSelectLabel: (labelId: EmailLabelId) => void;
}

const LABEL_ICONS: Record<string, React.ReactNode> = {
  INBOX: <Inbox className="h-4 w-4" />,
  STARRED: <Star className="h-4 w-4" />,
  IMPORTANT: <Flag className="h-4 w-4" />,
  SENT: <Send className="h-4 w-4" />,
  DRAFTS: <FileText className="h-4 w-4" />,
  SPAM: <AlertOctagon className="h-4 w-4" />,
  TRASH: <Trash2 className="h-4 w-4" />,
};

function LabelItem({
  label,
  active,
  unread,
  onClick,
}: {
  label: { email_label_id: string; name: string; color?: string | null };
  active: boolean;
  unread?: number;
  onClick: () => void;
}) {
  const icon = LABEL_ICONS[label.email_label_id] ?? <Tag className="h-4 w-4" />;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
        active ? 'bg-primary/10 font-semibold text-primary' : 'text-foreground hover:bg-muted'
      }`}
      aria-label={label.name}
      aria-current={active ? 'page' : undefined}
    >
      <span style={{ color: active ? undefined : (label.color ?? undefined) }}>{icon}</span>
      <span className="flex-1 truncate text-left">{label.name}</span>
      {unread && unread > 0 && (
        <Badge
          variant={active ? 'default' : 'secondary'}
          className="ml-auto h-5 min-w-5 px-1 text-xs"
          aria-label={`${unread} não lidos`}
        >
          {unread > 99 ? '99+' : unread}
        </Badge>
      )}
    </button>
  );
}

export function EmailLabelSidebar({
  accountId,
  activeLabel,
  unreadCounts = {},
  onSelectLabel,
}: EmailLabelSidebarProps) {
  const { systemLabels, userLabels, isLoading, syncLabels } = useEmailLabels(accountId);

  const [showCustom, setShowCustom] = useState(true);

  if (!accountId) {
    return (
      <div className="p-3 text-center text-xs text-muted-foreground">Conecte uma conta Email</div>
    );
  }

  return (
    <ScrollArea className="h-full py-2">
      <nav aria-label="Pastas Email">
        {/* Labels do sistema */}
        <div className="space-y-0.5 px-2">
          {systemLabels.map((label) => (
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
            <Separator className="mx-2 my-2" />
            <div className="px-2">
              <button
                type="button"
                onClick={() => setShowCustom((prev) => !prev)}
                className="flex w-full items-center gap-1.5 px-1 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
              >
                {showCustom ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                Labels
                <Badge variant="secondary" className="ml-auto h-4 px-1 text-xs">
                  {userLabels.length}
                </Badge>
              </button>

              {showCustom && (
                <div className="mt-1 space-y-0.5">
                  {userLabels.map((label) => (
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
        <div className="mt-3 px-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={syncLabels}
            disabled={isLoading}
            className="h-7 w-full justify-start gap-2 text-xs text-muted-foreground"
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
