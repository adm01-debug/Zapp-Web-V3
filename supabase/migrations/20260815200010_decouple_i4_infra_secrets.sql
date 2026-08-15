-- =============================================================================
-- Decouple I4 — ops.fn_get_vault_secret + 8 URLs de infra no vault
-- =============================================================================
-- Objetivo: centralizar no vault as URLs de infra que hoje aparecem como
-- literais hardcoded em funções (critério I4 do sql-gate: nenhum egresso
-- net.http_ com URL literal inline sem resolver na mesma statement). Este
-- arquivo cria o resolver genérico ops.fn_get_vault_secret() (lê
-- vault.decrypted_secrets por nome; retorna NULL quando o secret não existe,
-- sem RAISE) e planta as 8 URLs de infra consumidas pelas migrations
-- decouple_i4_* (00004 n8n_bootstrap_alert_webhook, 00006 lusha/leadcontact/
-- linkedin, 00008 sicoob_bridge_edge_url, etc.).
--
-- Etapa: I4 (pg_net / decouple de URLs hardcoded)
-- Data: 2026-08-15
-- Idempotente — CREATE OR REPLACE + ON CONFLICT (name) DO NOTHING.
--
-- Localização no schema ops (INFRA) de propósito: a regra do repo proíbe o
-- schema evo depender de zapp; ops é o schema neutro de infra e qualquer
-- chamador (evo/zapp/public) usa o resolver com search_path fixo.
--
-- SEGURANÇA:
-- - SECURITY DEFINER: executa com privilégios do proprietário.
-- - SET search_path = vault, ops, public (sem escalada de schema).
-- - SEM GRANT (ML-008): nenhuma exposição a authenticated; o acesso passa
--   apenas por chamadores autorizados que já detêm permissão no vault.
-- - SEM DROP: nada é removido; função é CREATE OR REPLACE e os inserts são
--   ON CONFLICT DO NOTHING.
-- =============================================================================

CREATE OR REPLACE FUNCTION ops.fn_get_vault_secret(p_name text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = vault, ops, public
AS $function$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = p_name
  LIMIT 1;
  RETURN v_secret;
END
$function$;

-- Achado W-V1/F-01 (2026-08-15): REVOKE explícito do PUBLIC — em DB fresco o
-- default concede EXECUTE a PUBLIC; sem isso qualquer role com USAGE em ops
-- conseguiria ler QUALQUER secret do vault via esta função. Produção já é
-- protegida pelo watchdog ops.fn_auto_revoke_public_on_evo_zapp_fn; o REVOKE
-- garante o mesmo comportamento em DB novo/CI.
REVOKE EXECUTE ON FUNCTION ops.fn_get_vault_secret(text) FROM PUBLIC;

-- Idempotência e criptografia: a coluna vault.secrets.secret armazena base64 do
-- ciphertext AEAD (vault._crypto_aead_det_decrypt na view decrypted_secrets).
-- INSERT direto de texto plano QUEBRA a leitura (decode base64 falha em ':') —
-- SEMPRE criar via vault.create_secret(...) com guarda WHERE NOT EXISTS
-- (vault.secrets desta versão NÃO tem UNIQUE(name)).
SELECT vault.create_secret('https://supabase.atomicabr.com.br', 'supabase_api_url', 'I4: URL base do Supabase self-hosted (edge functions)') WHERE NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name='supabase_api_url');
SELECT vault.create_secret('https://portainer.atomicabr.com.br', 'portainer_api_url', 'I4: URL base do Portainer') WHERE NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name='portainer_api_url');
SELECT vault.create_secret('https://webhook.atomicabr.com.br/webhook/evolution-bootstrap-alert', 'n8n_bootstrap_alert_webhook', 'I4: webhook n8n de alerta de bootstrap Evolution') WHERE NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name='n8n_bootstrap_alert_webhook');
SELECT vault.create_secret('https://api.lusha.com', 'lusha_v3_api_url', 'I4: base API Lusha v3') WHERE NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name='lusha_v3_api_url');
SELECT vault.create_secret('https://dashboard-services.lusha.com', 'lusha_v2_api_url', 'I4: base API Lusha v2') WHERE NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name='lusha_v2_api_url');
SELECT vault.create_secret('https://api.leadcontact.ai', 'leadcontact_api_url', 'I4: base API LeadContact') WHERE NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name='leadcontact_api_url');
SELECT vault.create_secret('https://www.linkedin.com', 'linkedin_api_url', 'I4: base API LinkedIn') WHERE NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name='linkedin_api_url');
SELECT vault.create_secret('http://functions:9000', 'sicoob_bridge_edge_url', 'I4: URL base da edge sicoob-bridge-reply (DNS interno Swarm)') WHERE NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name='sicoob_bridge_edge_url');
SELECT vault.create_secret('https://api.resend.com', 'resend_api_url', 'I4: URL base do Resend (canal email de alertas)') WHERE NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name='resend_api_url');
SELECT vault.create_secret('https://n8n.atomicabr.com.br/webhook/warroom-alert', 'n8n_warroom_alert_webhook', 'I4: webhook n8n de alerta warroom (wal slots — consumido pela migration 00013)') WHERE NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name='n8n_warroom_alert_webhook');
