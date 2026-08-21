-- 20260820130000 — f008_comments_full_coverage — REGISTRO RETROATIVO, NAO REAPLICAR (F-008 lotes 1+2)
-- =============================================================================
-- FINDING F-008: comments zapp em 27% de tabelas (108/400) e 20,7% de colunas.
-- Lotes 1+2 aplicados direto no banco em 2026-08-20 via MCP (Blocos 6-7 do plano):
-- 100% das tabelas zapp comentadas (386/386) — tabelas com dados receberam comment
-- descritivo (papel + quem escreve + quem le) e tabelas vazias receberam comment
-- curto por modulo ("Modulo X — nunca ativado ate 2026-08; ver F-009").
-- (evo ja estava 100% desde 2026-08-09, serie C01-C20.)
-- Conteudo abaixo = os 386 COMMENT ON TABLE reais capturados do banco em 2026-08-20
-- (mesma fonte do snapshot canonico scripts/decouple/snapshots/zapp_schema_snapshot.sql, regenerado neste PR).
-- Idempotente: COMMENT ON sobrescreve com o mesmo valor.

COMMENT ON TABLE zapp.voice_conversion_queue IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.scheduled_messages IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.sticky_assignments IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.password_reset_requests IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.profiles IS 'Usuários do ZAPP (id UUID surrogate; user_id = auth UID). Escrita: signup/triggers auth. Leitura: todas as telas (RLS por user_id/membership).';

COMMENT ON TABLE zapp.instance_processing_pauses IS 'Pausas de processamento por instância (kill-switch parcial).';

COMMENT ON TABLE zapp.evolution_deals IS 'Oportunidades de venda do funil comercial (lead → proposta → negociação → ganho/perdido) da Promo Brindes; registro central do CRM de vendas via WhatsApp. Status segue vocabulário fixo do funil; mantido pelo app e automações. ARMADILHA: deal é a oportunidade; a etiqueta visual do chat fica em evolution_labels.';

COMMENT ON TABLE zapp.evolution_tasks IS 'Tarefas operacionais do time comercial (follow-up, envio de orçamento, cobrança). Status segue vocabulário tipo pending/in_progress/done; due_at NULL significa sem prazo definido. Mantida pelos vendedores via app.';

COMMENT ON TABLE zapp.service_channels IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.integration_profiles IS 'Credenciais/config por integração (por tenant).';

COMMENT ON TABLE zapp.channel_queues IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.evolution_audit_log IS 'Log de auditoria de ações dos agentes no CRM WhatsApp. Cada ação de agente humano gera uma linha.
CARDINALIDADE: ~3.904 linhas | 2,1 MB.
PROPÓSITO: rastreabilidade LGPD — quem acessou, editou ou deletou qual entidade, quando e de onde.
ENTIDADES: contact | conversation | message | deal | pipeline | settings (coluna entity_type).
AÇÕES: create | update | delete | view | export | assign | transfer | resolve | reopen.
RETENÇÃO: permanente (compliance LGPD). Não excluir sem avaliação legal.
USO: auditoria de acesso a dados pessoais (LGPD Art. 37) e rastreamento de alterações manuais.';

COMMENT ON TABLE zapp.evolution_calls IS 'Registro de chamadas de voz (WhatsApp/telefone) com número, duração e resultado. ARMADILHA: resultado pode ficar NULL quando a chamada não é atendida; duração 0 indica chamada perdida.';

COMMENT ON TABLE zapp.evolution_labels IS 'Etiquetas visuais de chat no WhatsApp (ex.: Cliente quente, Aguardando resposta); vocabulário definido pelo admin e usado pelo funil via evolution_stage_mapping.';

COMMENT ON TABLE zapp.evolution_message_templates IS 'Templates HSM da Meta (mensagens aprovadas para envio fora da janela de 24h). PLANEJADA (0 linhas em 2026-08). ARMADILHA: somente templates aprovados pela Meta podem ser enviados; variáveis devem casar com o payload.';

COMMENT ON TABLE zapp.evolution_quick_replies IS 'Respostas rápidas do time comercial para agilizar o atendimento (tabela de preços, prazos de produção, condições). Texto curto reutilizável no WhatsApp.';

COMMENT ON TABLE zapp.evolution_tags IS 'Tags internas de segmentação comercial (ex.: brinde corporativo, atacado, evento). Diferem de labels: tags são internas do CRM; labels são visíveis no WhatsApp.';

COMMENT ON TABLE zapp.queues IS 'Tabela de filas de atendimento. RLS ativo.
Policies após FIX GAP-RLS (2026-08-06):
  authenticated_read_queues — SELECT authenticated, USING true [mantida]
  q_select, queues_select   — REMOVIDAS (duplicatas idênticas)
  queues_admin_write        — ALL authenticated, USING is_admin_or_supervisor()
  q_service                 — ALL service_role, USING true';

COMMENT ON TABLE zapp.stickers IS 'Stickers WhatsApp catalogados por categoria: usado no envio via edge. Escrita: admin. Leitura: front (galeria).';

COMMENT ON TABLE zapp.contatos IS 'Contatos legados do CRM (pré-decouple): lido por telas antigas de importação. Escrita: imports manuais históricos. Leitura: telas legadas — candidato a arquivamento (ver F-009).';

COMMENT ON TABLE zapp.empresas IS 'Empresas do catálogo (CRM Sicoob/corporativo): nome, contatos, vínculo Bitrix24 (bitrix_empresa_id). Escrita: edge functions catálogo/sicoob. Leitura: painéis internos.';

COMMENT ON TABLE zapp.calls IS 'Chamadas de voz WhatsApp registradas (incoming/outgoing). Escrita: consumer. Leitura: front.';

COMMENT ON TABLE zapp.evolution_alerts IS 'Fila de alertas operacionais do sistema WhatsApp CRM.
CARDINALIDADE: ~920 linhas ativas | 712 kB.
SEVERIDADE: low | medium | high | critical.
DEDUP: trigger trg_dedup_alert via (alert_type, instance_name) na última hora.
LIMPEZA: cron purge_evolution_alerts (job 65, 04:58 diário) remove resolved > 7 dias.
ÍNDICE: idx_alerts_resolved_type_created adicionado em 2026-08-09 (N-01) — 1.779 seq_scans eliminados.';

COMMENT ON TABLE zapp.evolution_media IS 'Registro de arquivos de mídia das mensagens WhatsApp. Espelho normalizado de evolution_messages_wpp2 para colunas de arquivo.
CARDINALIDADE: 32.885 linhas | 13 MB dados | 17 MB com índices.
UNICIDADE: message_id é UNIQUE (uq_evolution_media_message_id). Exatamente 1 linha por mensagem de mídia.
STORAGE: storage_url aponta para Supabase Storage bucket (whatsapp-media, audio-messages ou stickers). URL pública: https://supabase.atomicabr.com.br/storage/v1/object/public/{bucket}/{path}.
ESTADOS (media_status): pending | processing | ready | failed | expired | unknown | permanently_lost.
  "permanently_lost" = 36.179 linhas em 2026-08-09: sem mediaKey, sem directPath, sem objeto no bucket — irrecuperáveis.
FK: fk_media_message → evo.evolution_messages (NOT VALID — 15.666 orphans existem de mídia sem mensagem pai).
POPULAÇÃO: trigger trg_auto_media_wpp2 (fn_auto_populate_media) insere via zapp.evolution_media (VIEW). ON CONFLICT DO NOTHING com índice único.
ORPHANS: 15.666 linhas em evo.media_orphan_triage sem mensagem correspondente — candidatas a limpeza de storage.
ATENÇÃO: zapp.evolution_media é VIEW sobre esta tabela. DDL sempre em evo.evolution_media.';

COMMENT ON TABLE zapp.evolution_webhook_dlq IS 'Dead Letter Queue dos eventos do pipeline WhatsApp: eventos que falharam após esgotar retries. Monitorada por crons (fn_detect_ack_loss_gap) e views (v_ack_loss_candidates, v_evolution_dlq_open).';

COMMENT ON TABLE zapp.whatsapp_connections IS 'Conexões WhatsApp configuradas por usuário/agente.';

COMMENT ON TABLE zapp._consumer_dlq IS 'DLQ do consumer RabbitMQ (mensagens que falharam reprocessamento).';

COMMENT ON TABLE zapp.webhook_audit_log IS 'Auditoria de webhooks recebidos (evolution e outros): request/response, latência e status por evento. Escrita: edge evolution-webhook + consumer RabbitMQ. Leitura: ops/debug (sem UI).';

COMMENT ON TABLE zapp.webhook_event_dedup IS 'Chave de idempotência para eventos do webhook (Evolution + Cloud API). PK = sha256(instance:msg_id:event_type:ts). TTL 7 dias.';

COMMENT ON TABLE zapp.evolution_logpatch_audit IS 'Auditoria de patches aplicados no container Evolution (build-time/runtime). Verificada por fn_logpatch_verify; view v_logpatch_health resume o estado.';

COMMENT ON TABLE zapp.instance_registry IS 'Registro de instâncias Evolution conhecidas (wpp2): usada por guards de roteamento.';

COMMENT ON TABLE zapp.instance_auth_events IS 'Histórico de conexão/desconexão da instância WhatsApp (codes 408/515 etc): base dos watchdogs de desconexão. Escrita: consumer evolution (connection.update). Leitura: watchdogs + dashboards de saúde.';

COMMENT ON TABLE zapp.webhook_events_processed IS 'Deduplication table for incoming Evolution webhook events. Rows older than 30 days can be purged.';

COMMENT ON TABLE zapp.agent_achievements IS 'Módulo Agents — nunca ativado em produção até 2026-08; ver F-009';

COMMENT ON TABLE zapp.agent_installed_skills IS 'Módulo Agents — nunca ativado em produção até 2026-08; ver F-009';

COMMENT ON TABLE zapp.agent_presence IS 'Módulo Agents — nunca ativado em produção até 2026-08; ver F-009';

COMMENT ON TABLE zapp.agent_skills IS 'Módulo Agents — nunca ativado em produção até 2026-08; ver F-009';

COMMENT ON TABLE zapp.agent_stats IS 'Estatísticas gamificadas por agente (XP, level — contrato E70). Escrita: rpc_grant_xp SECDEF. Leitura: front gamification.';

COMMENT ON TABLE zapp.agent_visibility_grants IS 'Módulo Agents — nunca ativado em produção até 2026-08; ver F-009';

COMMENT ON TABLE zapp.agents IS 'Módulo Agents — nunca ativado em produção até 2026-08; ver F-009';

COMMENT ON TABLE zapp.ai_conversation_tags IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.alert_channels IS 'Canais de alerta (warroom para n8n etc).';

COMMENT ON TABLE zapp.alerts IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.allowed_countries IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.app_error_logs IS 'Production error logs from AppErrorBoundary. Auto-purge entries older than 30 days.';

COMMENT ON TABLE zapp.app_notifications IS 'Notificações in-app por usuário (outbox pattern com status pending/delivered): central de avisos do ZAPP. Escrita: cron fn_process_evolution_notifications + edges. Leitura: front (bell de notificações).';

COMMENT ON TABLE zapp.app_settings IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.audio_meme_categories IS 'Categorias estruturadas de audio-meme com slug, emoji, ordenacao e contagem automatica.';

COMMENT ON TABLE zapp.audio_meme_favorites IS 'Favoritos de audio-meme por usuario. Cada vendedor/operador tem sua propria lista de favoritos.';

COMMENT ON TABLE zapp.audio_memes IS 'Memes de áudio catalogados (envio rápido).';

COMMENT ON TABLE zapp.audit_log_tables IS 'Registro de tabelas de auditoria (metadados).';

COMMENT ON TABLE zapp.audit_logs IS 'Trilha de auditoria de ações de usuários (quem fez o quê, IP, user-agent): entity_type/entity_id + action + metadata. Escrita: triggers e handlers do front (via RPC). Leitura: compliance/admin.';

COMMENT ON TABLE zapp.audit_results IS 'Resultados de auditorias executadas.';

COMMENT ON TABLE zapp.auto_close_config IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.automation_executions IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.automation_rules IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.automations IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.avatars IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.away_messages IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.batch_jobs IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.blocked_countries IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.blocked_ips IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.budgets IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.business_hours IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.campaign_ab_variants IS 'Módulo Campaigns — nunca ativado em produção até 2026-08; ver F-009';

COMMENT ON TABLE zapp.campaign_contacts IS 'Módulo Campaigns — nunca ativado em produção até 2026-08; ver F-009';

COMMENT ON TABLE zapp.campaigns IS 'Módulo Campaigns — nunca ativado em produção até 2026-08; ver F-009';

COMMENT ON TABLE zapp.channel_connections IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.channel_provider_routes IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.channel_routing_rules IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.chatbot_executions IS 'Módulo Chatbot Flows — nunca ativado em produção até 2026-08; ver F-009';

COMMENT ON TABLE zapp.chatbot_flows IS 'Módulo Chatbot Flows — nunca ativado em produção até 2026-08; ver F-009';

COMMENT ON TABLE zapp.chunks IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.client_wallet_rules IS 'Regras de wallet do cliente (financeiro).';

COMMENT ON TABLE zapp.colaboradores IS 'Colaboradores (RH interno).';

COMMENT ON TABLE zapp.collections IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.companies IS 'Empresas (tenant do CRM, distinto de empresas do catálogo).';

COMMENT ON TABLE zapp.connection_alert_preferences IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.connection_health_logs IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.contact_assignments IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.contact_audit_log IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.contact_custom_fields IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.contact_export_log IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.contact_id_graveyard IS 'Immutable graveyard of deleted contact IDs. Prevents UUID reuse for 7 years after deletion. LGPD/GDPR compliant.';

COMMENT ON TABLE zapp.contact_intelligence IS 'Agregados de inteligência por contato: sentimento, engagement, risco, perfil DISC, lead_status. Escrita: pipeline de IA (edge analytics). Leitura: views de atendimento e dashboards.';

COMMENT ON TABLE zapp.contact_notes IS 'Notas internas por contato (add_contact_note RPC).';

COMMENT ON TABLE zapp.contact_phones IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.contact_purchases IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.contact_segments IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.contact_tags IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.conversation_analyses IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.conversation_audit_logs IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.conversation_closures IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.conversation_events IS 'Eventos de ciclo de vida de conversas: transferências entre agentes/filas, aberturas, encerramentos. Escrita: RPCs do front + triggers de conversa. Leitura: relatórios de atendimento.';

COMMENT ON TABLE zapp.conversation_memory IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.conversation_pins IS 'FATOR X v6.1.6: renomeada de zapp.conversations (colisao de nome com o dominio de chat evo.evolution_conversations). Shape real: fixacao/ordenacao de conversas por usuario (contact_id, pinned_by, position). Nunca populada.';

COMMENT ON TABLE zapp.conversation_sla IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.conversation_snoozes IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.conversation_summaries IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.conversation_tasks IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.conversation_threads IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.conversation_transfers IS 'Historico de transferencias de conversa entre agentes/departamentos. RLS: lockdown - apenas service_role. Aplicado em 2026-05-12 (Tarefa 0.5b - LOTE 1B).';

COMMENT ON TABLE zapp.cookies_config IS 'Third-party integration session state (LinkedIn/Lusha cookies, tokens). SERVICE_ROLE ONLY — never grant to anon/authenticated. Hardened 2026-07-02.';

COMMENT ON TABLE zapp.crisis_room_alerts IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.cron_schedule_executions IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.cron_schedules IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.csat_auto_config IS 'Módulo CSAT — estrutura criada; uso iniciando 2026-08; ver F-009';

COMMENT ON TABLE zapp.csat_responses IS 'Respostas CSAT por mensagem/atendimento (rating 1-5).';

COMMENT ON TABLE zapp.csat_surveys IS 'Pesquisas CSAT (definição de questionários).';

COMMENT ON TABLE zapp.custom_emojis IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.data_deletion_requests IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.dead_letter_queue IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.deal_activities IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.department_invitations IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.departments IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.dept_mapping IS 'Mapeamento de departamentos PT-BR → Enum Lusha EN. Alimenta workflows n8n e edge function lusha-search.';

COMMENT ON TABLE zapp.dev_diagnostic_logs IS 'Logs de diagnóstico do dev (debug temporário).';

COMMENT ON TABLE zapp.dispatch_error_logs IS 'Erros do dispatcher de mensagens.';

COMMENT ON TABLE zapp.dlq_audit_log IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.documents IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.email_health_logs IS 'Logs de saúde do envio de e-mail (SMTP/provider). Escrita: edges de e-mail. Leitura: ops.';

COMMENT ON TABLE zapp.email_health_summary IS 'Resumo diário de saúde de e-mail.';

COMMENT ON TABLE zapp.email_revalidation_jobs IS 'Módulo E-mail — nunca ativado em produção até 2026-08; ver F-009';

COMMENT ON TABLE zapp.email_watch_history IS 'Módulo E-mail — nunca ativado em produção até 2026-08; ver F-009';

COMMENT ON TABLE zapp.entity_versions IS 'Versionamento de entidades - RLS corrigido em 2026-06-10 (self-hosted)';

COMMENT ON TABLE zapp.environments IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.evolution_api_consumers IS 'Consumidores de API autorizados a integrar com o CRM (chaves e escopos). Mantida por admin; revogar acesso remove a integração.';

COMMENT ON TABLE zapp.evolution_automation_logs IS 'Log de execução de automações (follow-ups, keywords, agendamentos, templates). PLANEJADA (0 linhas em 2026-08); escrita por automação.';

COMMENT ON TABLE zapp.evolution_bitrix_queue IS 'Fila de sincronização com Bitrix24: operações pendentes (criar/atualizar deal, contato, atividade) aguardando envio ao CRM externo. Mantida pelo worker de sync. ARMADILHA: itens presos indicam falha de integração com Bitrix24.';

COMMENT ON TABLE zapp.evolution_burnin_tracker IS 'Controle do período de burn-in da instância (validação pós-deploy antes de tráfego real).';

COMMENT ON TABLE zapp.evolution_business_hours IS 'Horário comercial da empresa (ex.: seg-sex 8h-18h) que regula janela de atendimento, follow-ups e envio de mensagens. Mantida por admin.';

COMMENT ON TABLE zapp.evolution_chatbot_responses IS 'Respostas do chatbot para atendimento inicial automático no WhatsApp (saudação, captura de intenção). Mantida por admin; integra com keyword_automations.';

COMMENT ON TABLE zapp.evolution_contact_rate_limits IS 'Controle de rate limit por contato (remote_jid): janelas de contagem de mensagens para prevencao de flood/ban da Promo Brindes. Sem linhas no momento (reltuples 0) - estrutura pronta para uso.';

COMMENT ON TABLE zapp.evolution_daily_metrics IS 'Métricas diárias de negócio (contatos, mensagens, conversas, deals, receita). Populada por rotina diária; base do MV mv_daily_metrics.';

COMMENT ON TABLE zapp.evolution_fallback_events IS 'Eventos que caíram no caminho de FALLBACK (rota alternativa quando o processamento primário falhou). RLS: service_role ALL; authenticated só admin/supervisor.';

COMMENT ON TABLE zapp.evolution_followup_rules IS 'Regras de follow-up automático: definem quando e como reabordar lead/deal sem resposta no WhatsApp (ex.: reenviar proposta após X dias). Avaliadas por automação agendada. ARMADILHA: regra mal calibrada gera spam e queima reputação do número.';

COMMENT ON TABLE zapp.evolution_followups IS 'Execuções de follow-up disparadas pelas evolution_followup_rules; registra lead, regra, canal e resultado do contato. PLANEJADA (0 linhas em 2026-08); mantida por automação agendada.';

COMMENT ON TABLE zapp.evolution_group_messages IS 'Mensagens trocadas dentro dos grupos gerenciados. PLANEJADA (0 linhas em 2026-08); escrita pela automação de captura.';

COMMENT ON TABLE zapp.evolution_group_participants IS 'Participantes dos grupos de WhatsApp. ATIVA desde 2026-08-11 (melhoria grupos): mantida por fn_upsert_group_participants (add/remove/promote/demote idempotente).';

COMMENT ON TABLE zapp.evolution_group_rules IS 'Regras de automação para grupos (saudação de boas-vindas, anti-spam, resposta a comandos). PLANEJADA (0 linhas em 2026-08); mantida por admin.';

COMMENT ON TABLE zapp.evolution_groups IS 'Catalogo canonico de grupos de WhatsApp gerenciados. ATIVA desde 2026-08-11 (melhoria grupos): populada por fn_upsert_group_from_event (eventos) e fn_sync_groups_from_api (backfill, cron 464). ANTES disso ficava vazia - nao assumir dados historicos.';

COMMENT ON TABLE zapp.evolution_health_logs IS 'Logs de health check da Evolution API (checagens periódicas de conectividade). RLS: policies para PUBLIC com auth.uid() IS NOT NULL.';

COMMENT ON TABLE zapp.evolution_holidays IS 'Feriados que suspendem automações e follow-ups fora do horário comercial. Mantida por admin.';

COMMENT ON TABLE zapp.evolution_incident_runbook IS 'Runbooks de incidentes (passos de resposta por tipo de incidente). Acessada por fn_get_incident_runbook.';

COMMENT ON TABLE zapp.evolution_instance_credentials IS 'CREDENCIAIS das instâncias WhatsApp (Evolution API). TABELA SENSÍVEL: apikey/token podem estar em texto plano; acesso service_role only; nunca logar valores; referenciar vault_secret_id para segredos.';

COMMENT ON TABLE zapp.evolution_ip_blocklist IS 'Blocklist de IPs (abuso/401). Mantida por fn_auto_ban_401_abusers e verificações de segurança.';

COMMENT ON TABLE zapp.evolution_keyword_automations IS 'Automações disparadas por palavra-chave recebida no WhatsApp (ex.: preço → envia tabela de valores). PLANEJADA (0 linhas em 2026-08); mantida por automação de entrada.';

COMMENT ON TABLE zapp.evolution_label_associations IS 'Associação N:N entre chats/contatos e labels do WhatsApp. PLANEJADA (0 linhas em 2026-08); mantida por automação quando o estágio do deal muda.';

COMMENT ON TABLE zapp.evolution_license_health_log IS 'Log de verificações de saúde da licença do Evolution API. Registra checks periódicos de validade, alertas de expiração e eventos de renovação.';

COMMENT ON TABLE zapp.evolution_message_queue IS 'Fila de envio de mensagens WhatsApp (agendamento, prioridade e retry). Planejada: 0 linhas com 4 índices criados — integração de envio ainda não populando.';

COMMENT ON TABLE zapp.evolution_messages_wpp2_archive IS 'Arquivo frio de mensagens wpp2 com mais de 12 meses. Criado 2026-07-03. Fonte: fn_archive_old_wpp2_messages.';

COMMENT ON TABLE zapp.evolution_mirror_batches IS 'Batches de mirror/exportação para S3/R2 (0 linhas em 2026-08 — plano de mirror).';

COMMENT ON TABLE zapp.evolution_mirror_checkpoints IS 'Checkpoints de progresso do mirror (último valor processado por chave) para retomada incremental. Tabela vazia — plano de mirror R2.';

COMMENT ON TABLE zapp.evolution_mirror_media_queue IS 'Fila de mídias pendentes de mirror para R2 (S3), com tentativas e erros. Tabela vazia — plano de mirror R2 ainda não ativo.';

COMMENT ON TABLE zapp.evolution_mirror_runs IS 'Registro de execuções (runs) do processo de mirror, com tipo, status e contadores. Tabela vazia — plano de mirror R2.';

COMMENT ON TABLE zapp.evolution_monthly_audit_log IS 'Auditoria mensal consolidada (fn_monthly_evo_audit, cron 137).';

COMMENT ON TABLE zapp.evolution_notification_config IS 'Configuração de canais de notificação (email, slack, webhook). Criada/ampliada em 2026-08-11 (melhoria notificações).';

COMMENT ON TABLE zapp.evolution_notification_log IS 'Log de envio de notificações (um registro por envio tentado).';

COMMENT ON TABLE zapp.evolution_notification_outbox IS 'Outbox de notificações para canais EXTERNOS (email/slack/webhook/whatsapp_promo) — criada em 2026-08-11 (melhoria notificações). Consumida por dispatcher externo; zapp.fn_process_evolution_notifications grava aqui quando o canal é externo.';

COMMENT ON TABLE zapp.evolution_notifications IS 'Fila de notificações internas para agentes do CRM. Gerada por triggers, crons e automações.
CARDINALIDADE: ~8.664 linhas | 2,2 MB.
CICLO: evento ocorre → notificação criada → agente lê (read_at IS NOT NULL) → pode ser limpa.
CANAIS (channels_sent): email | slack | webhook | in_app | whatsapp_promo.
STATUS: pending | sent | read | failed.
PRIORIDADE: low | normal | high | urgent.
LIMPEZA: cron purge_old_notifications remove notificações lidas > 30 dias.';

COMMENT ON TABLE zapp.evolution_performance_metrics IS 'Métricas de performance por tipo (metric_date, metric_type UNIQUE).';

COMMENT ON TABLE zapp.evolution_reactions IS 'Reações (emoji) a mensagens, ingestão do evento messages.reaction da Evolution API. 113 linhas — sem FK para evolution_messages (integridade por contrato de ingestão).';

COMMENT ON TABLE zapp.evolution_realtime_events IS 'Buffer de eventos para Supabase Realtime. Materializa eventos que precisam ser propagados via websocket para o front-end CRM.
CARDINALIDADE: ~367 linhas | 592 kB — buffer rotativo, linhas antigas expiram.
PROPÓSITO: desacoplamento entre processamento de webhook e push para front-end via Supabase Realtime.
CICLO: evento processado → INSERT aqui → Realtime propaga → limpeza por TTL.';

COMMENT ON TABLE zapp.evolution_retry_metrics IS 'Métricas de requisições com retry para a Evolution API e edge functions. Gerado pelo consumer.py e N8N.
CARDINALIDADE: ~3.321 linhas | 560 kB.
PROPÓSITO: diagnosticar endpoints instáveis que requerem múltiplas tentativas. Subsídio para alertas de degradação.
CAMPOS CHAVE: action (endpoint chamado), attempt_count (tentativas), final_status (success/failed), total_duration_ms.
ANÁLISE: SELECT action, avg(attempt_count), avg(total_duration_ms), count(*) FROM evo.evolution_retry_metrics GROUP BY 1 ORDER BY 2 DESC.';

COMMENT ON TABLE zapp.evolution_sales_pipeline IS 'Etapas do funil de vendas configuráveis (novo lead, proposta enviada, negociação, ganho/perdido). PLANEJADA (0 linhas em 2026-08); sem pipeline populado, deals ficam sem estágio canônico. Mantida por admin.';

COMMENT ON TABLE zapp.evolution_scheduled_messages IS 'Mensagens agendadas para envio futuro (lembrete de follow-up, cobrança, campanha). PLANEJADA (0 linhas em 2026-08); mantida por scheduler.';

COMMENT ON TABLE zapp.evolution_send_idempotency IS 'Chaves de idempotência de envio: garante que retentativas não dupliquem mensagens. PLANEJADA (0 linhas em 2026-08). ARMADILHA: limpar registros durante campanha ativa pode causar reenvio duplicado.';

COMMENT ON TABLE zapp.evolution_sentiment_analysis IS 'Análise de sentimento de mensagens de clientes (positivo/neutro/negativo) para priorizar atendimento. PLANEJADA (0 linhas em 2026-08); mantida por automação/IA.';

COMMENT ON TABLE zapp.evolution_settings IS 'Configurações gerais do módulo CRM/atendimento (chave-valor: ex. empresa, fuso, limites). Mantida por admin.';

COMMENT ON TABLE zapp.evolution_source_schema_map IS 'Mapa de schemas/tabelas/colunas de FONTES externas descobertas (para auditoria de espelhamento). Planejada — sem linhas em 2026-08.';

COMMENT ON TABLE zapp.evolution_source_shadow_log IS 'Log de medições shadow entre fonte e espelho (auditoria de paridade de dados).';

COMMENT ON TABLE zapp.evolution_spam_keywords IS 'Palavras-chave que classificam mensagens recebidas como spam para filtro do atendimento. Mantida por admin.';

COMMENT ON TABLE zapp.evolution_stage_mapping IS 'Mapeia estágios do funil de vendas para labels do WhatsApp, refletindo a etapa do deal direto no chat. ARMADILHA: label sem mapeamento aqui não acompanha o estágio real do deal.';

COMMENT ON TABLE zapp.evolution_status_reactions IS 'Reacoes aos Status WhatsApp - manuais (vendedor) ou automaticas (bot). Rastreia envio ao WhatsApp. RLS: lockdown - apenas service_role. Aplicado em 2026-05-12 (Tarefa 0.5b - LOTE 1A).';

COMMENT ON TABLE zapp.evolution_tag_assignments IS 'Vínculo N:N entre contatos/deals e tags de segmentação. PLANEJADA (0 linhas em 2026-08); mantida pelo app.';

COMMENT ON TABLE zapp.evolution_template_usage IS 'Histórico de uso de templates HSM (quem enviou, para qual contato, status). PLANEJADA (0 linhas em 2026-08); mantida pela automação de envio.';

COMMENT ON TABLE zapp.evolution_whatsapp_status IS 'WhatsApp status/story cache: 14,789 rows, 10 MB. High update rate (status viewed events). Autovacuum tuned in melhoria5. Indexes wstatus_viewed_expires, wstatus_expires_at, wstatus_posted, wstatus_participant, wstatus_instance dropped in audit (0 scans).';

COMMENT ON TABLE zapp.extensions IS 'Extensões habilitadas no banco (pg extension registry do app).';

COMMENT ON TABLE zapp.failed_messages IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.favorite_contacts IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.feature_flags IS 'Feature flags por tenant/ambiente: liga/desliga funcionalidades.';

COMMENT ON TABLE zapp.file_scan_logs IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.followup_executions IS 'Módulo Follow-up — nunca ativado em produção até 2026-08; ver F-009';

COMMENT ON TABLE zapp.followup_sequences IS 'Módulo Follow-up — nunca ativado em produção até 2026-08; ver F-009';

COMMENT ON TABLE zapp.followup_steps IS 'Módulo Follow-up — nunca ativado em produção até 2026-08; ver F-009';

COMMENT ON TABLE zapp.geo_blocking_settings IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.global_settings IS 'Configurações globais do sistema (kv).';

COMMENT ON TABLE zapp.goals_configurations IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.inbox_custom_scopes IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.integrations IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.interactions IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.ip_whitelist IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.lgpd_consent_audit IS 'Módulo LGPD — nunca ativado em produção até 2026-08; ver F-009';

COMMENT ON TABLE zapp.lgpd_consent_audit_archive IS 'Módulo LGPD — nunca ativado em produção até 2026-08; ver F-009';

COMMENT ON TABLE zapp.login_attempts IS 'Tentativas de login (segurança/brute-force).';

COMMENT ON TABLE zapp.message_attempts IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.message_audit_log IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.message_queue IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.message_reactions IS 'Reações a mensagens (emoji por usuário): espelho do evolution_reactions. Escrita: consumer. Leitura: front.';

COMMENT ON TABLE zapp.message_templates IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.mfa_sessions IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.integration_registry IS 'Integrações registradas (catálogo de conectores externos).';

COMMENT ON TABLE zapp.notification_channels_config IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.notification_templates IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.notifications IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.number_reputation IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.onboarding_steps IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.outbound_delivery_audit IS 'Auditoria de entrega outbound (o que saiu, quando, status).';

COMMENT ON TABLE zapp.outbound_message_queue IS 'Fila de envio outbound (outbox pattern): claim FOR UPDATE SKIP LOCKED, retry/backoff (retry_count/max_retries). Escrita: edges de envio + dispatcher cron. Leitura: watchdogs de fila.';

COMMENT ON TABLE zapp.outbox_events IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.passkey_credentials IS 'Passkeys WebAuthn. RLS: usuario so ve suas proprias passkeys (user_id = auth.uid()). Aplicado em 2026-05-12 (Tarefa 4D).';

COMMENT ON TABLE zapp.password_reset_tokens IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.perfis_usuarios IS '[LOGISTICA] Perfis dos usuários do painel de cotação. Roles: admin (gestão) ou cotacao (operação). FK para auth.users com ON DELETE CASCADE.';

COMMENT ON TABLE zapp.performance_snapshots IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.permissions IS 'Permissões granulares (lookup) usadas por policies/feature flags.';

COMMENT ON TABLE zapp.personal_stickers IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.pii_access_log IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.pinned_conversations IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.processed_webhook_events IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.provider_configs IS 'Módulo Providers — nunca ativado em produção até 2026-08; ver F-009';

COMMENT ON TABLE zapp.provider_message_log IS 'Módulo Providers — nunca ativado em produção até 2026-08; ver F-009';

COMMENT ON TABLE zapp.provider_session_logs IS 'Módulo Providers — nunca ativado em produção até 2026-08; ver F-009';

COMMENT ON TABLE zapp.provider_sessions IS 'Módulo Providers — nunca ativado em produção até 2026-08; ver F-009';

COMMENT ON TABLE zapp.qr_attempts IS 'Tentativas de leitura de QR (pareamento instância).';

COMMENT ON TABLE zapp.queue_goals IS 'Módulo Filas (queue_*) — nunca ativado em produção até 2026-08; ver F-009';

COMMENT ON TABLE zapp.queue_members IS 'Membros das filas de atendimento.';

COMMENT ON TABLE zapp.queue_positions IS 'Módulo Filas (queue_*) — nunca ativado em produção até 2026-08; ver F-009';

COMMENT ON TABLE zapp.queue_routing_rules IS 'Módulo Filas (queue_*) — nunca ativado em produção até 2026-08; ver F-009';

COMMENT ON TABLE zapp.queue_skill_requirements IS 'Módulo Filas (queue_*) — nunca ativado em produção até 2026-08; ver F-009';

COMMENT ON TABLE zapp.quick_replies IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.rate_limit_configs IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.rate_limit_logs IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.reconnection_logs IS 'Logs de reconexão da instância (tentativas, backoff). Escrita: watchdogs. Leitura: ops.';

COMMENT ON TABLE zapp.reminders IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.reprocess_jobs IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.restore_test_log IS 'Resultados dos testes de restore de backup (DR): valida dumps periodicamente. Escrita: cron restore-integrity-check. Leitura: ops/DR.';

COMMENT ON TABLE zapp.role_permissions IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.roles IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.route_permissions IS 'Permissoes de rotas por role. PK(id) adicionado em auditoria 2026-07-04. UNIQUE em path.';

COMMENT ON TABLE zapp.rpc_rate_limits IS 'Rate limits por RPC (janela deslizante).';

COMMENT ON TABLE zapp.sales_deals IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.sales_pipeline_stages IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.saved_filters IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.scheduled_job_log IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.scheduled_reports IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.search_history IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.search_insights IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.security_acl_alerts IS 'Alertas do monitor de ACLs de segurança (fn_score_security_acl): violações de grants/policies detectadas. Escrita: cron de score de segurança. Leitura: ops/security.';

COMMENT ON TABLE zapp.security_alerts IS 'Módulo Security — nunca ativado em produção até 2026-08; ver F-009';

COMMENT ON TABLE zapp.security_audit_logs IS 'Módulo Security — nunca ativado em produção até 2026-08; ver F-009';

COMMENT ON TABLE zapp.sentiment_alerts IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.sessions IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.sla_alert_preferences IS 'Módulo SLA — nunca ativado em produção até 2026-08; ver F-009';

COMMENT ON TABLE zapp.sla_configurations IS 'Módulo SLA — nunca ativado em produção até 2026-08; ver F-009';

COMMENT ON TABLE zapp.sla_delivery_rules IS 'Regras de SLA de entrega (limiares).';

COMMENT ON TABLE zapp.sla_delivery_violations IS 'Violações de SLA registradas.';

COMMENT ON TABLE zapp.sla_history IS 'Tabela de histórico de SLA. RLS ativo.
Policies após FIX GAP-RLS (2026-08-06):
  sla_history_insert — INSERT PUBLIC, WITH CHECK (auth.uid() IS NOT NULL) [mantida]
  sla_history_select — SELECT PUBLIC, USING (auth.uid() IS NOT NULL) [mantida]
  sla_history_update — UPDATE PUBLIC, USING (auth.uid() IS NOT NULL) [mantida]
  sla_hist_insert, sla_hist_select, sla_hist_update — REMOVIDAS (duplicatas)';

COMMENT ON TABLE zapp.sla_rules IS 'Módulo SLA — nunca ativado em produção até 2026-08; ver F-009';

COMMENT ON TABLE zapp.sla_violations IS 'Módulo SLA — nunca ativado em produção até 2026-08; ver F-009';

COMMENT ON TABLE zapp.solicitacoes_vale IS 'Solicitações de vale-transporte/refeição (RH).';

COMMENT ON TABLE zapp.sticker_categories IS 'Categorias de stickers (lookup). Escrita: admin. Leitura: front.';

COMMENT ON TABLE zapp.sticker_favorites IS 'Tabela de stickers favoritos por usuário. RLS ativo.
Policies após FIX (2026-08-06):
  sf_select_all  — SELECT authenticated, USING true (leitura de todos os registros ok)
  sf_insert_auth — INSERT authenticated, WITH CHECK (user_id = auth.uid())
  sf_delete_own  — DELETE authenticated, USING (user_id = auth.uid()) [CORRIGIDA 2026-08-06]
Políticas removidas: sf_service_all (mal-nomeada, aplicava a authenticated com acesso irrestrito).';

COMMENT ON TABLE zapp.storage_cleanup_logs IS 'Registro de execuções da edge function cleanup-storage-orphans. Uma linha por bucket por execução.';

COMMENT ON TABLE zapp.stress_test_metrics IS 'Métricas de stress tests executados (latências, throughput). Escrita: harness de teste. Leitura: relatórios.';

COMMENT ON TABLE zapp.stress_test_runs IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.sts_performance_metrics IS 'Métricas do STS (token service).';

COMMENT ON TABLE zapp.sts_telemetry IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.sts_troubleshooting_report IS 'Relatórios de troubleshooting STS (tokens/sessão). Escrita: diagnóstico. Leitura: ops.';

COMMENT ON TABLE zapp.supplier_pix_keys IS 'Chaves PIX de fornecedores (sensivel). RLS: lockdown — apenas service_role. Acesso ao frontend deve ser via Edge Function dedicada com auditoria. Aplicado em 2026-05-12 (Tarefa 0.5 do plano de consolidacao Self-Hosted).';

COMMENT ON TABLE zapp.system_connections IS 'Armazena configurações de conexões externas (ex: Supabase FATOR X). Gerenciada pela UI em /admin/connections.';

COMMENT ON TABLE zapp.system_docs IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.system_health_incidents IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.system_kill_switches IS 'Kill-switches globais do sistema (desligar features em emergência).';

COMMENT ON TABLE zapp.system_logs IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.tags IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.talkx_blacklist IS 'Módulo TalkX — nunca ativado em produção até 2026-08; ver F-009';

COMMENT ON TABLE zapp.talkx_campaigns IS 'Módulo TalkX — nunca ativado em produção até 2026-08; ver F-009';

COMMENT ON TABLE zapp.talkx_recipients IS 'Módulo TalkX — nunca ativado em produção até 2026-08; ver F-009';

COMMENT ON TABLE zapp.task_queues IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.team_conversation_members IS 'Membros de conversas em equipe.';

COMMENT ON TABLE zapp.team_conversations IS 'Conversas em equipe (colaborativas).';

COMMENT ON TABLE zapp.team_message_reactions IS 'Reações em mensagens de equipe.';

COMMENT ON TABLE zapp.team_message_receipts IS 'Tabela de recibos de leitura de mensagens de equipe. RLS ativo.
Policies após FIX GAP-RLS (2026-08-06):
  receipts_select      — SELECT PUBLIC, USING (auth.uid() IS NOT NULL) [acesso amplo]
  team_receipts_select — SELECT authenticated, USING (own profile OR admin)
  receipts_insert      — REMOVIDA (duplicata de team_receipts_insert)
  team_receipts_insert — INSERT PUBLIC, WITH CHECK (auth.uid() IS NOT NULL)
  receipts_update      — UPDATE authenticated, USING (own profile via user_id) [CORRIGIDA: era profiles.id=auth.uid()]
  team_receipts_update — UPDATE PUBLIC, USING (auth.uid() IS NOT NULL)';

COMMENT ON TABLE zapp.team_messages IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.transfer_comments IS 'Comentarios em transferencias de conversa entre agentes/departamentos. RLS: lockdown - apenas service_role. Aplicado em 2026-05-12 (Tarefa 0.5b - LOTE 1B).';

COMMENT ON TABLE zapp.user_devices IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.user_roles IS 'Papéis de usuário (admin/supervisor/agent). Escrita: admin. Leitura: policies RLS (is_admin_*).';

COMMENT ON TABLE zapp.user_service_accounts IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.user_sessions IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.user_settings IS 'Preferências por usuário (UI, notificações). Escrita: front. Leitura: front.';

COMMENT ON TABLE zapp.vault_healthcheck_log IS 'Onda 9.1 - log do healthcheck do Supabase Vault. Append-only, retencao 30d via cron. RLS: lockdown - apenas service_role. Aplicado em 2026-05-12 (Tarefa 0.5b - LOTE 1A).';

COMMENT ON TABLE zapp.voice_command_logs IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.warroom_alerts IS 'Alertas críticos operacionais (war room): monitors/watchdogs inserem; n8n espelha p/ webhook de alerta. severity critical/warning; resolved_at fecha o alerta.';

COMMENT ON TABLE zapp.webauthn_challenges IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.webhook_events IS 'Tabela de suporte a webhooks — sem dados até 2026-08; ver F-009';

COMMENT ON TABLE zapp.webhook_health_alerts IS 'Alertas de saúde do webhook (rajadas, silêncio, 401 silencioso): inseridos por watchdogs de webhook. Leitura: ops.';

COMMENT ON TABLE zapp.webhook_health_checks IS 'Tabela de suporte a webhooks — sem dados até 2026-08; ver F-009';

COMMENT ON TABLE zapp.webhook_preferences IS 'Tabela de suporte a webhooks — sem dados até 2026-08; ver F-009';

COMMENT ON TABLE zapp.webhook_rate_limits IS 'Contadores de rate limit por instância/evento (janela deslizante). Escrita: increment_webhook_rate_limit. Leitura: RPCs de limite.';

COMMENT ON TABLE zapp.whatsapp_cloud_webhook_pings IS 'Pings do webhook cloud (teste de chegada): prova de vida do endpoint. Escrita: watchdog. Leitura: ops.';

COMMENT ON TABLE zapp.whatsapp_connection_queues IS 'Conexões WhatsApp-Filas - RLS corrigido em 2026-06-10 (self-hosted)';

COMMENT ON TABLE zapp.whatsapp_flows IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.whatsapp_groups IS 'Grupos WhatsApp (espelho simplificado de evolution_groups). Escrita: cron sync-groups. Leitura: front.';

COMMENT ON TABLE zapp.whatsapp_official_credentials IS 'Credenciais oficiais WhatsApp Business API. RLS: apenas admins/devs. Aplicado em 2026-05-12 (Tarefa 4D).';

COMMENT ON TABLE zapp.whatsapp_templates IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.whisper_files IS 'Arquivos de transcrição Whisper pendentes/processados.';

COMMENT ON TABLE zapp.whisper_messages IS 'Internal whisper notes between agents (invisible to end customers). RLS: agents see/update only whispers where they are sender or target_agent_id; supervisors/admins see all. Indexes: contact_id, target_agent_id, sender_id, partial on is_read=false.';

COMMENT ON TABLE zapp.workspace_members IS 'Membros por workspace (associação usuário↔workspace).';

COMMENT ON TABLE zapp.workspace_settings IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.workspaces IS 'Workspaces/tenants do ZAPP.';

COMMENT ON TABLE zapp.zapp_audit_log IS 'Auditoria específica do ZAPP (ações de sistema).';

COMMENT ON TABLE zapp._audit_sim_results IS 'Resultados de simulações de auditoria (rodadas read-only). Escrita: agentes de auditoria. Leitura: relatórios.';

COMMENT ON TABLE zapp._authoritative_time IS 'Fonte de tempo autoritativa (drift-check de relógio).';

COMMENT ON TABLE zapp._db_size_snapshots IS 'Snapshots diários de tamanho do banco (tendência de crescimento).';

COMMENT ON TABLE zapp._encryption_keys IS 'Chaves de criptografia do app (gestão interna).';

COMMENT ON TABLE zapp._input_normalization_cache IS 'Cache da normalização de inputs (dedup de processamento).';

COMMENT ON TABLE zapp._lgpd_retention_policies IS 'Políticas de retenção LGPD definidas (nunca ativadas).';

COMMENT ON TABLE zapp._pagination_state IS 'Estado de paginação de backfills (checkpoints).';

COMMENT ON TABLE zapp._snapshot_version_state IS 'Estado da versão de snapshot do pipeline (increment_snapshot_version).';

COMMENT ON TABLE zapp._system_health_history IS 'Histórico agregado de saúde (versões antigas do score).';

COMMENT ON TABLE zapp._system_health_log IS 'Snapshots periódicos de saúde do sistema (score + componentes). Escrita: cron fn_system_health_score. Leitura: dashboards ops.';

COMMENT ON TABLE zapp._vault_corrupted_quarantine IS 'Secrets do vault corrompidos em quarentena (isolados até rotação).';

COMMENT ON TABLE zapp.agent_memories IS 'Módulo Agents — nunca ativado em produção até 2026-08; ver F-009';

COMMENT ON TABLE zapp.ai_function_metrics IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.alert_dispatch_state IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.analytics_events IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.api_circuit_breaker IS 'Circuit breaker por serviço externo. Estados: closed=normal, open=bloqueado, half_open=testando. Impede chamadas a API morta até cooldown expirar.';

COMMENT ON TABLE zapp.api_keys IS 'API keys table. RLS lockdown - apenas service_role. Aplicado em 2026-05-12 (Tarefa 4D).';

COMMENT ON TABLE zapp.audio_dedupe_log IS 'Log de deduplicação de áudios (hash): auditoria do dedup de mídia. Escrita: pipeline de mídia. Leitura: ops.';

COMMENT ON TABLE zapp.auto_export_jobs IS 'AutoExport (G4): jobs de exportação CSV/JSON via edge zapp-auto-export. Arquivos em storage privado zapp-exports; acesso via signed URL. RLS admin-only.';

COMMENT ON TABLE zapp.consent_records IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.constraint_changelog IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.contact_identity_lid_staging IS 'Staging do mapeamento LID↔JID de contatos (upgrade LID): acessada só por SECDEF/cron. Escrita: pipeline LID. Leitura: SECDEF.';

COMMENT ON TABLE zapp.conversation_participants IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.cookie_probe_log IS 'Logs do probe de cookies/sessão Baileys (webhook-check watchdog): resultado de probes periódicos de integridade de sessão. Escrita: watchdog cron. Leitura: ops.';

COMMENT ON TABLE zapp.cookie_probe_pending IS 'Probes de cookie agendados (fila do watchdog).';

COMMENT ON TABLE zapp.credential_audit_logs IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.credential_vault IS 'Credential vault. RLS lockdown - apenas service_role. Aplicado em 2026-05-12 (Tarefa 4D).';

COMMENT ON TABLE zapp.crm_sync_config IS 'CRM plugável: 1 linha por provider. Secrets NUNCA em settings (ficam em env da edge ou vault) — settings só carrega config não-secreta (label, mapping de campos, base_url publica, dry_run).';

COMMENT ON TABLE zapp.cron_inventory IS 'Inventário versionado dos crons pg_cron (snapshot para drift-check). Escrita: cron de inventário. Leitura: ops/docs.';

COMMENT ON TABLE zapp.dashboard_queries IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.deploy_connections IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.emails IS 'Registro canônico de emails (inbound via webhook Resend, outbound via Resend API). message_id único garante idempotência de webhook. Inbound é admin-only; outbound é do user_id dono + admin.';

COMMENT ON TABLE zapp.embedding_configs IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.engineering_principles IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.evaluation_datasets IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.evaluation_runs IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.evo_reconcile_contact_snapshot IS 'Snapshots do delta contacts Evolution API vs mirror zapp. Populado pelo evo-reconcile a cada 900s.';

COMMENT ON TABLE zapp.favorite_messages IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.finetune_jobs IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.fn_health_score_cache IS 'Cache da fn_system_health_score(). TTL configuravel (default 5min). Evita 20+ queries sequenciais a cada chamada de monitoramento. Impacto: 1060ms -> <5ms em cache hits.';

COMMENT ON TABLE zapp.fn_health_score_history IS 'Histórico do health score de edge functions (por função). Escrita: cron health. Leitura: dashboards.';

COMMENT ON TABLE zapp.forensic_snapshots IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.forwarded_messages IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.google_calendar_config IS 'Configuração da integração Google Calendar (singleton id=1). Sem linha = integração desligada (contrato G1).';

COMMENT ON TABLE zapp.hmac_selftest_audit IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.installed_templates IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.invites IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.license_heartbeat_log IS 'Heartbeats de licença da Evolution (conformidade): um por ciclo. Escrita: cron. Leitura: ops.';

COMMENT ON TABLE zapp.lux_system_alerts IS 'LUX: alertas operacionais — JWT expiry, circuits open, API EOL, Bearer missing';

COMMENT ON TABLE zapp.message_reports IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.migration_audit IS 'Auditoria de operações de migration/backfill (phase, entity, action, rows).';

COMMENT ON TABLE zapp.n8n_config IS 'Configuração da integração n8n (single-row, id=1). Contrato real desligado: enabled=false até o pipeline de dispatch existir.';

COMMENT ON TABLE zapp.n8n_variables IS 'Variáveis compartilhadas com n8n (integrações). Escrita: ops. Leitura: n8n via RPC.';

COMMENT ON TABLE zapp.notification_delivery_log IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.pinned_messages IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.processed_requests IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.query_telemetry IS 'Telemetria de queries (latências por RPC).';

COMMENT ON TABLE zapp.queue_analytics IS 'Módulo Filas (queue_*) — nunca ativado em produção até 2026-08; ver F-009';

COMMENT ON TABLE zapp.queue_items IS 'Módulo Filas (queue_*) — nunca ativado em produção até 2026-08; ver F-009';

COMMENT ON TABLE zapp.realtime_message_fanout IS 'Log de fanout realtime: entrega de eventos WS por usuário/dispositivo. Escrita: pipeline realtime. Leitura: diagnóstico de WS.';

COMMENT ON TABLE zapp.rls_denied_log IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.scheduled_report_runs IS 'Auditoria + DLQ + outbox dos relatórios agendados. A fn gera o conteúdo aqui; a edge send-scheduled-report claima (SKIP LOCKED), faz upload p/ storage zapp-reports, gera signed URL e envia email.';

COMMENT ON TABLE zapp.schema_migrations IS 'Migrations aplicadas ao schema zapp (controle próprio, além do supabase_migrations). Escrita: pipeline de migration. Leitura: drift-check.';

COMMENT ON TABLE zapp.security_events IS 'Módulo Security — nunca ativado em produção até 2026-08; ver F-009';

COMMENT ON TABLE zapp.sentry_config IS 'Config do Sentry por ambiente.';

COMMENT ON TABLE zapp.supabase_projects IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.system_settings IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.tenants IS 'Tenants (multi-tenant root).';

COMMENT ON TABLE zapp.test_cases IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

COMMENT ON TABLE zapp.voip_profile_credentials IS 'Credenciais SIP por perfil (VoIP). Leitura SOMENTE via edge function zapp-get-sip-credentials (service_role) — sem GRANT para PostgREST.';

COMMENT ON TABLE zapp.webhook_endpoints IS 'Tabela de suporte a webhooks — sem dados até 2026-08; ver F-009';

COMMENT ON TABLE zapp.webhook_idempotency IS 'Tabela de suporte a webhooks — sem dados até 2026-08; ver F-009';

COMMENT ON TABLE zapp.webhook_reprocess_queue IS 'Tabela de suporte a webhooks — sem dados até 2026-08; ver F-009';

COMMENT ON TABLE zapp.workspace_secrets IS 'Workspace secrets. RLS lockdown - apenas service_role. Aplicado em 2026-05-12 (Tarefa 4D).';

COMMENT ON TABLE zapp.xp_transactions IS 'Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO';

