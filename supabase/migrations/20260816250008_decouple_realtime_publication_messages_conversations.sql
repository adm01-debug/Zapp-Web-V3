-- Auditoria 10 agentes r4: front assina postgres_changes em evo.evolution_messages
-- (ChatMessagesArea, useEvolutionMonitoring — ja migrados por outro agente para o
-- schema fisico), mas a publication supabase_realtime so continha evo.evolution_contacts.
-- Chat sem updates ao vivo. pubviaroot=true ja estava correto (particionadas emitem
-- com nome da mae). Replica identity: messages_wpp2=FULL ok.
ALTER PUBLICATION supabase_realtime ADD TABLE evo.evolution_messages, evo.evolution_conversations;
