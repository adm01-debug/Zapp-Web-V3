import { lazy, Suspense } from 'react';
import { AnimatePresence } from 'framer-motion';
import { SectionErrorBoundary } from '@/components/ui/section-error-boundary';

const WhisperMode = lazy(() =>
  import('../WhisperMode').then((m) => ({ default: m.WhisperMode })),
);
const VisualValidationChecklist = lazy(() =>
  import('../VisualValidationChecklist').then((m) => ({ default: m.VisualValidationChecklist })),
);
const NextBestActionEngine = lazy(() =>
  import('../NextBestActionEngine').then((m) => ({ default: m.NextBestActionEngine })),
);

interface Props {
  contactId: string;
  contactName: string;
  showVisualValidation: boolean;
  onCloseVisualValidation: () => void;
  showWhisper: boolean;
}

/**
 * Consolida os três overlays lazy do ChatPanel (NextBestAction sempre montado
 * por conversa, VisualValidation e Whisper condicionais), mantendo idêntica
 * a árvore de SectionErrorBoundary + Suspense já usada anteriormente.
 */
export function ChatPanelOverlays({
  contactId,
  contactName,
  showVisualValidation,
  onCloseVisualValidation,
  showWhisper,
}: Props) {
  return (
    <>
      <SectionErrorBoundary sectionName="NextBestAction">
        <Suspense fallback={null}>
          <NextBestActionEngine contactId={contactId} contactName={contactName} />
        </Suspense>
      </SectionErrorBoundary>

      <AnimatePresence>
        {showVisualValidation && (
          <SectionErrorBoundary sectionName="VisualValidation">
            <Suspense fallback={null}>
              <VisualValidationChecklist onClose={onCloseVisualValidation} />
            </Suspense>
          </SectionErrorBoundary>
        )}
      </AnimatePresence>

      {showWhisper && (
        <SectionErrorBoundary sectionName="WhisperMode">
          <Suspense fallback={null}>
            <WhisperMode contactId={contactId} className="mx-3 mb-2" defaultExpanded={true} />
          </Suspense>
        </SectionErrorBoundary>
      )}
    </>
  );
}
