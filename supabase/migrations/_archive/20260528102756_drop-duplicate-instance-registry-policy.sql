-- Remove duplicate SELECT policy on instance_registry.
-- Migration 20260527204620 dropped all existing SELECT policies and created
-- "Admins and supervisors can view instance registry".
-- Migration 20260527212009 then added a second SELECT policy with identical
-- USING clause without first removing the one from the previous migration.
-- Drop the redundant duplicate; the original policy from 20260527204620 is kept.
DROP POLICY IF EXISTS "Admin or Supervisor can view instance registry" ON public.instance_registry;
