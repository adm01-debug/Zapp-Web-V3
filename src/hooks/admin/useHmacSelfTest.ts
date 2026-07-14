// Re-export from consolidated useAdminManagement module (ETAPA 19 consolidation)
import { useAdminManagement } from '@/features/admin/hooks/useAdminManagement';

export type {
  Phase,
  ScenarioReport,
  SelfTestResult,
} from '@/features/admin/hooks/useAdminManagement';

/** Hook for running and managing HMAC security self-tests on admin instances. */
export function useHmacSelfTest(instance: string, includeNegative: boolean) {
  const admin = useAdminManagement({
    hmacInstance: instance,
    hmacIncludeNegative: includeNegative,
  });
  return {
    loading: admin.securityLoading,
    result: admin.securityResult,
    lastRunAt: admin.lastSecurityRunAt,
    run: admin.runSecurityTest,
  };
}
