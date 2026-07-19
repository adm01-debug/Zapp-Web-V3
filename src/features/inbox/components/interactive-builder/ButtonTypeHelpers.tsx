import { MessageSquare, ExternalLink, Phone } from 'lucide-react';
import { InteractiveButton } from '@/types/chat';

/** get Button Type Icon component for the interactive builder section. */
export function getButtonTypeIcon(type: InteractiveButton['type']) {
  switch (type) {
    case 'reply':
      return <MessageSquare className="w-4 h-4" />;
    case 'url':
      return <ExternalLink className="w-4 h-4" />;
    case 'phone':
      return <Phone className="w-4 h-4" />;
  }
}

/** get Button Type Label component for the interactive builder section. */
export function getButtonTypeLabel(type: InteractiveButton['type']) {
  switch (type) {
    case 'reply':
      return 'Resposta Rápida';
    case 'url':
      return 'Abrir URL';
    case 'phone':
      return 'Ligar';
  }
}
