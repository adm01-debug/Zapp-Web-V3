-- Migration: revoke_auth_edge_rpcs
-- Applied: 2026-08-05T12:04:07.985Z
-- Recovery: recriado 2026-08-07 (arquivo ausente — C-2 AUDIT_REPORT_2026-08-06.md)
-- Contexto: revogação de EXECUTE em RPCs de borda para anon/PUBLIC
-- que foram incorretamente concedidos em sessions anteriores de hardening.

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA zapp FROM anon;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA zapp FROM PUBLIC;
-- Grants específicos são gerenciados em migrations individuais.
