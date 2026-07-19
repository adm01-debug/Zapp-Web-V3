// Re-export from consolidated useAdminManagement module (ETAPA 19 consolidation)
import { useAdminManagement } from '@/features/admin/hooks/useAdminManagement';

/** Re-exported module members. */
export type {
  Phase,
  ScenarioReport,
  SelfTestResult,
} from '@/features/admin/hooks/useAdminManagement';

/** Hook: use Hmac Self Test. */
export function useHmacSelfTest(instance: string, includeNegative: boolean) {
  const admin = useAdminManagement({ hmacInstance: instance, hmacIncludeNegative: includeNegative });
  return {
    loading: admin.securityLoading,
    result: admin.securityResult,
    lastRunAt: admin.lastSecurityRunAt,
    run: admin.runSecurityTest,
  };
}
