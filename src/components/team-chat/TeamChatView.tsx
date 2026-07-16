import { useState } from 'react';
import { useTeamConversations } from '@/hooks/useTeamChat';
import { TeamConversationList } from './TeamConversationList';
import { TeamChatPanel } from './TeamChatPanel';
import { TeamMemberDetails } from './TeamMemberDetails';
import { NewConversationDialog } from './NewConversationDialog';
import { MessageSquare, Users, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTeamChatNotifications } from '@/hooks/useTeamChatNotifications';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

export function TeamChatView() {
  const { data: conversations = [], isLoading } = useTeamConversations();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // Enable differentiated notifications for team chat
  useTeamChatNotifications(selectedId);

  const selectedConversation = conversations.find((c) => c.id === selectedId) || null;

  return (
    <div className="flex h-full w-full bg-background">
      {/* Sidebar */}
      <div
        className={cn(
          'flex w-80 shrink-0 flex-col border-r border-border',
          selectedId && 'hidden md:flex'
        )}
      >
        <TeamConversationList
          conversations={conversations}
          isLoading={isLoading}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id);
            setShowDetails(false);
          }}
          onNewConversation={() => setShowNewDialog(true)}
        />
      </div>

      {/* Chat area */}
      <div className={cn('flex w-0 min-w-0 flex-1 flex-col', !selectedId && 'hidden md:flex')}>
        {selectedConversation ? (
          <TeamChatPanel
            conversation={selectedConversation}
            onBack={() => setSelectedId(null)}
            onToggleDetails={() => setShowDetails((prev) => !prev)}
            showDetails={showDetails}
          />
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="flex h-full items-center justify-center"
          >
            <div className="max-w-sm p-8 text-center">
              <div className="relative mx-auto mb-5 h-20 w-20">
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 shadow-sm">
                  <Users className="h-9 w-9 text-primary/70" />
                </div>
                <motion.div
                  animate={{ y: [0, -4, 0] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-xl bg-accent/20"
                >
                  <MessageSquare className="h-4 w-4 text-accent-foreground/60" />
                </motion.div>
              </div>
              <h3 className="mb-2 text-lg font-extrabold text-foreground">Chat da Equipe</h3>
              <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
                Selecione uma conversa ou inicie uma nova para conversar com seus colegas
              </p>
              <Button
                size="sm"
                className="gap-2 rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90"
                onClick={() => setShowNewDialog(true)}
              >
                <Plus className="h-4 w-4" />
                Nova conversa
              </Button>
            </div>
          </motion.div>
        )}
      </div>

      {/* Details panel */}
      {showDetails && selectedConversation && (
        <TeamMemberDetails
          conversation={selectedConversation}
          onClose={() => setShowDetails(false)}
        />
      )}

      <NewConversationDialog
        open={showNewDialog}
        onOpenChange={setShowNewDialog}
        onCreated={(id) => {
          setSelectedId(id);
          setShowNewDialog(false);
        }}
      />
    </div>
  );
}
