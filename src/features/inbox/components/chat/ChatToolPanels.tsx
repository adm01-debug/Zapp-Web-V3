import { Suspense, lazy } from 'react';
import { Radar, GraduationCap, Share2 } from 'lucide-react';
import { ToolPanel } from '../ai-tools/ToolPanel';
import { VisionIcon } from '../ai-tools/VisionIcon';
import { Message } from '@/types/chat';
import type { ActiveTool } from './ChatHeaderToolbar';

const _ConversationSummary = lazy(() =>
  import('../ConversationSummary').then((m) => ({ default: m.ConversationSummary }))
);
const ObjectionDetector = lazy(() =>
  import('../ObjectionDetector').then((m) => ({ default: m.ObjectionDetector }))
);
const UniversityHelp = lazy(() =>
  import('../UniversityHelp').then((m) => ({ default: m.UniversityHelp }))
);
const AIConversationAssistant = lazy(() =>
  import('../AIConversationAssistant').then((m) => ({ default: m.AIConversationAssistant }))
);
const TeamFiles = lazy(() => import('../TeamFiles').then((m) => ({ default: m.TeamFiles })));

interface ChatToolPanelsProps {
  activeTool: ActiveTool;
  onSetActiveTool: (tool: ActiveTool) => void;
  messages: Message[];
  contactId: string;
  contactName: string;
  onSelectSuggestion: (text: string) => void;
}

export function ChatToolPanels({
  activeTool,
  onSetActiveTool,
  messages,
  contactId,
  contactName,
  onSelectSuggestion,
}: ChatToolPanelsProps) {
  const mappedMessages = messages.map((m) => ({
    id: m.id,
    content: m.content,
    sender: m.sender,
    timestamp: m.timestamp.toISOString(),
  }));

  return (
    <>
      {activeTool === 'aiAssistant' && (
        <Suspense fallback={null}>
          <ToolPanel
            isOpen
            onClose={() => onSetActiveTool('aiAssistant')}
            icon={<VisionIcon className="h-4 w-4 text-primary" />}
            title="Visão"
            subtitle="Análise Profunda"
          >
            <AIConversationAssistant
              messages={messages.map((m) => ({
                id: m.id,
                sender: m.sender,
                content: m.content,
                type: m.type,
                mediaUrl: m.mediaUrl,
                created_at: m.timestamp.toISOString(),
              }))}
              contactId={contactId}
              contactName={contactName}
              isOpen={activeTool === 'aiAssistant'}
              onClose={() => onSetActiveTool('aiAssistant')}
            />
          </ToolPanel>
        </Suspense>
      )}

      {activeTool === 'objections' && (
        <Suspense fallback={null}>
          <ToolPanel
            isOpen
            onClose={() => onSetActiveTool('objections')}
            icon={<Radar className="h-4 w-4 text-warning" />}
            title="Monitoramento de Objeções"
            subtitle="Detecta resistências e sugere contra-argumentos"
          >
            <ObjectionDetector
              contactId={contactId}
              contactName={contactName}
              lastMessages={messages
                .filter((m) => m.sender === 'contact')
                .slice(-5)
                .map((m) => m.content)}
              allMessages={mappedMessages}
              onSelectSuggestion={onSelectSuggestion}
            />
          </ToolPanel>
        </Suspense>
      )}

      {activeTool === 'university' && (
        <Suspense fallback={null}>
          <ToolPanel
            isOpen
            onClose={() => onSetActiveTool('university')}
            icon={<GraduationCap className="h-4 w-4 text-primary" />}
            title="Ajuda dos Universitários"
            subtitle="Gera respostas inteligentes a partir de mensagens"
          >
            <UniversityHelp
              contactId={contactId}
              contactName={contactName}
              messages={mappedMessages}
              onSelectSuggestion={onSelectSuggestion}
            />
          </ToolPanel>
        </Suspense>
      )}

      {activeTool === 'teamFiles' && (
        <Suspense fallback={null}>
          <ToolPanel
            isOpen
            onClose={() => onSetActiveTool('teamFiles')}
            icon={<Share2 className="h-4 w-4 text-warning-foreground" />}
            title="Arquivos da Equipe"
            subtitle="Compartilhamento interno seguro"
            className="border-border/10 bg-background"
          >
            <TeamFiles contactId={contactId} />
          </ToolPanel>
        </Suspense>
      )}
    </>
  );
}
