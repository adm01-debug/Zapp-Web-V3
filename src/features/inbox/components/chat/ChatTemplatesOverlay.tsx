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
export function ChatTemplatesOverlay({
  contactName,
  contactCompany,
  onUseTemplate,
  onClose,
}: Props) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center overflow-auto bg-foreground/80 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl">
        <Button
          variant="ghost"
          size="icon"
          className="absolute -right-2 -top-2 z-[60] rounded-full border border-border bg-background hover:bg-muted"
          onClick={onClose}
          aria-label="Fechar templates"
        >
          <X className="h-4 w-4" />
        </Button>
        <TemplatesWithVariables
          onUseTemplate={onUseTemplate}
          contactData={{ name: contactName, company: contactCompany }}
        />
      </div>
    </div>
  );
}
