/**
 * Helpers de cleanup pós-teste E2E.
 * Usa o anon key — só remove dados marcados como `*-test` via RPC pública
 * (se existir) ou no-op em ambientes sem service role.
 */
import { TEST_INSTANCE, TEST_REMOTE_JID } from '../fixtures/test-data';

export async function cleanupTestData(): Promise<void> {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return;

  try {
    await fetch(`${url}/rest/v1/rpc/rpc_e2e_cleanup`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_instance: TEST_INSTANCE, p_remote_jid: TEST_REMOTE_JID }),
    });
  } catch {
    /* cleanup best-effort */
  }
}
