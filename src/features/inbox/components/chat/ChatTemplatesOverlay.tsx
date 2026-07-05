import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { TemplatesWithVariables } from '../TemplatesWithVariables';

interface Props {
  contactName?: string;
  contactCompany?: string;
  onUseTemplate: (content: string) => void;
  onClose: () => void;
}

/**
 * Overlay to browse and pick message templates. Extracted from ChatPanel to
 * keep the orchestrator lean.
 */
export function ChatTemplatesOverlay({ contactName, contactCompany, onUseTemplate, onClose }: Props) {
  return (
    <div className="absolute inset-0 z-50 bg-foreground/80 backdrop-blur-sm p-4 overflow-auto flex items-center justify-center">
      <div className="w-full max-w-2xl relative">
        <Button
          variant="ghost"
          size="icon"
          className="absolute -right-2 -top-2 z-[60] bg-background border border-border rounded-full hover:bg-muted"
          onClick={onClose}
          aria-label="Fechar templates"
        >
          <X className="w-4 h-4" />
        </Button>
        <TemplatesWithVariables
          onUseTemplate={onUseTemplate}
          contactData={{ name: contactName, company: contactCompany }}
        />
      </div>
    </div>
  );
}
