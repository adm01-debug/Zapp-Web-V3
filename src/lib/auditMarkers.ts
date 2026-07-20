/**
 * Audit Markers (MELHORIA #11 - Silent Error Prevention)
 *
 * Structured markers for documenting intentional error handling decisions.
 * These replace bare comments like "// ignore-audit" with documented reasoning.
 *
 * Usage:
 * - errorSuppressed: error is caught and handled with visible feedback
 * - errorRecovered: error is caught and recovery strategy applied
 * - errorLogged: error is caught, logged, but not shown to user
 * - errorExpected: error is anticipated and handled as expected case
 * - errorIgnored: error is truly intentionally ignored (rare)
 */

/**
 * Marker: Error is suppressed but user receives feedback via toast/notification.
 * All errors of this type MUST be logged to error tracking system.
 *
 * @param reason - Why the error is being suppressed (e.g., "shown to user via toast")
 * @example
 * } catch (err) {
 *   ERROR_SUPPRESSED('user is notified via toast', err);
 *   toast({ title: 'Error', description: err.message });
 * }
 */
export function ERROR_SUPPRESSED(reason: string, error?: unknown): void {
  // Error is handled and user gets feedback; marker just documents the intent
  void reason;
  void error;
}

/**
 * Marker: Error is caught but recovery strategy is applied instead of propagating.
 *
 * @param reason - Why recovery is being applied
 * @param fallback - What fallback is being used
 * @example
 * } catch (err) {
 *   ERROR_RECOVERED('network timeout, retrying with backoff', 3);
 * }
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ERROR_RECOVERED(reason: string, fallback?: any): void {
  void reason;
  void fallback;
}

/**
 * Marker: Error is caught, logged, but intentionally not shown to user.
 * This is rare and should only be used for truly non-critical background operations.
 *
 * @param reason - Why the error isn't shown to user
 * @example
 * } catch (err) {
 *   ERROR_LOGGED_ONLY('background sync failure, will retry on next interval');
 * }
 */
export function ERROR_LOGGED_ONLY(reason: string): void {
  void reason;
}

/**
 * Marker: This error condition is expected and handled as part of normal flow.
 *
 * @param reason - What condition is expected
 * @example
 * } catch (err) {
 *   if (err.code === 'NOT_FOUND') {
 *     ERROR_EXPECTED('404 is expected for deleted records');
 *     return null;
 *   }
 * }
 */
export function ERROR_EXPECTED(reason: string): void {
  void reason;
}

/**
 * Marker: Error is intentionally ignored. Use SPARINGLY — should almost never appear.
 * If you're tempted to use this, reconsider if ERROR_SUPPRESSED or ERROR_RECOVERED fits better.
 *
 * @param reason - CRITICAL: must justify why error is truly ignorable
 * @example
 * } catch (err) {
 *   ERROR_IGNORED('cleanup handler error, process is already shutting down');
 * }
 */
export function ERROR_IGNORED(reason: string): void {
  void reason;
}

/**
 * Audit configuration for detecting improper error handling.
 * Can be used to warn about certain patterns in development mode.
 */
export const AUDIT_CONFIG = {
  // Warn if more than N errors occur without being logged
  warnThreshold: 10,

  // Warn if error recovery attempts exceed threshold
  recoveryRetryLimit: 5,

  // Enable detailed audit logging in development
  enableDetailedLogging: import.meta.env.DEV,

  // List of error types that should NEVER be silently ignored
  neverIgnore: [
    'SecurityError',
    'TypeError',
    'ReferenceError',
    'SyntaxError',
    'RangeError',
    'EvalError',
  ],
};

/** Default export. */
export default {
  ERROR_SUPPRESSED,
  ERROR_RECOVERED,
  ERROR_LOGGED_ONLY,
  ERROR_EXPECTED,
  ERROR_IGNORED,
  AUDIT_CONFIG,
};
