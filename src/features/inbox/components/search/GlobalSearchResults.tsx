import { motion } from 'framer-motion';
import {
  Search,
  MessageSquare,
  User,
  Mic,
  Zap,
  Image,
  Video,
  FileDown,
  Sparkles,
  Loader2,
  ArrowRight,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { SearchResult } from '../useGlobalSearchData';

function getResultIcon(type: SearchResult['type'], messageType?: string) {
  if (type === 'message' && messageType) {
    switch (messageType) {
      case 'image':
        return <Image className="h-4 w-4" />;
      case 'video':
        return <Video className="h-4 w-4" />;
      case 'audio':
        return <Mic className="h-4 w-4" />;
      case 'document':
        return <FileDown className="h-4 w-4" />;
    }
  }
  switch (type) {
    case 'transcription':
      return <Mic className="h-4 w-4" />;
    case 'message':
      return <MessageSquare className="h-4 w-4" />;
    case 'contact':
      return <User className="h-4 w-4" />;
    case 'crm':
      return <Sparkles className="h-4 w-4" />;
    case 'action':
      return <Zap className="h-4 w-4" />;
  }
}

function getResultStyle(type: SearchResult['type']) {
  switch (type) {
    case 'transcription':
      return 'bg-warning/10 text-warning';
    case 'message':
      return 'bg-primary/10 text-primary';
    case 'contact':
      return 'bg-secondary/10 text-secondary';
    case 'crm':
      return 'bg-primary/10 text-primary';
    case 'action':
      return 'bg-accent/10 text-accent';
  }
}

function getResultLabel(type: SearchResult['type'], messageType?: string) {
  if (type === 'message' && messageType) {
    switch (messageType) {
      case 'image':
        return 'Imagem';
      case 'video':
        return 'Vídeo';
      case 'audio':
        return 'Áudio';
      case 'document':
        return 'Documento';
    }
  }
  switch (type) {
    case 'transcription':
      return 'Transcrição';
    case 'message':
      return 'Texto';
    case 'contact':
      return 'Contato';
    case 'crm':
      return 'CRM';
    case 'action':
      return 'Ação';
  }
}

interface GlobalSearchResultsProps {
  results: SearchResult[];
  isLoading: boolean;
  search: string;
  selectedIndex: number;
  hasTagSuggestions: boolean;
  onSelect: (result: SearchResult) => void;
}

/** Global Search Results component for the search section. */
export function GlobalSearchResults({
  results,
  isLoading,
  search,
  selectedIndex,
  hasTagSuggestions,
  onSelect,
}: GlobalSearchResultsProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (results.length > 0 && !hasTagSuggestions) {
    return (
      <div className="p-2">
        <div className="px-2 pb-2 text-xs text-muted-foreground">
          {results.length} resultado{results.length !== 1 ? 's' : ''}
        </div>
        {results.map((result, index) => {
          const isMessageLike = result.type === 'message' || result.type === 'transcription';
          return (
            <motion.div
              key={`${result.type}-${result.id}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.02 }}
              className={`group relative flex w-full items-start gap-3 rounded-lg transition-colors ${
                index === selectedIndex ? 'bg-muted' : 'hover:bg-muted/50'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(result)}
                className="flex min-w-0 flex-1 items-start gap-3 p-3 text-left"
              >
                <div className={`rounded-full p-2 ${getResultStyle(result.type)}`}>
                  {getResultIcon(result.type, result.messageType)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{result.title}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {getResultLabel(result.type, result.messageType)}
                    </Badge>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{result.preview}</p>
                  <span className="text-[10px] text-muted-foreground">
                    {format(result.timestamp, "d 'de' MMM, HH:mm", { locale: ptBR })}
                  </span>
                </div>
              </button>
              {isMessageLike && result.contactId && (
                <div className="flex items-center py-3 pr-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(result);
                    }}
                    className="h-8 gap-1.5 px-2.5 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                    title="Abrir conversa e destacar esta mensagem"
                    aria-label="Ver no chat"
                  >
                    <span className="text-xs">Ver no chat</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    );
  }

  if (search.length >= 2 && results.length === 0 && !hasTagSuggestions) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Search className="mb-2 h-8 w-8 opacity-50" />
        <p className="text-sm">Nenhum resultado encontrado</p>
        <p className="mt-1 text-xs">Tente outros termos ou ajuste os filtros</p>
      </div>
    );
  }

  return null;
}
