import { createContext, useContext } from 'react';

export interface TourStep {
  id: string;
  target: string;
  title: string;
  description: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  spotlightPadding?: number;
}

export interface TourContextType {
  isActive: boolean;
  currentStep: number;
  steps: TourStep[];
  startTour: (steps: TourStep[]) => void;
  endTour: () => void;
  nextStep: () => void;
  prevStep: () => void;
  goToStep: (index: number) => void;
}

const TourContext = createContext<TourContextType | null>(null);

/** Internal bridge for TourProvider — do not use TourContext directly outside this module. */
export const TourContextProvider = TourContext.Provider;

export function useTour(): TourContextType {
  const context = useContext(TourContext);
  if (!context) {
    throw new Error('useTour must be used within a TourProvider');
  }
  return context;
}
