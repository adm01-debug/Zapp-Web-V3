/* eslint-disable react-refresh/only-export-components */
import { useState, useCallback, useMemo, ReactNode } from 'react';
import { TourOverlay } from './TourOverlay';
import { TourContextProvider } from './tourContext';
import type { TourStep } from './tourContext';
/** Re-export of the TourStep type from tourContext for consumer convenience. */
export type { TourStep } from './tourContext';
/** Re-export of the useTour hook from tourContext for consumer convenience. */
export { useTour } from './tourContext';

interface TourProviderProps {
  children: ReactNode;
  onComplete?: () => void;
}

/** Tour Provider component for the onboarding section. */
export function TourProvider({ children, onComplete }: TourProviderProps) {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [steps, setSteps] = useState<TourStep[]>([]);

  const startTour = useCallback((tourSteps: TourStep[]) => {
    setSteps(tourSteps);
    setCurrentStep(0);
    setIsActive(true);
  }, []);

  const endTour = useCallback(() => {
    setIsActive(false);
    setCurrentStep(0);
    setSteps([]);
    onComplete?.();
  }, [onComplete]);

  const nextStep = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      endTour();
    }
  }, [currentStep, steps.length, endTour]);

  const prevStep = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  }, [currentStep]);

  const goToStep = useCallback(
    (index: number) => {
      if (index >= 0 && index < steps.length) {
        setCurrentStep(index);
      }
    },
    [steps.length]
  );

  const contextValue = useMemo(
    () => ({ isActive, currentStep, steps, startTour, endTour, nextStep, prevStep, goToStep }),
    [isActive, currentStep, steps, startTour, endTour, nextStep, prevStep, goToStep],
  );

  return (
    <TourContextProvider
      value={contextValue}
    >
      {children}
      <TourOverlay />
    </TourContextProvider>
  );
}

// Re-export for backward compatibility
/** Re-exported module members. */
export { DEFAULT_ONBOARDING_STEPS } from './defaultTourSteps';
