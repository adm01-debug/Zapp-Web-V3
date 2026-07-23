/* eslint-disable react-refresh/only-export-components */
import { useState, useCallback, useMemo, createContext, useContext, ReactNode } from 'react';
import { InAppNotification, InAppNotificationData } from './InAppNotification';

interface InAppNotificationContextType {
  showNotification: (data: Omit<InAppNotificationData, 'id'>) => void;
}

const InAppNotificationContext = createContext<InAppNotificationContextType>({
  showNotification: () => {},
});

/** use In App Notification component for the mobile section. */
export function useInAppNotification() {
  return useContext(InAppNotificationContext);
}

/** In App Notification Provider component for the mobile section. */
export function InAppNotificationProvider({ children }: { children: ReactNode }) {
  const [notification, setNotification] = useState<InAppNotificationData | null>(null);

  const showNotification = useCallback((data: Omit<InAppNotificationData, 'id'>) => {
    setNotification({ ...data, id: crypto.randomUUID() });
  }, []);

  const handleDismiss = useCallback(() => setNotification(null), []);

  const contextValue = useMemo(() => ({ showNotification }), [showNotification]);

  return (
    <InAppNotificationContext.Provider value={contextValue}>
      {children}
      <InAppNotification notification={notification} onDismiss={handleDismiss} />
    </InAppNotificationContext.Provider>
  );
}
