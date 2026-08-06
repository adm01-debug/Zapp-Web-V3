-- Item 55 da auditoria infra (AG-EX-01): ai.model_pricing (v1) vs ai.model_pricing_v2 (ambas vazias)
-- Verificacao previa: v2 usada por zapp.model_pricing_v2, zapp.v_model_catalog, zapp.estimate_cost e
-- zapp.find_cheapest_model; v1 so tinha a view orfa zapp.model_pricing (nenhum consumidor no repo: grep src/).
-- Decisao: manter v2, dropar v1 + view orfa. Outras tabelas _v2 (evolution_webhook_events_v2_*) sao particoes legitimas — mantidas.
DROP VIEW IF EXISTS zapp.model_pricing;
DROP TABLE IF EXISTS ai.model_pricing;
