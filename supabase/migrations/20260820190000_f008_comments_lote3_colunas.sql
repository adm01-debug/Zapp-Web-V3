-- 20260820190000 — f008_comments_lote3_colunas (F-008 lote 3 — colunas)
-- =============================================================================
-- Cobertura de colunas zapp: 22,7% (924/4.074) -> 47,7% (1.942/4.075).
-- Estrategia (etapa 62 do plano: gerar -> revisar -> executar):
--   1. Funcao geradora com regras por nome/tipo/FK/PK + extracao automatica de
--      valores de CHECK constraints (abaixo, como capturada do banco).
--   2. DO aplica COMMENT apenas em colunas SEM comment de tabelas COM dados
--      (colunas de tabelas vazias nao precisam de comment individual — decisao
--      registrada na etapa 65 do plano).
--   3. Overrides curados para as top-5 tabelas (webhook_audit_log, empresas,
--      contact_intelligence, conversation_events, audit_logs) apos inspecao de dados.
--   4. Funcao geradora dropada ao final (utilitario transiente).
-- 25 colunas sem regra segura ficaram sem comment (skip honesto; ver relatorio).
-- Amostra de 45 saidas revisada antes da aplicacao. Idempotente por construcao.

-- Name: fn_f008_col_comment(oid, text, text, boolean, text, boolean); Type: FUNCTION; Schema: zapp; Owner: postgres
--

-- Name: fn_f008_col_comment(oid, text, text, boolean, text, boolean); Type: FUNCTION; Schema: zapp; Owner: postgres
--

CREATE FUNCTION zapp.fn_f008_col_comment(p_rel oid, p_att text, p_typ text, p_notnull boolean, p_fk text, p_pk boolean) RETURNS text
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
  v text;
  v_check text;
  v_base text;
BEGIN
  SELECT ' Valores: ' || regexp_replace(substring(pg_get_constraintdef(cc.oid) from 'ARRAY\[(.+?)\]'), '(::character varying)|(::text)|''', '', 'g') || '.'
    INTO v_check
  FROM pg_constraint cc
  WHERE cc.conrelid = p_rel AND cc.contype = 'c'
    AND (pg_get_constraintdef(cc.oid) LIKE '%(' || p_att || ')::text = ANY%'
      OR pg_get_constraintdef(cc.oid) LIKE '%' || p_att || ' = ANY%')
  LIMIT 1;
  v_check := coalesce(v_check, '');

  v := CASE
    WHEN p_pk AND p_att IN ('id','key_id') THEN format('PK (%s).', p_typ)
    WHEN p_fk <> '' THEN format('FK -> %s.%s', p_fk, CASE WHEN p_notnull THEN ' Obrigatoria.' ELSE '' END)
    WHEN p_att IN ('created_at','criado_em','inserted_at') THEN 'Timestamp de criacao do registro.'
    WHEN p_att IN ('updated_at','atualizado_em') THEN 'Timestamp da ultima atualizacao do registro.'
    WHEN p_att = 'deleted_at' THEN 'Soft delete: quando preenchido, o registro esta excluido logicamente.'
    WHEN p_att = 'resolved_at' THEN 'Quando o item foi resolvido (NULL = em aberto).'
    WHEN p_att IN ('expires_at','expire_at','token_expires_at') THEN 'Timestamp de expiracao/validade.'
    WHEN p_att = 'processed_at' THEN 'Quando o item foi processado pelo pipeline.'
    WHEN p_att = 'checked_at' THEN 'Timestamp da ultima verificacao.'
    WHEN p_att = 'connected_at' THEN 'Quando a conexao foi estabelecida.'
    WHEN p_att IN ('started_at','iniciado_em') THEN 'Timestamp de inicio da execucao.'
    WHEN p_att IN ('finished_at','completed_at','ended_at','concluido_em') THEN 'Timestamp de conclusao.'
    WHEN p_att = 'status' THEN 'Status do registro.' || v_check
    WHEN p_att IN ('name','nome') THEN 'Nome de exibicao.'
    WHEN p_att IN ('title','titulo') THEN 'Titulo de exibicao.'
    WHEN p_att IN ('description','descricao') THEN 'Descricao livre.'
    WHEN p_att = 'message' THEN 'Texto da mensagem.'
    WHEN p_att = 'content' THEN 'Conteudo textual.'
    WHEN p_att = 'metadata' THEN 'JSONB de metadados adicionais (estrutura livre por modulo).'
    WHEN p_att = 'payload' THEN 'JSONB com o payload bruto do evento/requisicao.'
    WHEN p_att IN ('details','detail') THEN 'Detalhes adicionais do evento.'
    WHEN p_att = 'config' THEN 'JSONB de configuracao do modulo.'
    WHEN p_att = 'settings' THEN 'JSONB de configuracoes.'
    WHEN p_att IN ('is_active','ativo') THEN 'Flag: registro ativo?'
    WHEN p_att = 'enabled' THEN 'Flag: recurso habilitado?'
    WHEN p_att = 'is_read' THEN 'Flag: item lido pelo usuario?'
    WHEN p_att = 'email' THEN 'Endereco de e-mail.'
    WHEN p_att IN ('phone','telefone','phone_number') THEN 'Numero de telefone.'
    WHEN p_att = 'remote_jid' THEN 'JID WhatsApp (ex.: 5511...@s.whatsapp.net; @g.us para grupos).'
    WHEN p_att = 'instance_name' THEN 'Instancia Evolution API dona do registro (ex.: wpp2).'
    WHEN p_att = 'message_id' THEN 'ID da mensagem WhatsApp (WAMID) na Evolution.'
    WHEN p_att = 'user_id' THEN 'ID do usuario (auth.users).'
    WHEN p_att = 'profile_id' THEN 'ID do perfil (zapp.profiles).'
    WHEN p_att = 'workspace_id' THEN 'ID do workspace/tenant (zapp.workspaces).'
    WHEN p_att = 'contact_id' THEN 'ID do contato relacionado.'
    WHEN p_att = 'conversation_id' THEN 'ID da conversa relacionada.'
    WHEN p_att = 'ip_address' THEN 'Endereco IP de origem.'
    WHEN p_att = 'user_agent' THEN 'User-Agent do cliente HTTP.'
    WHEN p_att = 'error_message' THEN 'Mensagem de erro (NULL = sem erro).'
    WHEN p_att IN ('error_code','error_type','error_msg') THEN 'Codigo/tipo do erro.'
    WHEN p_att IN ('http_status','http_code','status_code') THEN 'Codigo de status HTTP.'
    WHEN p_att = 'duration_ms' THEN 'Duracao em milissegundos.'
    WHEN p_att = 'duration_seconds' THEN 'Duracao em segundos.'
    WHEN p_att IN ('retry_count','attempts','tentativas') THEN 'Numero de tentativas realizadas.'
    WHEN p_att = 'attempt_number' THEN 'Numero da tentativa atual.'
    WHEN p_att = 'max_retries' THEN 'Limite maximo de tentativas.'
    WHEN p_att IN ('table_name','tbl_name') THEN 'Nome da tabela referenciada.'
    WHEN p_att = 'event_type' THEN 'Tipo do evento.' || v_check
    WHEN p_att = 'alert_type' THEN 'Tipo do alerta.' || v_check
    WHEN p_att = 'severity' THEN 'Severidade.' || v_check
    WHEN p_att IN ('category','categoria') THEN 'Categoria.' || v_check
    WHEN p_att IN ('type','tipo','kind') THEN 'Tipo do registro.' || v_check
    WHEN p_att = 'role' THEN 'Papel/permissao do usuario.' || v_check
    WHEN p_att = 'slug' THEN 'Identificador URL-safe (slug).'
    WHEN p_att = 'token' THEN 'Token secreto de acesso/validacao.'
    WHEN p_att = 'key' THEN 'Chave identificadora.'
    WHEN p_att IN ('value','valor') THEN 'Valor associado a chave.'
    WHEN p_att = 'avatar_url' THEN 'URL do avatar.'
    WHEN p_att = 'emoji' THEN 'Emoji associado (UI).'
    WHEN p_att IN ('color','cor') THEN 'Cor (hex ou nome) para UI.'
    WHEN p_att IN ('position','ordem','sort_order','display_order') THEN 'Ordem de exibicao.'
    WHEN p_att IN ('notes','observacoes','nota') THEN 'Anotacoes livres.'
    WHEN p_att IN ('reason','motivo') THEN 'Motivo/justificativa.'
    WHEN p_att = 'result' THEN 'Resultado da operacao.'
    WHEN p_att = 'run_id' THEN 'ID da execucao (correlaciona registros do mesmo run).'
    WHEN p_att = 'request_id' THEN 'ID da requisicao (correlacao de logs).'
    WHEN p_att IN ('created_by','updated_by','performed_by','owner_id','dismissed_by','resolved_by','acknowledged_by','assigned_by','requested_by','paused_by','changed_by','triggered_by','uploaded_by') THEN 'Usuario/processo autor da acao.'
    WHEN p_att = 'agent_id' THEN 'Agente (atendente) relacionado.'
    WHEN p_att = 'department_id' THEN 'Departamento relacionado.'
    WHEN p_att = 'queue_id' THEN 'Fila de atendimento relacionada.'
    WHEN p_att = 'provider' THEN 'Provedor/integracao de origem.'
    WHEN p_att = 'servico' THEN 'Servico monitorado/relacionado.'
    WHEN p_att = 'source' THEN 'Origem do registro/evento.'
    WHEN p_att = 'entity' THEN 'Entidade alvo do evento.'
    WHEN p_att IN ('operation','action','acao') THEN 'Operacao/acao executada.' || v_check
    WHEN p_att = 'whatsapp_connection_id' THEN 'Conexao WhatsApp relacionada (zapp.whatsapp_connections).'
    WHEN p_att = 'api_key' THEN 'Chave de API (segredo - nao expor em logs).'
    WHEN p_att = 'cnpj' THEN 'CNPJ da empresa.'
    WHEN p_att = 'cargo' THEN 'Cargo do colaborador.'
    WHEN p_att = 'sobrenome' THEN 'Sobrenome.'
    WHEN p_att = 'nickname' THEN 'Apelido de exibicao.'
    WHEN p_att = 'birthday' THEN 'Data de aniversario.'
    WHEN p_att IN ('chave_pix','pix_key') THEN 'Chave PIX.'
    WHEN p_att = 'pix_key_type' THEN 'Tipo da chave PIX.' || v_check
    WHEN p_att = 'coins' THEN 'Moedas acumuladas (gamificacao).'
    WHEN p_att IN ('current_streak','best_streak') THEN 'Sequencia (streak) de gamificacao.'
    WHEN p_att = 'hot_days' THEN 'Dias consecutivos ativos (gamificacao).'
    WHEN p_att = 'entity_id' THEN 'ID da entidade alvo (par com entity_type).'
    WHEN p_att = 'entity_type' THEN 'Tipo da entidade alvo.' || v_check
    WHEN p_att = 'file_size' THEN 'Tamanho do arquivo em bytes.'
    WHEN p_att IN ('size_bytes','total_size','index_size','toast_size') THEN 'Tamanho em bytes.'
    WHEN p_att = 'file_name' THEN 'Nome do arquivo.'
    WHEN p_att = 'file_hash' THEN 'Hash do conteudo do arquivo (dedupe/integridade).'
    WHEN p_att IN ('file_type','mime_type','media_mime_type') THEN 'MIME type do arquivo/midia.'
    WHEN p_att IN ('height','width') THEN 'Dimensao da midia em pixels.'
    WHEN p_att = 'caption' THEN 'Legenda da midia.'
    WHEN p_att = 'instance_id' THEN 'ID da instancia Evolution API.'
    WHEN p_att = 'owner_jid' THEN 'JID WhatsApp do dono da instancia.'
    WHEN p_att = 'group_id' THEN 'ID do grupo WhatsApp.'
    WHEN p_att = 'lid_jid' THEN 'JID formato LID (identidade WhatsApp pos-multi-device).'
    WHEN p_att = 'pn_jid' THEN 'JID formato PN (phone number) do contato.'
    WHEN p_att = 'label_pt' THEN 'Rotulo em portugues.'
    WHEN p_att = 'label_en' THEN 'Rotulo em ingles.'
    WHEN p_att = 'dept_pt' THEN 'Nome do departamento em portugues.'
    WHEN p_att = 'dept_en' THEN 'Nome do departamento em ingles.'
    WHEN p_att = 'department' THEN 'Departamento (texto livre).'
    WHEN p_att = 'last_health_check' THEN 'Timestamp do ultimo health check.'
    WHEN p_att = 'health_status' THEN 'Status de saude do componente.' || v_check
    WHEN p_att IN ('health_error','health_reason') THEN 'Erro/motivo reportado pelo health check.'
    WHEN p_att = 'last_seen' THEN 'Ultima vez visto/ativo.'
    WHEN p_att = 'ultimo_login' THEN 'Timestamp do ultimo login.'
    WHEN p_att = 'paused_until' THEN 'Pausado ate este timestamp.'
    WHEN p_att = 'paused_reason' THEN 'Motivo da pausa.'
    WHEN p_att = 'locked_until' THEN 'Bloqueado ate este timestamp.'
    WHEN p_att = 'priority' THEN 'Prioridade de processamento/atendimento.'
    WHEN p_att IN ('meta','context','data') THEN 'JSONB de dados/contexto do registro.'
    WHEN p_att IN ('new_data','new_values') THEN 'JSONB com os valores NOVOS do registro auditado.'
    WHEN p_att IN ('old_data','old_values') THEN 'JSONB com os valores ANTIGOS do registro auditado.'
    WHEN p_att = 'changed_fields' THEN 'JSONB com os campos alterados.'
    WHEN p_att = 'rollout_percentage' THEN 'Percentual de rollout da feature (0-100).'
    WHEN p_att = 'rpc_name' THEN 'Nome da funcao RPC.'
    WHEN p_att = 'score' THEN 'Pontuacao calculada.'
    WHEN p_att = 'sender_id' THEN 'Remetente (usuario/perfil).'
    WHEN p_att = 'service' THEN 'Servico relacionado.'
    WHEN p_att = 'total_uses' THEN 'Contador de usos.'
    WHEN p_att = 'window_start' THEN 'Inicio da janela de agregacao/rate limit.'
    WHEN p_att = 'body' THEN 'Corpo/conteudo textual.'
    WHEN p_att = 'raw' THEN 'Conteudo bruto sem processamento.'
    WHEN p_att = 'ts' THEN 'Timestamp do registro.'
    WHEN p_att = 'unit' THEN 'Unidade de medida.'
    WHEN p_att = 'theme' THEN 'Tema de UI escolhido.'
    WHEN p_att = 'plan' THEN 'Plano contratado.'
    WHEN p_att IN ('secret','cookie','csrf_token','jwt_secret','verify_token','challenge') THEN 'Segredo/token de seguranca (nao expor em logs).'
    WHEN p_att = 'jwt_jwks' THEN 'JSONB JWKS (chaves publicas JWT).'
    WHEN p_att IN ('nonce','key_material','signature') THEN 'Material criptografico.'
    WHEN p_att = 'key_hash' THEN 'Hash da chave (armazenada apenas como hash).'
    WHEN p_att = 'key_prefix' THEN 'Prefixo publico da chave (identificacao).'
    WHEN p_att = 'key_version' THEN 'Versao da chave (rotacao).'
    WHEN p_att = 'etag' THEN 'ETag para cache/controle de versao HTTP.'
    WHEN p_att = 'dsn' THEN 'DSN do Sentry.'
    WHEN p_att LIKE '%sample_rate' THEN 'Taxa de amostragem Sentry (0.0-1.0).'
    WHEN p_att = 'icon' THEN 'Icone (nome ou URL) para UI.'
    WHEN p_att = 'rating' THEN 'Avaliacao numerica dada pelo usuario.'
    WHEN p_att = 'tags' THEN 'Lista de tags.'
    WHEN p_att = 'state' THEN 'Estado atual (maquina de estados).' || v_check
    WHEN p_att = 'step' THEN 'Etapa atual do fluxo.'
    WHEN p_att = 'segment' THEN 'Segmento do contato/empresa.'
    WHEN p_att = 'feedback' THEN 'Feedback textual do usuario.'
    WHEN p_att = 'periodo' THEN 'Periodo de referencia.'
    WHEN p_att = 'owner' THEN 'Dono do recurso.'
    WHEN p_att = 'identifier' THEN 'Identificador generico do registro.'
    WHEN p_att = 'module' THEN 'Modulo do sistema.'
    WHEN p_att = 'language' THEN 'Idioma (codigo, ex.: pt-BR).'
    WHEN p_att IN ('version','version_number') THEN 'Numero de versao.'
    WHEN p_att = 'jobid' THEN 'ID do job no pg_cron (cron.job).'
    WHEN p_att = 'jobname' THEN 'Nome do job no pg_cron.'
    WHEN p_att IN ('battery','battery_level') THEN 'Nivel de bateria do dispositivo WhatsApp.'
    WHEN p_att = 'direction' THEN 'Direcao da mensagem (inbound/outbound).' || v_check
    WHEN p_att = 'disc_profile' THEN 'Perfil comportamental DISC (D, I, S ou C).'
    WHEN p_att = 'display_phone' THEN 'Telefone formatado para exibicao.'
    WHEN p_att = 'endpoint' THEN 'Endpoint/rota HTTP.'
    WHEN p_att = 'method' THEN 'Metodo HTTP (GET/POST/etc).'
    WHEN p_att = 'environment' THEN 'Ambiente (production/staging/dev).'
    WHEN p_att IN ('failure_reason','delete_error','probe_error') THEN 'Motivo/erro da falha.'
    WHEN p_att = 'error_logs' THEN 'Logs de erro acumulados.'
    WHEN p_att = 'event_id' THEN 'ID externo do evento.'
    WHEN p_att = 'expiration_date' THEN 'Data de expiracao.'
    WHEN p_att = 'external_id' THEN 'ID do registro no sistema externo.'
    WHEN p_att IN ('qr_code','qr_code_base64') THEN 'QR code de pareamento WhatsApp (base64/texto).'
    WHEN p_att IN ('proxy_host','proxy_port','proxy_user','proxy_pass') THEN 'Configuracao de proxy da instancia.'
    WHEN p_att = 'purpose' THEN 'Finalidade do registro.'
    WHEN p_att IN ('query_hash','query_text') THEN 'Query SQL (texto ou hash).'
    WHEN p_att IN ('query_limit','query_offset') THEN 'Paginacao da consulta.'
    WHEN p_att IN ('quiet_hours_start','quiet_hours_end') THEN 'Janela de silencio de notificacoes (HH:MM).'
    WHEN p_att IN ('business_hours_start','business_hours_end') THEN 'Horario comercial (HH:MM).'
    WHEN p_att = 'business_hours' THEN 'JSONB com grade de horario comercial.'
    WHEN p_att = 'work_days' THEN 'Dias de trabalho (lista).'
    WHEN p_att = 'rows_affected' THEN 'Quantidade de linhas afetadas.'
    WHEN p_att = 'rule_id' THEN 'Regra relacionada.'
    WHEN p_att = 'scopes' THEN 'Escopos de acesso concedidos.'
    WHEN p_att = 'snapshot_date' THEN 'Data do snapshot.'
    WHEN p_att IN ('welcome_message','away_message','farewell_message','closing_message','auto_reply_message','custom_message') THEN 'Mensagem automatica configurada (texto).'
    WHEN p_att = 'legacy_message' THEN 'Mensagem no formato legado.'
    WHEN p_att = 'webhook_source' THEN 'Origem do webhook.'
    WHEN p_att = 'idempotency_key' THEN 'Chave de idempotencia (dedupe de operacoes).'
    WHEN p_att = 'response_body' THEN 'Corpo da resposta HTTP.'
    WHEN p_att = 'response_preview' THEN 'Preview truncado da resposta.'
    WHEN p_att IN ('allowed_roles','allowed_user_ids','blocked_user_ids') THEN 'Lista de controle de acesso.'
    WHEN p_att = 'account_id' THEN 'Conta relacionada.'
    WHEN p_att IN ('routing_mode','distribution_algorithm','auto_assignment_method') THEN 'Estrategia de roteamento/distribuicao de atendimento.' || v_check
    WHEN p_att = 'routing_weight' THEN 'Peso no algoritmo de roteamento.'
    WHEN p_att = 'profile_picture' THEN 'Foto de perfil (URL ou base64).'
    WHEN p_att = 'object_name' THEN 'Nome do objeto no storage.'
    WHEN p_att = 'bucket_id' THEN 'Bucket do storage relacionado.'
    WHEN p_att IN ('normalized_text','original_text') THEN 'Texto (original ou normalizado) para dedupe/busca.'
    WHEN p_att = 'normalization_form' THEN 'Forma de normalizacao Unicode aplicada (ex.: NFC).'
    WHEN p_att IN ('conversations_resolved','messages_sent','messages_received','message_count_sent','message_count_received') THEN 'Contador de produtividade do atendimento.'
    WHEN p_att = 'avg_response_time_seconds' THEN 'Tempo medio de resposta em segundos.'
    WHEN p_att = 'customer_satisfaction_score' THEN 'Score de satisfacao do cliente (CSAT).'
    WHEN p_att IN ('metric_name','metric_value','metrics') THEN 'Metrica coletada (nome/valor/JSONB).'
    WHEN p_att IN ('migration_status','migration_notes','migrations_ran') THEN 'Controle de migracao de dados.'
    WHEN p_att IN ('cursor_id','last_record_id','row_id','_row_id') THEN 'Cursor/ponteiro de progresso de processamento.'
    WHEN p_att IN ('delta_abs','delta_pct') THEN 'Delta medido (absoluto/percentual).'
    WHEN p_att IN ('inactivity_timeout','cooldown_seconds','reconnect_interval_seconds') THEN 'Intervalo/timeout em segundos.'
    WHEN p_att IN ('archive_days') THEN 'Dias ate arquivamento (retencao).'
    WHEN p_att IN ('src_contacts','mir_contacts') THEN 'Contador de contatos (origem/espelho) na migracao.'
    WHEN p_att IN ('postgres_cdc_default','broadcast_adapter') THEN 'Configuracao interna do servico Supabase Realtime.'
    WHEN p_att IN ('alerts','breakdown','full_result','recent_errors','detected_signals','inbox_filters','n8n_workflows','bitrix_integration','permissions') THEN format('JSONB: %s.', replace(p_att,'_',' '))
    WHEN p_att LIKE 'bitrix%' OR p_att LIKE '%bitrix%' THEN format('Integracao Bitrix24: %s.', replace(p_att,'_',' '))
    WHEN p_att LIKE 'tts_%' THEN format('Configuracao TTS (texto-para-voz): %s.', replace(substr(p_att,5),'_',' '))
    WHEN p_att LIKE '%_sound_type' THEN format('Som de notificacao para "%s".', replace(left(p_att, length(p_att)-11),'_',' '))
    WHEN p_att LIKE 'sla_%' THEN format('Parametro de SLA: %s.', replace(substr(p_att,5),'_',' ')) || v_check
    WHEN p_att LIKE 'probe_%' THEN format('Dado do probe de monitoramento: %s.', replace(substr(p_att,7),'_',' '))
    WHEN p_att LIKE 'test_%' THEN format('Identificacao do teste: %s.', replace(substr(p_att,6),'_',' '))
    WHEN p_att LIKE 'max_%' THEN format('Limite maximo: %s.', replace(substr(p_att,5),'_',' '))
    WHEN p_att LIKE 'min_%' THEN format('Limite minimo: %s.', replace(substr(p_att,5),'_',' '))
    WHEN p_att LIKE '%_threshold%' THEN format('Limiar configurado: %s.', replace(p_att,'_',' '))
    WHEN p_att = 'threshold' THEN 'Limiar configurado.'
    WHEN p_att LIKE 'is\_%' THEN format('Flag booleana: %s?', replace(substr(p_att,4), '_', ' '))
    WHEN p_att LIKE 'has\_%' THEN format('Flag booleana: possui %s?', replace(substr(p_att,5), '_', ' '))
    WHEN p_att LIKE '%\_url' THEN format('URL de %s.', replace(left(p_att, length(p_att)-4), '_', ' '))
    WHEN p_att LIKE '%\_ms' THEN format('%s em milissegundos.', initcap(replace(left(p_att, length(p_att)-3), '_', ' ')))
    WHEN p_att LIKE '%\_seconds' THEN format('%s em segundos.', initcap(replace(left(p_att, length(p_att)-8), '_', ' ')))
    WHEN p_att LIKE '%\_minutes' THEN format('%s em minutos.', initcap(replace(left(p_att, length(p_att)-8), '_', ' ')))
    WHEN p_att LIKE '%\_hours' THEN format('%s em horas.', initcap(replace(left(p_att, length(p_att)-6), '_', ' ')))
    WHEN p_att LIKE '%\_days' THEN format('%s em dias.', initcap(replace(left(p_att, length(p_att)-5), '_', ' ')))
    WHEN p_att LIKE '%\_count' THEN format('Contador de %s.', replace(left(p_att, length(p_att)-6), '_', ' '))
    WHEN p_att LIKE '%\_at' AND p_typ LIKE 'timestamp%' THEN format('Timestamp do evento "%s".', replace(left(p_att, length(p_att)-3), '_', ' '))
    WHEN p_att LIKE '%\_em' AND p_typ LIKE 'timestamp%' THEN format('Timestamp do evento "%s".', replace(left(p_att, length(p_att)-3), '_', ' '))
    WHEN p_att LIKE '%\_date' THEN format('Data de %s.', replace(left(p_att, length(p_att)-5), '_', ' '))
    WHEN p_att LIKE '%\_jid' THEN format('JID WhatsApp (%s).', replace(left(p_att, length(p_att)-4), '_', ' '))
    WHEN p_att LIKE '%\_name' THEN format('Nome de %s.', replace(left(p_att, length(p_att)-5), '_', ' '))
    WHEN p_att LIKE '%\_hash' THEN format('Hash de %s.', replace(left(p_att, length(p_att)-5), '_', ' '))
    WHEN p_att LIKE '%\_key' THEN format('Chave: %s.', replace(left(p_att, length(p_att)-4), '_', ' '))
    WHEN p_att LIKE '%\_type' THEN format('Tipo de %s.', replace(left(p_att, length(p_att)-5), '_', ' ')) || v_check
    WHEN p_att LIKE '%\_status' THEN format('Status de %s.', replace(left(p_att, length(p_att)-7), '_', ' ')) || v_check
    WHEN p_att LIKE '%\_reason' THEN format('Motivo de %s.', replace(left(p_att, length(p_att)-7), '_', ' '))
    WHEN p_att LIKE '%\_notes' THEN format('Anotacoes de %s.', replace(left(p_att, length(p_att)-6), '_', ' '))
    WHEN p_att LIKE '%\_message' THEN format('Texto: %s.', replace(p_att, '_', ' '))
    WHEN p_att LIKE '%\_by' THEN format('Autor da acao "%s".', replace(left(p_att, length(p_att)-3), '_', ' '))
    WHEN p_att LIKE '%\_ids' AND p_typ LIKE '%[]' THEN format('Lista de IDs: %s.', replace(left(p_att, length(p_att)-4), '_', ' '))
    WHEN p_att LIKE '%\_id' AND p_fk = '' THEN format('ID de %s relacionado.', replace(left(p_att, length(p_att)-3), '_', ' '))
    WHEN p_typ = 'boolean' THEN format('Flag booleana "%s".', replace(p_att, '_', ' '))
    WHEN p_typ = 'inet' THEN 'Endereco IP.'
    WHEN p_typ = 'jsonb' THEN format('JSONB: %s.', replace(p_att, '_', ' '))
    ELSE NULL
  END;
  RETURN v;
END;
$$;

DO $do$ DECLARE r RECORD; v_cmt text; v_qtd int := 0; BEGIN
  FOR r IN SELECT c.oid AS rel, c.relname AS t, a.attname AS col, format_type(a.atttypid,a.atttypmod) AS typ, a.attnotnull AS nn,
      coalesce((SELECT con.confrelid::regclass::text FROM pg_constraint con WHERE con.conrelid=c.oid AND con.contype='f' AND a.attnum=ANY(con.conkey) LIMIT 1),'') AS fk,
      EXISTS (SELECT 1 FROM pg_constraint pc WHERE pc.conrelid=c.oid AND pc.contype='p' AND a.attnum=ANY(pc.conkey)) AS pk
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='zapp' AND c.relkind IN ('r','p') AND c.reltuples>0 AND a.attnum>0 AND NOT a.attisdropped
      AND col_description(a.attrelid,a.attnum) IS NULL
  LOOP
    v_cmt := zapp.fn_f008_col_comment(r.rel, r.col, r.typ, r.nn, r.fk, r.pk);
    IF v_cmt IS NOT NULL THEN
      EXECUTE format('COMMENT ON COLUMN zapp.%I.%I IS %L', r.t, r.col, v_cmt);
      v_qtd := v_qtd + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'comments aplicados: %', v_qtd;
END $do$;

-- Overrides curados (top-5 tabelas, apos inspecao de amostras reais)
COMMENT ON COLUMN zapp.webhook_audit_log.endpoint IS 'Endpoint/rota do webhook chamado (NULL para eventos internos do pipeline RabbitMQ).';
COMMENT ON COLUMN zapp.webhook_audit_log.method IS 'Metodo HTTP da chamada (NULL para eventos internos).';
COMMENT ON COLUMN zapp.webhook_audit_log.response_body IS 'JSONB com a resposta retornada ao emissor do webhook.';
COMMENT ON COLUMN zapp.webhook_audit_log.received_at IS 'Quando o evento foi recebido pelo gateway/consumer.';
COMMENT ON COLUMN zapp.empresas.telefone IS 'Telefone principal da empresa (formato livre, ex.: +55 62 3307-2690).';
COMMENT ON COLUMN zapp.contact_intelligence.predicted_value IS 'Valor previsto do contato (score de propensao/valor potencial calculado pela IA).';
COMMENT ON COLUMN zapp.contact_intelligence.phone IS 'Telefone normalizado do contato (DDI+DDD+numero, sem +; ex.: 553299149400).';
COMMENT ON COLUMN zapp.contact_intelligence.contact_name IS 'Nome do contato no momento do calculo de inteligencia.';
COMMENT ON COLUMN zapp.contact_intelligence.inbound_ratio IS 'Proporcao de mensagens recebidas vs enviadas (0-100).';
COMMENT ON COLUMN zapp.conversation_events.from_queue_id IS 'Fila de origem (eventos de transferencia).';
COMMENT ON COLUMN zapp.conversation_events.to_queue_id IS 'Fila de destino (eventos de transferencia).';
COMMENT ON COLUMN zapp.conversation_events.provider_message_log_id IS 'Referencia ao log de mensagem do provider que originou o evento.';
COMMENT ON COLUMN zapp.conversation_events.thread_id IS 'Thread/conversa relacionada ao evento.';
COMMENT ON COLUMN zapp.conversation_events.trace_id IS 'ID de trace distribuido (correlacao ponta a ponta).';
COMMENT ON COLUMN zapp.audit_logs.resource IS 'Recurso/objeto alvo da acao auditada.';
COMMENT ON COLUMN zapp.audit_logs.event_type IS 'Tipo do evento auditado (ex.: login, logout, update).';
COMMENT ON COLUMN zapp.audit_logs.status IS 'Resultado da acao auditada (ex.: success, failure).';

-- Cleanup do utilitario
DROP FUNCTION IF EXISTS zapp.fn_f008_col_comment(oid, text, text, boolean, text, boolean);

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260820190000', 'f008_comments_lote3_colunas')
ON CONFLICT DO NOTHING;
