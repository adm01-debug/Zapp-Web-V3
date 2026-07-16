-- Schema Hardening v2: Fix gap found during exhaustive testing
-- GAP: onboarding_steps.step_key is nullable despite being part of
-- UNIQUE(user_id, step_key). PostgreSQL UNIQUE allows multiple NULLs,
-- so two rows with the same user_id and NULL step_key would both be
-- accepted, silently breaking the uniqueness intent.

ALTER TABLE zapp.onboarding_steps
  ALTER COLUMN step_key SET NOT NULL;
