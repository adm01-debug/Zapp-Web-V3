-- Etapa 10: dblink e deadman switch
-- Achados: F9-12, F9-13, F9-14, F7-16
-- ROLLBACK: SELECT cron.alter_job(193, command := '<original com swarm-task-guardian>');
--
-- ✅ Cron 193: service_name 'swarm-task-guardian' → 'pg-cron-liveness'
--    Deadman switch agora distingue heartbeat sintético do guardian real
-- 📝 F7-16: OBSOLETO — dblink instalado em public, funções em zapp
-- 📝 F9-13: search_path já tem zapp
SELECT cron.alter_job(193, command := $$
  INSERT INTO zapp.evolution_guardian_heartbeat (service_name, heartbeat_at)
  VALUES ('pg-cron-liveness', NOW())
  ON CONFLICT (service_name, heartbeat_at) DO NOTHING;
  
  INSERT INTO evo.evolution_guardian_heartbeat (service_name, heartbeat_at)  
  VALUES ('pg-cron-liveness', NOW())
  ON CONFLICT (service_name, heartbeat_at) DO NOTHING
  $$);
