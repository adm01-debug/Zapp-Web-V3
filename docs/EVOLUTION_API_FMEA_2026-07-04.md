# 🧪 FMEA — Simulação de cenários de falha ANTES da execução (Sessão 5)

> **Data:** 2026-07-04 · **Escopo:** todas as melhorias pendentes das auditorias (sessões 1–5)
> **Método:** para cada workstream, enumeração de modos de falha com Probabilidade (P: A=alta,
> M=média, B=baixa), Impacto (I: 1=cosmético … 5=outage total), detecção, mitigação preventiva
> e critério de ABORT. Execução só começa depois desta matriz. Regra de ouro global:
> **1 mudança por vez, validação após cada passo, rollback documentado antes de tocar.**

## Invariantes globais (valem para todos os workstreams)

| # | Invariante | Verificação contínua |
|---|---|---|
| G1 | A linha principal (fantasma `d8e07e44…`, `open`) e a `wpp_pink_test` NÃO podem cair por efeito colateral | Nunca reiniciar `evolution_evolution`; nenhuma mudança toca o serviço Evolution |
| G2 | O Postgres PG15 (Supabase) serve produção (zapp-web) — mudanças de dados só em schemas de log/analytics, nunca DDL destrutivo em `zapp`/`evo`/`public` sem backup | Dumps diários existem (verificado sessão 4 §4); conferir antes de cada DELETE/DROP |
| G3 | Meu próprio acesso de execução (MCP Portainer + psql peer via exec) não pode depender da senha sendo rotacionada | `psql` via socket/peer dentro dos containers PG = independe de senha |
| G4 | Backups: nunca deixar os 3 stacks de backup em estado intermediário no fim da sessão | Cada stack convertido e validado individualmente antes do próximo |
| G5 | Segredos novos: gerados dentro do host (`openssl rand`), nunca impressos em log/transcript | Comandos com saída suprimida (`>/dev/null`, sem echo do valor) |
| G6 | Toda mudança em stack file preserva o comportamento runtime atual (anti-drift: o que o container usa hoje = o que o stack file descreve amanhã) | Diff runtime env vs stack file antes de reescrever |

---

## WS-1 · GlitchTip (S4-3) — consertar ingestão HTTP 500

| # | Cenário de falha | P | I | Mitigação / Abort |
|---|---|---|---|---|
| 1.1 | Migrações Django pendentes → 500 em `/api/N/store/` | M | 2 | Rodar `manage.py migrate` no container web (idempotente); abort se migração falhar no meio → restaurar não é preciso (migrate é transacional) |
| 1.2 | Postgres do GlitchTip (postgres:16) cheio/corrompido | B | 2 | Checar `pg_database_size`, logs; se corrompido, NÃO recriar volume sem dump |
| 1.3 | Redis/worker do GlitchTip morto → ingestão enfileira e falha | M | 2 | Checar serviços da stack 41 (web/worker/beat/redis se houver); restart só dos componentes do GlitchTip (fora do caminho de mensagens WhatsApp) |
| 1.4 | DSN do watchdog aponta para projeto inexistente (projeto deletado) → 500/404 | M | 2 | Testar ingestão com o MESMO DSN do secret; se projeto não existe, recriar projeto e atualizar secret (novo DSN) |
| 1.5 | `SECRET_KEY`/env quebrado após restart do glitchtip-web (2 tasks vistas — flapping?) | M | 2 | Inspecionar por que existem 2 containers web; se replicas=1, o segundo é task morta antiga |
| 1.6 | Restart do GlitchTip derruba alertas durante a janela | A | 1 | Janela de segundos; watchdog reenvia no próximo ciclo (5 min) |
| 1.7 | Consumer usa Sentry DSN do mesmo GlitchTip → fix muda comportamento do consumer | B | 1 | Consumer só ENVIA para Sentry; mudança no servidor não afeta o consumer |
| 1.8 | Fix envolve upgrade de imagem `latest` → breaking change do GlitchTip | M | 3 | NÃO fazer pull de imagem nova; consertar com a imagem atual |
| 1.9 | Evento sintético de teste polui projeto de produção | A | 1 | Usar tag `test=true` e mensagem explícita "synthetic ingestion test" |
| 1.10 | 500 é intermitente (só sob carga) → falso "consertado" | M | 2 | Validar com ≥3 eventos espaçados + conferir no banco do GlitchTip que os eventos foram persistidos |

## WS-2 · Quick wins Evolution API (settings do fantasma + syncFullHistory pink)

| # | Cenário de falha | P | I | Mitigação / Abort |
|---|---|---|---|---|
| 2.1 | `settings/set` no fantasma derruba a conexão Baileys | B | 4 | Endpoint só grava Setting no DB + aplica em runtime; não reinicia socket. Confirmar `state=open` após. Abort: se state mudar, reverter settings imediatamente |
| 2.2 | Aplicar settings dispara re-sync ou loop de eventos | B | 2 | Settings não geram eventos de sync; monitorar logs 2 min após |
| 2.3 | `syncFullHistory=false` na pink só vale na PRÓXIMA conexão → falsa expectativa | A | 1 | Documentar: efeito a partir da próxima reconexão (não forçar reconexão agora — G1) |
| 2.4 | Fantasma é deletado pelo usuário durante a mudança (corrida com re-pareamento) | B | 1 | Mudança é idempotente e barata; se instância sumir, nada a fazer |
| 2.5 | Mudar settings do fantasma "legitima" a instância errada e desincentiva o re-pareamento | M | 2 | Deixar explícito no relatório: é MITIGAÇÃO temporária; runbook S5-1 continua obrigatório |
| 2.6 | Typo no nome da instância (UUID longo) → cria instância nova do nada | B | 3 | Copiar nome exato do fetchInstances; conferir resposta do set (instanceId f957389a…) |
| 2.7 | `rejectCall=true` com mensagem: cliente que liga recebe texto → comportamento visível ao público | A | 1 | É o comportamento que a wpp2 sempre teve (mesma msgCall); alinhado ao negócio |

## WS-3 · zapp.instance_registry (S5-2) + ghost QA (S5-4/S5-3)

| # | Cenário de falha | P | I | Mitigação / Abort |
|---|---|---|---|---|
| 3.1 | UPDATE manual do status conflita com um job que também escreve (lost update) | M | 1 | Descobrir QUEM escreve no registry (grep nas functions) antes; preferir corrigir a FONTE (função de reconcile) |
| 3.2 | Trigger novo em tabela quente degrada ingestão de webhooks | M | 3 | NÃO criar trigger em `webhook_events_processed` (48k rows/mês); usar o cron de reconcile existente (5 min) para atualizar o registry |
| 3.3 | Função nova com search_path inseguro (SECURITY DEFINER) | M | 2 | `SET search_path = pg_catalog, public, zapp` explícito; owner postgres; sem SECURITY DEFINER se desnecessário |
| 3.4 | Registrar `qa_*` como test esconde fantasma real futuro | M | 3 | Registrar QA com `status='test'` e `is_active=false` + o KPI continua alertando para instância fora do registry (fantasma real como `d8e07e44…` continua alertando) |
| 3.5 | Registro do fantasma `d8e07e44…` no registry por engano | B | 3 | NÃO registrar o fantasma — ele deve continuar disparando o KPI de ghost até ser deletado |
| 3.6 | Migração aplicada direto em produção sem ficar versionada no repo | A | 2 | Salvar o SQL em `db/` ou `supabase/migrations` no repo (mesmo padrão dos PRs #160–164) |
| 3.7 | Status atualizado com base em `connection.update` atrasado (fila) → flip-flop | B | 1 | Usar last-write-wins por timestamp do evento; updates a cada ciclo de reconcile são idempotentes |

## WS-4 · Retenção `_analytics`/Logflare (S4-4) — recuperar ~30 GB

| # | Cenário de falha | P | I | Mitigação / Abort |
|---|---|---|---|---|
| 4.1 | `log_events_*` NÃO é particionada → DELETE de 29 GB gera WAL gigante + bloat, não libera espaço | M | 4 | Inspecionar `pg_partitioned_table`/`pg_inherits` ANTES. Se não particionada: DELETE em lotes de ≤50k + `VACUUM` (espaço reutilizável) e avaliar `pg_repack`-less truncate por tabela se o Logflare recriar. Abort se WAL/disco subir >5 GB |
| 4.2 | DROP de partição enquanto Logflare escreve → erro no Logflare / crash loop | M | 3 | Dropar apenas partições com dados >14 dias (nunca a partição corrente/futura); Logflare tolera partição ausente antiga |
| 4.3 | Disco enche DURANTE a operação (WAL + logs) — 46 GB livres | B | 5 | `max_wal_size=4GB` limita; monitorar `pg_database_size` + `df` entre lotes; abort imediato se livre <35 GB |
| 4.4 | Lock exclusivo do DROP bloqueia ingestão do Logflare por segundos | A | 1 | DROP de partição é rápido (ms); fazer 1 a 1 |
| 4.5 | Studio/Logs do Supabase para de mostrar histórico antigo | A | 1 | Esperado e aceito (retenção 14d) — logs de negócio não moram aí |
| 4.6 | Config permanente exige env `LOGFLARE_*` + redeploy do analytics → analytics reinicia | M | 2 | Logflare self-hosted v1 não tem env de retenção confiável → preferir job pg_cron mensal/diário de drop (sem tocar no serviço) |
| 4.7 | Job de retenção novo dropa partição errada (regex frouxa) | B | 5 | Função com allowlist estrita (`_analytics.log_events_%` + idade por nome/constraint) + `RAISE NOTICE` de dry-run validado antes de agendar |
| 4.8 | Autovacuum tenta processar tabelões durante a janela → IO alto | M | 2 | Fazer em lotes com pausas; horário atual (sáb de manhã) é janela boa |
| 4.9 | `supabase_analytics` (Logflare) referencia OIDs das partições em cache → erros transitórios | M | 1 | Erros transitórios se auto-resolvem; monitorar logs do container analytics após |
| 4.10 | Espaço não volta ao SO (páginas livres, não truncadas) | M | 2 | DROP TABLE devolve espaço imediatamente (unlink); DELETE não → por isso preferir DROP de partições |

## WS-5 · supabase-db-mcp → secret (N5)

| # | Cenário de falha | P | I | Mitigação / Abort |
|---|---|---|---|---|
| 5.1 | Redeploy do stack 128 derruba MEU canal de SQL no meio da sessão | A | 3 | Sequenciar: fazer TODAS as queries SQL pendentes antes; fallback G3 (`psql` peer via Portainer exec) validado antes do redeploy |
| 5.2 | Imagem `supabase-db-mcp-server:latest` é build local — redeploy não encontra a imagem | M | 3 | `docker service inspect` para confirmar que a imagem existe local; update só de env/secret não re-puxa imagem com `--no-resolve-image` (Portainer: manter digest) |
| 5.3 | Secret criado com \n no final → senha inválida | M | 3 | `printf '%s'` (sem echo); testar conexão ANTES do redeploy via container efêmero não é possível — validar após redeploy com query de health |
| 5.4 | Entrypoint do MCP não suporta `_FILE`/wrapper → precisa shell wrapper | M | 2 | Inspecionar entrypoint atual; usar wrapper `sh -c 'export DATABASE_URL=$(cat /run/secrets/...) && exec …'` como nos outros stacks |
| 5.5 | OAuth/token do MCP remoto invalidado pelo restart | B | 2 | O MCP é stateless (token no gateway); reconectar é transparente |

## WS-6 · Backups PG14 (stacks 112/84/85) — drift MinIO→R2

| # | Cenário de falha | P | I | Mitigação / Abort |
|---|---|---|---|---|
| 6.1 | Env runtime capturado ≠ env que funciona (container antigo com env morto) | B | 4 | Capturar env do container RODANDO + validar com backup manual de teste pós-mudança |
| 6.2 | Backup diário das 02:00 perdido durante a janela | B | 2 | Executar redeploy fora de 01:45–02:15 UTC; hoje ~11:00 UTC — ok |
| 6.3 | Imagem `eeshugerman/postgres-backup-s3:14` não suporta `*_FILE` | A | 3 | Confirmado que não suporta → usar wrapper entrypoint `sh -c 'export … && exec /entrypoint.sh'` (padrão já usado no supabase-backup v2 da sessão 4) — mas essa imagem usa go-cron/sh próprio: inspecionar CMD/ENTRYPOINT antes |
| 6.4 | Wrapper quebra o cron interno da imagem (agenda nunca dispara) | M | 4 | Após redeploy, rodar `sh backup.sh` manual no container e conferir objeto novo no R2; conferir processo cron vivo |
| 6.5 | Passphrase GPG divergente (monthly ≠ daily/weekly — achado sessão 4) é "corrigida" por engano | M | 4 | NÃO normalizar a passphrase agora; preservar exatamente o valor runtime de cada stack (restauração de monthlies antigos depende dela) |
| 6.6 | Secret name colide com existente | B | 1 | Nomes novos versionados `r2_backup_*_v1` + checar `docker secret ls` |
| 6.7 | Portainer update do stack recria serviço com env limpo mas secret não montado (typo) | M | 4 | Validar `docker service inspect` + logs do container novo antes de considerar done; rollback = redeploy com file anterior (guardado no repo) |
| 6.8 | R2 endpoint/keys expirados (funcionava em abril, hoje não) | B | 3 | O daily de hoje 02:00 rodou? Conferir objeto de hoje no R2 ANTES de mexer (baseline) |
| 6.9 | 3 stacks mudados de uma vez → falha simultânea de todos os backups | B | 5 | Regra G4: 1 stack por vez, validação completa entre eles |
| 6.10 | Snapshot do stack file antigo perdido (sem rollback) | B | 3 | Salvar os 3 stack files originais no repo (`docs/infra-snapshots/`) antes de editar |

## WS-7 · Aposentar minio-offsite-mirror (89)

| # | Cenário de falha | P | I | Mitigação / Abort |
|---|---|---|---|---|
| 7.1 | Stack ainda copia algo que só existe no MinIO | B | 4 | Verificar containers do stack (parados?), credenciais PENDING (nunca funcionou desde abr), e que PG14+PG15+baileys já vão ao R2 direto |
| 7.2 | Outro serviço referencia a network/volume do stack | B | 2 | `docker network/volume ls` por referências antes do delete |
| 7.3 | Necessidade futura de restaurar a config | B | 1 | Salvar stack file no repo antes de deletar |
| 7.4 | MinIO em si é deletado por engano (stack 19) | B | 5 | NÃO tocar no stack `minio` (19) — só no `minio-offsite-mirror` (89) |

## WS-8 · Rotação da senha compartilhada (o mais crítico)

| # | Cenário de falha | P | I | Mitigação / Abort |
|---|---|---|---|---|
| 8.1 | ALTER ROLE aplicado mas redeploys falham no meio → metade dos serviços sem login | M | 5 | Ordem: secret v2 criado → stacks preparados (files prontos) → ALTER dos 6 roles em 1 transação de sessão → redeploys imediatos 35→124→165; janela total <10 min; rollback: ALTER de volta para senha antiga (guardada em secret v1) |
| 8.2 | Eu perco acesso SQL no meio (MCP usa senha antiga) | A | 4 | G3: TODAS as operações da rotação via `psql` peer (Portainer exec no container supabase_db) — zero dependência de senha |
| 8.3 | `rest` (PostgREST) com URI hardcoded esquecido → API do zapp-web morre | M | 5 | Incluir fix do `rest` NO MESMO stack file update do 35 (wrapper + secret) |
| 8.4 | `authenticator` role: PostgREST usa `authenticator`+senha própria? | M | 4 | Conferir PGRST_DB_URI runtime: qual role/senha usa de fato; rotacionar exatamente o que ele usa |
| 8.5 | supavisor (pooler) cacheia credenciais → conexões novas falham só nele | M | 4 | Redeploy do supavisor junto (faz parte do stack 35); validar porta 5432/6543 pós |
| 8.6 | Edge Functions (functions service) com JWT ok mas DB via env antigo | M | 4 | Conferir env do functions: usa `SUPABASE_DB_URL`? Atualizar no mesmo redeploy |
| 8.7 | n8n workflows com credencial PG15 quebram silenciosamente | A | 3 | Listar credenciais via MCP do n8n; atualizar credencial via API após ALTER; validar executando um workflow de teste (ou aguardar execução agendada e conferir) |
| 8.8 | Metabase usa senha compartilhada (não `metabase_user`) | M | 2 | Conferir; se usar `metabase_user` (senha própria), nada a fazer |
| 8.9 | GlitchTip usa o PG16 próprio — fora do escopo | — | — | Confirmado: postgres:16 dedicado |
| 8.10 | Senha nova vaza no transcript/logs | M | 4 | G5: gerar com `openssl rand -base64 24 > /tmp/pw` dentro do container, `docker secret create` a partir do arquivo, `shred` depois; para o n8n, setar via API lendo do arquivo — NUNCA ecoar |
| 8.11 | `POSTGRES_PASSWORD` env do supabase_db (initdb) fica dessincronizado | A | 1 | Cosmético (só usado no primeiro initdb); atualizar ref para _v2 no mesmo redeploy para higiene |
| 8.12 | Sessões antigas (conexões abertas) continuam com senha velha → falso sucesso na validação | A | 2 | Validar com CONEXÕES NOVAS (psql -h via rede com a senha nova) para cada role |
| 8.13 | pgbouncer/pgsodium/authenticator com senha em `pgbouncer.ini`/arquivo interno | B | 3 | Supabase self-hosted usa supavisor (não pgbouncer clássico); conferir mesmo assim |
| 8.14 | Realtime/Storage/Auth com migração pendente dispara no restart e falha | B | 3 | Serviços reiniciam com o MESMO código/imagem (digest pinado) — migração já aplicada |
| 8.15 | Restart em cascata do stack 35 causa 1–3 min de indisponibilidade da API do zapp | A | 2 | Janela sábado de manhã; zapp-web frontend continua no ar (Vercel/nginx), reconecta sozinho |
| 8.16 | Backup das 02:00 do PG15 usa a senha antiga amanhã | M | 3 | Stack 124 já usa secret `_v1` → trocar ref para `_v2` no mesmo lote |
| 8.17 | zapp-health-guard (165) perde acesso e dispara alertas falsos | A | 1 | Trocar ref no 165 no mesmo lote; alertas do intervalo são esperados e documentados |
| 8.18 | Algum consumidor NÃO mapeado (desconhecido) quebra depois | M | 3 | Pós-rotação: monitorar `pg_stat_activity`/logs de auth-failure por 15 min + deixar senha antiga documentada como "morta em 2026-07-04" para diagnóstico rápido |
| 8.19 | ALTER ROLE do `postgres` corta o próprio psql peer | B | 1 | Peer auth via socket ignora senha — imune |
| 8.20 | Vault/pgsodium com chaves derivadas da senha | B | 4 | pgsodium usa chave própria (getkey script), independente de senha de role — conferir script antes |

## WS-9 · Riscos de plataforma/transversais

| # | Cenário | P | I | Mitigação |
|---|---|---|---|---|
| 9.1 | Operador humano mexendo em paralelo (aconteceu na sessão 4 — N7) | M | 3 | Antes de cada janela: checar `updatedAt` dos stacks; se houver mudança <5 min, esperar |
| 9.2 | Session/context é interrompida no meio de um workstream | M | 3 | Ordem dos passos sempre deixa o sistema num estado consistente; cada task só é `completed` com validação |
| 9.3 | O usuário escaneia o QR da wpp2 DURANTE a execução | M | 1 | Ótimo — só valida o pipeline; nada aqui conflita |
| 9.4 | Portainer MCP cai / rate limit | B | 2 | Retry com backoff; operações idempotentes |
| 9.5 | Disco enche por outro motivo durante a sessão (backup, logs) | B | 4 | WS-4 executado cedo LIBERA 30 GB — reduz o risco para o resto |
| 9.6 | Um redeploy dispara watchtower/auto-update de imagem | M | 4 | Stacks usam digest pinado; watchtower (156) — conferir escopo/labels antes dos redeploys |
| 9.7 | Ações destrutivas em tabela errada (schema `evo` vs `_analytics`) | B | 5 | Todos os DROP/DELETE com schema totalmente qualificado + dry-run SELECT antes |
| 9.8 | RabbitMQ acumula backlog se algum consumer morrer por efeito colateral | B | 3 | Nenhuma mudança toca consumer/rabbit; verificar filas ao final da sessão |
| 9.9 | git push conflita com trabalho paralelo no branch | B | 1 | Branch exclusivo desta sessão |
| 9.10 | O fantasma S5-1 é deletado pelo usuário sem re-parear antes | M | 3 | Runbook já entregue com a ordem certa; mitigação WS-2 não muda isso |

## Decisões pré-aprovadas pela matriz

1. **Ordem de execução:** GlitchTip → quick wins Evolution → registry/ghost → forense S5-4 →
   retenção `_analytics` (libera disco cedo, 9.5) → secret do supabase-db-mcp → backups 112/84/85
   (1 a 1) → aposentar mirror 89 → **rotação de senha por último** (maior blast radius, com
   observabilidade já consertada pelo passo 1).
2. **Retenção `_analytics`: 14 dias** via DROP de partições antigas (4.1/4.10) + job pg_cron
   permanente com allowlist estrita (4.7).
3. **Rotação:** tudo via `psql` peer (8.2), `rest` corrigido no mesmo redeploy (8.3),
   senha nunca impressa (8.10), validação com conexões novas por role (8.12).
4. **Nunca tocar:** serviço `evolution_evolution`, stack `minio` (19), volume
   `evolution_instances`, schemas `zapp`/`evo`/`public` com DDL destrutivo.
5. **Abort global:** qualquer sinal de indisponibilidade da linha WhatsApp principal → parar
   tudo, verificar G1, só retomar com `state=open`.
