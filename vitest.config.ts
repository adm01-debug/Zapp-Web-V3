import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    pool: 'forks',
    minWorkers: 1,
    maxWorkers: 3,
    testTimeout: 15000,
    retry: process.env.CI ? 2 : 0,
    env: {
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    },
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'e2e/**',
      'tests/**',
      'src/tests/e2e/**',
      'scripts/**',
      // QUARENTENA — testes com falhas conhecidas aguardando reescrita.
      // Categorias:
      //   ORPHAN: hook removido do codebase (teste obsoleto)
      //   FAILING: hook existe mas teste referencia API refatorada
      //   DENO: imports incompatíveis com vitest (rodam via deno test)
      //   NEEDS-ENV: requerem vars de ambiente externas
      //
      // Un-quaranteados nesta sessão (2026-07-28, passam 100%):
      //   useViewTransition, usePushNotifications, useSpeechToText,
      //   useVoiceActionHandler, useHubTabNavigation, useEmailDraft,
      //   useDashboardData, useExternalEvolution, useImportData,
      //   useSentimentAlerts, useTranscriptionNotifications, useTypingPresence,
      //   useSearchHistory, contactHealth, diagnostics, crossTabDedupe,
      //   realtimeFanoutEvents, ExportDropdownPermission, ConnectionHealthPanel,
      //   TalkX, v237Fallbacks (21 arquivos)

      // ORPHAN — hook removido do codebase
      'src/hooks/__tests__/useAutoCloseConversations.test.tsx',
      'src/hooks/__tests__/useRetryOperation.test.ts',
      'src/hooks/__tests__/useSidebarFavorites.test.ts',
      'src/hooks/__tests__/useSwipeGesture.test.ts',
      'src/hooks/__tests__/useSwipeNavigation.test.ts',
      'src/hooks/useEmailActions.test.ts',
      // FAILING — hook existe, teste usa API refatorada
      'src/hooks/__tests__/useGlobalSearchShortcut.test.ts',
      'src/hooks/__tests__/useTextToSpeech.test.ts',
      'src/hooks/__tests__/useContactCustomFields.test.tsx',
      'src/hooks/__tests__/useDownloadPermission.test.ts',
      'src/hooks/__tests__/useExportData.test.tsx',
      'src/hooks/__tests__/useOnboardingChecklist.test.tsx',
      'src/hooks/__tests__/useQueueAnalytics.test.tsx',
      'src/hooks/__tests__/useQueueGoals.test.tsx',
      'src/hooks/__tests__/useQueues.test.tsx',
      'src/hooks/__tests__/useQueuesComparison.test.tsx',
      'src/hooks/__tests__/useRealtimeMessages.test.tsx',
      'src/hooks/__tests__/useRealtimeSentimentAlerts.test.ts',
      'src/hooks/__tests__/useWarRoomAlerts.integration.test.tsx',
      'src/components/settings/__tests__/MediaLibraryAdmin.test.tsx',
      // DENO — use https://deno.land/ imports incompatíveis com Node/vitest.
      // Rodam apenas com `deno test` (suíte separada).
      'src/hooks/__tests__/useAudioRecorder.cleanup.test.ts',
      'src/lib/__tests__/clientRateLimiter.test.ts',
      'src/lib/__tests__/healthCheck.test.ts',
      'src/lib/__tests__/queryTimeout.test.ts',
      'src/lib/__tests__/sanitize-extra.test.ts',
      'src/shared/__tests__/validation.test.ts',
      // NEEDS-ENV — requer VITE_EXTERNAL_SUPABASE_URL/ANON_KEY (Supabase self-hosted).
      // Rodados separadamente via script de integração.
      'src/lib/__tests__/contactsDB.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      exclude: ['node_modules/', 'src/test/'],
      thresholds: {
        lines: 25,
        functions: 18,
        branches: 15,
        statements: 24,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
