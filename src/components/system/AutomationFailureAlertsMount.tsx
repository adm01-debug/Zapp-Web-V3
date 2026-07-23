/**
 * Componente headless: monta no shell o alerta global de falhas de automação.
 * Não renderiza nada — apenas dispara toasts via `useAutomationFailureAlerts`
 * sempre que uma execução de regra termina em `status='failed'`.
 */
import { useAutomationFailureAlerts } from "@/features/inbox";

/** Headless component that activates the global automation-failure toast alert system; renders nothing. */
export function AutomationFailureAlertsMount(): null {
  useAutomationFailureAlerts(true);
  return null;
}
