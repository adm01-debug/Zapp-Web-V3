-- Fix: Add zapp.payment_links and email_app.email_accounts to supabase_realtime publication
--
-- M-1: zapp.payment_links was explicitly DROPPED from supabase_realtime in migration
--      20260401002035. PaymentLinksView.tsx has a Realtime subscription that was
--      silently receiving zero events (first wrong schema 'financeiro', now correct
--      schema 'zapp' but table still not in publication).
--
-- M-2: email_app.email_accounts is used by useGmailOAuthFlow.ts to detect when
--      the OAuth callback writes a new account row. Without being in the publication,
--      the subscription is a silent no-op and the OAuth flow appears to hang.

ALTER PUBLICATION supabase_realtime ADD TABLE zapp.payment_links;
ALTER PUBLICATION supabase_realtime ADD TABLE email_app.email_accounts;

-- Verify
DO $$
DECLARE
  missing TEXT[] := ARRAY[]::TEXT[];
  t TEXT;
  pairs TEXT[][] := ARRAY[
    ARRAY['zapp', 'payment_links'],
    ARRAY['email_app', 'email_accounts']
  ];
BEGIN
  FOREACH t SLICE 1 IN ARRAY pairs
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = t[1]
        AND tablename  = t[2]
    ) THEN
      missing := missing || (t[1] || '.' || t[2]);
    END IF;
  END LOOP;

  IF array_length(missing, 1) > 0 THEN
    RAISE EXCEPTION 'VERIFICATION FAILED: % not in supabase_realtime', array_to_string(missing, ', ');
  END IF;

  RAISE NOTICE 'OK: zapp.payment_links and email_app.email_accounts are now in supabase_realtime publication';
END $$;
