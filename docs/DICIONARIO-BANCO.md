# Dicionario do Banco — schemas `zapp` + `evo`

> Gerado em 2026-08-20 pela execucao do plano de correcao (100 etapas, Bloco 7 etapa 66/68).
> Fonte: catalogo vivo do Postgres de producao (pg_class/pg_description/cron.job).
> Texto integral dos comments (inclusive multilinha e colunas): `supabase/schema-snapshots/zapp_ddl_20260820.sql`.
> Cobertura de comments: tabelas zapp 100% (386/386), tabelas evo 100% (74/74), colunas zapp 47,7% (1.942/4.075 — 98% das colunas de tabelas com dados), rpc_* evo 100% (29/29), rpc_* zapp 27% (59/218).

## Schema zapp — 386 tabelas

| Tabela | Rows (reltuples) | Comment |
|---|---:|---|
| _audit_sim_results | 150 | Resultados de simulações de auditoria (rodadas read-only). Escrita: agentes de auditoria. Leitura: relatórios. |
| _authoritative_time | 1 | Fonte de tempo autoritativa (drift-check de relógio). |
| _consumer_dlq | 0 | DLQ do consumer RabbitMQ (mensagens que falharam reprocessamento). |
| _db_size_snapshots | 2484 | Snapshots diários de tamanho do banco (tendência de crescimento). |
| _encryption_keys | 1 | Chaves de criptografia do app (gestão interna). |
| _input_normalization_cache | 4 | Cache da normalização de inputs (dedup de processamento). |
| _lgpd_retention_policies | 1 | Políticas de retenção LGPD definidas (nunca ativadas). |
| _pagination_state | 7 | Estado de paginação de backfills (checkpoints). |
| _snapshot_version_state | 1 | Estado da versão de snapshot do pipeline (increment_snapshot_version). |
| _system_health_history | 4 | Histórico agregado de saúde (versões antigas do score). |
| _system_health_log | 1091 | Snapshots periódicos de saúde do sistema (score + componentes). Escrita: cron fn_system_health_score. Leitura: dashboards ops. |
| _vault_corrupted_quarantine | 7 | Secrets do vault corrompidos em quarentena (isolados até rotação). |
| agent_achievements | 0 | Módulo Agents — nunca ativado em produção até 2026-08; ver F-009 |
| agent_installed_skills | 0 | Módulo Agents — nunca ativado em produção até 2026-08; ver F-009 |
| agent_memories | 0 | Módulo Agents — nunca ativado em produção até 2026-08; ver F-009 |
| agent_presence | 0 | Módulo Agents — nunca ativado em produção até 2026-08; ver F-009 |
| agent_skills | 0 | Módulo Agents — nunca ativado em produção até 2026-08; ver F-009 |
| agent_stats | 21 | Estatísticas gamificadas por agente (XP, level — contrato E70). Escrita: rpc_grant_xp SECDEF. Leitura: front gamification. |
| agent_visibility_grants | 0 | Módulo Agents — nunca ativado em produção até 2026-08; ver F-009 |
| agents | 0 | Módulo Agents — nunca ativado em produção até 2026-08; ver F-009 |
| ai_conversation_tags | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| ai_function_metrics | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| alert_channels | 3 | Canais de alerta (warroom para n8n etc). |
| alert_dispatch_state | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| alerts | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| allowed_countries | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| analytics_events | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| api_circuit_breaker | 3 | Circuit breaker por serviço externo. Estados: closed=normal, open=bloqueado, half_open=testando. Impede chamadas a API morta até cooldown expirar. |
| api_keys | 4 | API keys table. RLS lockdown - apenas service_role. Aplicado em 2026-05-12 (Tarefa 4D). |
| app_error_logs | 0 | Production error logs from AppErrorBoundary. Auto-purge entries older than 30 days. |
| app_notifications | 13211 | Notificações in-app por usuário (outbox pattern com status pending/delivered): central de avisos do ZAPP. Escrita: cron fn_process_evolution_notifications + edges. Leitura: front (bell de notificações). |
| app_settings | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| audio_dedupe_log | 533 | Log de deduplicação de áudios (hash): auditoria do dedup de mídia. Escrita: pipeline de mídia. Leitura: ops. |
| audio_meme_categories | 12 | Categorias estruturadas de audio-meme com slug, emoji, ordenacao e contagem automatica. |
| audio_meme_favorites | 1 | Favoritos de audio-meme por usuario. Cada vendedor/operador tem sua propria lista de favoritos. |
| audio_memes | 17 | Memes de áudio catalogados (envio rápido). |
| audit_log_tables | 4 | Registro de tabelas de auditoria (metadados). |
| audit_logs | 15178 | Trilha de auditoria de ações de usuários (quem fez o quê, IP, user-agent): entity_type/entity_id + action + metadata. Escrita: triggers e handlers do front (via RPC). Leitura: compliance/admin. |
| audit_results | 2 | Resultados de auditorias executadas. |
| auto_close_config | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| auto_export_jobs | 0 | AutoExport (G4): jobs de exportação CSV/JSON via edge zapp-auto-export. Arquivos em storage privado zapp-exports; acesso via signed URL. RLS admin-only. |
| automation_executions | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| automation_rules | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| automations | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| avatars | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| away_messages | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| batch_jobs | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| blocked_countries | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| blocked_ips | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| budgets | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| business_hours | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| calls | 98 | Chamadas de voz WhatsApp registradas (incoming/outgoing). Escrita: consumer. Leitura: front. |
| campaign_ab_variants | 0 | Módulo Campaigns — nunca ativado em produção até 2026-08; ver F-009 |
| campaign_contacts | 0 | Módulo Campaigns — nunca ativado em produção até 2026-08; ver F-009 |
| campaigns | 0 | Módulo Campaigns — nunca ativado em produção até 2026-08; ver F-009 |
| channel_connections | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| channel_provider_routes | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| channel_queues | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| channel_routing_rules | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| chatbot_executions | 0 | Módulo Chatbot Flows — nunca ativado em produção até 2026-08; ver F-009 |
| chatbot_flows | 0 | Módulo Chatbot Flows — nunca ativado em produção até 2026-08; ver F-009 |
| chunks | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| client_wallet_rules | 1 | Regras de wallet do cliente (financeiro). |
| colaboradores | 1 | Colaboradores (RH interno). |
| collections | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| companies | 4 | Empresas (tenant do CRM, distinto de empresas do catálogo). |
| connection_alert_preferences | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| connection_health_logs | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| consent_records | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| constraint_changelog | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| contact_assignments | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| contact_audit_log | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| contact_custom_fields | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| contact_export_log | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| contact_id_graveyard | 797 | Immutable graveyard of deleted contact IDs. Prevents UUID reuse for 7 years after deletion. LGPD/GDPR compliant. |
| contact_identity_lid_staging | 190 | Staging do mapeamento LID↔JID de contatos (upgrade LID): acessada só por SECDEF/cron. Escrita: pipeline LID. Leitura: SECDEF. |
| contact_intelligence | 21648 | Agregados de inteligência por contato: sentimento, engagement, risco, perfil DISC, lead_status. Escrita: pipeline de IA (edge analytics). Leitura: views de atendimento e dashboards. |
| contact_notes | 1 | Notas internas por contato (add_contact_note RPC). |
| contact_phones | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| contact_purchases | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| contact_segments | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| contact_tags | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| contatos | 3236 | Contatos legados do CRM (pré-decouple): lido por telas antigas de importação. Escrita: imports manuais históricos. Leitura: telas legadas — candidato a arquivamento (ver F-009). |
| conversation_analyses | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| conversation_audit_logs | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| conversation_closures | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| conversation_events | 20716 | Eventos de ciclo de vida de conversas: transferências entre agentes/filas, aberturas, encerramentos. Escrita: RPCs do front + triggers de conversa. Leitura: relatórios de atendimento. |
| conversation_memory | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| conversation_participants | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| conversation_pins | 0 | FATOR X v6.1.6: renomeada de zapp.conversations (colisao de nome com o dominio de chat evo.evolution_conversations). Shape real: fixacao/ordenacao de conversas por usuario (contact_id, pinned_by, position). Nunca popula… |
| conversation_sla | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| conversation_snoozes | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| conversation_summaries | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| conversation_tasks | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| conversation_threads | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| conversation_transfers | 0 | Historico de transferencias de conversa entre agentes/departamentos. RLS: lockdown - apenas service_role. Aplicado em 2026-05-12 (Tarefa 0.5b - LOTE 1B). |
| cookie_probe_log | 3092 | Logs do probe de cookies/sessão Baileys (webhook-check watchdog): resultado de probes periódicos de integridade de sessão. Escrita: watchdog cron. Leitura: ops. |
| cookie_probe_pending | 2 | Probes de cookie agendados (fila do watchdog). |
| cookies_config | 3 | Third-party integration session state (LinkedIn/Lusha cookies, tokens). SERVICE_ROLE ONLY — never grant to anon/authenticated. Hardened 2026-07-02. |
| credential_audit_logs | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| credential_vault | 0 | Credential vault. RLS lockdown - apenas service_role. Aplicado em 2026-05-12 (Tarefa 4D). |
| crisis_room_alerts | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| crm_sync_config | 0 | CRM plugável: 1 linha por provider. Secrets NUNCA em settings (ficam em env da edge ou vault) — settings só carrega config não-secreta (label, mapping de campos, base_url publica, dry_run). |
| cron_inventory | 158 | Inventário versionado dos crons pg_cron (snapshot para drift-check). Escrita: cron de inventário. Leitura: ops/docs. |
| cron_schedule_executions | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| cron_schedules | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| csat_auto_config | 0 | Módulo CSAT — estrutura criada; uso iniciando 2026-08; ver F-009 |
| csat_responses | 0 | Respostas CSAT por mensagem/atendimento (rating 1-5). |
| csat_surveys | 1 | Pesquisas CSAT (definição de questionários). |
| custom_emojis | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| dashboard_queries | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| data_deletion_requests | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| dead_letter_queue | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| deal_activities | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| department_invitations | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| departments | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| deploy_connections | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| dept_mapping | 137 | Mapeamento de departamentos PT-BR → Enum Lusha EN. Alimenta workflows n8n e edge function lusha-search. |
| dev_diagnostic_logs | 2 | Logs de diagnóstico do dev (debug temporário). |
| dispatch_error_logs | 1 | Erros do dispatcher de mensagens. |
| dlq_audit_log | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| documents | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| email_health_logs | 197 | Logs de saúde do envio de e-mail (SMTP/provider). Escrita: edges de e-mail. Leitura: ops. |
| email_health_summary | 1 | Resumo diário de saúde de e-mail. |
| email_revalidation_jobs | 0 | Módulo E-mail — nunca ativado em produção até 2026-08; ver F-009 |
| email_watch_history | 0 | Módulo E-mail — nunca ativado em produção até 2026-08; ver F-009 |
| emails | 0 | Registro canônico de emails (inbound via webhook Resend, outbound via Resend API). message_id único garante idempotência de webhook. Inbound é admin-only; outbound é do user_id dono + admin. |
| embedding_configs | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| empresas | 51688 | Empresas do catálogo (CRM Sicoob/corporativo): nome, contatos, vínculo Bitrix24 (bitrix_empresa_id). Escrita: edge functions catálogo/sicoob. Leitura: painéis internos. |
| engineering_principles | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| entity_versions | 0 | Versionamento de entidades - RLS corrigido em 2026-06-10 (self-hosted) |
| environments | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| evaluation_datasets | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| evaluation_runs | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| evo_reconcile_contact_snapshot | 580 | Snapshots do delta contacts Evolution API vs mirror zapp. Populado pelo evo-reconcile a cada 900s. |
| evolution_alerts | 1532 | Fila de alertas operacionais do sistema WhatsApp CRM.; CARDINALIDADE: ~920 linhas ativas / 712 kB.; SEVERIDADE: low / medium / high / critical.; DEDUP: trigger trg_dedup_alert via (alert_type, instance_name) na última h… |
| evolution_api_consumers | 6 | Consumidores de API autorizados a integrar com o CRM (chaves e escopos). Mantida por admin; revogar acesso remove a integração. |
| evolution_audit_log | 4238 | Log de auditoria de ações dos agentes no CRM WhatsApp. Cada ação de agente humano gera uma linha.; CARDINALIDADE: ~3.904 linhas / 2,1 MB.; PROPÓSITO: rastreabilidade LGPD — quem acessou, editou ou deletou qual entidade,… |
| evolution_automation_logs | 0 | Log de execução de automações (follow-ups, keywords, agendamentos, templates). PLANEJADA (0 linhas em 2026-08); escrita por automação. |
| evolution_bitrix_queue | 0 | Fila de sincronização com Bitrix24: operações pendentes (criar/atualizar deal, contato, atividade) aguardando envio ao CRM externo. Mantida pelo worker de sync. ARMADILHA: itens presos indicam falha de integração com Bi… |
| evolution_burnin_tracker | 1 | Controle do período de burn-in da instância (validação pós-deploy antes de tráfego real). |
| evolution_business_hours | 7 | Horário comercial da empresa (ex.: seg-sex 8h-18h) que regula janela de atendimento, follow-ups e envio de mensagens. Mantida por admin. |
| evolution_calls | 70 | Registro de chamadas de voz (WhatsApp/telefone) com número, duração e resultado. ARMADILHA: resultado pode ficar NULL quando a chamada não é atendida; duração 0 indica chamada perdida. |
| evolution_chatbot_responses | 3 | Respostas do chatbot para atendimento inicial automático no WhatsApp (saudação, captura de intenção). Mantida por admin; integra com keyword_automations. |
| evolution_contact_rate_limits | 0 | Controle de rate limit por contato (remote_jid): janelas de contagem de mensagens para prevencao de flood/ban da Promo Brindes. Sem linhas no momento (reltuples 0) - estrutura pronta para uso. |
| evolution_daily_metrics | 1 | Métricas diárias de negócio (contatos, mensagens, conversas, deals, receita). Populada por rotina diária; base do MV mv_daily_metrics. |
| evolution_deals | 9 | Oportunidades de venda do funil comercial (lead → proposta → negociação → ganho/perdido) da Promo Brindes; registro central do CRM de vendas via WhatsApp. Status segue vocabulário fixo do funil; mantido pelo app e autom… |
| evolution_fallback_events | 0 | Eventos que caíram no caminho de FALLBACK (rota alternativa quando o processamento primário falhou). RLS: service_role ALL; authenticated só admin/supervisor. |
| evolution_followup_rules | 4 | Regras de follow-up automático: definem quando e como reabordar lead/deal sem resposta no WhatsApp (ex.: reenviar proposta após X dias). Avaliadas por automação agendada. ARMADILHA: regra mal calibrada gera spam e queim… |
| evolution_followups | 0 | Execuções de follow-up disparadas pelas evolution_followup_rules; registra lead, regra, canal e resultado do contato. PLANEJADA (0 linhas em 2026-08); mantida por automação agendada. |
| evolution_group_messages | 0 | Mensagens trocadas dentro dos grupos gerenciados. PLANEJADA (0 linhas em 2026-08); escrita pela automação de captura. |
| evolution_group_participants | 10748 | Participantes dos grupos de WhatsApp. ATIVA desde 2026-08-11 (melhoria grupos): mantida por fn_upsert_group_participants (add/remove/promote/demote idempotente). |
| evolution_group_rules | 0 | Regras de automação para grupos (saudação de boas-vindas, anti-spam, resposta a comandos). PLANEJADA (0 linhas em 2026-08); mantida por admin. |
| evolution_groups | 221 | Catalogo canonico de grupos de WhatsApp gerenciados. ATIVA desde 2026-08-11 (melhoria grupos): populada por fn_upsert_group_from_event (eventos) e fn_sync_groups_from_api (backfill, cron 464). ANTES disso ficava vazia -… |
| evolution_health_logs | 1 | Logs de health check da Evolution API (checagens periódicas de conectividade). RLS: policies para PUBLIC com auth.uid() IS NOT NULL. |
| evolution_holidays | 11 | Feriados que suspendem automações e follow-ups fora do horário comercial. Mantida por admin. |
| evolution_incident_runbook | 11 | Runbooks de incidentes (passos de resposta por tipo de incidente). Acessada por fn_get_incident_runbook. |
| evolution_instance_credentials | 1 | CREDENCIAIS das instâncias WhatsApp (Evolution API). TABELA SENSÍVEL: apikey/token podem estar em texto plano; acesso service_role only; nunca logar valores; referenciar vault_secret_id para segredos. |
| evolution_ip_blocklist | 0 | Blocklist de IPs (abuso/401). Mantida por fn_auto_ban_401_abusers e verificações de segurança. |
| evolution_keyword_automations | 0 | Automações disparadas por palavra-chave recebida no WhatsApp (ex.: preço → envia tabela de valores). PLANEJADA (0 linhas em 2026-08); mantida por automação de entrada. |
| evolution_label_associations | 0 | Associação N:N entre chats/contatos e labels do WhatsApp. PLANEJADA (0 linhas em 2026-08); mantida por automação quando o estágio do deal muda. |
| evolution_labels | 9 | Etiquetas visuais de chat no WhatsApp (ex.: Cliente quente, Aguardando resposta); vocabulário definido pelo admin e usado pelo funil via evolution_stage_mapping. |
| evolution_license_health_log | 0 | Log de verificações de saúde da licença do Evolution API. Registra checks periódicos de validade, alertas de expiração e eventos de renovação. |
| evolution_logpatch_audit | 445 | Auditoria de patches aplicados no container Evolution (build-time/runtime). Verificada por fn_logpatch_verify; view v_logpatch_health resume o estado. |
| evolution_media | 18628 | Registro de arquivos de mídia das mensagens WhatsApp. Espelho normalizado de evolution_messages_wpp2 para colunas de arquivo.; CARDINALIDADE: 32.885 linhas / 13 MB dados / 17 MB com índices.; UNICIDADE: message_id é UNI… |
| evolution_message_queue | 0 | Fila de envio de mensagens WhatsApp (agendamento, prioridade e retry). Planejada: 0 linhas com 4 índices criados — integração de envio ainda não populando. |
| evolution_message_templates | 0 | Templates HSM da Meta (mensagens aprovadas para envio fora da janela de 24h). PLANEJADA (0 linhas em 2026-08). ARMADILHA: somente templates aprovados pela Meta podem ser enviados; variáveis devem casar com o payload. |
| evolution_messages_wpp2_archive | 64 | Arquivo frio de mensagens wpp2 com mais de 12 meses. Criado 2026-07-03. Fonte: fn_archive_old_wpp2_messages. |
| evolution_mirror_batches | 0 | Batches de mirror/exportação para S3/R2 (0 linhas em 2026-08 — plano de mirror). |
| evolution_mirror_checkpoints | 0 | Checkpoints de progresso do mirror (último valor processado por chave) para retomada incremental. Tabela vazia — plano de mirror R2. |
| evolution_mirror_media_queue | 0 | Fila de mídias pendentes de mirror para R2 (S3), com tentativas e erros. Tabela vazia — plano de mirror R2 ainda não ativo. |
| evolution_mirror_runs | 0 | Registro de execuções (runs) do processo de mirror, com tipo, status e contadores. Tabela vazia — plano de mirror R2. |
| evolution_monthly_audit_log | 2 | Auditoria mensal consolidada (fn_monthly_evo_audit, cron 137). |
| evolution_notification_config | 1 | Configuração de canais de notificação (email, slack, webhook). Criada/ampliada em 2026-08-11 (melhoria notificações). |
| evolution_notification_log | 498 | Log de envio de notificações (um registro por envio tentado). |
| evolution_notification_outbox | 2 | Outbox de notificações para canais EXTERNOS (email/slack/webhook/whatsapp_promo) — criada em 2026-08-11 (melhoria notificações). Consumida por dispatcher externo; zapp.fn_process_evolution_notifications grava aqui quand… |
| evolution_notifications | 8666 | Fila de notificações internas para agentes do CRM. Gerada por triggers, crons e automações.; CARDINALIDADE: ~8.664 linhas / 2,2 MB.; CICLO: evento ocorre → notificação criada → agente lê (read_at IS NOT NULL) → pode ser… |
| evolution_performance_metrics | 11 | Métricas de performance por tipo (metric_date, metric_type UNIQUE). |
| evolution_quick_replies | 13 | Respostas rápidas do time comercial para agilizar o atendimento (tabela de preços, prazos de produção, condições). Texto curto reutilizável no WhatsApp. |
| evolution_reactions | 677 | Reações (emoji) a mensagens, ingestão do evento messages.reaction da Evolution API. 113 linhas — sem FK para evolution_messages (integridade por contrato de ingestão). |
| evolution_realtime_events | 676 | Buffer de eventos para Supabase Realtime. Materializa eventos que precisam ser propagados via websocket para o front-end CRM.; CARDINALIDADE: ~367 linhas / 592 kB — buffer rotativo, linhas antigas expiram.; PROPÓSITO: d… |
| evolution_retry_metrics | 3341 | Métricas de requisições com retry para a Evolution API e edge functions. Gerado pelo consumer.py e N8N.; CARDINALIDADE: ~3.321 linhas / 560 kB.; PROPÓSITO: diagnosticar endpoints instáveis que requerem múltiplas tentati… |
| evolution_sales_pipeline | 0 | Etapas do funil de vendas configuráveis (novo lead, proposta enviada, negociação, ganho/perdido). PLANEJADA (0 linhas em 2026-08); sem pipeline populado, deals ficam sem estágio canônico. Mantida por admin. |
| evolution_scheduled_messages | 0 | Mensagens agendadas para envio futuro (lembrete de follow-up, cobrança, campanha). PLANEJADA (0 linhas em 2026-08); mantida por scheduler. |
| evolution_send_idempotency | 0 | Chaves de idempotência de envio: garante que retentativas não dupliquem mensagens. PLANEJADA (0 linhas em 2026-08). ARMADILHA: limpar registros durante campanha ativa pode causar reenvio duplicado. |
| evolution_sentiment_analysis | 0 | Análise de sentimento de mensagens de clientes (positivo/neutro/negativo) para priorizar atendimento. PLANEJADA (0 linhas em 2026-08); mantida por automação/IA. |
| evolution_settings | 43 | Configurações gerais do módulo CRM/atendimento (chave-valor: ex. empresa, fuso, limites). Mantida por admin. |
| evolution_source_schema_map | 0 | Mapa de schemas/tabelas/colunas de FONTES externas descobertas (para auditoria de espelhamento). Planejada — sem linhas em 2026-08. |
| evolution_source_shadow_log | 17 | Log de medições shadow entre fonte e espelho (auditoria de paridade de dados). |
| evolution_spam_keywords | 5 | Palavras-chave que classificam mensagens recebidas como spam para filtro do atendimento. Mantida por admin. |
| evolution_stage_mapping | 14 | Mapeia estágios do funil de vendas para labels do WhatsApp, refletindo a etapa do deal direto no chat. ARMADILHA: label sem mapeamento aqui não acompanha o estágio real do deal. |
| evolution_status_reactions | 0 | Reacoes aos Status WhatsApp - manuais (vendedor) ou automaticas (bot). Rastreia envio ao WhatsApp. RLS: lockdown - apenas service_role. Aplicado em 2026-05-12 (Tarefa 0.5b - LOTE 1A). |
| evolution_tag_assignments | 0 | Vínculo N:N entre contatos/deals e tags de segmentação. PLANEJADA (0 linhas em 2026-08); mantida pelo app. |
| evolution_tags | 24 | Tags internas de segmentação comercial (ex.: brinde corporativo, atacado, evento). Diferem de labels: tags são internas do CRM; labels são visíveis no WhatsApp. |
| evolution_tasks | 6 | Tarefas operacionais do time comercial (follow-up, envio de orçamento, cobrança). Status segue vocabulário tipo pending/in_progress/done; due_at NULL significa sem prazo definido. Mantida pelos vendedores via app. |
| evolution_template_usage | 0 | Histórico de uso de templates HSM (quem enviou, para qual contato, status). PLANEJADA (0 linhas em 2026-08); mantida pela automação de envio. |
| evolution_webhook_dlq | 0 | Dead Letter Queue dos eventos do pipeline WhatsApp: eventos que falharam após esgotar retries. Monitorada por crons (fn_detect_ack_loss_gap) e views (v_ack_loss_candidates, v_evolution_dlq_open). |
| evolution_whatsapp_status | 16103 | WhatsApp status/story cache: 14,789 rows, 10 MB. High update rate (status viewed events). Autovacuum tuned in melhoria5. Indexes wstatus_viewed_expires, wstatus_expires_at, wstatus_posted, wstatus_participant, wstatus_i… |
| extensions | 1 | Extensões habilitadas no banco (pg extension registry do app). |
| failed_messages | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| favorite_contacts | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| favorite_messages | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| feature_flags | 6 | Feature flags por tenant/ambiente: liga/desliga funcionalidades. |
| file_scan_logs | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| finetune_jobs | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| fn_health_score_cache | 1 | Cache da fn_system_health_score(). TTL configuravel (default 5min). Evita 20+ queries sequenciais a cada chamada de monitoramento. Impacto: 1060ms -> <5ms em cache hits. |
| fn_health_score_history | 703 | Histórico do health score de edge functions (por função). Escrita: cron health. Leitura: dashboards. |
| followup_executions | 0 | Módulo Follow-up — nunca ativado em produção até 2026-08; ver F-009 |
| followup_sequences | 0 | Módulo Follow-up — nunca ativado em produção até 2026-08; ver F-009 |
| followup_steps | 0 | Módulo Follow-up — nunca ativado em produção até 2026-08; ver F-009 |
| forensic_snapshots | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| forwarded_messages | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| geo_blocking_settings | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| global_settings | 2 | Configurações globais do sistema (kv). |
| goals_configurations | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| google_calendar_config | 0 | Configuração da integração Google Calendar (singleton id=1). Sem linha = integração desligada (contrato G1). |
| hmac_selftest_audit | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| inbox_custom_scopes | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| installed_templates | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| instance_auth_events | 3224 | Histórico de conexão/desconexão da instância WhatsApp (codes 408/515 etc): base dos watchdogs de desconexão. Escrita: consumer evolution (connection.update). Leitura: watchdogs + dashboards de saúde. |
| instance_processing_pauses | 7 | Pausas de processamento por instância (kill-switch parcial). |
| instance_registry | 22 | Registro de instâncias Evolution conhecidas (wpp2): usada por guards de roteamento. |
| integration_profiles | 1 | Credenciais/config por integração (por tenant). |
| integration_registry | 17 | Integrações registradas (catálogo de conectores externos). |
| integrations | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| interactions | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| invites | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| ip_whitelist | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| lgpd_consent_audit | 0 | Módulo LGPD — nunca ativado em produção até 2026-08; ver F-009 |
| lgpd_consent_audit_archive | 0 | Módulo LGPD — nunca ativado em produção até 2026-08; ver F-009 |
| license_heartbeat_log | 207 | Heartbeats de licença da Evolution (conformidade): um por ciclo. Escrita: cron. Leitura: ops. |
| login_attempts | 4 | Tentativas de login (segurança/brute-force). |
| lux_system_alerts | 166 | LUX: alertas operacionais — JWT expiry, circuits open, API EOL, Bearer missing |
| message_attempts | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| message_audit_log | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| message_queue | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| message_reactions | 737 | Reações a mensagens (emoji por usuário): espelho do evolution_reactions. Escrita: consumer. Leitura: front. |
| message_reports | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| message_templates | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| mfa_sessions | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| migration_audit | 2 | Auditoria de operações de migration/backfill (phase, entity, action, rows). |
| n8n_config | 0 | Configuração da integração n8n (single-row, id=1). Contrato real desligado: enabled=false até o pipeline de dispatch existir. |
| n8n_variables | 34 | Variáveis compartilhadas com n8n (integrações). Escrita: ops. Leitura: n8n via RPC. |
| notification_channels_config | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| notification_delivery_log | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| notification_templates | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| notifications | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| number_reputation | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| onboarding_steps | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| outbound_delivery_audit | 3 | Auditoria de entrega outbound (o que saiu, quando, status). |
| outbound_message_queue | 1892 | Fila de envio outbound (outbox pattern): claim FOR UPDATE SKIP LOCKED, retry/backoff (retry_count/max_retries). Escrita: edges de envio + dispatcher cron. Leitura: watchdogs de fila. |
| outbox_events | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| passkey_credentials | 0 | Passkeys WebAuthn. RLS: usuario so ve suas proprias passkeys (user_id = auth.uid()). Aplicado em 2026-05-12 (Tarefa 4D). |
| password_reset_requests | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| password_reset_tokens | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| perfis_usuarios | 12 | [LOGISTICA] Perfis dos usuários do painel de cotação. Roles: admin (gestão) ou cotacao (operação). FK para auth.users com ON DELETE CASCADE. |
| performance_snapshots | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| permissions | 7 | Permissões granulares (lookup) usadas por policies/feature flags. |
| personal_stickers | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| pii_access_log | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| pinned_conversations | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| pinned_messages | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| processed_requests | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| processed_webhook_events | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| profiles | 21 | Usuários do ZAPP (id UUID surrogate; user_id = auth UID). Escrita: signup/triggers auth. Leitura: todas as telas (RLS por user_id/membership). |
| provider_configs | 0 | Módulo Providers — nunca ativado em produção até 2026-08; ver F-009 |
| provider_message_log | 0 | Módulo Providers — nunca ativado em produção até 2026-08; ver F-009 |
| provider_session_logs | 0 | Módulo Providers — nunca ativado em produção até 2026-08; ver F-009 |
| provider_sessions | 0 | Módulo Providers — nunca ativado em produção até 2026-08; ver F-009 |
| qr_attempts | 5 | Tentativas de leitura de QR (pareamento instância). |
| query_telemetry | 4 | Telemetria de queries (latências por RPC). |
| queue_analytics | 0 | Módulo Filas (queue_*) — nunca ativado em produção até 2026-08; ver F-009 |
| queue_goals | 0 | Módulo Filas (queue_*) — nunca ativado em produção até 2026-08; ver F-009 |
| queue_items | 0 | Módulo Filas (queue_*) — nunca ativado em produção até 2026-08; ver F-009 |
| queue_members | 14 | Membros das filas de atendimento. |
| queue_positions | 0 | Módulo Filas (queue_*) — nunca ativado em produção até 2026-08; ver F-009 |
| queue_routing_rules | 0 | Módulo Filas (queue_*) — nunca ativado em produção até 2026-08; ver F-009 |
| queue_skill_requirements | 0 | Módulo Filas (queue_*) — nunca ativado em produção até 2026-08; ver F-009 |
| queues | 1 | Tabela de filas de atendimento. RLS ativo.; Policies após FIX GAP-RLS (2026-08-06):;   authenticated_read_queues — SELECT authenticated, USING true [mantida];   q_select, queues_select   — REMOVIDAS (duplicatas idêntica… |
| quick_replies | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| rate_limit_configs | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| rate_limit_logs | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| realtime_message_fanout | 72 | Log de fanout realtime: entrega de eventos WS por usuário/dispositivo. Escrita: pipeline realtime. Leitura: diagnóstico de WS. |
| reconnection_logs | 88 | Logs de reconexão da instância (tentativas, backoff). Escrita: watchdogs. Leitura: ops. |
| reminders | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| reprocess_jobs | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| restore_test_log | 505 | Resultados dos testes de restore de backup (DR): valida dumps periodicamente. Escrita: cron restore-integrity-check. Leitura: ops/DR. |
| rls_denied_log | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| role_permissions | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| roles | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| route_permissions | 0 | Permissoes de rotas por role. PK(id) adicionado em auditoria 2026-07-04. UNIQUE em path. |
| rpc_rate_limits | 3 | Rate limits por RPC (janela deslizante). |
| sales_deals | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| sales_pipeline_stages | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| saved_filters | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| scheduled_job_log | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| scheduled_messages | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| scheduled_report_runs | 0 | Auditoria + DLQ + outbox dos relatórios agendados. A fn gera o conteúdo aqui; a edge send-scheduled-report claima (SKIP LOCKED), faz upload p/ storage zapp-reports, gera signed URL e envia email. |
| scheduled_reports | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| schema_migrations | 39 | Migrations aplicadas ao schema zapp (controle próprio, além do supabase_migrations). Escrita: pipeline de migration. Leitura: drift-check. |
| search_history | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| search_insights | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| security_acl_alerts | 2988 | Alertas do monitor de ACLs de segurança (fn_score_security_acl): violações de grants/policies detectadas. Escrita: cron de score de segurança. Leitura: ops/security. |
| security_alerts | 0 | Módulo Security — nunca ativado em produção até 2026-08; ver F-009 |
| security_audit_logs | 0 | Módulo Security — nunca ativado em produção até 2026-08; ver F-009 |
| security_events | 0 | Módulo Security — nunca ativado em produção até 2026-08; ver F-009 |
| sentiment_alerts | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| sentry_config | 1 | Config do Sentry por ambiente. |
| service_channels | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| sessions | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| sla_alert_preferences | 0 | Módulo SLA — nunca ativado em produção até 2026-08; ver F-009 |
| sla_configurations | 0 | Módulo SLA — nunca ativado em produção até 2026-08; ver F-009 |
| sla_delivery_rules | 2 | Regras de SLA de entrega (limiares). |
| sla_delivery_violations | 2 | Violações de SLA registradas. |
| sla_history | 0 | Tabela de histórico de SLA. RLS ativo.; Policies após FIX GAP-RLS (2026-08-06):;   sla_history_insert — INSERT PUBLIC, WITH CHECK (auth.uid() IS NOT NULL) [mantida];   sla_history_select — SELECT PUBLIC, USING (auth.uid… |
| sla_rules | 0 | Módulo SLA — nunca ativado em produção até 2026-08; ver F-009 |
| sla_violations | 0 | Módulo SLA — nunca ativado em produção até 2026-08; ver F-009 |
| solicitacoes_vale | 1 | Solicitações de vale-transporte/refeição (RH). |
| sticker_categories | 29 | Categorias de stickers (lookup). Escrita: admin. Leitura: front. |
| sticker_favorites | 0 | Tabela de stickers favoritos por usuário. RLS ativo.; Policies após FIX (2026-08-06):;   sf_select_all  — SELECT authenticated, USING true (leitura de todos os registros ok);   sf_insert_auth — INSERT authenticated, WIT… |
| stickers | 1262 | Stickers WhatsApp catalogados por categoria: usado no envio via edge. Escrita: admin. Leitura: front (galeria). |
| sticky_assignments | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| storage_cleanup_logs | 0 | Registro de execuções da edge function cleanup-storage-orphans. Uma linha por bucket por execução. |
| stress_test_metrics | 98 | Métricas de stress tests executados (latências, throughput). Escrita: harness de teste. Leitura: relatórios. |
| stress_test_runs | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| sts_performance_metrics | 4 | Métricas do STS (token service). |
| sts_telemetry | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| sts_troubleshooting_report | 113 | Relatórios de troubleshooting STS (tokens/sessão). Escrita: diagnóstico. Leitura: ops. |
| supabase_projects | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| supplier_pix_keys | 1 | Chaves PIX de fornecedores (sensivel). RLS: lockdown — apenas service_role. Acesso ao frontend deve ser via Edge Function dedicada com auditoria. Aplicado em 2026-05-12 (Tarefa 0.5 do plano de consolidacao Self-Hosted). |
| system_connections | 0 | Armazena configurações de conexões externas (ex: Supabase FATOR X). Gerenciada pela UI em /admin/connections. |
| system_docs | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| system_health_incidents | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| system_kill_switches | 1 | Kill-switches globais do sistema (desligar features em emergência). |
| system_logs | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| system_settings | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| tags | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| talkx_blacklist | 0 | Módulo TalkX — nunca ativado em produção até 2026-08; ver F-009 |
| talkx_campaigns | 0 | Módulo TalkX — nunca ativado em produção até 2026-08; ver F-009 |
| talkx_recipients | 0 | Módulo TalkX — nunca ativado em produção até 2026-08; ver F-009 |
| task_queues | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| team_conversation_members | 4 | Membros de conversas em equipe. |
| team_conversations | 2 | Conversas em equipe (colaborativas). |
| team_message_reactions | 1 | Reações em mensagens de equipe. |
| team_message_receipts | 0 | Tabela de recibos de leitura de mensagens de equipe. RLS ativo.; Policies após FIX GAP-RLS (2026-08-06):;   receipts_select      — SELECT PUBLIC, USING (auth.uid() IS NOT NULL) [acesso amplo];   team_receipts_select — S… |
| team_messages | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| tenants | 1 | Tenants (multi-tenant root). |
| test_cases | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| transfer_comments | 0 | Comentarios em transferencias de conversa entre agentes/departamentos. RLS: lockdown - apenas service_role. Aplicado em 2026-05-12 (Tarefa 0.5b - LOTE 1B). |
| user_devices | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| user_roles | 18 | Papéis de usuário (admin/supervisor/agent). Escrita: admin. Leitura: policies RLS (is_admin_*). |
| user_service_accounts | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| user_sessions | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| user_settings | 21 | Preferências por usuário (UI, notificações). Escrita: front. Leitura: front. |
| vault_healthcheck_log | 2851 | Onda 9.1 - log do healthcheck do Supabase Vault. Append-only, retencao 30d via cron. RLS: lockdown - apenas service_role. Aplicado em 2026-05-12 (Tarefa 0.5b - LOTE 1A). |
| voice_command_logs | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| voice_conversion_queue | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| voip_profile_credentials | 0 | Credenciais SIP por perfil (VoIP). Leitura SOMENTE via edge function zapp-get-sip-credentials (service_role) — sem GRANT para PostgREST. |
| warroom_alerts | 2661 | Alertas críticos operacionais (war room): monitors/watchdogs inserem; n8n espelha p/ webhook de alerta. severity critical/warning; resolved_at fecha o alerta. |
| webauthn_challenges | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| webhook_audit_log | 115507 | Auditoria de webhooks recebidos (evolution e outros): request/response, latência e status por evento. Escrita: edge evolution-webhook + consumer RabbitMQ. Leitura: ops/debug (sem UI). |
| webhook_endpoints | 0 | Tabela de suporte a webhooks — sem dados até 2026-08; ver F-009 |
| webhook_event_dedup | 0 | Chave de idempotência para eventos do webhook (Evolution + Cloud API). PK = sha256(instance:msg_id:event_type:ts). TTL 7 dias. |
| webhook_events | 0 | Tabela de suporte a webhooks — sem dados até 2026-08; ver F-009 |
| webhook_events_processed | 191813 | Deduplication table for incoming Evolution webhook events. Rows older than 30 days can be purged. |
| webhook_health_alerts | 845 | Alertas de saúde do webhook (rajadas, silêncio, 401 silencioso): inseridos por watchdogs de webhook. Leitura: ops. |
| webhook_health_checks | 0 | Tabela de suporte a webhooks — sem dados até 2026-08; ver F-009 |
| webhook_idempotency | 0 | Tabela de suporte a webhooks — sem dados até 2026-08; ver F-009 |
| webhook_preferences | 0 | Tabela de suporte a webhooks — sem dados até 2026-08; ver F-009 |
| webhook_rate_limits | 173 | Contadores de rate limit por instância/evento (janela deslizante). Escrita: increment_webhook_rate_limit. Leitura: RPCs de limite. |
| webhook_reprocess_queue | 0 | Tabela de suporte a webhooks — sem dados até 2026-08; ver F-009 |
| whatsapp_cloud_webhook_pings | 173 | Pings do webhook cloud (teste de chegada): prova de vida do endpoint. Escrita: watchdog. Leitura: ops. |
| whatsapp_connection_queues | 0 | Conexões WhatsApp-Filas - RLS corrigido em 2026-06-10 (self-hosted) |
| whatsapp_connections | 3 | Conexões WhatsApp configuradas por usuário/agente. |
| whatsapp_flows | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| whatsapp_groups | 30 | Grupos WhatsApp (espelho simplificado de evolution_groups). Escrita: cron sync-groups. Leitura: front. |
| whatsapp_official_credentials | 0 | Credenciais oficiais WhatsApp Business API. RLS: apenas admins/devs. Aplicado em 2026-05-12 (Tarefa 4D). |
| whatsapp_templates | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| whisper_files | 2 | Arquivos de transcrição Whisper pendentes/processados. |
| whisper_messages | 1 | Internal whisper notes between agents (invisible to end customers). RLS: agents see/update only whispers where they are sender or target_agent_id; supervisors/admins see all. Indexes: contact_id, target_agent_id, sender… |
| workspace_members | 14 | Membros por workspace (associação usuário↔workspace). |
| workspace_secrets | 0 | Workspace secrets. RLS lockdown - apenas service_role. Aplicado em 2026-05-12 (Tarefa 4D). |
| workspace_settings | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| workspaces | 1 | Workspaces/tenants do ZAPP. |
| xp_transactions | 0 | Módulo inativo/vazio até 2026-08 (sprawl F-009); ver DICIONARIO |
| zapp_audit_log | 2 | Auditoria específica do ZAPP (ações de sistema). |

## Schema evo — 74 tabelas

| Tabela | Rows (reltuples) | Comment |
|---|---:|---|
| _dead_idx_usage_audit_20260820 | 845 | Snapshot de pg_stat_user_indexes capturado na auditoria 2026-08-20 (base para F-007 drop de indices duplicados). RLS deny-all; somente leitura historica. Candidata a DROP apos 2026-09-20. |
| _dead_migration_watermark_20260820 | 3 | Backup do estado de evo.migration_watermark capturado na auditoria 2026-08-20 antes do saneamento de migrations (F-003/F-004). RLS deny-all. Candidata a DROP apos 2026-09-20. |
| _recon_missing | 365 | Staging do pipeline whatsapp_reconcile (crons pg_cron 27 dispatch / 30 apply / 67 cleanup / 68 reaper): mensagens presentes na fonte PG14 e ausentes no espelho evo.evolution_messages_wpp2 — diff por message_id na janela… |
| _recon_pg14_ids | 2120 | Staging do pipeline whatsapp_reconcile (crons pg_cron 27 dispatch / 30 apply / 67 cleanup / 68 reaper): message_ids + metadados puxados da fonte PG14 (FDW) na janela de reconcile. Repovoada por ciclo — não usar como fon… |
| _secure_config | 1 | Configuracao sensivel do schema evo (chave-valor). Acesso restrito a service_role - nao expor via PostgREST/RLS; usada para parametros operacionais internos da Promo Brindes. |
| _snapshot_version_state | 1 | Tabela de 1 linha que versiona os snapshots de contatos: versao incrementada por triggers (trigger_snapshot_version_*) a cada mutacao em evolution_contacts; lida via get_snapshot_version/increment_snapshot_version. |
| _unknown_media_backfill_20260820 | 15958 | Staging da auditoria/backfill de midia 2026-08-20 (15.958 refs de midia sem download mapeadas durante o plano de correcao). RLS deny-all; acesso apenas service_role. Candidata a DROP apos conclusao do backfill de midia … |
| _watchdog_media_links_log | 916 | Log do watchdog de links de mídia (fn_watchdog_media_links, cron 461): verifica se links de mídia ainda respondem. |
| audit100_baseline | 114 | Snapshot de baseline imutável capturado no início de cada sessão de auditoria evo. Acrescentar; nunca deletar. |
| contact_id_graveyard | 126 | Cemiterio de UUIDs de contatos deletados: impede reuso de IDs (trigger_prevent_contact_id_reuse bloqueia INSERT em evolution_contacts com id presente aqui). Populada por trigger_auto_graveyard_on_delete. |
| contact_identity | 16626 | Identidade unificada LID/PN de contatos: resolve JIDs "@lid" (bug Evolution 2.3.7) para numeros de telefone. ~12,6K linhas na Promo Brindes; mantida por trg_sync_contact_identity (a partir de lid_phone_map) e consultada… |
| e2e_probe_results | 1352 | Resultados de probes E2E do pipeline de mídia (fn_e2e_media_probe, crons 339/340). |
| evolution_alert_cooldown | 1 | Cooldown de alertas por chave (evita spam de notificações para o mesmo alerta repetido). |
| evolution_backfill_audit | 1 | Auditoria de execuções de backfill (quem rodou, quanto inseriu/atualizou). |
| evolution_bootstrap_log | 176 | Log de execuções de scripts de bootstrap (inicialização de dados). Rastreia quando e o que foi inicializado. CARDINALIDADE: ~166 linhas / 104 kB. PROPÓSITO: auditoria de execuções de bootstrap (ex: lid_phone_map bootstr… |
| evolution_connection_history | 10742 | Histórico de estados de conexão da instância wpp2 com o WhatsApp. CARDINALIDADE: 9.427 linhas / 3,3 MB. ESTADOS: connected / connecting / disconnected / logged_out / qr_code. USO: diagnóstico de flapping. Última entrada… |
| evolution_contacts | 22351 | Cache de contatos WhatsApp da instância wpp2. Espelho dos contatos da Evolution API, enriquecido com dados CRM. CARDINALIDADE: 20.754 linhas / 14 MB dados / 38 MB com índices / ~100 novos contatos/semana. CHAVE NATURAL:… |
| evolution_conversations | 15815 | Tabela-MÃE PARTICIONADA das conversas (dados em partições por instância/departamento — ex.: evolution_conversations_wpp2). Parent tem 0 linhas; consultar a partição correta. |
| evolution_conversations_compras | 0 | Partição de conversas do departamento de compras (aquisição de brindes promocionais); 0-2 linhas — departamento ainda sem volume real, operação vive na wpp2. |
| evolution_conversations_default | 3 | Partição default de conversas sem departamento definido; 0 linhas — não usada na prática (investigar se há roteamento caindo aqui). |
| evolution_conversations_financeiro | 0 | Partição de conversas do departamento financeiro (cobranças, pagamentos, negociação de brindes); 0-2 linhas — departamento ainda sem volume real. |
| evolution_conversations_logistica | 0 | Partição de conversas do departamento de logística (envio/entrega/rastreio de brindes); 0-2 linhas — departamento ainda sem volume real. |
| evolution_conversations_marketing | 0 | Partição de conversas do departamento de marketing (campanhas promocionais de brindes); 0 linhas — não usada na prática. |
| evolution_conversations_wpp2 | 15290 | Thread de conversa WhatsApp por contato na instância wpp2. Uma conversa agrupa todas as mensagens com um remote_jid. CARDINALIDADE: 15.555 linhas / 3,2 MB. CHAVE NATURAL: (remote_jid, instance_name) UNIQUE. ATRIBUIÇÃO: … |
| evolution_guardian_heartbeat | 4444 | Heartbeats do guardian bridge (Supabase←Evolution DB via dblink). Constraints: UNIQUE(service_name,heartbeat_at), CHECK(heartbeat_at<=now()+5min). pg_cron: guardian-heartbeat-sync (2-59/5 * * * *). Adicionado ON CONFLIC… |
| evolution_messages | 311132 | Tabela-MÃE PARTICIONADA das mensagens do WhatsApp (dados vivem nas partições — ex.: evolution_messages_wpp2). Parent tem 0 linhas; SEMPRE consultar a partição correta. Comentários de colunas espelham a partição wpp2. |
| evolution_messages_default | 0 | Tabela-pai particionada de mensagens. Autovacuum padronizado em 2026-07-10 (R3): scale_factor=0.05 (estava 0.1 — inconsistente). cost_limit=2000 para processamento mais agressivo. |
| evolution_messages_wpp2 | 311132 | Espelho das mensagens do WhatsApp (PG14 → evo). Tipos filtrados por design (não viram linha): reactionMessage (~74/24h), secretEncryptedMessage (~28/24h), protocol/edited — diff normal ~25/h. Escrita: edge evolution-web… |
| evolution_pipeline_health_log | 6689 | Snapshots de saúde do pipeline WhatsApp → RabbitMQ → Consumer → Supabase. Capturado a cada 5 minutos. CARDINALIDADE: ~5.605 linhas / 2,9 MB. CRON: pipeline-health-check (job 5, a cada 5 min) — executa fn_check_pipeline_… |
| evolution_pipeline_history | 1 | Histórico de mudanças de estágio do pipeline (auditoria de transições). |
| evolution_rabbit_consumer_stats | 22878 | Estatísticas coletadas dos consumers RabbitMQ (uma linha por réplica/coleta). Consumida via FDW pela view v_evolution_pipeline_health. |
| evolution_reconcile_health_log | 568 | Log de saúde dos jobs de reconciliação de dados (evolution_reconcile_jobs). Captura resultado de cada ciclo. CARDINALIDADE: ~107 linhas / 64 kB. PROPÓSITO: monitorar divergências entre Evolution API e banco de dados. Ca… |
| evolution_reconcile_jobs | 1522 | Trail auditável de cada chamada GET /instance/fetchInstances disparada pelo pg_cron. Particionar/cleanup pelo cron whatsapp_reconcile_cleanup (>7 dias). RLS ativo: service_role tem ALL, authenticated tem SELECT, anon bl… |
| evolution_retention_log | 1 | Log de execuções de retenção de partições. ATENÇÃO: fn_retention_webhook_partitions (cron job 305, 0 2 1 * *) NÃO escreve aqui — loga via zapp.rpc_boundary_raise_alert. Esta tabela está vazia por design. Para auditar ex… |
| evolution_traefik_401_stats | 7531 | Logs de requisições 401 no Traefik para a instância Evolution API. Coletados pelo container traefik-ops/collector-401. CARDINALIDADE: 88.915 linhas / 13 MB (atualizado 2026-08-20). PROPÓSITO: detectar rajadas de autenti… |
| evolution_webhook_events_v2 | 60026 | Tabela particionada por RANGE(created_at) mensal. Substitui evolution_webhook_events_* por instância. v1.3.0 |
| evolution_webhook_events_v2_2026_07 | 0 | PARTIÇÃO JULHO/2026 de evo.evolution_webhook_events_v2. Raw dos eventos recebidos pela edge function evolution-webhook. CARDINALIDADE: 36.647 linhas / 15 MB dados / 20 MB com índices — PARTIÇÃO VENCIDA (não recebe novos… |
| evolution_webhook_events_v2_2026_08 | 51344 | PARTIÇÃO AGOSTO/2026 de evo.evolution_webhook_events_v2. Partição ativa — recebe novos eventos. CARDINALIDADE: ~8.509 linhas (crescendo) / 3,4 MB dados / 4,8 MB com índices. PROPÓSITO: auditoria e replay dos eventos do … |
| evolution_webhook_events_v2_2026_09 | 0 | Partição mensal de eventos normalizados do webhook Evolution. Partição futura — vazia em 2026-08, pré-criada pelo cron fn_auto_create_next_partitions (job 64). Estrutura idêntica ao parent evolution_webhook_events_v2. S… |
| evolution_webhook_events_v2_2026_10 | 0 | Partição mensal de eventos normalizados do webhook Evolution. Partição futura — vazia em 2026-08, pré-criada pelo cron fn_auto_create_next_partitions (job 64). Estrutura idêntica ao parent evolution_webhook_events_v2. S… |
| evolution_webhook_events_v2_2026_11 | 0 | Partição mensal de eventos normalizados do webhook Evolution. Partição futura — vazia em 2026-08, pré-criada pelo cron fn_auto_create_next_partitions (job 64). Estrutura idêntica ao parent evolution_webhook_events_v2. S… |
| evolution_webhook_events_v2_2026_12 | 0 | Partição mensal de eventos normalizados do webhook Evolution. Partição futura — vazia em 2026-08, pré-criada pelo cron fn_auto_create_next_partitions (job 64). Estrutura idêntica ao parent evolution_webhook_events_v2. S… |
| evolution_webhook_events_v2_2027_01 | 0 | Partição mensal de eventos normalizados do webhook Evolution. Partição futura — vazia em 2026-08, pré-criada pelo cron fn_auto_create_next_partitions (job 64). Estrutura idêntica ao parent evolution_webhook_events_v2. S… |
| evolution_webhook_events_v2_2027_02 | 0 | Partição mensal de eventos normalizados do webhook Evolution. Partição futura — vazia em 2026-08, pré-criada pelo cron fn_auto_create_next_partitions (job 64). Estrutura idêntica ao parent evolution_webhook_events_v2. S… |
| evolution_webhook_events_v2_2027_03 | 0 | Partição mensal de eventos normalizados do webhook Evolution. Partição futura — vazia em 2026-08, pré-criada pelo cron fn_auto_create_next_partitions (job 64). Estrutura idêntica ao parent evolution_webhook_events_v2. S… |
| evolution_webhook_events_v2_2027_04 | 0 | Partição mensal de eventos normalizados do webhook Evolution. Partição futura — vazia em 2026-08, pré-criada pelo cron fn_auto_create_next_partitions (job 64). Estrutura idêntica ao parent evolution_webhook_events_v2. S… |
| evolution_webhook_events_v2_2027_05 | 0 | Partição mensal de eventos normalizados do webhook Evolution. Partição futura — vazia em 2026-08, pré-criada pelo cron fn_auto_create_next_partitions (job 64). Estrutura idêntica ao parent evolution_webhook_events_v2. S… |
| evolution_webhook_events_v2_2027_06 | 0 | Partição mensal de eventos normalizados do webhook Evolution. Partição futura — vazia em 2026-08, pré-criada pelo cron fn_auto_create_next_partitions (job 64). Estrutura idêntica ao parent evolution_webhook_events_v2. S… |
| evolution_webhook_events_v2_default | 0 | Partição mensal de eventos normalizados do webhook Evolution. Partição DEFAULT — eventos sem mês identificado caem aqui. Cron job 301 gera alerta se acumular (sinal de particionamento quebrado). Estrutura idêntica ao pa… |
| evolution_whatsapp_check_queue | 15420 | Fila de verificação de números WhatsApp (validade/status do número) antes de campanhas. Mantida por worker; remove números inválidos da lista de envio. CARDINALIDADE: 15.420 linhas / 1,9 MB (atualizado 2026-08-20). NOTA… |
| ingest_ledger | 63544 | Livro-caixa de ingestão de webhooks WhatsApp. Criado em 2026-08-09 (E-03) para observabilidade do pipeline. PROPÓSITO: 1 linha por evento messages.upsert recebido → registra outcome antes de qualquer retry/dedup. CARDIN… |
| kpi_rollup_24h | 0 | Rollup diario de KPIs do pipeline (particao por dia). |
| lid_convergence_history | 848 | Historico de snapshots diarios de convergencia LID: numeros absolutos e delta de resolucao @lid para PN. Alimentado por rotina/cron diaria; base da view v_lid_convergence_status. |
| lid_phone_map | 8836 | Mapeamento LID→telefone para resolver o bug Evolution API 2.3.7 (#1778). PROBLEMA: Evolution API às vezes entrega remote_jid com formato "^[0-9]{15,}@lid$" (ID numérico interno do WhatsApp Business) em vez do JID padrão… |
| media_cache | 0 | Cache temporário de mídia mantido por fn_evict_media_cache e purgado pelo cron fn_purge_storage_cache(30); vazia/em desuso — não confiar dados aqui. |
| media_cleanup_log | 7190 | Log de limpeza de mídia (remoção de objetos do storage/expiração de URLs), escrito por crons e workers de manutenção; somente leitura para auditoria. |
| media_dedupe_log | 6956 | Log de deduplicação de mídia: registra tentativas de download duplicadas (mesmo message_id/URL) e a decisão (reuso de objeto existente ou novo download); mantido pelo pipeline de download. |
| media_download_queue | 6084 | Fila de download de mídia do WhatsApp: mensagens com mídia entram por trigger (trg_enqueue_media_wpp2) e são processadas por workers via rpc_claim_media_download_batch/rpc_complete_media_download; status: pending/proces… |
| media_loss_archive | 35142 | Objeto evo.media_loss_archive — [PG14-HARDENING 49]. Papel: operacional/evo; consultar a definicao para detalhes. |
| media_loss_registry | 8501 | Registro permanente de mídias perdidas identificadas na auditoria de 2026-08-09. CARDINALIDADE: 43.643 linhas — snapshot único, append-only. CLASSES (loss_class): sem_ponteiro (36.717) / cdn_expirado (6.808) / presigned… |
| media_orphan_triage | 15666 | Classificação das 15.666 linhas de evolution_media sem mensagem correspondente. Criada em 2026-08-09 (E-24). CLASSES (classe): host_proprio_sem_mensagem (915) / cdn_whatsapp_expirado (313) / url_externa_desconhecida (14… |
| media_quarantine | 7 | Arquivos de midia bloqueados pela camada de seguranca. Registro de auditoria de cada arquivo quarentenado. RLS: lockdown - apenas service_role. Aplicado em 2026-05-12 (Tarefa 0.5b - LOTE 1A). |
| media_scan_log | 18373 | Log de scans de segurança de mídia (validação/quarentena) executados pelo pipeline antes de liberar download; cada linha registra um scan e seu veredito (aprovado/rejeitado/quarentenado). |
| media_security_alerts | 8 | Alertas de seguranca de midia. Frontend recebe via Realtime quando arquivo e bloqueado. RLS: lockdown - apenas service_role. Aplicado em 2026-05-12 (Tarefa 0.5b - LOTE 1B). |
| media_security_config | 47 | 47 regras de bloqueio ClamAV (mimetypes, extensoes, tamanho, force download). RLS: lockdown - apenas service_role (regras criticas de seguranca). Aplicado em 2026-05-12 (Tarefa 0.5b - LOTE 2). |
| media_storage_config | 1 | Configuração do storage de mídia (bucket, endpoint, URL pública); ~1 linha ativa define o destino dos uploads dos workers (Supabase Storage → R2). |
| ops_runbooks | 11 | Runbooks operacionais genéricos (versão, sintomas, passos, prevenção). |
| pipeline_canary_log | 574 | Log dedicado para mensagens canário do pg-cron (fn_pipeline_canary_insert, job 429). Separado de evolution_messages_wpp2 para não contaminar métricas de negócio. Criado por claude-evo-audit-100 etapa A4. Retenção: 7 dia… |
| rabbitmq_backlog_history | 12 | Backlog RabbitMQ via mgmt API 15672 — PLANO-100 etapa 57. Coletor a estender no watchdog w9-consumer-stats (stack ag6-watchdogs): curl :15672/api/queues a cada 60s + INSERT. Alimenta v_kpi_overview.rabbitmq_backlog_mess… |
| recon_coverage_daily | 1 | Snapshot diario da cobertura do espelho evo vs fonte PG14 — grafico de CP-2 do PLANO-100. coverage_pct = mirror/source sobre janela movel 24h por message_id (via FDW fdw_evolution_message); alerta <99pct via rpc_boundar… |
| vps_comments | 21 | Comentários por cenário do checklist VPS (go-live). |
| vps_diagnostic_runs | 14 | Execuções de diagnóstico por cenário VPS. |
| vps_etapas | 10 | Etapas do checklist VPS (go-live) com severidade e cor. |
| vps_scenario_status | 89 | Status por cenário do checklist VPS (todo/doing/done). |

## Funcoes rpc_* com comment — 88

| Funcao | Comment |
|---|---|
| evo.rpc_boundary_cooldown_clear | Funcao evo.rpc_boundary_cooldown_clear — [PG14-HARDENING 49]. Papel: operacional/evo; consultar prosrc para detalhes. Escrita/Leitura: crons, RPCs e f |
| evo.rpc_boundary_cooldown_get | Funcao evo.rpc_boundary_cooldown_get — [PG14-HARDENING 49]. Papel: operacional/evo; consultar prosrc para detalhes. Escrita/Leitura: crons, RPCs e fer |
| evo.rpc_boundary_enqueue_media_download | Funcao evo.rpc_boundary_enqueue_media_download — [PG14-HARDENING 49]. Papel: operacional/evo; consultar prosrc para detalhes. Escrita/Leitura: crons, |
| evo.rpc_boundary_event_mark_fail | Funcao evo.rpc_boundary_event_mark_fail — [PG14-HARDENING 49]. Papel: operacional/evo; consultar prosrc para detalhes. Escrita/Leitura: crons, RPCs e |
| evo.rpc_boundary_event_mark_ok | Funcao evo.rpc_boundary_event_mark_ok — [PG14-HARDENING 49]. Papel: operacional/evo; consultar prosrc para detalhes. Escrita/Leitura: crons, RPCs e fe |
| evo.rpc_boundary_events_pull | Boundary API (lote4 decouple): puxa eventos de webhook pending/failed (<5 retries, criados ha >30s) para o consumidor externo (evolution-stack); leitu |
| evo.rpc_boundary_graveyard_pairs | Funcao evo.rpc_boundary_graveyard_pairs — [PG14-HARDENING 49]. Papel: operacional/evo; consultar prosrc para detalhes. Escrita/Leitura: crons, RPCs e |
| evo.rpc_boundary_graveyard_pending_count | Funcao evo.rpc_boundary_graveyard_pending_count — [PG14-HARDENING 49]. Papel: operacional/evo; consultar prosrc para detalhes. Escrita/Leitura: crons, |
| evo.rpc_boundary_insert_consumer_stats | RPC SECURITY DEFINER: INSERT de stats do consumer via edge (canal HTTP/dual) em evo.evolution_rabbit_consumer_stats. |
| evo.rpc_boundary_insert_heartbeat_event | Funcao evo.rpc_boundary_insert_heartbeat_event — [PG14-HARDENING 49]. Papel: operacional/evo; consultar prosrc para detalhes. Escrita/Leitura: crons, |
| evo.rpc_boundary_insert_pipeline_health | Funcao evo.rpc_boundary_insert_pipeline_health — [PG14-HARDENING 49]. Papel: operacional/evo; consultar prosrc para detalhes. Escrita/Leitura: crons, |
| evo.rpc_boundary_isonwa_mark | Funcao evo.rpc_boundary_isonwa_mark — [PG14-HARDENING 49]. Papel: operacional/evo; consultar prosrc para detalhes. Escrita/Leitura: crons, RPCs e ferr |
| evo.rpc_boundary_isonwa_pull | Funcao evo.rpc_boundary_isonwa_pull — [PG14-HARDENING 49]. Papel: operacional/evo; consultar prosrc para detalhes. Escrita/Leitura: crons, RPCs e ferr |
| evo.rpc_boundary_ledger_insert | INSERT no evo.ingest_ledger via boundary (SECURITY DEFINER). [PG14-HARDENING 28] Normaliza conversation→text (taxonomia única do espelho) — cobre todo |
| evo.rpc_boundary_lookup_contact_id | Funcao evo.rpc_boundary_lookup_contact_id — [PG14-HARDENING 49]. Papel: operacional/evo; consultar prosrc para detalhes. Escrita/Leitura: crons, RPCs |
| evo.rpc_boundary_pipeline_health_probe | Funcao evo.rpc_boundary_pipeline_health_probe — [PG14-HARDENING 49]. Papel: operacional/evo; consultar prosrc para detalhes. Escrita/Leitura: crons, R |
| evo.rpc_boundary_provision_instance_partitions | Funcao evo.rpc_boundary_provision_instance_partitions — [PG14-HARDENING 49]. Papel: operacional/evo; consultar prosrc para detalhes. Escrita/Leitura: |
| evo.rpc_boundary_purge_events | Funcao evo.rpc_boundary_purge_events — [PG14-HARDENING 49]. Papel: operacional/evo; consultar prosrc para detalhes. Escrita/Leitura: crons, RPCs e fer |
| evo.rpc_boundary_reconcile_apply | Funcao evo.rpc_boundary_reconcile_apply — [PG14-HARDENING 49]. Papel: operacional/evo; consultar prosrc para detalhes. Escrita/Leitura: crons, RPCs e |
| evo.rpc_boundary_reconcile_enqueue | Funcao evo.rpc_boundary_reconcile_enqueue — [PG14-HARDENING 49]. Papel: operacional/evo; consultar prosrc para detalhes. Escrita/Leitura: crons, RPCs |
| evo.rpc_boundary_reconcile_pending | Funcao evo.rpc_boundary_reconcile_pending — [PG14-HARDENING 49]. Papel: operacional/evo; consultar prosrc para detalhes. Escrita/Leitura: crons, RPCs |
| evo.rpc_boundary_refresh_daily_metrics | Funcao evo.rpc_boundary_refresh_daily_metrics — [PG14-HARDENING 49]. Papel: operacional/evo; consultar prosrc para detalhes. Escrita/Leitura: crons, R |
| evo.rpc_boundary_resolve_lid_phone | Boundary API: resolve LID para phone_number via lid_phone_map/contact_identity; leitura; usada por consumer/edge functions do ecossistema Evolution. |
| evo.rpc_boundary_scrub_secret | Funcao evo.rpc_boundary_scrub_secret — [PG14-HARDENING 49]. Papel: operacional/evo; consultar prosrc para detalhes. Escrita/Leitura: crons, RPCs e fer |
| evo.rpc_boundary_upsert_lid_identity | Funcao evo.rpc_boundary_upsert_lid_identity — [PG14-HARDENING 49]. Papel: operacional/evo; consultar prosrc para detalhes. Escrita/Leitura: crons, RPC |
| evo.rpc_boundary_vps_health_score | Funcao evo.rpc_boundary_vps_health_score — [PG14-HARDENING 49]. Papel: operacional/evo; consultar prosrc para detalhes. Escrita/Leitura: crons, RPCs e |
| evo.rpc_claim_media_download_batch | RPC que reivindica um lote de downloads de mídia para a instância informada, aplicando locking contra concorrência. |
| evo.rpc_complete_media_download | RPC que conclui um download de mídia, gravando a URL final e o caminho de storage. |
| evo.rpc_fail_media_download | RPC que registra a falha de download de mídia com a mensagem de erro correspondente. |
| zapp.rpc_add_xp | E59: incrementa XP de forma atomica (xp = xp + delta, FOR UPDATE). Level recalculado pelo trigger update_level_on_xp_change. Somente o dono do perfil |
| zapp.rpc_auto_save_sticker | Verificar se já existe (deduplicação por URL) (extraido do cabecalho do fonte). Args: (p_image_url text, p_name text, p_category text, p_is_animated b |
| zapp.rpc_backfill_messages_contact_id | Match by remote_jid (exact) (extraido do cabecalho do fonte). Args: (p_instance_name text, p_batch_size integer, p_dry_run boolean). |
| zapp.rpc_boundary_apply_lid_mappings | Boundary do contrato evo<->zapp (desacoplamento, lado zapp): apply lid mappings. SECDEF - caminho autorizado unico de acesso cross-schema. Args: (p_dr |
| zapp.rpc_boundary_insert_consumer_stats | Boundary do contrato evo<->zapp (desacoplamento, lado zapp): insert consumer stats. SECDEF - caminho autorizado unico de acesso cross-schema. Args: (p |
| zapp.rpc_boundary_log_audit | Boundary do contrato evo<->zapp (desacoplamento, lado zapp): log audit. SECDEF - caminho autorizado unico de acesso cross-schema. Args: (p_action text |
| zapp.rpc_boundary_normalize_send_jid | Boundary do contrato evo<->zapp (desacoplamento, lado zapp): normalize send jid. SECDEF - caminho autorizado unico de acesso cross-schema. Args: (p_ji |
| zapp.rpc_boundary_raise_alert | Boundary do contrato evo<->zapp (desacoplamento, lado zapp): raise alert. SECDEF - caminho autorizado unico de acesso cross-schema. Args: (p_alert_typ |
| zapp.rpc_boundary_register_media | Boundary do contrato evo<->zapp (desacoplamento, lado zapp): register media. SECDEF - caminho autorizado unico de acesso cross-schema. Args: (p_messag |
| zapp.rpc_boundary_resolve_alert | Boundary do contrato evo<->zapp (desacoplamento, lado zapp): resolve alert. SECDEF - caminho autorizado unico de acesso cross-schema. Args: (p_alert_t |
| zapp.rpc_boundary_system_health_score | Boundary do contrato evo<->zapp (desacoplamento, lado zapp): system health score. SECDEF - caminho autorizado unico de acesso cross-schema. Args: (). |
| zapp.rpc_boundary_touch_contact | Boundary do contrato evo<->zapp (desacoplamento, lado zapp): touch contact. SECDEF - caminho autorizado unico de acesso cross-schema. Args: (p_remote_ |
| zapp.rpc_boundary_upsert_status | Boundary do contrato evo<->zapp (desacoplamento, lado zapp): upsert status. SECDEF - caminho autorizado unico de acesso cross-schema. Args: (p_instanc |
| zapp.rpc_campaign_assign_variant | 1. campanha precisa existir (extraido do cabecalho do fonte). Args: (p_campaign_id uuid, p_contact_id uuid, p_variant_id uuid). |
| zapp.rpc_check_and_trigger_gmail_revalidation | Trigger if degraded/error OR if last validation was more than 30 minutes ago (extraido do cabecalho do fonte). Args: (). |
| zapp.rpc_check_audio_meme_duplicate | Verifica duplicata de audio-meme por hash SHA256 ou URL. |
| zapp.rpc_claim_pending_report_runs | Claim atômico (SKIP LOCKED) da outbox scheduled_report_runs p/ a edge send-scheduled-report; recupera sending órfão >10min; send_attempts>=5 vira DLQ |
| zapp.rpc_complete_media_download | Marca download de midia como concluido e atualiza URL publica via R2 worker |
| zapp.rpc_dashboard_home | FATOR X v6.1.0: KPIs do dashboard home (conversas, mensagens 7d, contatos, SLA 1a resposta). |
| zapp.rpc_disable_service_channel | Marca conexão whatsapp como desconectada (se houver) (extraido do cabecalho do fonte). Args: (p_id uuid, p_reason text). |
| zapp.rpc_email_cleanup_old_events | Delete old tracking events (keep the aggregated counts in tracked_messages) (extraido do cabecalho do fonte). Args: (p_retention_days integer). |
| zapp.rpc_email_create_tracking | 1. Criar tracked message (extraido do cabecalho do fonte). Args: (p_recipient_email text, p_recipient_name text, p_sender_email text, p_subject text, |
| zapp.rpc_email_health_check | Check tables (extraido do cabecalho do fonte). Args: (). |
| zapp.rpc_email_link_performance | If tracking_id provided, show links for that specific email (extraido do cabecalho do fonte). Args: (p_tracking_id uuid, p_days integer, p_limit integ |
| zapp.rpc_email_message_details | Message details (extraido do cabecalho do fonte). Args: (p_tracking_id uuid). |
| zapp.rpc_email_search | Converter query para tsquery com tratamento de erros (extraido do cabecalho do fonte). Args: (p_query text, p_account_id uuid, p_limit integer). |
| zapp.rpc_email_search_threads | Guard: apenas usuarios autenticados podem buscar threads (extraido do cabecalho do fonte). Args: (p_query text, p_account_id uuid, p_status text, p_la |
| zapp.rpc_email_tracking_stats | Total de emails rastreados no período (extraido do cabecalho do fonte). Args: (p_days integer). |
| zapp.rpc_get_contact_summary_batch | CAPTURA (2026-08-05): registra definicao viva de producao |
| zapp.rpc_get_crm_sync_config | Lista providers configurados (SEM secrets por construção — settings é não-secreta). Consumido pelo hook useSyncToCRM para o estado honesto isConfigure |
| zapp.rpc_get_gmail_health_summary | Get count of failures in the window (extraido do cabecalho do fonte). Args: (p_window_minutes integer). |
| zapp.rpc_grant_achievement | E59: concede conquista de forma atomica (ON CONFLICT DO NOTHING + xp/achievements_count incrementais no mesmo UPDATE). Conquista repetida → already_ha |
| zapp.rpc_grant_xp | Ledger (auditoria): uma linha por concessão. (extraido do cabecalho do fonte). Args: (p_profile_id uuid, p_amount integer, p_reason text). |
| zapp.rpc_insert_message | Porta canônica de ingestão de mensagens. Insere em evo.evolution_messages com dedup por (message_id, instance_name). p_wa_timestamp: timestamp WhatsAp |
| zapp.rpc_list_cron_jobs | Admin RPC — lista todos os jobs pg_cron (somente admins/supervisores). SECURITY DEFINER. |
| zapp.rpc_log_email_health | status para a coluna do summary respeita a CHECK; valores fora do dominio viram 'unknown' (extraido do cabecalho do fonte). Args: (p_status text, p_op |
| zapp.rpc_log_search_event | Registrar entidades pesquisadas no log de diagnóstico se fornecido (extraido do cabecalho do fonte). Args: (p_query text, p_entities jsonb). |
| zapp.rpc_log_service_event | FATOR X v6.1.0: log estruturado de eventos de servico em evo.evolution_audit_log. |
| zapp.rpc_mark_conversation_read | FIX A2: parent table em vez de _wpp2 (funciona para qualquer instancia) (extraido do cabecalho do fonte). Args: (p_id uuid). |
| zapp.rpc_mark_messages_as_read | Marks all inbound (from_me=false) messages for a contact as read in evo.evolution_messages. SECURITY DEFINER bypasses the missing UPDATE RLS policy on |
| zapp.rpc_mark_messages_read | Mapear conversation_id → contact_id para checar visibilidade (extraido do cabecalho do fonte). Args: (p_conversation_id uuid). |
| zapp.rpc_migrate_whatsapp_integration | Sinais Evolution: instâncias registradas localmente (extraido do cabecalho do fonte). Args: (). |
| zapp.rpc_ops_metrics | Bloqueia agentes (extraido do cabecalho do fonte). Args: (p_window_hours integer). |
| zapp.rpc_pick_next_agent | Próximo elegível depois do último atribuído (ordem determinística por user_id), (extraido do cabecalho do fonte). Args: (p_queue_id uuid). |
| zapp.rpc_queue_sla_panel | v2 2026-07-02: espera/SLA lidos de zapp.queue_positions (entered_at) e in_progress de zapp.sticky_assignments ativos. Antes agregava public.contacts.q |
| zapp.rpc_resolve_instance_by_phone | LID-FIX-01 (lid-s7 2026-08-11): não propagar LID como telefone (extraido do cabecalho do fonte). Args: (p_phone text). |
| zapp.rpc_resolve_whatsapp_instance | LID-FIX-01 (2026-08-11): se phone_number for LID (14+ dígitos) ou NULL, (extraido do cabecalho do fonte). Args: (p_contact_id uuid). |
| zapp.rpc_route_inbound_message | 1) Tenta sticky (extraido do cabecalho do fonte). Args: (p_contact_id uuid, p_channel_id uuid, p_queue_id uuid). |
| zapp.rpc_route_incoming_message | Lê estado atual (extraido do cabecalho do fonte). Args: (p_contact_id uuid, p_connection_id uuid). |
| zapp.rpc_run_full_test_suite | T1: Webhook pipeline health (extraido do cabecalho do fonte). Args: (). |
| zapp.rpc_search_audio_memes | Busca fuzzy por nome (trigram) e tags. Retorna com score de similaridade. |
| zapp.rpc_set_whatsapp_mode | NULL NOT IN (...) = NULL -> IF NULL = FALSE: guarda explícita contra NULL (extraido do cabecalho do fonte). Args: (p_mode text). |
| zapp.rpc_toggle_cron_job | Admin RPC — ativa ou desativa um job pg_cron (somente admins/supervisores). SECURITY DEFINER. |
| zapp.rpc_unified_search | LID-FIX-01 (lid-s7 2026-08-11): evitar exibir LID 14+ como telefone (extraido do cabecalho do fonte). Args: (p_query text, p_limit integer). |
| zapp.rpc_unlock_achievement | Marcos cumulativos (semântica pré-existente do front): podem repetir. (extraido do cabecalho do fonte). Args: (p_profile_id uuid, p_type text, p_name |
| zapp.rpc_upsert_crm_sync_config | Upsert versionado da config de provider CRM. Valida provider (CHECK) e settings (objeto, sem secrets) antes de gravar — F8 (config corrompida). |
| zapp.rpc_upsert_label | UPDATE: apenas colunas que existem na tabela (extraido do cabecalho do fonte). Args: (p_id uuid, p_name text, p_label_id text, p_color text, p_label_t |
| zapp.rpc_upsert_service_channel | Se este vai ser default, desmarca os outros do mesmo tipo (extraido do cabecalho do fonte). Args: (p_id uuid, p_name text, p_display_name text, p_chan |
| zapp.rpc_zapp_health_check | Health check global ZAPP WEB com alertas de R2, fila e URLs |

## Crons pg_cron — 239 jobs

| ID | Job | Schedule | Ativo | Comando (inicio) |
|---:|---|---|---|---|
| 4 | auto-offline-agents | `2-59/5 * * * *` | on | `SELECT zapp.fn_auto_offline_agents()` |
| 5 | retry-stuck-messages | `0,10,20,30,40,50 * * * *` | on | `SELECT zapp.fn_retry_stuck_messages()` |
| 6 | refresh-daily-metrics | `28 */1 * * *` | on | `SELECT zapp.rpc_refresh_daily_metrics()` |
| 9 | expire-old-media-queue | `3 3 * * *` | OFF | `SELECT evo.fn_expire_old_media_queue()` |
| 10 | retry-stuck-media-queue | `1,11,21,31,41,51 * * * *` | on | `SELECT evo.fn_retry_stuck_media_queue()` |
| 11 | refresh-top-stickers | `30 * * * *` | on | `SELECT zapp.rpc_refresh_top_stickers()` |
| 12 | sync-r2-lifecycle | `0 5 * * *` | on | `SELECT zapp.fn_handle_expired_r2_media()` |
| 15 | email_tracking_cleanup_weekly | `0 3 * * 0` | on | `SELECT public.rpc_email_cleanup_old_events(90)` |
| 17 | reprocess_pending_webhooks | `0-58/2 * * * *` | on | `SELECT zapp.fn_reprocess_pending_webhook_events(200);` |
| 27 | whatsapp_reconcile_dispatch | `0-59/5 * * * *` | on | `SELECT zapp.fn_reconcile_dispatch();` |
| 30 | whatsapp_reconcile_apply | `1-59/5 * * * *` | on | `SELECT count(*) FROM zapp.fn_reconcile_apply();` |
| 32 | whatsapp_connection_drift_alert | `4-59/5 * * * *` | on | `SELECT zapp.fn_alert_connection_drift();` |
| 33 | message_pipeline_stalled_alert | `5 8-22 * * *` | on | `SELECT zapp.fn_alert_message_pipeline_stalled();` |
| 34 | evolution-pipeline-health-check-bateria10 | `4-59/5 * * * *` | on | `SELECT zapp.fn_check_evolution_pipeline_health()` |
| 35 | evolution-jid-health-check-5min | `3-59/5 * * * *` | on | `SELECT zapp.fn_check_evolution_jid_health()` |
| 41 | scan-media-security | `3-59/5 * * * *` | on | `SELECT evo.fn_process_pending_scans(100)` |
| 43 | process_pending_followups | `1-59/5 * * * *` | on | `SELECT zapp.fn_process_pending_followups()` |
| 51 | vault_healthcheck | `0,15,30,45 * * * *` | on | `SELECT zapp.fn_vault_healthcheck_run();` |
| 52 | vault_healthcheck_cleanup | `3 4 * * *` | on | `SELECT zapp.fn_vault_healthcheck_cleanup();` |
| 55 | pipeline-watchdog | `0 */4 * * *` | on | `SELECT zapp.fn_pipeline_watchdog();` |
| 57 | system-health-score | `5 * * * *` | on | `SELECT zapp.fn_system_health_score_cached(30, TRUE);` |
| 63 | db_size_snapshot | `0 6 * * *` | on | `INSERT INTO zapp._db_size_snapshots (table_name, row_count, total_size, toast_size, index` |
| 64 | auto-create-monthly-partitions | `0 0 1 * *` | on | `SELECT evo.fn_auto_create_next_partitions();` |
| 65 | purge_evolution_alerts | `58 4 * * *` | on | `-- Purge 1: pipeline_health resolvidos com mais de 7 dias (sao muito numerosos) DELETE FR` |
| 66 | purge_realtime_events | `45 4 * * *` | on | `DELETE FROM zapp.evolution_realtime_events WHERE created_at < NOW() - INTERVAL '7 days';` |
| 67 | whatsapp_reconcile_cleanup | `17 3 * * *` | on | `DELETE FROM evo.evolution_reconcile_jobs WHERE applied_at < now() - interval '7 days';` |
| 68 | whatsapp_reconcile_reaper | `*/3 * * * *` | on | `UPDATE evo.evolution_reconcile_jobs SET applied_at = now(), http_status = -1, result = js` |
| 71 | cleanup-old-notifications | `3 3 * * *` | on | `SELECT zapp.fn_cleanup_old_notifications()` |
| 73 | escalate-critical-alerts | `2,12,22,32,42,52 * * * *` | on | `SELECT zapp.fn_escalate_critical_alerts()` |
| 76 | link-orphan-messages | `14,44 * * * *` | on | `SELECT zapp.fn_link_orphan_messages(10000)` |
| 78 | analyze-catalogo-diario | `5 6 * * *` | on | `DO $an$ DECLARE r record; n int := 0; BEGIN -- Tabelas do catalogo publico FOR r IN SELEC` |
| 82 | ops-guardrails-deadman | `3,13,23,33,43,53 * * * *` | on | `SELECT ops.fn_guardrails_check()` |
| 84 | ops-notify-critical-alerts | `2-59/5 * * * *` | on | `SELECT ops.fn_notify_critical_alerts()` |
| 86 | purge_query_telemetry_daily | `6 3 * * *` | on | `SELECT zapp.purge_old_query_telemetry(30);` |
| 88 | archive-old-wpp2-messages | `0 3 1 * *` | on | `SELECT zapp.fn_archive_old_wpp2_messages(p_months_old:=12, p_batch_size:=5000)` |
| 89 | ops-payload-retention | `15 3 1 * *` | on | `SELECT ops.fn_payload_retention(60,false)` |
| 90 | purge-media-queue-and-scan-log | `45 3 * * *` | on | `DELETE FROM evo.media_download_queue WHERE status='expired' AND created_at < now()-interv` |
| 91 | monitor-dlq-health | `1,16,31,46 * * * *` | on | `SELECT zapp.fn_monitor_dlq_health(p_threshold := 10)` |
| 94 | ops-ddl-weekly-summary | `59 8 * * 1` | on | `SELECT ops.fn_ddl_weekly_summary()` |
| 95 | catalog-sanity-weekly | `0 5 * * 1` | on | `SELECT ops.fn_catalog_sanity_check()` |
| 96 | sync-instance-registry-status | `8,38 * * * *` | on | `SELECT zapp.fn_sync_instance_registry_status()` |
| 97 | alert-ghost-message-events | `12,42 * * * *` | on | `SELECT zapp.fn_alert_ghost_message_events()` |
| 99 | cleanup-cron-job-history | `6 3 * * *` | on | `DELETE FROM cron.job_run_details WHERE (status = 'succeeded' AND start_time < NOW() - INTE` |
| 100 | analytics-log-retention | `20 5 * * *` | on | `SELECT ops.fn_analytics_log_retention(14)` |
| 101 | qr-attempts-expire-15min | `2,17,32,47 * * * *` | on | `UPDATE zapp.qr_attempts SET status='expired', expired_at=now(), updated_at=now() WHERE sta` |
| 102 | slow_query_monitor_hourly | `10 7 * * *` | on | `SELECT zapp.fn_monitor_slow_queries(500, 50)` |
| 103 | pg_stat_statements_weekly_reset | `58 2 * * 0` | on | `DO $snap$ BEGIN -- Snapshota top 20 antes do reset INSERT INTO zapp.query_telemetry (quer` |
| 104 | wpp2_disconnection_watchdog | `7,17,27,37,47,57 6-23 * * *` | on | `SELECT zapp.fn_alert_wpp2_disconnection()` |
| 105 | infra_check_hourly | `15 * * * *` | on | `SELECT ops.check_infrastructure()` |
| 106 | run_all_checks_daily | `58 7 * * *` | on | `SELECT check_name, status FROM ops.run_all_checks()` |
| 107 | performance_report_weekly | `0 6 * * 1` | on | `-- Salvar snapshot semanal de performance em query_telemetry INSERT INTO zapp.query_telem` |
| 108 | health_score_alert_hourly | `45 * * * *` | on | `SELECT zapp.fn_alert_health_score_degraded(70)` |
| 111 | regression_tests_daily | `13 8 * * *` | on | `SELECT test_name, status FROM ops.fn_regression_tests() WHERE status != 'PASS'` |
| 113 | bloat_alert_4h | `0 */4 * * *` | on | `SELECT zapp.fn_alert_table_bloat(15)` |
| 115 | redis_sentinel_refresh_5min | `*/7 * * * *` | on | `UPDATE ops.redis_sentinel SET last_ping_at = now(), updated_at = now(), -- Se evicted_keys` |
| 116 | purge-webhook-rate-limits-2h | `20 * * * *` | on | `DELETE FROM zapp.webhook_rate_limits WHERE window_start < now() - INTERVAL '2 hours';` |
| 117 | analyze_critical_tables | `31 3 * * *` | on | `SELECT zapp.fn_force_autovacuum(schemaname, relname) FROM pg_stat_user_tables WHERE schem` |
| 120 | wpp2-session-expiry-watchdog | `3,18,33,48 * * * *` | on | `INSERT INTO zapp.warroom_alerts (alert_type, title, message, source, entity) SELECT 'crit` |
| 122 | wal-slot-monitor | `4,19,34,49 * * * *` | on | `SELECT ops.fn_check_wal_slots()` |
| 123 | weekly-edge-fn-freshness | `58 12 * * 1` | on | `SELECT ops.fn_edge_fn_staleness_check()` |
| 124 | daily-wa-marketing-budget | `29 12 * * *` | on | `SELECT ops.check_marketing_budget();` |
| 126 | types-drift-weekly | `29 13 * * 1` | on | `INSERT INTO ops.schema_drift_log (status, missing_tables, missing_columns, detail) SELECT` |
| 127 | daily-backup-sentinel-check | `30 16 * * *` | on | `SELECT ops.fn_auto_update_backup_sentinel()` |
| 128 | security_acl_email_check | `0,30 * * * *` | on | `SELECT zapp.fn_security_acl_master_check()` |
| 131 | guardian-heartbeat-sync | `2-59/5 * * * *` | on | `SELECT evo.fn_sync_guardian_heartbeat()` |
| 133 | vacuum-alerts-daily | `6 2 * * *` | on | `VACUUM ANALYZE zapp.evolution_alerts` |
| 135 | vacuum-bootstrap-log-daily | `16 2 * * *` | on | `VACUUM ANALYZE evo.evolution_bootstrap_log` |
| 136 | vacuum-connection-history-daily | `21 2 * * *` | on | `VACUUM ANALYZE evo.evolution_connection_history` |
| 137 | monthly-evo-audit | `0 6 1 * *` | on | `SELECT zapp.fn_monthly_evo_audit();` |
| 138 | ensure-evolution-backcompat-views | `0 */6 * * *` | on | `SELECT ops.fn_ensure_evolution_backcompat_views()` |
| 139 | cache-warmup-after-vacuum | `35 2 * * *` | on | `SELECT zapp.fn_cache_warmup_after_vacuum()` |
| 142 | check-media-pipeline-health | `*/15 11-23 * * *` | on | `SELECT evo.fn_check_media_pipeline_health()` |
| 143 | restore-integrity-check | `0 11 * * *` | on | `SELECT ops.fn_restore_integrity_check()` |
| 144 | alert-consumer-halt | `4-59/5 * * * *` | on | `SELECT ops.fn_alert_consumer_halt()` |
| 146 | dlq-poison-guard | `0-59/5 * * * *` | on | `SELECT zapp.fn_flag_poison_messages()` |
| 147 | pino-timeout-monitor | `7,37 * * * *` | on | `SELECT zapp.fn_monitor_pino_timeouts()` |
| 148 | refresh-health-score-cache | `19,49 * * * *` | on | `SELECT zapp.fn_system_health_score_cached(5, TRUE)` |
| 149 | vps-performance-snapshot | `25 * * * *` | on | `INSERT INTO ops.vps_performance_snapshots (system_health_score, system_grade, vps_health_` |
| 151 | security-invoker-daily-audit | `10 6 * * *` | on | `INSERT INTO zapp.security_acl_alerts (detected_at, alert_type, object_name, role_name, pr` |
| 158 | cleanup-guardian-events-evo-db | `2 4 * * *` | on | `SELECT evo.fn_cleanup_evolution_guardian_events(7)` |
| 159 | evo-r2-path-scrubber | `3 4 * * *` | on | `SELECT zapp.fn_scrub_r2_paths_from_logs('24 hours'::interval)` |
| 160 | evo-swarm-duplicate-detector | `29,59 * * * *` | on | `SELECT zapp.fn_detect_swarm_task_duplication()` |
| 161 | evo-wpp2-401-disconnect-feed | `7,17,27,37,47,57 * * * *` | on | `SELECT zapp.fn_feed_401_disconnect_alerts()` |
| 162 | vps-matview-auto-refresh | `24,54 * * * *` | on | `SELECT evo.fn_vps_refresh_dashboard();` |
| 163 | evo-wpp2-uptime-kpi | `6,21,36,51 * * * *` | on | `SELECT zapp.fn_wpp2_uptime_kpi()` |
| 164 | evo-ack-loss-gap-detector | `9,39 * * * *` | on | `SELECT zapp.fn_detect_ack_loss_gap('30 minutes'::interval, 5)` |
| 165 | secdef-search-path-guard | `1,31 * * * *` | on | `SELECT ops.fn_secdef_search_path_guard()` |
| 166 | evo-spurious-close-detector | `7,22,37,52 * * * *` | on | `SELECT zapp.fn_detect_spurious_closes('1 hour'::interval, '30 seconds'::interval)` |
| 168 | evo-dedup-cap-monitor | `27,57 * * * *` | on | `SELECT zapp.fn_detect_dedup_cap_failures('1 hour'::interval)` |
| 169 | vacuum-contacts-2h | `35 */2 * * *` | on | `VACUUM ANALYZE evo.evolution_contacts` |
| 171 | evo-sync-messages-to-v2 | `0-59/5 * * * *` | on | `SELECT evo.fn_sync_messages_to_v2()` |
| 173 | evo-detect-401-bursts | `8,23,38,53 * * * *` | on | `SELECT zapp.fn_detect_401_bursts()` |
| 176 | v2-pipeline-heartbeat | `*/30 * * * *` | on | `SELECT zapp.fn_v2_pipeline_heartbeat()` |
| 179 | security-surface-sentinel | `4,34 * * * *` | on | `SELECT zapp.fn_security_surface_audit()` |
| 180 | cron-guardian | `9,24,39,54 * * * *` | on | `SELECT zapp.fn_cron_guardian()` |
| 182 | evolution-pipeline-probe-15min | `2,17,32,47 * * * *` | on | `SELECT zapp.fn_pipeline_health_probe()` |
| 183 | vacuum-burnin-tracker-daily | `12 2 * * *` | on | `VACUUM ANALYZE zapp.evolution_burnin_tracker` |
| 184 | vacuum-pipeline-health-log-daily | `7 2 * * *` | on | `VACUUM ANALYZE evo.evolution_pipeline_health_log` |
| 185 | vacuum-instance-credentials-daily | `9 2 * * *` | on | `VACUUM ANALYZE zapp.evolution_instance_credentials` |
| 186 | vacuum-messages-2h | `25 */2 * * *` | on | `VACUUM ANALYZE evo.evolution_messages` |
| 187 | lid-contamination-daily | `29 8 * * *` | on | `SELECT zapp.fn_monitor_lid_contamination()` |
| 188 | check-guardian-alive | `3-59/10 * * * *` | on | `SELECT zapp.fn_check_guardian_alive()` |
| 189 | evo_cleanup_expired_contact_ids | `0 2 * * *` | on | `DO $$ BEGIN PERFORM evo.cleanup_expired_contact_ids(); PERFORM zapp.cleanup_expired_contac` |
| 190 | cleanup_expired_contact_ids | `0 3 * * *` | on | `SELECT zapp.cleanup_expired_contact_ids()` |
| 191 | auth-session-cleanup-weekly | `0 3 * * 0` | on | `SELECT sessions_deleted, tokens_deleted, execution_ms FROM ops.auth_session_cleanup(5, 24)` |
| 192 | auth-session-overflow-alert | `2,32 * * * *` | on | `SELECT ops.fn_auth_session_overflow_alert()` |
| 193 | guardian-db-heartbeat-resilient | `1-59/5 * * * *` | on | `DO $$ BEGIN INSERT INTO zapp.evolution_guardian_heartbeat (service_name, heartbeat_at) VAL` |
| 194 | cleanup-guardian-heartbeat-public | `30 2 * * *` | on | `DELETE FROM zapp.evolution_guardian_heartbeat WHERE heartbeat_at < NOW()-INTERVAL '7 days'` |
| 197 | autofix-security-invoker | `5 3 * * *` | on | `SELECT * FROM zapp.fn_autofix_security_invoker()` |
| 203 | cookie-probe-2phase-30min | `6,36 * * * *` | on | `SELECT zapp.fn_cookie_probe_cycle();` |
| 204 | lux-maintenance-daily | `6 4 * * *` | on | `SELECT zapp.fn_lux_maintenance();` |
| 205 | verify-alert-delivery-10min | `4,14,24,34,44,54 * * * *` | on | `SELECT ops.fn_verify_alert_delivery()` |
| 206 | monitor-ingestion-persistence-gap | `10,25,40,55 * * * *` | on | `SELECT ops.fn_monitor_ingestion_persistence_gap()` |
| 207 | purge-health-score-history | `29 5 * * *` | on | `DELETE FROM zapp.fn_health_score_history WHERE computed_at < now() - interval '7 days';` |
| 208 | purge-pipeline-health-log-60d | `20 2 * * *` | on | `DELETE FROM evo.evolution_pipeline_health_log WHERE checked_at < now() - interval '60 days` |
| 212 | purge-app-notifications-90d | `6 4 * * *` | on | `DELETE FROM zapp.app_notifications WHERE created_at < now() - interval '90 days'` |
| 213 | media_pipeline_health_check | `0 */4 * * *` | on | `SELECT zapp.fn_run_media_health_alert()` |
| 217 | expire-whatsapp-media-1h | `40 * * * *` | on | `SELECT zapp.fn_expire_whatsapp_media_urls(7, 500)` |
| 218 | logflare-cloudflare-cleanup | `9 3 * * *` | on | `DO $log$ DECLARE r record; v_rows bigint; v_total bigint := 0; v_cutoff timestamptz; v_ret` |
| 225 | wal-alert-state-cleanup | `11,26,41,56 * * * *` | on | `DELETE FROM ops.wal_alert_state WHERE slot_name NOT IN (SELECT slot_name FROM pg_replicati` |
| 230 | disk-actions-cleanup | `9 4 * * *` | on | `DELETE FROM ops.disk_actions_queue WHERE executed_at < now() - interval '7 days';` |
| 231 | disk-tables-vacuum-weekly | `0 2 * * 0` | on | `VACUUM ANALYZE ops.disk_actions_queue, ops.paused_services, ops.alert_cooldown, ops.docker` |
| 233 | disk-daily-summary-refresh | `30 5 * * *` | on | `REFRESH MATERIALIZED VIEW CONCURRENTLY ops.mv_disk_daily_summary` |
| 234 | disk-baseline-snapshot-daily | `0 1 * * *` | on | `WITH disk_info AS ( SELECT used_pct, CASE WHEN total_h ~ 'T$' THEN (replace(total_h, 'T',` |
| 238 | disk-log-prune-daily | `12 3 * * *` | on | `DELETE FROM ops.host_disk_log WHERE checked_at < now() - interval '30 days';` |
| 239 | disk-hires-prune-daily | `15 3 * * *` | on | `SELECT ops.prune_disk_hires();` |
| 240 | disk-baseline-prune-weekly | `30 3 * * 0` | on | `SELECT ops.prune_disk_baseline();` |
| 241 | disk-events-prune-weekly | `45 3 * * 0` | on | `DELETE FROM ops.disk_event_log WHERE ts < now() - interval '90 days';` |
| 243 | refresh_mv_daily_kpis | `35 * * * *` | on | `REFRESH MATERIALIZED VIEW CONCURRENTLY evo.mv_daily_metrics` |
| 245 | perf-slow-query-alert | `*/10 * * * *` | on | `INSERT INTO zapp.warroom_alerts (alert_type, title, message, source, entity) SELECT 'warn` |
| 246 | reference-integrity-daily | `58 8 * * *` | on | `SELECT ops.fn_check_reference_integrity()` |
| 248 | purge-ddl-audit-90d | `12 4 * * *` | on | `DELETE FROM ops.ddl_audit WHERE "at" < now() - interval '90 days';` |
| 249 | expire-stale-backups | `0 4 * * *` | on | `SELECT ops.fn_expire_stale_backups(90)` |
| 261 | nps-daily-trigger | `0 10 * * *` | on | `SELECT extensions.http_post(url := 'https://supabase.atomicabr.com.br/functions/v1/nps-sch` |
| 262 | security-self-audit-daily | `10 6 * * *` | on | `SELECT zapp.fn_security_self_audit_daily()` |
| 263 | webhook-purge-consolidated | `0 2 * * *` | on | `SELECT zapp.fn_webhook_purge_consolidated(14, 5000)` |
| 268 | mirror-warroom-criticals | `5,20,35,50 * * * *` | on | `SELECT ops.fn_mirror_warroom_criticals()` |
| 269 | host-disk-collector-guard | `7,22,37,52 * * * *` | on | `SELECT ops.fn_host_disk_collector_guard()` |
| 295 | check_401_rate | `*/15 * * * *` | on | `SELECT zapp.fn_check_401_rate()` |
| 296 | check_ack_stall | `*/30 * * * *` | on | `SELECT zapp.fn_check_ack_stall()` |
| 297 | auto_resolve_alerts | `*/30 * * * *` | on | `SELECT zapp.fn_auto_resolve_alerts()` |
| 298 | collect-restore-logs | `30 11 * * *` | on | `SELECT zapp.fn_collect_restore_logs()` |
| 300 | evo-instance-health-check | `3-59/15 * * * *` | on | `SELECT zapp.fn_update_instance_health()` |
| 301 | evo-default-partition-guard | `*/30 * * * *` | on | `DO $i$ DECLARE v_count bigint; BEGIN SELECT COUNT(*) INTO v_count FROM evo.evolution_webh` |
| 305 | retention_webhook_partitions | `0 2 1 * *` | on | `SELECT evo.fn_retention_webhook_partitions(FALSE, 3)` |
| 306 | check_connection_saturation | `*/5 * * * *` | on | `SELECT zapp.fn_check_connection_saturation()` |
| 311 | wal_slot_lag_check | `*/5 * * * *` | on | `SELECT zapp.fn_wal_slot_lag_alert(200)` |
| 313 | kpi-alerts-auto-resolve | `55 * * * *` | on | `SELECT zapp.fn_resolve_kpi_alerts_stale()` |
| 317 | outbound-queue-dispatch | `*/2 * * * *` | on | `SELECT zapp.fn_outbound_dispatch(30)` |
| 318 | outbound-queue-stalled-alert | `*/15 * * * *` | on | `INSERT INTO zapp.warroom_alerts (alert_type, title, message, source, severity) SELECT 'wa` |
| 319 | shadow-source-snapshot-daily | `15 0 * * *` | on | `SELECT zapp.fn_shadow_snapshot_daily()` |
| 322 | archive-drift-guard | `*/5 * * * *` | on | `INSERT INTO zapp.warroom_alerts (alert_type, title, message, source, severity) SELECT 'wa` |
| 326 | verify-notification-delivery | `4,9,14,19,24,29,34,39,44,49,54,59 * * * *` | on | `SELECT ops.fn_verify_notification_delivery(60)` |
| 328 | lid-passive-accumulator | `*/30 * * * *` | on | `SELECT evo.fn_passive_lid_accumulator(48)` |
| 329 | lid-api-sync-weekly | `0 6 * * *` | on | `SELECT evo.fn_sync_lid_from_api()` |
| 333 | resolve-stale-connection-alerts | `*/5 * * * *` | on | `SELECT zapp.fn_resolve_stale_connection_alerts()` |
| 334 | backfill-contact-id-ongoing | `2-59/10 * * * *` | on | `SELECT evo.fn_backfill_contact_id(5000)` |
| 335 | queue-autoassign-tick | `* * * * *` | on | `SELECT zapp.fn_queue_autoassign_tick();` |
| 336 | process-api-contacts-response | `2,7,12,17,22,27,32,37,42,47,52,57 * * * *` | on | `SELECT evo.fn_process_api_contacts_response()` |
| 337 | ingest-ledger-retention | `25 3 * * *` | on | `DELETE FROM evo.ingest_ledger WHERE received_at < now() - interval '90 days'` |
| 338 | ingest-loss-alert | `*/10 * * * *` | on | `INSERT INTO zapp.evolution_alerts (alert_type, severity, title, message) SELECT 'ingest_l` |
| 339 | e2e-media-probe-daily | `0 10 * * *` | on | `SELECT evo.fn_e2e_media_probe(24)` |
| 340 | e2e-media-probe-hourly | `30 * * * *` | on | `SELECT evo.fn_e2e_media_probe(1)` |
| 344 | audio-transcription-trigger | `*/5 * * * *` | on | `SELECT zapp.fn_trigger_audio_transcription(50)` |
| 345 | download-wa-status-media | `*/30 * * * *` | on | `SELECT zapp.fn_download_wa_status_media(10)` |
| 411 | enqueue-orphan-media-hourly | `5 * * * *` | on | `SELECT evo.fn_enqueue_orphan_media(200, 30)` |
| 427 | auto-resolve-pipeline-alerts | `*/3 * * * *` | on | `UPDATE zapp.evolution_alerts SET resolved_at = now(), resolved_by = 'auto-resolve-cron' WH` |
| 429 | pipeline-canary-keep-alive | `*/3 * * * *` | on | `SELECT zapp.fn_pipeline_canary_insert()` |
| 445 | auto-reset-stuck-media-queue | `*/10 * * * *` | on | `SELECT evo.fn_reset_stuck_media_queue(10)` |
| 446 | auto-expire-old-media-queue | `0 3 * * *` | on | `SELECT evo.fn_cleanup_media_queue_expired(7)` |
| 447 | view-column-drift-guard | `*/15 * * * *` | on | `SELECT ops.fn_check_view_column_drift()` |
| 450 | security-hardening-autofix | `*/2 * * * *` | on | `SELECT ops.fn_revoke_anon_public_breaches()` |
| 456 | rt12-autofix-pk-guardian | `*/15 * * * *` | on | `SELECT ops.fn_autofix_tables_no_pk()` |
| 458 | wal-slot-lag-alert | `*/15 * * * *` | on | `SELECT zapp.fn_check_wal_slot_health()` |
| 459 | ensure-critical-crons-active | `*/5 * * * *` | on | `SELECT ops.fn_ensure_critical_crons_active()` |
| 460 | analytics-wal-watchdog | `*/10 * * * *` | on | `SELECT zapp.fn_analytics_wal_watchdog()` |
| 461 | watchdog-media-links | `4-59/15 * * * *` | on | `SELECT evo.fn_watchdog_media_links()` |
| 463 | purge-storage-cache | `0 3 * * *` | on | `SELECT evo.fn_purge_storage_cache(30)` |
| 465 | process-evolution-notifications | `*/2 * * * *` | on | `SELECT zapp.fn_process_evolution_notifications(200)` |
| 466 | lid-convergence-snapshot-hourly | `*/15 * * * *` | on | `SELECT evo.fn_lid_convergence_snapshot()` |
| 467 | lid-normalizer-test-suite-6h | `0 */6 * * *` | on | `SELECT evo.fn_lid_normalizer_test_suite()` |
| 468 | lid-regression-suite-2h | `0 */2 * * *` | on | `SELECT evo.fn_lid_regression_suite()` |
| 469 | lid-quarterly-checkpoint | `0 9 1 1,4,7,10 *` | on | `INSERT INTO evo.e2e_probe_results (probed_at, resultado, notes, wpp2_state, wal_lag_mb) S` |
| 471 | lid-upgrade-detect-and-alert | `30 * * * *` | on | `SELECT evo.fn_lid_upgrade_alert_check()` |
| 475 | lid-weekly-health-report | `0 6 * * 1` | on | `INSERT INTO evo.e2e_probe_results (probed_at, resultado, notes, wpp2_state, wal_lag_mb) S` |
| 476 | sync-groups-daily | `10 4 * * *` | on | `SELECT net.http_post(url := 'https://supabase.atomicabr.com.br/functions/v1/evolution-grou` |
| 477 | check-whatsapp-numbers | `*/15 * * * *` | on | `SELECT extensions.http_post(url := 'https://supabase.atomicabr.com.br/functions/v1/evoluti` |
| 478 | notif-dispatcher | `*/5 * * * *` | on | `SELECT extensions.http_post(url := 'https://supabase.atomicabr.com.br/functions/v1/evoluti` |
| 479 | evo-schema-guardian-weekly | `30 6 * * 1` | on | `DO $guard$ DECLARE v_probs text[] := '{}'; v_n int; BEGIN SELECT count(*) INTO v_n FROM ev` |
| 480 | evo-schema-guardian-monthly | `0 7 1 * *` | on | `DO $guard_m$ DECLARE v_probs text[] := '{}'; v_n int; BEGIN SELECT count(*) INTO v_n FROM` |
| 481 | cron-guardian-lid-15min | `*/15 * * * *` | on | `SELECT zapp.fn_ensure_critical_crons_active()` |
| 483 | lid-phonejid-emergence-watchdog | `*/5 * * * *` | on | `DO $body$ DECLARE v_count int; v_result jsonb; BEGIN SELECT COUNT(*) INTO v_count FROM za` |
| 484 | check-socket-flapping-wpp2 | `*/5 * * * *` | on | `SELECT evo.fn_check_socket_flapping()` |
| 485 | evolution-session-redis-snapshot-6h | `0 */6 * * *` | on | `INSERT INTO ops.evolution_session_snapshots(instance_uuid,instance_name,hash_len,source) S` |
| 486 | v04-phonejid-monitor | `*/5 * * * *` | on | `SELECT zapp.fn_check_v04_phonejid_arrived()` |
| 487 | lid-backfill-22h-auto | `0 1 * * *` | on | `SELECT evo.fn_execute_lid_backfill_when_ready()` |
| 488 | v04-auto-apply-lid-mappings | `*/30 * * * *` | on | `SELECT evo.fn_auto_apply_lid_mappings()` |
| 490 | auth-session-auto-cleanup-daily | `30 2 * * *` | on | `DO $cleanup$ DECLARE v_deleted int := 0; v_tokens int := 0; v_users text[]; v_overflow_us` |
| 493 | onda2_license_monitor | `0 * * * *` | on | `SELECT zapp.fn_check_license_heartbeat()` |
| 494 | repontar-filhas-graveyard | `0 5 * * *` | on | `SELECT zapp.fn_repontar_filhas_graveyard(false)` |
| 495 | monitor-inbound-zerado | `*/15 * * * *` | on | `SELECT zapp.fn_checar_inbound_zerado()` |
| 496 | license-heartbeat-log-purge-30d | `0 3 * * *` | on | `DELETE FROM zapp.license_heartbeat_log WHERE checked_at < now()-interval '30 days'` |
| 498 | ghost-conversations-daily-alert | `0 10 * * *` | on | `SELECT zapp.fn_alert_ghost_conversations()` |
| 500 | bootstrap-coverage-hourly | `5 * * * *` | on | `SELECT zapp.fn_bootstrap_coverage_hourly_check()` |
| 501 | evo-repopula-fila-isonwa | `0 4 * * *` | on | `INSERT INTO evo.evolution_whatsapp_check_queue (remote_jid, instance_name, status) SELECT` |
| 505 | views-drift-guard | `0 6 * * *` | on | `SELECT ops.fn_views_drift_guard()` |
| 508 | zapp-purge-reconcile-snapshots | `10 3 * * *` | on | `SELECT zapp.purge_old_reconcile_snapshots()` |
| 511 | logflare_log_events_retention | `10 4 * * *` | on | `select _analytics.purge_log_events()` |
| 512 | evo-reconcile-media-fk-orphans | `*/15 * * * *` | on | `SELECT evo.fn_reconcile_media_fk_orphans()` |
| 515 | ops-decouple-preflight-hourly | `5 * * * *` | on | `SELECT ops.fn_preflight_hourly()` |
| 516 | reprocess-failed-messages-15m | `*/15 * * * *` | on | `SELECT extensions.http_post(url := 'https://supabase.atomicabr.com.br/functions/v1/reproce` |
| 521 | warroom-monthly-test | `0 13 1 * *` | on | `SELECT net.http_post(url := 'https://supabase.atomicabr.com.br/functions/v1/warroom-monthl` |
| 522 | csat-dispatch-tick | `* * * * *` | on | `SELECT extensions.http_post(url := 'https://supabase.atomicabr.com.br/functions/v1/csat-di` |
| 523 | csat-reply-capture-tick | `*/2 * * * *` | on | `SELECT zapp.fn_capture_csat_replies();` |
| 524 | media-queue-stalled-alert | `*/15 * * * *` | on | `SELECT zapp.fn_media_queue_stalled_alert()` |
| 525 | media-loss-retry-purge | `30 3 * * *` | on | `DO $$ DECLARE v_retry int := 0; v_arquivadas int := 0; BEGIN -- 1) RETRY (a): repara pont` |
| 527 | scheduled-reports-daily | `0 8 * * *` | on | `SELECT zapp.fn_run_scheduled_reports()` |
| 528 | scheduled-reports-weekly | `0 8 * * 1` | on | `SELECT zapp.fn_run_scheduled_reports()` |
| 529 | scheduled-reports-dispatch | `*/15 * * * *` | on | `SELECT extensions.http_post( url := 'https://supabase.atomicabr.com.br/functions/v1/send-` |
| 530 | sentinel-teste-mensal | `0 12 2 * *` | on | `INSERT INTO zapp.warroom_alerts (alert_type, title, message, source, entity, severity) SE` |
| 531 | scheduled-messages-dispatch | `* * * * *` | on | `SELECT zapp.fn_dispatch_scheduled_messages();` |
| 532 | sentinel-curto-521 | `30 14 1 * *` | on | `INSERT INTO zapp.warroom_alerts (alert_type, title, message, source, entity, severity) SE` |
| 533 | zapp-notifications-dispatch-5m | `*/5 * * * *` | on | `SELECT extensions.http_post( url := 'https://supabase.atomicabr.com.br/functions/v1/zapp-` |
| 535 | sync-evolution-media-daily | `0 6 * * *` | on | `-- [100PLAN S18 FIX-v2 2026-08-20] Fix: usar m.message_id (WhatsApp hex) em vez de m.id::` |
| 538 | restore_av_zapp_app_notifications | `33 00 * * *` | on | `ALTER TABLE zapp.app_notifications RESET (autovacuum_vacuum_scale_factor, autovacuum_vacuu` |
| 539 | restore_av_evo_evolution_conversations_wpp2 | `33 00 * * *` | on | `ALTER TABLE evo.evolution_conversations_wpp2 RESET (autovacuum_vacuum_scale_factor, autova` |
| 540 | backfill-wa-timestamp-daily | `0 6 * * *` | on | `SELECT evo.fn_backfill_wa_timestamp(24.0, 10000)` |
| 541 | vacuum-analyze-traefik-401-weekly | `0 7 * * 1` | on | `VACUUM ANALYZE evo.evolution_traefik_401_stats` |
| 542 | vacuum-analyze-whatsapp-check-queue-weekly | `5 7 * * 1` | on | `VACUUM ANALYZE evo.evolution_whatsapp_check_queue` |
| 543 | recon-coverage-daily | `30 4 * * *` | on | `SELECT evo.fn_recon_coverage_snapshot()` |
| 544 | weekly-vacuum-webhook-events-processed | `0 3 * * 0` | on | `VACUUM ANALYZE zapp.webhook_events_processed` |
| 545 | purge-warroom-alerts-daily | `30 4 * * *` | on | `SELECT zapp.fn_purge_warroom_alerts(30, 90)` |
| 546 | purge-webhook-events-7d | `30 00 * * 0` | on | `DELETE FROM zapp.webhook_events_processed WHERE processed_at < now() - interval '7 days';` |
| 548 | purge-media-orphans-uuid | `0 5 * * 0` | on | `DELETE FROM zapp.evolution_media WHERE message_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}` |
| 550 | evo-collect-backlog-10m | `*/10 * * * *` | on | `SELECT evo.fn_collect_backlog_history()` |
| 551 | evo-purge-traefik-401-7d | `20 3 * * *` | on | `SELECT evo.fn_purge_traefik_401_stats()` |
| 554 | evo-purge-recon-temp | `0 6 * * *` | on | `SELECT evo.fn_purge_recon_temp_tables()` |
| 555 | rt-fanout-ttl | `*/5 * * * *` | on | `DELETE FROM zapp.realtime_message_fanout WHERE mirrored_at < now() - interval '10 minutes'` |
| 556 | fdw-delta-sentinel-30min | `7,37 * * * *` | on | `SELECT evo.fn_fdw_delta_sentinel()` |
