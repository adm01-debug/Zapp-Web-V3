/**
 * Utility to simulate network latency and failures for testing purposes.
 * Controlled via localStorage keys:
 * - 'debug_chat_latency': milliseconds to delay every message send
 * - 'debug_chat_failure_rate': 0.0 to 1.0 (e.g. 0.5 = 50% failure rate)
 */

/** Simulates configurable network latency and failure injection for debug testing via localStorage flags. */
export const simulateLatency = async () => {
  const latency = localStorage.getItem('debug_chat_latency');
  if (latency) {
    const ms = parseInt(latency, 10);
    if (!isNaN(ms)) {
      await new Promise(resolve => setTimeout(resolve, ms));
    }
  }
};

/** should Simulate Failure constant. */
export const shouldSimulateFailure = (): boolean => {
  const rate = localStorage.getItem('debug_chat_failure_rate');
  if (rate) {
    const failRate = parseFloat(rate);
    if (!isNaN(failRate)) {
      return Math.random() < failRate;
    }
  }
  return false;
};

/** get Simulation Config constant. */
export const getSimulationConfig = () => ({
  latency: parseInt(localStorage.getItem('debug_chat_latency') || '0', 10),
  failureRate: parseFloat(localStorage.getItem('debug_chat_failure_rate') || '0'),
});

/** set Simulation Config constant. */
export const setSimulationConfig = (latency: number, failureRate: number) => {
  localStorage.setItem('debug_chat_latency', latency.toString());
  localStorage.setItem('debug_chat_failure_rate', failureRate.toString());
};

/** clear Simulation Config constant. */
export const clearSimulationConfig = () => {
  localStorage.removeItem('debug_chat_latency');
  localStorage.removeItem('debug_chat_failure_rate');
};
