-- EX-02 (2026-08-06): corrige zapp.alert_channels_id_seq — sequence atrás do
-- max(id) real (last_value=1, is_called=false com max(id)=4 → próxima inserção
-- colidiria na PK). setval para GREATEST(max(id), 1) com is_called=true.
--
-- Rollback: SELECT setval('zapp.alert_channels_id_seq', 1, false);

DO $$
BEGIN
  PERFORM setval(
    'zapp.alert_channels_id_seq',
    GREATEST(COALESCE((SELECT max(id) FROM zapp.alert_channels), 1), 1),
    true
  );
END
$$;
